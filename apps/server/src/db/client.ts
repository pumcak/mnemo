import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

export interface DatabaseHandle {
  db: BetterSQLite3Database;
  sqlite: Database.Database;
  close: () => void;
}

const inMemoryPath = ':memory:';

/**
 * Opens the database and puts it in the shape the service expects.
 *
 * WAL matters more here than it looks: heartbeats are written continuously
 * while the interface reads the same file, and the default journal mode makes
 * those two block each other. NORMAL synchronous is the matching trade, since
 * losing the last few heartbeats to a power cut is acceptable and a full fsync
 * per write is not.
 */
export const openDatabase = (path: string): DatabaseHandle => {
  if (path !== inMemoryPath) {
    mkdirSync(dirname(path), { recursive: true });
  }

  const sqlite = new Database(path);

  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  return {
    sqlite,
    db: drizzle(sqlite),
    close: () => {
      sqlite.close();
    },
  };
};
