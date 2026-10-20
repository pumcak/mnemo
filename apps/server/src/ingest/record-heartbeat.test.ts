import type { Heartbeat } from '@mnemo/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recordHeartbeat, UnknownDeviceError } from './record-heartbeat';
import type { DatabaseHandle } from '../db/client';
import { devices, heartbeats, playbackSessions, sources } from '../db/schema';
import { openMigratedDatabase, registerDevice } from '../testing/database';

const deviceId = '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11';
const firstSeen = new Date('2026-09-17T20:00:00.000Z');

const heartbeat = (overrides: Partial<Heartbeat> = {}): Heartbeat => ({
  deviceId,
  source: { kind: 'browser', app: 'netflix.com' },
  rawTitle: 'Arcane: Season 1: Welcome to the Playground',
  state: 'playing',
  positionSeconds: 30,
  durationSeconds: 2520,
  observedAt: '2026-09-17T20:01:00.000Z',
  ...overrides,
});

describe('recordHeartbeat', () => {
  let handle: DatabaseHandle;

  beforeEach(() => {
    handle = openMigratedDatabase();
    registerDevice(handle, deviceId, firstSeen);
  });

  afterEach(() => {
    handle.close();
  });

  it('refuses a heartbeat from a device nobody registered', () => {
    expect(() =>
      recordHeartbeat(handle, heartbeat({ deviceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' })),
    ).toThrow(UnknownDeviceError);
  });

  it('records the observation and the session it belongs to', () => {
    const recorded = recordHeartbeat(handle, heartbeat());

    expect(recorded.sessionId).toBeTypeOf('number');
    expect(handle.db.select().from(heartbeats).all()).toHaveLength(1);
    expect(handle.db.select().from(playbackSessions).all()).toHaveLength(1);
  });

  it('discovers the capture source on first sight and reuses it after', () => {
    recordHeartbeat(handle, heartbeat());
    recordHeartbeat(handle, heartbeat({ rawTitle: 'something else entirely' }));

    expect(handle.db.select().from(sources).all()).toHaveLength(1);
  });

  it('continues the open session when the raw title is the same', () => {
    const first = recordHeartbeat(handle, heartbeat());
    const second = recordHeartbeat(
      handle,
      heartbeat({ positionSeconds: 45, observedAt: '2026-09-17T20:01:15.000Z' }),
    );

    expect(second.sessionId).toBe(first.sessionId);

    const session = handle.db.select().from(playbackSessions).get();

    expect(session?.lastPositionSeconds).toBe(45);
    expect(session?.lastSeenAt.toISOString()).toBe('2026-09-17T20:01:15.000Z');
    expect(session?.startedAt.toISOString()).toBe('2026-09-17T20:01:00.000Z');
  });

  it('opens a separate session for a different raw title', () => {
    const first = recordHeartbeat(handle, heartbeat());
    const second = recordHeartbeat(
      handle,
      heartbeat({ rawTitle: 'Arcane: Season 1: Some Mysteries' }),
    );

    expect(second.sessionId).not.toBe(first.sessionId);
    expect(handle.db.select().from(playbackSessions).all()).toHaveLength(2);
  });

  it('starts a new session when the same title comes back after a long silence', () => {
    const first = recordHeartbeat(handle, heartbeat());
    const second = recordHeartbeat(handle, heartbeat({ observedAt: '2026-09-17T21:30:00.000Z' }));

    expect(second.sessionId).not.toBe(first.sessionId);

    const [closed, opened] = handle.db.select().from(playbackSessions).all();

    expect(closed?.closedAt?.toISOString()).toBe('2026-09-17T20:01:00.000Z');
    expect(opened?.closedAt).toBeNull();
  });

  it('continues through a pause shorter than the gap', () => {
    const first = recordHeartbeat(handle, heartbeat());
    const second = recordHeartbeat(handle, heartbeat({ observedAt: '2026-09-17T20:11:00.000Z' }));

    expect(second.sessionId).toBe(first.sessionId);
  });

  it('honours a gap given by the caller', () => {
    const first = recordHeartbeat(handle, heartbeat());
    const second = recordHeartbeat(handle, heartbeat({ observedAt: '2026-09-17T20:03:00.000Z' }), {
      gapMs: 60 * 1000,
    });

    expect(second.sessionId).not.toBe(first.sessionId);
  });

  it('closes the session when playback ends, so a replay is a new one', () => {
    const first = recordHeartbeat(handle, heartbeat());

    recordHeartbeat(
      handle,
      heartbeat({ state: 'ended', positionSeconds: 2520, observedAt: '2026-09-17T20:10:00.000Z' }),
    );

    const replay = recordHeartbeat(handle, heartbeat({ observedAt: '2026-09-17T20:11:00.000Z' }));

    expect(replay.sessionId).not.toBe(first.sessionId);
    expect(handle.db.select().from(playbackSessions).get()?.closedAt?.toISOString()).toBe(
      '2026-09-17T20:10:00.000Z',
    );
  });

  it('stores a late observation without moving the session backwards', () => {
    recordHeartbeat(
      handle,
      heartbeat({ positionSeconds: 90, observedAt: '2026-09-17T20:02:00.000Z' }),
    );
    recordHeartbeat(
      handle,
      heartbeat({ positionSeconds: 30, observedAt: '2026-09-17T20:01:00.000Z' }),
    );

    const session = handle.db.select().from(playbackSessions).get();

    expect(handle.db.select().from(heartbeats).all()).toHaveLength(2);
    expect(session?.lastPositionSeconds).toBe(90);
    expect(session?.lastSeenAt.toISOString()).toBe('2026-09-17T20:02:00.000Z');
  });

  it('keeps the media hint the source sent', () => {
    recordHeartbeat(handle, heartbeat({ hint: { seriesTitle: 'Arcane', season: 1, episode: 1 } }));

    expect(handle.db.select().from(playbackSessions).get()?.hint?.episode).toBe(1);
  });

  it('moves the last seen date of the device forward', () => {
    recordHeartbeat(handle, heartbeat());

    const device = handle.db.select().from(devices).get();

    expect(device?.lastSeenAt.toISOString()).toBe('2026-09-17T20:01:00.000Z');
  });

  it('leaves nothing behind when the device is unknown', () => {
    expect(() =>
      recordHeartbeat(handle, heartbeat({ deviceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' })),
    ).toThrow();

    expect(handle.db.select().from(sources).all()).toHaveLength(0);
    expect(handle.db.select().from(heartbeats).all()).toHaveLength(0);
  });
});
