import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import type { HealthPayload } from './app';
import type { DatabaseHandle } from './db/client';
import { openMigratedDatabase, silentLogger } from './testing/database';

describe('health endpoint', () => {
  let handle: DatabaseHandle;

  beforeEach(() => {
    handle = openMigratedDatabase();
  });

  afterEach(() => {
    handle.close();
  });

  it('reports that the service is up and how long it has been up', async () => {
    const response = await createApp({ handle, logger: silentLogger, token: 'test-token' }).request(
      '/health',
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as HealthPayload;

    expect(payload.status).toBe('ok');
    expect(payload.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('answers nothing else', async () => {
    const response = await createApp({ handle, logger: silentLogger, token: 'test-token' }).request(
      '/',
    );

    expect(response.status).toBe(404);
  });
});
