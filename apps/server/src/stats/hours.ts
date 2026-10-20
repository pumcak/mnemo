import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import type { DatabaseHandle } from '../db/client';
import { playbackSessions, views } from '../db/schema';

export const periods = ['day', 'week', 'month'] as const;

export type Period = (typeof periods)[number];

export interface StatsRange {
  from: Date;
  to: Date;
  /**
   * Offset of the viewer's clock from UTC. A film started at 23:30 in Paris
   * belongs to that evening, not to the next day in UTC.
   */
  utcOffsetMinutes?: number;
}

export interface PeriodHours {
  /** `2026-10-20` for a day, `2026-W43` for a week, `2026-10` for a month. */
  period: string;
  hours: number;
}

const formats: Record<Period, string> = {
  day: '%Y-%m-%d',
  week: '%Y-W%W',
  month: '%Y-%m',
};

/**
 * Hours watched per day, week or month, over views only.
 *
 * Time comes from the session rather than from the view, because the view froze
 * the watched time at the moment it crossed the threshold and the film went on
 * playing after that. A view is filed under the period its session started in.
 */
export const hoursByPeriod = (
  handle: DatabaseHandle,
  period: Period,
  { from, to, utcOffsetMinutes = 0 }: StatsRange,
): PeriodHours[] => {
  const bucket = sql<string>`strftime(${formats[period]}, ${playbackSessions.startedAt} / 1000, 'unixepoch', ${`${utcOffsetMinutes} minutes`})`;

  return handle.db
    .select({
      period: bucket,
      hours: sql<number>`sum(${playbackSessions.watchedSeconds}) / 3600.0`,
    })
    .from(views)
    .innerJoin(playbackSessions, eq(playbackSessions.id, views.sessionId))
    .where(and(gte(playbackSessions.startedAt, from), lt(playbackSessions.startedAt, to)))
    .groupBy(bucket)
    .orderBy(asc(bucket))
    .all();
};
