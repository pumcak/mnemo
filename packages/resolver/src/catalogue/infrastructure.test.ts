import { describe, expect, it } from 'vitest';
import { createTtlCache } from './cache';
import { createRateLimiter } from './rate-limit';

describe('createTtlCache', () => {
  it('returns what it was given until it expires', () => {
    let clock = 0;
    const cache = createTtlCache<string>({ ttlMs: 100, maxEntries: 10, now: () => clock });

    cache.set('heat', 'film');
    clock = 99;

    expect(cache.get('heat')).toBe('film');

    clock = 100;

    expect(cache.get('heat')).toBeUndefined();
  });

  it('throws out the least recently used entry first', () => {
    const cache = createTtlCache<number>({ ttlMs: 1000, maxEntries: 2, now: () => 0 });

    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });

  it('restarts the clock of an entry that is set again', () => {
    let clock = 0;
    const cache = createTtlCache<number>({ ttlMs: 100, maxEntries: 10, now: () => clock });

    cache.set('a', 1);
    clock = 90;
    cache.set('a', 2);
    clock = 150;

    expect(cache.get('a')).toBe(2);
  });
});

describe('createRateLimiter', () => {
  it('spaces the starts of consecutive calls', async () => {
    let clock = 0;
    const waits: number[] = [];
    const limiter = createRateLimiter({
      minIntervalMs: 100,
      now: () => clock,
      sleep: (ms) => {
        waits.push(ms);
        clock += ms;

        return Promise.resolve();
      },
    });

    await Promise.all([1, 2, 3].map((value) => limiter.schedule(() => Promise.resolve(value))));

    expect(waits).toEqual([100, 100]);
  });

  it('does not wait when the previous call is long gone', async () => {
    let clock = 0;
    const waits: number[] = [];
    const limiter = createRateLimiter({
      minIntervalMs: 100,
      now: () => clock,
      sleep: (ms) => {
        waits.push(ms);

        return Promise.resolve();
      },
    });

    await limiter.schedule(() => Promise.resolve(1));
    clock += 500;
    await limiter.schedule(() => Promise.resolve(2));

    expect(waits).toEqual([]);
  });

  it('keeps going after a call fails, so one error does not stall the queue', async () => {
    const limiter = createRateLimiter({ minIntervalMs: 0 });

    await expect(limiter.schedule(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(limiter.schedule(() => Promise.resolve('next'))).resolves.toBe('next');
  });

  it('runs calls in the order they were scheduled', async () => {
    const limiter = createRateLimiter({ minIntervalMs: 0 });
    const order: number[] = [];

    await Promise.all(
      [1, 2, 3].map((value) =>
        limiter.schedule(() => {
          order.push(value);

          return Promise.resolve();
        }),
      ),
    );

    expect(order).toEqual([1, 2, 3]);
  });
});
