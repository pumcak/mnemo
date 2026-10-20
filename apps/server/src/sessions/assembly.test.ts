import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeIdleSessions, continuesSession, defaultSessionGapMs } from './assembly';
import type { DatabaseHandle } from '../db/client';
import { playbackSessions, sources } from '../db/schema';
import { openMigratedDatabase, registerDevice } from '../testing/database';

const deviceId = '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11';
const minute = 60 * 1000;

describe('continuesSession', () => {
  const last = new Date('2026-10-20T20:00:00.000Z');

  it('continues within the gap', () => {
    expect(continuesSession(last, new Date(last.getTime() + 14 * minute), 15 * minute)).toBe(true);
  });

  it('continues at exactly the gap', () => {
    expect(continuesSession(last, new Date(last.getTime() + 15 * minute), 15 * minute)).toBe(true);
  });

  it('splits past the gap', () => {
    expect(continuesSession(last, new Date(last.getTime() + 16 * minute), 15 * minute)).toBe(false);
  });

  it('continues for an observation that arrived late', () => {
    expect(continuesSession(last, new Date(last.getTime() - 5 * minute), 15 * minute)).toBe(true);
  });
});

describe('closeIdleSessions', () => {
  let handle: DatabaseHandle;
  let sourceId: number;
  const now = new Date('2026-10-20T22:00:00.000Z');

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

  const session = (lastSeenAt: Date, closedAt: Date | null = null): void => {
    handle.db
      .insert(playbackSessions)
      .values({
        deviceId,
        sourceId,
        rawTitle: 'Heat (1995)',
        startedAt: new Date(lastSeenAt.getTime() - 30 * minute),
        lastSeenAt,
        lastPositionSeconds: 1800,
        closedAt,
      })
      .run();
  };

  it('closes a silent session at its last observation', () => {
    const lastSeenAt = new Date(now.getTime() - 40 * minute);

    session(lastSeenAt);

    expect(closeIdleSessions(handle, now)).toBe(1);
    expect(handle.db.select().from(playbackSessions).get()?.closedAt).toEqual(lastSeenAt);
  });

  it('leaves a session that is still reporting open', () => {
    session(new Date(now.getTime() - minute));

    expect(closeIdleSessions(handle, now)).toBe(0);
    expect(handle.db.select().from(playbackSessions).get()?.closedAt).toBeNull();
  });

  it('does not touch a session already closed', () => {
    const closedAt = new Date(now.getTime() - 50 * minute);

    session(new Date(now.getTime() - 60 * minute), closedAt);

    expect(closeIdleSessions(handle, now, defaultSessionGapMs)).toBe(0);
    expect(handle.db.select().from(playbackSessions).get()?.closedAt).toEqual(closedAt);
  });
});
