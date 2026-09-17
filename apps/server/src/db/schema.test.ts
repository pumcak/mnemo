import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './client';
import type { DatabaseHandle } from './client';
import { runMigrations } from './migrate';
import { devices, sources } from './schema';
import type { Logger } from '../logger';

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const migrationsFolder = fileURLToPath(new URL('../../migrations', import.meta.url));

const now = new Date('2026-09-17T19:00:00.000Z');

describe('devices and sources tables', () => {
  let handle: DatabaseHandle;

  beforeEach(() => {
    handle = openDatabase(':memory:');
    runMigrations(handle, migrationsFolder, silentLogger);
  });

  afterEach(() => {
    handle.close();
  });

  it('stores a device and reads its timestamps back as dates', () => {
    handle.db
      .insert(devices)
      .values({
        id: '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11',
        name: 'desktop',
        platform: 'windows',
        createdAt: now,
        lastSeenAt: now,
      })
      .run();

    const stored = handle.db.select().from(devices).all();

    expect(stored).toHaveLength(1);
    expect(stored[0]?.name).toBe('desktop');
    expect(stored[0]?.lastSeenAt.toISOString()).toBe(now.toISOString());
  });

  it('refuses a platform the contracts do not declare', () => {
    expect(() =>
      handle.db
        .insert(devices)
        .values({
          id: '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e12',
          name: 'phone',
          platform: 'android',
          createdAt: now,
          lastSeenAt: now,
        })
        .run(),
    ).toThrow();
  });

  it('stores a capture source', () => {
    handle.db.insert(sources).values({ kind: 'browser', app: 'netflix.com', createdAt: now }).run();

    const stored = handle.db.select().from(sources).all();

    expect(stored[0]?.kind).toBe('browser');
    expect(stored[0]?.id).toBeTypeOf('number');
  });

  it('keeps one row per kind and application pair', () => {
    handle.db.insert(sources).values({ kind: 'browser', app: 'netflix.com', createdAt: now }).run();

    expect(() =>
      handle.db
        .insert(sources)
        .values({ kind: 'browser', app: 'netflix.com', createdAt: now })
        .run(),
    ).toThrow();

    handle.db.insert(sources).values({ kind: 'smtc', app: 'netflix.com', createdAt: now }).run();

    expect(handle.db.select().from(sources).all()).toHaveLength(2);
  });

  it('refuses a capture kind the contracts do not declare', () => {
    expect(() =>
      handle.db
        .insert(sources)
        .values({ kind: 'chromecast', app: 'chromecast', createdAt: now })
        .run(),
    ).toThrow();
  });
});
