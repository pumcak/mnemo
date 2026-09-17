import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './client';
import type { DatabaseHandle } from './client';
import { runMigrations } from './migrate';
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
const startedAt = new Date('2026-09-17T20:00:00.000Z');

const seedSession = (handle: DatabaseHandle): number => {
  handle.db
    .insert(devices)
    .values({
      id: deviceId,
      name: 'desktop',
      platform: 'windows',
      createdAt: startedAt,
      lastSeenAt: startedAt,
    })
    .run();

  const source = handle.db
    .insert(sources)
    .values({ kind: 'browser', app: 'netflix.com', createdAt: startedAt })
    .returning({ id: sources.id })
    .get();

  const session = handle.db
    .insert(playbackSessions)
    .values({
      deviceId,
      sourceId: source.id,
      rawTitle: 'Arcane: Season 1: Welcome to the Playground',
      url: 'https://www.netflix.com/watch/81435684',
      hint: { seriesTitle: 'Arcane', season: 1, episode: 1 },
      startedAt,
      lastSeenAt: startedAt,
      lastPositionSeconds: 0,
      durationSeconds: 2520,
    })
    .returning({ id: playbackSessions.id })
    .get();

  return session.id;
};

describe('playback sessions and heartbeats', () => {
  let handle: DatabaseHandle;

  beforeEach(() => {
    handle = openDatabase(':memory:');
    runMigrations(handle, migrationsFolder, silentLogger);
  });

  afterEach(() => {
    handle.close();
  });

  it('stores a session and reads the media hint back as an object', () => {
    const sessionId = seedSession(handle);

    const stored = handle.db
      .select()
      .from(playbackSessions)
      .where(eq(playbackSessions.id, sessionId))
      .get();

    expect(stored?.hint?.seriesTitle).toBe('Arcane');
    expect(stored?.watchedSeconds).toBe(0);
    expect(stored?.closedAt).toBeNull();
  });

  it('stores heartbeats against a session', () => {
    const sessionId = seedSession(handle);

    handle.db
      .insert(heartbeats)
      .values([
        { sessionId, observedAt: startedAt, state: 'playing', positionSeconds: 0 },
        {
          sessionId,
          observedAt: new Date(startedAt.getTime() + 15_000),
          state: 'playing',
          positionSeconds: 15,
          durationSeconds: 2520,
        },
      ])
      .run();

    expect(handle.db.select().from(heartbeats).all()).toHaveLength(2);
  });

  it('refuses a heartbeat pointing at a session that does not exist', () => {
    expect(() =>
      handle.db
        .insert(heartbeats)
        .values({ sessionId: 999, observedAt: startedAt, state: 'playing', positionSeconds: 0 })
        .run(),
    ).toThrow();
  });

  it('refuses a playback state the contracts do not declare', () => {
    const sessionId = seedSession(handle);

    expect(() =>
      handle.db
        .insert(heartbeats)
        .values({ sessionId, observedAt: startedAt, state: 'buffering', positionSeconds: 0 })
        .run(),
    ).toThrow();
  });

  it('takes the heartbeats with the session when it is deleted', () => {
    const sessionId = seedSession(handle);

    handle.db
      .insert(heartbeats)
      .values({ sessionId, observedAt: startedAt, state: 'playing', positionSeconds: 0 })
      .run();

    handle.db.delete(playbackSessions).where(eq(playbackSessions.id, sessionId)).run();

    expect(handle.db.select().from(heartbeats).all()).toHaveLength(0);
  });

  it('keeps a session from pointing at a device that does not exist', () => {
    expect(() =>
      handle.db
        .insert(playbackSessions)
        .values({
          deviceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          sourceId: 1,
          rawTitle: 'orphan',
          startedAt,
          lastSeenAt: startedAt,
          lastPositionSeconds: 0,
        })
        .run(),
    ).toThrow();
  });
});
