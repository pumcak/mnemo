import { describe, expect, it } from 'vitest';
import { defaultSettings, isBlocked, loadSettings, saveSettings, settingsKey } from './settings';
import { createMemoryStore } from './storage';

describe('settings', () => {
  it('starts paused off, with no blocked domain and the loopback service', () => {
    const settings = defaultSettings();

    expect(settings.paused).toBe(false);
    expect(settings.blockedDomains).toEqual([]);
    expect(settings.serviceUrl).toBe('http://127.0.0.1:4870');
  });

  it('reads back what was saved', async () => {
    const store = createMemoryStore();

    await saveSettings(store, {
      ...defaultSettings(),
      paused: true,
      blockedDomains: ['adult.example'],
    });

    const loaded = await loadSettings(store);

    expect(loaded.paused).toBe(true);
    expect(loaded.blockedDomains).toEqual(['adult.example']);
  });

  it('falls back to the defaults when nothing was ever stored', async () => {
    expect(await loadSettings(createMemoryStore())).toEqual(defaultSettings());
  });

  it('keeps the usable half of broken stored data', async () => {
    const store = createMemoryStore({ [settingsKey]: { paused: true, serviceUrl: 'not a url' } });

    const loaded = await loadSettings(store);

    expect(loaded.paused).toBe(true);
    expect(loaded.serviceUrl).toBe('http://127.0.0.1:4870');
  });

  it('survives stored data of the wrong type entirely', async () => {
    const store = createMemoryStore({ [settingsKey]: 'corrupted' });

    expect(await loadSettings(store)).toEqual(defaultSettings());
  });
});

describe('isBlocked', () => {
  const settings = { ...defaultSettings(), blockedDomains: ['adult.example', 'work.internal'] };

  it('blocks the exact hostname', () => {
    expect(isBlocked(settings, 'adult.example')).toBe(true);
  });

  it('blocks a subdomain of a blocked domain', () => {
    expect(isBlocked(settings, 'videos.adult.example')).toBe(true);
  });

  it('does not block a hostname that merely ends with the same letters', () => {
    expect(isBlocked(settings, 'notadult.example')).toBe(false);
  });

  it('leaves everything else alone', () => {
    expect(isBlocked(settings, 'netflix.com')).toBe(false);
  });
});
