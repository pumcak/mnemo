import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hoursByPeriod, hoursBySource } from './hours';
import type { DatabaseHandle } from '../db/client';
import { playbackSessions, sources, views } from '../db/schema';
import { openMigratedDatabase, registerDevice } from '../testing/database';

const deviceId = '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11';
const range = {
  from: new Date('2026-10-01T00:00:00.000Z'),
  to: new Date('2026-11-01T00:00:00.000Z'),
};

describe('watched hours', () => {
  let handle: DatabaseHandle;
  let sourceId: number;

  beforeEach(() => {
    handle = openMigratedDatabase();
    registerDevice(handle, deviceId, range.from);
    sourceId = handle.db
      .insert(sources)
      .values({ kind: 'browser', app: 'netflix.com', createdAt: range.from })
      .returning({ id: sources.id })
      .get().id;
  });

  afterEach(() => {
    handle.close();
  });

  const watched = (startedAt: string, seconds: number, asView = true, source = sourceId): void => {
    const sessionId = handle.db
      .insert(playbackSessions)
      .values({
        deviceId,
        sourceId: source,
        rawTitle: 'Heat (1995)',
        startedAt: new Date(startedAt),
        lastSeenAt: new Date(startedAt),
        lastPositionSeconds: seconds,
        watchedSeconds: seconds,
      })
      .returning({ id: playbackSessions.id })
      .get().id;

    if (asView) {
      handle.db
        .insert(views)
        .values({ sessionId, watchedSeconds: 1200, validatedAt: new Date(startedAt) })
        .run();
    }
  };

  it('adds up the hours of each day', () => {
    watched('2026-10-19T20:00:00.000Z', 3600);
    watched('2026-10-19T22:00:00.000Z', 1800);
    watched('2026-10-20T20:00:00.000Z', 5400);

    expect(hoursByPeriod(handle, 'day', range)).toEqual([
      { period: '2026-10-19', hours: 1.5 },
      { period: '2026-10-20', hours: 1.5 },
    ]);
  });

  it('counts the whole session, not the time at validation', () => {
    watched('2026-10-19T20:00:00.000Z', 7200);

    expect(hoursByPeriod(handle, 'month', range)).toEqual([{ period: '2026-10', hours: 2 }]);
  });

  it('leaves out sessions that never became views', () => {
    watched('2026-10-19T20:00:00.000Z', 600, false);

    expect(hoursByPeriod(handle, 'day', range)).toEqual([]);
  });

  it('files a late film under the evening of the viewer', () => {
    watched('2026-10-19T22:30:00.000Z', 3600);

    expect(hoursByPeriod(handle, 'day', { ...range, utcOffsetMinutes: 120 })).toEqual([
      { period: '2026-10-20', hours: 1 },
    ]);
    expect(hoursByPeriod(handle, 'day', { ...range, utcOffsetMinutes: -60 })).toEqual([
      { period: '2026-10-19', hours: 1 },
    ]);
  });

  it('groups by week', () => {
    watched('2026-10-19T20:00:00.000Z', 3600);
    watched('2026-10-21T20:00:00.000Z', 3600);

    expect(hoursByPeriod(handle, 'week', range)).toEqual([{ period: '2026-W42', hours: 2 }]);
  });

  it('stays inside the range', () => {
    watched('2026-09-30T20:00:00.000Z', 3600);

    expect(hoursByPeriod(handle, 'day', range)).toEqual([]);
  });

  it('adds up the hours of each source, the most watched first', () => {
    const vlc = handle.db
      .insert(sources)
      .values({ kind: 'smtc', app: 'vlc', createdAt: range.from })
      .returning({ id: sources.id })
      .get().id;

    watched('2026-10-19T20:00:00.000Z', 3600);
    watched('2026-10-20T20:00:00.000Z', 7200, true, vlc);
    watched('2026-10-21T20:00:00.000Z', 3600, true, vlc);
    watched('2026-10-22T20:00:00.000Z', 3600, false, vlc);

    expect(hoursBySource(handle, range)).toEqual([
      { kind: 'smtc', app: 'vlc', hours: 3 },
      { kind: 'browser', app: 'netflix.com', hours: 1 },
    ]);
  });
});
