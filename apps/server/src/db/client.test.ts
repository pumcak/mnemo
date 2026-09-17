import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './client';

describe('openDatabase', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'mnemo-db-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('creates the parent directories of a database that does not exist yet', () => {
    const path = join(directory, 'nested', 'deeper', 'mnemo.db');
    const handle = openDatabase(path);

    expect(existsSync(path)).toBe(true);

    handle.close();
  });

  it('puts a file database in write ahead logging mode', () => {
    const handle = openDatabase(join(directory, 'mnemo.db'));

    expect(handle.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');

    handle.close();
  });

  it('enforces foreign keys, which sqlite leaves off by default', () => {
    const handle = openDatabase(join(directory, 'mnemo.db'));

    expect(handle.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);

    handle.close();
  });

  it('accepts an in memory database for tests', () => {
    const handle = openDatabase(':memory:');

    handle.sqlite.exec('create table probe (id integer primary key)');

    expect(handle.sqlite.prepare('select count(*) as total from probe').get()).toEqual({
      total: 0,
    });

    handle.close();
  });
});
