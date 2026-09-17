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
  /** Called whenever what is waiting changes, so it can be written somewhere it survives. */
  onChange?: (waiting: readonly Heartbeat[]) => void;
}

export interface HeartbeatQueue {
  enqueue: (heartbeat: Heartbeat) => void;
  /** Puts back what was waiting before the worker was suspended. */
  restore: (waiting: readonly Heartbeat[]) => void;
  flush: () => Promise<void>;
  pending: () => readonly Heartbeat[];
  dropped: () => number;
  /** How many times in a row the service could not take the oldest observation. */
  failures: () => number;
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
  onChange,
}: QueueOptions): HeartbeatQueue => {
  let waiting: Heartbeat[] = [];
  let droppedCount = 0;
  let failureCount = 0;
  let flushing = false;

  const changed = (): void => {
    onChange?.([...waiting]);
  };

  const trim = (): void => {
    while (waiting.length > maxSize) {
      // The oldest goes: a session that old has already been closed by the
      // service, while what is happening now can still be recorded usefully.
      waiting.shift();
      droppedCount += 1;
    }
  };

  return {
    enqueue: (heartbeat) => {
      waiting.push(heartbeat);
      trim();
      changed();
    },
    restore: (stored) => {
      waiting = [...stored, ...waiting];
      trim();
      changed();
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
            failureCount += 1;

            return;
          }

          if (outcome === 'unpaired') {
            failureCount += 1;
            onUnpaired?.();

            return;
          }

          failureCount = 0;
          waiting.shift();
          changed();
        }
      } finally {
        flushing = false;
      }
    },
    pending: () => [...waiting],
    dropped: () => droppedCount,
    failures: () => failureCount,
  };
};
