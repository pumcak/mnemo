import type { Heartbeat } from '@mnemo/contracts';
import type { DeliveryOutcome } from './service-client';

export interface QueueOptions {
  send: (heartbeat: Heartbeat) => Promise<DeliveryOutcome>;
  /**
   * How many observations to hold when the service cannot take them. At one
   * heartbeat every fifteen seconds of playback, two hundred is around fifty
   * minutes of watching with the service down.
   */
  maxSize?: number;
  onUnpaired?: () => void;
}

export interface HeartbeatQueue {
  enqueue: (heartbeat: Heartbeat) => void;
  flush: () => Promise<void>;
  pending: () => readonly Heartbeat[];
  dropped: () => number;
}

const defaultMaxSize = 200;

/**
 * Holds heartbeats and sends them one at a time, oldest first.
 *
 * Serial rather than parallel on purpose: the service assembles a session from
 * the order observations arrive in, and two requests in flight can land the
 * wrong way round. Nothing here is fast enough to need the concurrency.
 */
export const createHeartbeatQueue = ({
  send,
  maxSize = defaultMaxSize,
  onUnpaired,
}: QueueOptions): HeartbeatQueue => {
  const waiting: Heartbeat[] = [];
  let droppedCount = 0;
  let flushing = false;

  return {
    enqueue: (heartbeat) => {
      waiting.push(heartbeat);

      while (waiting.length > maxSize) {
        // The oldest goes: a session that old has already been closed by the
        // service, while what is happening now can still be recorded usefully.
        waiting.shift();
        droppedCount += 1;
      }
    },
    flush: async () => {
      if (flushing) {
        return;
      }

      flushing = true;

      try {
        while (waiting.length > 0) {
          const next = waiting[0];

          if (next === undefined) {
            return;
          }

          const outcome = await send(next);

          if (outcome === 'retry') {
            return;
          }

          if (outcome === 'unpaired') {
            onUnpaired?.();

            return;
          }

          waiting.shift();
        }
      } finally {
        flushing = false;
      }
    },
    pending: () => [...waiting],
    dropped: () => droppedCount,
  };
};
