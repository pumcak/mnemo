import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './client';
import type { DatabaseHandle } from './client';
import { runMigrations } from './migrate';
import type { Logger } from '../logger';

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Writes the two files drizzle-kit would generate for a single migration. */
const writeMigration = (folder: string, tag: string, sql: string): void => {
  mkdirSync(join(folder, 'meta'), { recursive: true });
  writeFileSync(join(folder, `${tag}.sql`), sql);
  writeFileSync(
    join(folder, 'meta', '_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'sqlite',
      entries: [{ idx: 0, version: '6', when: 1_700_000_000_000, tag, breakpoints: true }],
    }),
  );
};

const tableNames = (handle: DatabaseHandle): string[] =>
  handle.sqlite
    .prepare("select name from sqlite_master where type = 'table'")
    .all()
    .map((row) => (row as { name: string }).name);

describe('runMigrations', () => {
  let folder: string;
  let handle: DatabaseHandle;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'mnemo-migrations-'));
    handle = openDatabase(':memory:');
  });

  afterEach(() => {
    handle.close();
    rmSync(folder, { recursive: true, force: true });
  });

  it('does nothing when no migration has been generated yet', () => {
    expect(() => {
      runMigrations(handle, folder, silentLogger);
    }).not.toThrow();

    expect(tableNames(handle)).toEqual([]);
  });

  it('applies a pending migration', () => {
    writeMigration(folder, '0000_probe', 'create table probe (id integer primary key);');

    runMigrations(handle, folder, silentLogger);

    expect(tableNames(handle)).toContain('probe');
  });

  it('is safe to run twice', () => {
    writeMigration(folder, '0000_probe', 'create table probe (id integer primary key);');

    runMigrations(handle, folder, silentLogger);

    expect(() => {
      runMigrations(handle, folder, silentLogger);
    }).not.toThrow();

    expect(tableNames(handle)).toContain('probe');
  });
});
