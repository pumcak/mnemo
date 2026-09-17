import { describe, expect, it } from 'vitest';
import { retryDelayMs } from './backoff';

const noJitter = { random: () => 0 };

describe('retryDelayMs', () => {
  it('waits the floor on the first failure, since an alarm cannot fire sooner', () => {
    expect(retryDelayMs(0, noJitter)).toBe(30_000);
  });

  it('doubles as failures pile up', () => {
    expect(retryDelayMs(1, noJitter)).toBe(60_000);
    expect(retryDelayMs(2, noJitter)).toBe(120_000);
    expect(retryDelayMs(3, noJitter)).toBe(240_000);
  });

  it('stops growing at the cap', () => {
    expect(retryDelayMs(50, noJitter)).toBe(30 * 60_000);
  });

  it('adds noise, so several workers waking together do not all knock at once', () => {
    expect(retryDelayMs(2, { random: () => 1 })).toBeGreaterThan(retryDelayMs(2, noJitter));
  });

  it('never returns less than the floor, whatever it is given', () => {
    for (const failures of [-5, 0, 1, 2]) {
      expect(retryDelayMs(failures, noJitter)).toBeGreaterThanOrEqual(30_000);
    }
  });

  it('accepts a shorter floor, which is what a test wants', () => {
    expect(retryDelayMs(0, { ...noJitter, floorMs: 10, baseMs: 100 })).toBe(100);
  });
});
