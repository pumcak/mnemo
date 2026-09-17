import { heartbeatSchema } from '@mnemo/contracts';
import type { Heartbeat } from '@mnemo/contracts';
import { z } from 'zod';
import type { KeyValueStore } from './storage';

export const queueKey = 'mnemo.queue';

const storedQueueSchema = z.array(heartbeatSchema);

/**
 * The queue has to outlive the worker that holds it.
 *
 * A background worker in manifest version 3 is stopped a few seconds after it
 * goes idle, which is most of the time while somebody watches an episode. What
 * is waiting to be sent therefore lives in storage, not only in memory.
 */
export const readStoredQueue = async (store: KeyValueStore): Promise<Heartbeat[]> => {
  const parsed = storedQueueSchema.safeParse(await store.get(queueKey));

  if (parsed.success) {
    return parsed.data;
  }

  /**
   * Stored observations that no longer parse are dropped rather than salvaged
   * one by one. They are a few seconds of playback, and the alternative is a
   * worker that cannot start.
   */
  return [];
};

export const writeStoredQueue = async (
  store: KeyValueStore,
  waiting: readonly Heartbeat[],
): Promise<void> => {
  await store.set(queueKey, waiting);
};
