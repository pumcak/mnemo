import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { DatabaseHandle } from '../db/client';
import { devices } from '../db/schema';
import { openMigratedDatabase, silentLogger } from '../testing/database';

const token = 'a-token-that-only-the-disk-knows';

const pair = async (
  handle: DatabaseHandle,
  body: unknown,
  bearer: string = token,
): Promise<Response> =>
  createApp({ handle, logger: silentLogger, token }).request('/pair', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
    body: JSON.stringify(body),
  });

describe('POST /pair', () => {
  let handle: DatabaseHandle;

  beforeEach(() => {
    handle = openMigratedDatabase();
  });

  afterEach(() => {
    handle.close();
  });

  it('registers the device and returns its identifier', async () => {
    const response = await pair(handle, { name: 'desktop', platform: 'windows' });

    expect(response.status).toBe(201);

    const payload = (await response.json()) as { deviceId: string };
    const stored = handle.db.select().from(devices).all();

    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe(payload.deviceId);
    expect(stored[0]?.name).toBe('desktop');
  });

  it('refuses a wrong token and registers nothing', async () => {
    const response = await pair(handle, { name: 'desktop', platform: 'windows' }, 'guessed');

    expect(response.status).toBe(401);
    expect(handle.db.select().from(devices).all()).toHaveLength(0);
  });

  it('refuses a body that does not name the device', async () => {
    const response = await pair(handle, { platform: 'windows' });

    expect(response.status).toBe(400);
  });

  it('refuses a platform the contracts do not declare', async () => {
    const response = await pair(handle, { name: 'phone', platform: 'android' });

    expect(response.status).toBe(400);
  });

  it('gives each pairing its own device, since two browsers are two devices', async () => {
    const first = (await (await pair(handle, { name: 'chrome', platform: 'windows' })).json()) as {
      deviceId: string;
    };
    const second = (await (
      await pair(handle, { name: 'firefox', platform: 'windows' })
    ).json()) as {
      deviceId: string;
    };

    expect(second.deviceId).not.toBe(first.deviceId);
    expect(handle.db.select().from(devices).all()).toHaveLength(2);
  });

  it('lets a paired device send heartbeats, which was refused before pairing', async () => {
    const paired = (await (
      await pair(handle, { name: 'desktop', platform: 'windows' })
    ).json()) as {
      deviceId: string;
    };

    const response = await createApp({ handle, logger: silentLogger, token }).request(
      '/ingest/heartbeat',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          deviceId: paired.deviceId,
          source: { kind: 'browser', app: 'netflix.com' },
          rawTitle: 'Arcane S01E01',
          state: 'playing',
          positionSeconds: 10,
          observedAt: '2026-09-17T21:00:00.000Z',
        }),
      },
    );

    expect(response.status).toBe(202);
  });
});
