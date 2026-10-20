import type { SourceKind } from '@mnemo/contracts';
import { normalizeTitle, titleSimilarity } from '@mnemo/resolver';
import { and, eq, gte, inArray, isNull } from 'drizzle-orm';
import type { DatabaseHandle } from '../db/client';
import { playbackSessions, sources, views } from '../db/schema';

/**
 * Which capture path to believe when two report the same playback, best first.
 *
 * The browser extension sees the page, so it has the url and the hints the page
 * exposes. The system media session is last because it is what every other path
 * also feeds: a browser playing Netflix publishes to it as well, with less detail.
 */
const sourcePriority: readonly SourceKind[] = ['browser', 'plex', 'jellyfin', 'vlc', 'mpv', 'smtc'];

/** Players round durations differently, so they are compared with some slack. */
const durationSlackSeconds = 5;

/** Sessions older than this are settled and not compared again. */
const lookbackMs = 24 * 60 * 60 * 1000;

export interface DedupSession {
  id: number;
  deviceId: string;
  sourceId: number;
  sourceKind: SourceKind;
  rawTitle: string;
  startedAt: Date;
  lastSeenAt: Date;
  durationSeconds: number | null;
}

const numbersIn = (value: string): string => (value.match(/\d+/g) ?? []).join(' ');

/**
 * Whether two raw titles name the same thing.
 *
 * A source that only sees the system media session often gets the episode name
 * where the page had the series and the season around it, so one title wholly
 * contained in the other counts as long as the shorter one says enough to be
 * specific.
 */
export const sameTitle = (left: string, right: string): boolean => {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];

  if (shorter.length >= 8 && ` ${longer} `.includes(` ${shorter} `)) {
    return true;
  }

  // Two episodes of a show differ by a number and nothing else, which is close
  // enough to fool any similarity measure.
  if (numbersIn(a) !== numbersIn(b)) {
    return false;
  }

  return titleSimilarity(a, b) >= 0.9;
};

const overlaps = (a: DedupSession, b: DedupSession): boolean =>
  a.startedAt <= b.lastSeenAt && b.startedAt <= a.lastSeenAt;

const sameDuration = (a: DedupSession, b: DedupSession): boolean =>
  a.durationSeconds === null ||
  b.durationSeconds === null ||
  Math.abs(a.durationSeconds - b.durationSeconds) <= durationSlackSeconds;

export const isDuplicatePair = (a: DedupSession, b: DedupSession): boolean =>
  a.id !== b.id &&
  a.deviceId === b.deviceId &&
  a.sourceId !== b.sourceId &&
  overlaps(a, b) &&
  sameDuration(a, b) &&
  sameTitle(a.rawTitle, b.rawTitle);

/** The session to keep out of a duplicate pair: the better source, then the earlier start. */
export const preferred = (a: DedupSession, b: DedupSession): DedupSession => {
  const rank = sourcePriority.indexOf(a.sourceKind) - sourcePriority.indexOf(b.sourceKind);

  if (rank !== 0) {
    return rank < 0 ? a : b;
  }

  return a.startedAt <= b.startedAt ? a : b;
};

/**
 * Marks sessions that repeat a playback another capture path already reported.
 *
 * A duplicate that had already become a view loses it, since the view belongs to
 * the session that was kept. Only recent sessions are compared: duplicates
 * overlap in time by definition, and they are found within a minute of starting.
 */
export const markDuplicates = (handle: DatabaseHandle, now: Date = new Date()): number => {
  const recent = handle.db
    .select({
      id: playbackSessions.id,
      deviceId: playbackSessions.deviceId,
      sourceId: playbackSessions.sourceId,
      sourceKind: sources.kind,
      rawTitle: playbackSessions.rawTitle,
      startedAt: playbackSessions.startedAt,
      lastSeenAt: playbackSessions.lastSeenAt,
      durationSeconds: playbackSessions.durationSeconds,
    })
    .from(playbackSessions)
    .innerJoin(sources, eq(sources.id, playbackSessions.sourceId))
    .where(
      and(
        isNull(playbackSessions.duplicateOf),
        gte(playbackSessions.lastSeenAt, new Date(now.getTime() - lookbackMs)),
      ),
    )
    .all();

  const losers = new Map<number, number>();

  for (const [index, a] of recent.entries()) {
    for (const b of recent.slice(index + 1)) {
      if (losers.has(a.id) || losers.has(b.id) || !isDuplicatePair(a, b)) {
        continue;
      }

      const kept = preferred(a, b);
      const dropped = kept === a ? b : a;

      losers.set(dropped.id, kept.id);
    }
  }

  if (losers.size === 0) {
    return 0;
  }

  handle.db.transaction((tx) => {
    for (const [dropped, kept] of losers) {
      tx.update(playbackSessions)
        .set({ duplicateOf: kept })
        .where(eq(playbackSessions.id, dropped))
        .run();
    }

    tx.delete(views)
      .where(inArray(views.sessionId, [...losers.keys()]))
      .run();
  });

  return losers.size;
};
