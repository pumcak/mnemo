import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './client';
import type { DatabaseHandle } from './client';
import { runMigrations } from './migrate';
import { pruneHeartbeats } from './retention';
import { devices, heartbeats, playbackSessions, sources } from './schema';
import type { Logger } from '../logger';

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const migrationsFolder = fileURLToPath(new URL('../../migrations', import.meta.url));

const deviceId = '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11';
const now = new Date('2026-09-17T20:00:00.000Z');
const daysAgo = (days: number): Date => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

describe('pruneHeartbeats', () => {
  let handle: DatabaseHandle;
  let sessionId: number;

  beforeEach(() => {
    handle = openDatabase(':memory:');
    runMigrations(handle, migrationsFolder, silentLogger);

    handle.db
      .insert(devices)
      .values({
        id: deviceId,
        name: 'desktop',
        platform: 'windows',
        createdAt: daysAgo(90),
        lastSeenAt: now,
      })
      .run();

    const source = handle.db
      .insert(sources)
      .values({ kind: 'browser', app: 'netflix.com', createdAt: daysAgo(90) })
      .returning({ id: sources.id })
      .get();

    sessionId = handle.db
      .insert(playbackSessions)
      .values({
        deviceId,
        sourceId: source.id,
        rawTitle: 'Arcane S01E01',
        startedAt: daysAgo(90),
        lastSeenAt: daysAgo(90),
        lastPositionSeconds: 1200,
        watchedSeconds: 1200,
      })
      .returning({ id: playbackSessions.id })
      .get().id;
  });

  afterEach(() => {
    handle.close();
  });

  const insertAt = (observedAt: Date): void => {
    handle.db
      .insert(heartbeats)
      .values({ sessionId, observedAt, state: 'playing', positionSeconds: 42 })
      .run();
  };

  it('drops observations older than the window and keeps the rest', () => {
    insertAt(daysAgo(45));
    insertAt(daysAgo(31));
    insertAt(daysAgo(29));
    insertAt(now);

    expect(pruneHeartbeats(handle, 30, silentLogger, now)).toBe(2);
    expect(handle.db.select().from(heartbeats).all()).toHaveLength(2);
  });

  it('leaves the session itself alone, since it holds the watched time', () => {
    insertAt(daysAgo(45));

    pruneHeartbeats(handle, 30, silentLogger, now);

    const session = handle.db.select().from(playbackSessions).get();

    expect(session?.watchedSeconds).toBe(1200);
  });

  it('deletes nothing when everything is inside the window', () => {
    insertAt(daysAgo(1));

    expect(pruneHeartbeats(handle, 30, silentLogger, now)).toBe(0);
  });

  it('honours a shorter window', () => {
    insertAt(daysAgo(3));
    insertAt(daysAgo(1));

    expect(pruneHeartbeats(handle, 2, silentLogger, now)).toBe(1);
  });
});
