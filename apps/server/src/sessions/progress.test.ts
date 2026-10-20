import { describe, expect, it } from 'vitest';
import { maxCreditedSeconds, playedBetween, sessionProgress } from './progress';

const at = (seconds: number): Date =>
  new Date(Date.parse('2026-10-20T20:00:00.000Z') + seconds * 1000);

describe('playedBetween', () => {
  it('credits the interval after a playing observation', () => {
    expect(
      playedBetween(
        { observedAt: at(0), state: 'playing' },
        { observedAt: at(15), state: 'playing' },
      ),
    ).toBe(15);
  });

  it('credits nothing after a pause, whatever comes next', () => {
    expect(
      playedBetween(
        { observedAt: at(0), state: 'paused' },
        { observedAt: at(15), state: 'playing' },
      ),
    ).toBe(0);
  });

  it('credits the interval that ends on a pause', () => {
    expect(
      playedBetween(
        { observedAt: at(0), state: 'playing' },
        { observedAt: at(10), state: 'paused' },
      ),
    ).toBe(10);
  });

  it('caps a long silence instead of crediting all of it', () => {
    expect(
      playedBetween(
        { observedAt: at(0), state: 'playing' },
        { observedAt: at(600), state: 'playing' },
      ),
    ).toBe(maxCreditedSeconds);
  });

  it('never goes negative', () => {
    expect(
      playedBetween(
        { observedAt: at(15), state: 'playing' },
        { observedAt: at(0), state: 'playing' },
      ),
    ).toBe(0);
  });
});

describe('sessionProgress', () => {
  it('is the share of the duration reached', () => {
    expect(sessionProgress({ lastPositionSeconds: 630, durationSeconds: 2520 })).toBe(0.25);
  });

  it('is unknown without a duration', () => {
    expect(sessionProgress({ lastPositionSeconds: 630, durationSeconds: null })).toBeUndefined();
  });

  it('stays within bounds when a player rounds past the end', () => {
    expect(sessionProgress({ lastPositionSeconds: 2521, durationSeconds: 2520 })).toBe(1);
  });
});
