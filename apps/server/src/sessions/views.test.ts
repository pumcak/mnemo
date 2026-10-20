import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promoteViews } from './views';
import type { DatabaseHandle } from '../db/client';
import { playbackSessions, sources, views } from '../db/schema';
import { openMigratedDatabase, registerDevice } from '../testing/database';

const deviceId = '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11';
const now = new Date('2026-10-20T22:00:00.000Z');

describe('promoteViews', () => {
  let handle: DatabaseHandle;
  let sourceId: number;

  beforeEach(() => {
    handle = openMigratedDatabase();
    registerDevice(handle, deviceId, now);
    sourceId = handle.db
      .insert(sources)
      .values({ kind: 'browser', app: 'example.test', createdAt: now })
      .returning({ id: sources.id })
      .get().id;
  });

  afterEach(() => {
    handle.close();
  });

  const session = (
    watchedSeconds: number,
    durationSeconds: number | null,
    lastPositionSeconds = watchedSeconds,
  ): number =>
    handle.db
      .insert(playbackSessions)
      .values({
        deviceId,
        sourceId,
        rawTitle: 'Arcane S01E01',
        startedAt: now,
        lastSeenAt: now,
        lastPositionSeconds,
        durationSeconds,
        watchedSeconds,
      })
      .returning({ id: playbackSessions.id })
      .get().id;

  it('validates a session played past 80 percent of its duration', () => {
    const id = session(1200 * 0.8 + 1, 1200);

    expect(promoteViews(handle, now)).toBe(1);
    expect(handle.db.select().from(views).get()).toMatchObject({ sessionId: id, validatedAt: now });
  });

  it('leaves a session short of both thresholds alone', () => {
    session(600, 2520);

    expect(promoteViews(handle, now)).toBe(0);
  });

  it('validates twenty minutes of a long film', () => {
    session(20 * 60, 9000);

    expect(promoteViews(handle, now)).toBe(1);
  });

  it('validates twenty minutes without any duration', () => {
    session(20 * 60, null);

    expect(promoteViews(handle, now)).toBe(1);
    expect(handle.db.select().from(views).get()?.progress).toBeNull();
  });

  it('does not count a seek to the end as watching', () => {
    session(60, 1440, 1440);

    expect(promoteViews(handle, now)).toBe(0);
  });

  it('keeps the progress the session had when it was validated', () => {
    session(1300, 2600, 1300);

    promoteViews(handle, now);

    expect(handle.db.select().from(views).get()?.progress).toBe(0.5);
  });

  it('records a view once, however many passes run', () => {
    session(1300, 1440);

    promoteViews(handle, now);

    expect(promoteViews(handle, now)).toBe(0);
    expect(handle.db.select().from(views).all()).toHaveLength(1);
  });
});
