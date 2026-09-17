import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { DatabaseHandle } from './client';
import type { Logger } from '../logger';

/**
 * Applies pending migrations, and does nothing at all when the folder holds
 * none yet. A fresh checkout with no generated migration is a normal state, not
 * a reason to refuse to start.
 */
export const runMigrations = (
  handle: DatabaseHandle,
  migrationsFolder: string,
  logger: Logger,
): void => {
  if (!existsSync(join(migrationsFolder, 'meta', '_journal.json'))) {
    logger.debug({ migrationsFolder }, 'no migrations to apply');
    return;
  }

  migrate(handle.db, { migrationsFolder });
  logger.info({ migrationsFolder }, 'migrations applied');
};
