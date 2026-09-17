import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDefaultDatabasePath } from './paths';

describe('resolveDefaultDatabasePath', () => {
  it('uses the local app data directory on windows', () => {
    const path = resolveDefaultDatabasePath({
      platform: 'win32',
      env: { LOCALAPPDATA: 'C:\\Users\\someone\\AppData\\Local' },
    });

    expect(path).toContain('AppData');
    expect(path.endsWith('mnemo.db')).toBe(true);
  });

  it('falls back to the home directory when windows does not say where', () => {
    const path = resolveDefaultDatabasePath({ platform: 'win32', env: {}, home: '/home/someone' });

    expect(path).toContain('AppData');
    expect(path).toContain('someone');
  });

  it('uses application support on macos', () => {
    const path = resolveDefaultDatabasePath({
      platform: 'darwin',
      env: {},
      home: '/Users/someone',
    });

    expect(path).toContain('Application Support');
  });

  it('honours the xdg data directory on linux', () => {
    const path = resolveDefaultDatabasePath({
      platform: 'linux',
      env: { XDG_DATA_HOME: '/data' },
      home: '/home/someone',
    });

    expect(path).toBe(join('/data', 'mnemo', 'mnemo.db'));
  });

  it('falls back to the conventional share directory on linux', () => {
    const path = resolveDefaultDatabasePath({
      platform: 'linux',
      env: {},
      home: '/home/someone',
    });

    expect(path).toBe(join('/home/someone', '.local', 'share', 'mnemo', 'mnemo.db'));
  });
});
