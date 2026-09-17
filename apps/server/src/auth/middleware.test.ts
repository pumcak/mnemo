import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { DatabaseHandle } from '../db/client';
import { openMigratedDatabase, silentLogger } from '../testing/database';

const token = 'a-token-that-only-the-disk-knows';
const extensionOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

const app = (handle: DatabaseHandle, allowedOrigins: readonly string[] = []) =>
  createApp({ handle, logger: silentLogger, token, allowedOrigins });

const pairBody = JSON.stringify({ name: 'desktop', platform: 'windows' });

describe('token guard', () => {
  let handle: DatabaseHandle;

  beforeEach(() => {
    handle = openMigratedDatabase();
  });

  afterEach(() => {
    handle.close();
  });

  it('refuses a pairing attempt with no authorization header', async () => {
    const response = await app(handle).request('/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: pairBody,
    });

    expect(response.status).toBe(401);
  });

  it('refuses a wrong token', async () => {
    const response = await app(handle).request('/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer guessed' },
      body: pairBody,
    });

    expect(response.status).toBe(401);
  });

  it('refuses a token sent without the bearer scheme', async () => {
    const response = await app(handle).request('/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: token },
      body: pairBody,
    });

    expect(response.status).toBe(401);
  });

  it('accepts the right token', async () => {
    const response = await app(handle).request('/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: pairBody,
    });

    expect(response.status).toBe(201);
  });

  it('guards the ingest endpoint too', async () => {
    const response = await app(handle).request('/ingest/heartbeat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(401);
  });

  it('leaves health open, since a source needs it before it has a token', async () => {
    const response = await app(handle).request('/health');

    expect(response.status).toBe(200);
  });
});

describe('host guard', () => {
  let handle: DatabaseHandle;

  beforeEach(() => {
    handle = openMigratedDatabase();
  });

  afterEach(() => {
    handle.close();
  });

  it('refuses a request that arrived under someone else domain', async () => {
    const response = await app(handle).request('/health', {
      headers: { host: 'rebound.example.com' },
    });

    expect(response.status).toBe(403);
  });

  it('accepts the loopback spellings, with or without a port', async () => {
    for (const host of ['127.0.0.1:4870', 'localhost:4870', 'localhost', '[::1]:4870']) {
      const response = await app(handle).request('/health', { headers: { host } });

      expect(response.status).toBe(200);
    }
  });
});

describe('cross origin rules', () => {
  let handle: DatabaseHandle;

  beforeEach(() => {
    handle = openMigratedDatabase();
  });

  afterEach(() => {
    handle.close();
  });

  it('allows nothing cross origin by default', async () => {
    const response = await app(handle).request('/health', {
      headers: { origin: extensionOrigin },
    });

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('allows the origin it was configured with', async () => {
    const response = await app(handle, [extensionOrigin]).request('/health', {
      headers: { origin: extensionOrigin },
    });

    expect(response.headers.get('access-control-allow-origin')).toBe(extensionOrigin);
  });

  it('still refuses a page that is not on the list', async () => {
    const response = await app(handle, [extensionOrigin]).request('/health', {
      headers: { origin: 'https://ads.example.com' },
    });

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers the preflight without asking it for a token', async () => {
    const response = await app(handle, [extensionOrigin]).request('/ingest/heartbeat', {
      method: 'OPTIONS',
      headers: {
        origin: extensionOrigin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(extensionOrigin);
  });
});
