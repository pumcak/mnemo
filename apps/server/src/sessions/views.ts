import { and, eq, gt, gte, isNull, or, sql } from 'drizzle-orm';
import { sessionProgress } from './progress';
import type { DatabaseHandle } from '../db/client';
import { playbackSessions, views } from '../db/schema';

/** Share of the duration that has to be played for a session to count as a view. */
export const viewShare = 0.8;

/** Playing time that makes a view on its own, whatever the duration. */
export const viewSeconds = 20 * 60;

/**
 * Records a view for every session watched enough to be one, once.
 *
 * Both thresholds are measured on time spent playing, not on position: dragging
 * the slider to the credits reaches 100 percent of the position and none of the
 * watching. Twenty minutes stands alone because a film abandoned after an hour
 * was still watched, and because live streams and some players never report a
 * duration to take a share of.
 *
 * Duplicates of a session reported by a better capture path are skipped, or one
 * evening would count twice. Open sessions are included, so a film still playing
 * shows up in the history once it has been watched enough rather than only when
 * the tab closes.
 */
export const promoteViews = (handle: DatabaseHandle, now: Date = new Date()): number => {
  const qualifying = handle.db
    .select({
      id: playbackSessions.id,
      watchedSeconds: playbackSessions.watchedSeconds,
      durationSeconds: playbackSessions.durationSeconds,
      lastPositionSeconds: playbackSessions.lastPositionSeconds,
    })
    .from(playbackSessions)
    .leftJoin(views, eq(views.sessionId, playbackSessions.id))
    .where(
      and(
        isNull(views.id),
        isNull(playbackSessions.duplicateOf),
        or(
          gte(playbackSessions.watchedSeconds, viewSeconds),
          and(
            gt(playbackSessions.durationSeconds, 0),
            gte(
              playbackSessions.watchedSeconds,
              sql`${playbackSessions.durationSeconds} * ${viewShare}`,
            ),
          ),
        ),
      ),
    )
    .all();

  if (qualifying.length === 0) {
    return 0;
  }

  handle.db
    .insert(views)
    .values(
      qualifying.map((session) => ({
        sessionId: session.id,
        watchedSeconds: session.watchedSeconds,
        progress: sessionProgress(session) ?? null,
        validatedAt: now,
      })),
    )
    .onConflictDoNothing()
    .run();

  return qualifying.length;
};
