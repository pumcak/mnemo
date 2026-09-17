import { lt } from 'drizzle-orm';
import type { DatabaseHandle } from './client';
import { heartbeats } from './schema';
import type { Logger } from '../logger';

const millisecondsPerDay = 24 * 60 * 60 * 1000;

/**
 * Drops raw heartbeats older than the retention window.
 *
 * Heartbeats are a means, not the record: once the assembler has folded them
 * into a session, the session holds the watched time and the last position, so
 * the raw rows only serve reprocessing and debugging. Keeping them forever would
 * grow the file by roughly a third of a million rows a year for nothing.
 */
export const pruneHeartbeats = (
  handle: DatabaseHandle,
  retentionDays: number,
  logger: Logger,
  now: Date = new Date(),
): number => {
  const cutoff = new Date(now.getTime() - retentionDays * millisecondsPerDay);
  const result = handle.db.delete(heartbeats).where(lt(heartbeats.observedAt, cutoff)).run();
  const deleted = result.changes;

  if (deleted > 0) {
    logger.info({ deleted, cutoff: cutoff.toISOString(), retentionDays }, 'heartbeats pruned');
  }

  return deleted;
};
