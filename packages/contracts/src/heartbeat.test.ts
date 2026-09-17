import { describe, expect, it } from 'vitest';
import { heartbeatSchema } from './heartbeat';

const validHeartbeat = {
  deviceId: '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11',
  source: { kind: 'browser', app: 'netflix.com' },
  rawTitle: 'Arcane: Season 1: Welcome to the Playground',
  url: 'https://www.netflix.com/watch/81435684',
  state: 'playing',
  positionSeconds: 412.5,
  durationSeconds: 2520,
  observedAt: '2026-09-17T14:31:05.000Z',
  hint: { seriesTitle: 'Arcane', season: 1, episode: 1 },
};

describe('heartbeatSchema', () => {
  it('accepts an observation coming from the browser', () => {
    const parsed = heartbeatSchema.parse(validHeartbeat);

    expect(parsed.source.kind).toBe('browser');
    expect(parsed.hint?.season).toBe(1);
  });

  it('accepts an observation without duration, url or hint', () => {
    const { durationSeconds: _duration, url: _url, hint: _hint, ...minimal } = validHeartbeat;

    expect(() => heartbeatSchema.parse(minimal)).not.toThrow();
  });

  it('trims the raw title instead of rejecting it', () => {
    const parsed = heartbeatSchema.parse({ ...validHeartbeat, rawTitle: '  One Piece 1071  ' });

    expect(parsed.rawTitle).toBe('One Piece 1071');
  });

  it('rejects a capture source it does not know', () => {
    const result = heartbeatSchema.safeParse({
      ...validHeartbeat,
      source: { kind: 'chromecast', app: 'chromecast' },
    });

    expect(result.success).toBe(false);
  });

  it('rejects a title made only of whitespace', () => {
    const result = heartbeatSchema.safeParse({ ...validHeartbeat, rawTitle: '   ' });

    expect(result.success).toBe(false);
  });

  it('rejects a negative position', () => {
    const result = heartbeatSchema.safeParse({ ...validHeartbeat, positionSeconds: -1 });

    expect(result.success).toBe(false);
  });

  it('rejects a position well past the duration', () => {
    const result = heartbeatSchema.safeParse({
      ...validHeartbeat,
      positionSeconds: 3000,
      durationSeconds: 2520,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['positionSeconds']);
  });

  it('tolerates a position one second past the duration', () => {
    const result = heartbeatSchema.safeParse({
      ...validHeartbeat,
      positionSeconds: 2521,
      durationSeconds: 2520,
    });

    expect(result.success).toBe(true);
  });

  it('rejects a timestamp that is not an ISO instant', () => {
    const result = heartbeatSchema.safeParse({ ...validHeartbeat, observedAt: '17/09/2026 14:31' });

    expect(result.success).toBe(false);
  });
});
