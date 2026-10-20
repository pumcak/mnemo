import { and, isNull, lt, sql } from 'drizzle-orm';
import type { DatabaseHandle } from '../db/client';
import { playbackSessions } from '../db/schema';

/**
 * How long a session may go without a heartbeat and still be the same session.
 *
 * Long enough to cover a pause to answer the door or a tab left in the
 * background, short enough that the same episode started again in the evening
 * counts as a second sitting rather than as one session spanning the day.
 */
export const defaultSessionGapMs = 15 * 60 * 1000;

/**
 * Whether an observation still belongs to a session last seen at `lastSeenAt`.
 *
 * An observation older than the last one seen continues the session: requests
 * sent close together can arrive out of order, and that is no reason to split.
 */
export const continuesSession = (lastSeenAt: Date, observedAt: Date, gapMs: number): boolean =>
  observedAt.getTime() - lastSeenAt.getTime() <= gapMs;

/**
 * Closes the sessions nothing has reported on for longer than the gap.
 *
 * A source that stops sending, because the tab was closed or the machine went
 * to sleep, never says so. The session is closed at its last observation, not
 * at the sweep, so its length is what was actually seen.
 */
export const closeIdleSessions = (
  handle: DatabaseHandle,
  now: Date = new Date(),
  gapMs: number = defaultSessionGapMs,
): number => {
  const cutoff = new Date(now.getTime() - gapMs);

  return handle.db
    .update(playbackSessions)
    .set({ closedAt: sql`${playbackSessions.lastSeenAt}` })
    .where(and(isNull(playbackSessions.closedAt), lt(playbackSessions.lastSeenAt, cutoff)))
    .run().changes;
};
