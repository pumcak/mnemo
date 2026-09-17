import type { Heartbeat } from '@mnemo/contracts';
import { describe, expect, it } from 'vitest';
import { createServiceClient } from './service-client';

const heartbeat: Heartbeat = {
  deviceId: '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11',
  source: { kind: 'browser', app: 'netflix.com' },
  rawTitle: 'Arcane S01E01',
  state: 'playing',
  positionSeconds: 30,
  observedAt: '2026-09-17T22:00:00.000Z',
};

interface Recorded {
  url: string;
  init: RequestInit | undefined;
}

const clientAnswering = (
  reply: Response | (() => Promise<Response>),
): { client: ReturnType<typeof createServiceClient>; calls: Recorded[] } => {
  const calls: Recorded[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ url: input instanceof Request ? input.url : input.toString(), init });

    return typeof reply === 'function' ? reply() : reply.clone();
  };

  return {
    calls,
    client: createServiceClient({
      serviceUrl: 'http://127.0.0.1:4870',
      token: 'a-token',
      fetcher,
    }),
  };
};

describe('sendHeartbeat', () => {
  it('carries the token and posts to the ingest endpoint', async () => {
    const { client, calls } = clientAnswering(new Response(null, { status: 202 }));

    expect(await client.sendHeartbeat(heartbeat)).toBe('sent');
    expect(calls[0]?.url).toBe('http://127.0.0.1:4870/ingest/heartbeat');
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer a-token');
  });

  it.each([
    [401, 'unpaired'],
    [404, 'unpaired'],
  ])('treats %i as a pairing that needs redoing', async (status, expected) => {
    const { client } = clientAnswering(new Response(null, { status }));

    expect(await client.sendHeartbeat(heartbeat)).toBe(expected);
  });

  it('treats a rejected payload as refused, since retrying would not help', async () => {
    const { client } = clientAnswering(new Response(null, { status: 400 }));

    expect(await client.sendHeartbeat(heartbeat)).toBe('refused');
  });

  it('treats a server fault as worth retrying', async () => {
    const { client } = clientAnswering(new Response(null, { status: 500 }));

    expect(await client.sendHeartbeat(heartbeat)).toBe('retry');
  });

  it('treats a service that is not running as worth retrying', async () => {
    const { client } = clientAnswering(() => Promise.reject(new Error('connection refused')));

    expect(await client.sendHeartbeat(heartbeat)).toBe('retry');
  });
});

describe('reachable', () => {
  it('is true when health answers', async () => {
    const { client, calls } = clientAnswering(new Response('{}', { status: 200 }));

    expect(await client.reachable()).toBe(true);
    expect(calls[0]?.url).toBe('http://127.0.0.1:4870/health');
  });

  it('is false when nothing is listening', async () => {
    const { client } = clientAnswering(() => Promise.reject(new Error('connection refused')));

    expect(await client.reachable()).toBe(false);
  });
});

describe('pair', () => {
  it('returns the device the service registered', async () => {
    const { client } = clientAnswering(
      new Response(JSON.stringify({ deviceId: '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11' }), {
        status: 201,
      }),
    );

    expect(await client.pair('desktop', 'windows')).toEqual({
      deviceId: '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11',
    });
  });

  it('refuses to invent a device when the service says no', async () => {
    const { client } = clientAnswering(new Response(null, { status: 401 }));

    await expect(client.pair('desktop', 'windows')).rejects.toThrow('401');
  });

  it('refuses an answer that is not the shape the contract promises', async () => {
    const { client } = clientAnswering(
      new Response(JSON.stringify({ deviceId: 'not-a-uuid' }), { status: 201 }),
    );

    await expect(client.pair('desktop', 'windows')).rejects.toThrow();
  });
});
