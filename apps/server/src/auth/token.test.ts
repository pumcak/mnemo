import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadOrCreateToken, tokenMatches } from './token';

describe('loadOrCreateToken', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'mnemo-token-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('creates a token on first run and writes it where it was asked to', () => {
    const path = join(directory, 'nested', 'mnemo.token');
    const token = loadOrCreateToken(path);

    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(readFileSync(path, 'utf8').trim()).toBe(token);
  });

  it('returns the same token on the next run', () => {
    const path = join(directory, 'mnemo.token');

    expect(loadOrCreateToken(path)).toBe(loadOrCreateToken(path));
  });

  it('generates a different token for a different installation', () => {
    const first = loadOrCreateToken(join(directory, 'one.token'));
    const second = loadOrCreateToken(join(directory, 'two.token'));

    expect(first).not.toBe(second);
  });

  it('replaces a file that was emptied rather than handing back nothing', () => {
    const path = join(directory, 'mnemo.token');

    writeFileSync(path, '   \n');

    expect(loadOrCreateToken(path).trim().length).toBeGreaterThan(0);
  });
});

describe('tokenMatches', () => {
  it('accepts the exact token', () => {
    expect(tokenMatches('abc123', 'abc123')).toBe(true);
  });

  it('rejects a different token of the same length', () => {
    expect(tokenMatches('abc123', 'abc124')).toBe(false);
  });

  it('rejects a prefix instead of throwing on the length mismatch', () => {
    expect(tokenMatches('abc123', 'abc')).toBe(false);
  });

  it('rejects an empty attempt', () => {
    expect(tokenMatches('abc123', '')).toBe(false);
  });
});
