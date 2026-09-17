import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Logger } from './logger';
import { requestLogger } from './request-logger';

interface Entry {
  fields: Record<string, unknown>;
  message: string;
}

const createRecorder = (): { logger: Logger; entries: Entry[] } => {
  const entries: Entry[] = [];
  const record = (fields: Record<string, unknown>, message: string): void => {
    entries.push({ fields, message });
  };

  return {
    entries,
    logger: { debug: record, info: record, warn: record, error: record },
  };
};

const appWith = (logger: Logger): Hono =>
  new Hono().use('*', requestLogger(logger)).get('/health', (c) => c.text('ok'));

describe('requestLogger', () => {
  it('logs one line per request with method, path, status and duration', async () => {
    const { logger, entries } = createRecorder();

    await appWith(logger).request('/health');

    expect(entries).toHaveLength(1);
    expect(entries[0]?.message).toBe('request');
    expect(entries[0]?.fields).toMatchObject({ method: 'GET', path: '/health', status: 200 });
    expect(entries[0]?.fields.durationMs).toBeTypeOf('number');
  });

  it('keeps the query string out of the log', async () => {
    const { logger, entries } = createRecorder();

    await appWith(logger).request('/health?title=Arcane%20S01E01');

    expect(entries[0]?.fields.path).toBe('/health');
    expect(JSON.stringify(entries[0])).not.toContain('Arcane');
  });

  it('logs the status of a request that matched no route', async () => {
    const { logger, entries } = createRecorder();

    await appWith(logger).request('/nope');

    expect(entries[0]?.fields).toMatchObject({ path: '/nope', status: 404 });
  });
});
