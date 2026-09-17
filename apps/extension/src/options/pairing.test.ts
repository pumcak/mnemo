import { describe, expect, it } from 'vitest';
import { detectPlatform, pairDevice } from './pairing';
import type { ServiceClient } from '../service-client';
import { loadSettings } from '../settings';
import { createMemoryStore } from '../storage';

const deviceId = '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11';

const clientThat = (behaviour: { reachable?: boolean; pairs?: boolean }): (() => ServiceClient) => {
  const { reachable = true, pairs = true } = behaviour;

  return () => ({
    reachable: () => Promise.resolve(reachable),
    pair: () =>
      pairs ? Promise.resolve({ deviceId }) : Promise.reject(new Error('401 from the service')),
    sendHeartbeat: () => Promise.resolve('sent'),
  });
};

const request = (overrides: Partial<Parameters<typeof pairDevice>[0]> = {}) => ({
  store: createMemoryStore(),
  serviceUrl: 'http://127.0.0.1:4870',
  token: 'a-token-from-the-file',
  name: 'desktop',
  platform: 'windows' as const,
  clientFactory: clientThat({}),
  ...overrides,
});

describe('detectPlatform', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'macos'],
    ['Mozilla/5.0 (X11; Linux x86_64)', 'linux'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'macos'],
  ])('reads %s as %s', (userAgent, expected) => {
    expect(detectPlatform(userAgent)).toBe(expected);
  });

  it('falls back to linux rather than refusing to pair', () => {
    expect(detectPlatform('something nobody has seen')).toBe('linux');
  });
});

describe('pairDevice', () => {
  it('remembers the token and the device the service handed back', async () => {
    const store = createMemoryStore();

    expect(await pairDevice(request({ store }))).toBe('paired');

    const settings = await loadSettings(store);

    expect(settings.deviceId).toBe(deviceId);
    expect(settings.token).toBe('a-token-from-the-file');
  });

  it('says the service is not running, which is not the same as a wrong token', async () => {
    const store = createMemoryStore();

    expect(
      await pairDevice(request({ store, clientFactory: clientThat({ reachable: false }) })),
    ).toBe('unreachable');
    expect((await loadSettings(store)).deviceId).toBeUndefined();
  });

  it('says the token was refused', async () => {
    const store = createMemoryStore();

    expect(await pairDevice(request({ store, clientFactory: clientThat({ pairs: false }) }))).toBe(
      'refused',
    );
    expect((await loadSettings(store)).token).toBeUndefined();
  });

  it('refuses an empty token without bothering the service', async () => {
    expect(await pairDevice(request({ token: '   ' }))).toBe('invalid');
  });

  it('refuses an unnamed device, since the history would not say where', async () => {
    expect(await pairDevice(request({ name: '  ' }))).toBe('invalid');
  });

  it('trims what was pasted, because a copied token carries whitespace', async () => {
    const store = createMemoryStore();

    await pairDevice(request({ store, token: '  a-token-from-the-file \n' }));

    expect((await loadSettings(store)).token).toBe('a-token-from-the-file');
  });

  it('keeps the settings that were already there', async () => {
    const store = createMemoryStore();

    await pairDevice(request({ store }));

    expect((await loadSettings(store)).paused).toBe(false);
  });
});
