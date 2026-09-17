import { errorResponseSchema } from '@mnemo/contracts';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { failureHandler, notFoundHandler } from './errors';
import { createApp } from '../app';
import type { DatabaseHandle } from '../db/client';
import type { Logger } from '../logger';
import { openMigratedDatabase, silentLogger } from '../testing/database';

const token = 'a-token-that-only-the-disk-knows';

const parseError = async (response: Response): Promise<{ code: string; message: string }> => {
  const parsed = errorResponseSchema.parse(await response.json());

  return parsed.error;
};

describe('refusals coming out of the real app', () => {
  let handle: DatabaseHandle;

  beforeEach(() => {
    handle = openMigratedDatabase();
  });

  afterEach(() => {
    handle.close();
  });

  const app = (): Hono => createApp({ handle, logger: silentLogger, token });

  it('answers an unknown route in the same shape as everything else', async () => {
    const error = await parseError(await app().request('/nope'));

    expect(error.code).toBe('not_found');
  });

  it('labels a missing token', async () => {
    const error = await parseError(
      await app().request('/pair', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    );

    expect(error.code).toBe('unauthorized');
  });

  it('labels a foreign hostname', async () => {
    const error = await parseError(
      await app().request('/health', { headers: { host: 'evil.test' } }),
    );

    expect(error.code).toBe('forbidden_host');
  });

  it('labels a body that is not json', async () => {
    const error = await parseError(
      await app().request('/ingest/heartbeat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: 'nonsense',
      }),
    );

    expect(error.code).toBe('invalid_body');
  });

  it('says which field broke the contract', async () => {
    const response = await app().request('/ingest/heartbeat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11',
        source: { kind: 'browser', app: 'netflix.com' },
        rawTitle: 'Arcane',
        state: 'playing',
        positionSeconds: -1,
        observedAt: '2026-09-17T22:00:00.000Z',
      }),
    });

    const parsed = errorResponseSchema.parse(await response.json());

    expect(parsed.error.code).toBe('contract_violation');
    expect(parsed.error.details?.[0]?.path).toBe('positionSeconds');
  });

  it('labels a device that never paired', async () => {
    const error = await parseError(
      await app().request('/ingest/heartbeat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          deviceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          source: { kind: 'browser', app: 'netflix.com' },
          rawTitle: 'Arcane',
          state: 'playing',
          positionSeconds: 1,
          observedAt: '2026-09-17T22:00:00.000Z',
        }),
      }),
    );

    expect(error.code).toBe('unknown_device');
  });
});

describe('failureHandler', () => {
  it('hides what went wrong from the caller and keeps it for the log', async () => {
    const logged: string[] = [];
    const logger: Logger = {
      ...silentLogger,
      error: (fields) => {
        logged.push(JSON.stringify(fields));
      },
    };

    const app = new Hono()
      .onError(failureHandler(logger))
      .notFound(notFoundHandler)
      .get('/boom', () => {
        throw new Error('the database is on fire at row 42');
      });

    const response = await app.request('/boom');
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain('row 42');
    expect(errorResponseSchema.parse(JSON.parse(body)).error.code).toBe('internal');
    expect(logged.join()).toContain('row 42');
  });
});
