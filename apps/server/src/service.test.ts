import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Config } from './config';
import { heartbeats, playbackSessions } from './db/schema';
import type { Service } from './service';
import { startService } from './service';
import { silentLogger } from './testing/database';

/**
 * These tests go over real HTTP against a really listening service, which is
 * what the in process route tests cannot cover: the node adapter, the token read
 * from an actual file, the boot order, and the Host header a client sends.
 *
 * Port 0 asks the operating system for a free one, so nothing collides.
 */
const configFor = (directory: string): Config => ({
  host: '127.0.0.1',
  port: 0,
  logLevel: 'silent',
  databasePath: join(directory, 'mnemo.db'),
  heartbeatRetentionDays: 30,
  tokenPath: join(directory, 'mnemo.token'),
  allowedOrigins: [],
});

const statusWithHost = (port: number, host: string): Promise<number> =>
  new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      { hostname: '127.0.0.1', port, path: '/health', method: 'GET', headers: { host } },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      },
    );

    outgoing.once('error', reject);
    outgoing.end();
  });

const heartbeatFor = (deviceId: string, position: number, observedAt: string): string =>
  JSON.stringify({
    deviceId,
    source: { kind: 'browser', app: 'netflix.com' },
    rawTitle: 'Arcane: Season 1: Welcome to the Playground',
    state: 'playing',
    positionSeconds: position,
    durationSeconds: 2520,
    observedAt,
  });

describe('the service over real http', () => {
  let directory: string;
  let service: Service;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'mnemo-service-'));
    service = await startService(configFor(directory), silentLogger);
  });

  afterEach(async () => {
    await service.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const authorized = (body: string): RequestInit => ({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${service.token}`,
    },
    body,
  });

  const pair = async (): Promise<string> => {
    const response = await fetch(
      `${service.url}/pair`,
      authorized(JSON.stringify({ name: 'desktop', platform: 'windows' })),
    );
    const payload = (await response.json()) as { deviceId: string };

    return payload.deviceId;
  };

  it('binds to a port and answers health', async () => {
    const response = await fetch(`${service.url}/health`);

    expect(response.status).toBe(200);
    expect(service.port).toBeGreaterThan(0);
  });

  it('uses the token it wrote to disk', () => {
    expect(readFileSync(configFor(directory).tokenPath, 'utf8').trim()).toBe(service.token);
  });

  it('refuses to pair without the token', async () => {
    const response = await fetch(`${service.url}/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'desktop', platform: 'windows' }),
    });

    expect(response.status).toBe(401);
  });

  it('refuses to ingest without the token, even with a real device', async () => {
    const deviceId = await pair();

    const response = await fetch(`${service.url}/ingest/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: heartbeatFor(deviceId, 30, '2026-09-17T22:00:00.000Z'),
    });

    expect(response.status).toBe(401);
    expect(service.handle.db.select().from(heartbeats).all()).toHaveLength(0);
  });

  it('pairs then ingests, and the row is in the database', async () => {
    const deviceId = await pair();

    const response = await fetch(
      `${service.url}/ingest/heartbeat`,
      authorized(heartbeatFor(deviceId, 30, '2026-09-17T22:00:00.000Z')),
    );

    expect(response.status).toBe(202);
    expect(service.handle.db.select().from(heartbeats).all()).toHaveLength(1);
  });

  it('refuses a request that arrived under a foreign hostname', async () => {
    // fetch refuses to let a caller set Host, so this one goes out raw. Which is
    // also why the guard matters for rebinding rather than for a forged header:
    // the browser is the one filling Host in, and it fills in the page domain.
    expect(await statusWithHost(service.port, 'rebound.example.com')).toBe(403);
    expect(await statusWithHost(service.port, '127.0.0.1')).toBe(200);
  });

  it('keeps concurrent observations in one session and loses none', async () => {
    const deviceId = await pair();
    const count = 20;

    const responses = await Promise.all(
      Array.from({ length: count }, (_unused, index) =>
        fetch(
          `${service.url}/ingest/heartbeat`,
          authorized(
            heartbeatFor(
              deviceId,
              index * 15,
              new Date(Date.parse('2026-09-17T22:00:00.000Z') + index * 15_000).toISOString(),
            ),
          ),
        ),
      ),
    );

    expect(responses.every((response) => response.status === 202)).toBe(true);
    expect(service.handle.db.select().from(heartbeats).all()).toHaveLength(count);
    expect(service.handle.db.select().from(playbackSessions).all()).toHaveLength(1);
  });
});

describe('restarting the service', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'mnemo-restart-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('keeps the token and the history across a restart', async () => {
    const first = await startService(configFor(directory), silentLogger);

    const paired = await fetch(`${first.url}/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${first.token}` },
      body: JSON.stringify({ name: 'desktop', platform: 'windows' }),
    });
    const { deviceId } = (await paired.json()) as { deviceId: string };

    await fetch(`${first.url}/ingest/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${first.token}` },
      body: heartbeatFor(deviceId, 30, '2026-09-17T22:00:00.000Z'),
    });

    await first.close();

    const second = await startService(configFor(directory), silentLogger);

    expect(second.token).toBe(first.token);
    expect(second.handle.db.select().from(heartbeats).all()).toHaveLength(1);

    await second.close();
  });
});
