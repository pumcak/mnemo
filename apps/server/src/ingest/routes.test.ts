import { errorResponseSchema } from '@mnemo/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../db/client';
import { heartbeats } from '../db/schema';
import { createApp } from '../app';
import { openMigratedDatabase, registerDevice, silentLogger } from '../testing/database';

const deviceId = '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11';

const validBody = {
  deviceId,
  source: { kind: 'browser', app: 'netflix.com' },
  rawTitle: 'Arcane: Season 1: Welcome to the Playground',
  url: 'https://www.netflix.com/watch/81435684',
  state: 'playing',
  positionSeconds: 30,
  durationSeconds: 2520,
  observedAt: '2026-09-17T20:01:00.000Z',
};

const post = async (handle: DatabaseHandle, body: unknown, raw?: string): Promise<Response> =>
  createApp({ handle, logger: silentLogger, token: 'test-token' }).request('/ingest/heartbeat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
    body: raw ?? JSON.stringify(body),
  });

describe('POST /ingest/heartbeat', () => {
  let handle: DatabaseHandle;

  beforeEach(() => {
    handle = openMigratedDatabase();
    registerDevice(handle, deviceId, new Date('2026-09-17T20:00:00.000Z'));
  });

  afterEach(() => {
    handle.close();
  });

  it('accepts an observation and says which session it joined', async () => {
    const response = await post(handle, validBody);

    expect(response.status).toBe(202);

    const payload = (await response.json()) as { sessionId: number; heartbeatId: number };

    expect(payload.sessionId).toBeTypeOf('number');
    expect(handle.db.select().from(heartbeats).all()).toHaveLength(1);
  });

  it('rejects a payload the contract does not accept and says what is wrong', async () => {
    const response = await post(handle, { ...validBody, positionSeconds: -5 });

    expect(response.status).toBe(400);

    const payload = errorResponseSchema.parse(await response.json());

    expect(payload.error.code).toBe('contract_violation');
    expect(payload.error.details?.[0]?.path).toBe('positionSeconds');
    expect(handle.db.select().from(heartbeats).all()).toHaveLength(0);
  });

  it('rejects a position past the duration, which the schema catches', async () => {
    const response = await post(handle, {
      ...validBody,
      positionSeconds: 3000,
      durationSeconds: 2520,
    });

    expect(response.status).toBe(400);
  });

  it('answers 404 for a device nobody registered', async () => {
    const response = await post(handle, {
      ...validBody,
      deviceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    });

    expect(response.status).toBe(404);
  });

  it('rejects a body that is not json', async () => {
    const response = await post(handle, undefined, 'not json at all');

    expect(response.status).toBe(400);
  });
});
