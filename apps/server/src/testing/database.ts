import { fileURLToPath } from 'node:url';
import { openDatabase } from '../db/client';
import type { DatabaseHandle } from '../db/client';
import { runMigrations } from '../db/migrate';
import { devices } from '../db/schema';
import type { Logger } from '../logger';

/** Test scaffolding: a migrated in memory database and a logger that says nothing. */

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const migrationsFolder = fileURLToPath(new URL('../../migrations', import.meta.url));

export const openMigratedDatabase = (): DatabaseHandle => {
  const handle = openDatabase(':memory:');

  runMigrations(handle, migrationsFolder, silentLogger);

  return handle;
};

export const registerDevice = (handle: DatabaseHandle, id: string, at: Date): void => {
  handle.db
    .insert(devices)
    .values({ id, name: 'desktop', platform: 'windows', createdAt: at, lastSeenAt: at })
    .run();
};
