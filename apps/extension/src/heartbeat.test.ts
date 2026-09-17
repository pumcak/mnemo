import { heartbeatSchema } from '@mnemo/contracts';
import { describe, expect, it } from 'vitest';
import { heartbeatFrom } from './heartbeat';
import type { PlaybackMessage } from './messages';

const deviceId = '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11';

const message = (overrides: Partial<PlaybackMessage> = {}): PlaybackMessage => ({
  type: 'mnemo.playback',
  observedAt: '2026-09-17T22:00:00.000Z',
  state: 'playing',
  positionSeconds: 30,
  durationSeconds: 2520,
  reason: 'progress',
  rawTitle: 'Arcane: Season 1: Welcome to the Playground',
  app: 'netflix.com',
  titleSource: 'site-adapter',
  url: 'https://www.netflix.com/watch/81435684',
  hint: { seriesTitle: 'Arcane', season: 1, episode: 1 },
  ...overrides,
});

describe('heartbeatFrom', () => {
  it('produces something the contract accepts', () => {
    expect(() => heartbeatSchema.parse(heartbeatFrom(message(), deviceId))).not.toThrow();
  });

  it('reports the browser as the capture source and the site as the application', () => {
    expect(heartbeatFrom(message(), deviceId).source).toEqual({
      kind: 'browser',
      app: 'netflix.com',
    });
  });

  it('carries the hint the page published', () => {
    expect(heartbeatFrom(message(), deviceId).hint).toEqual({
      seriesTitle: 'Arcane',
      season: 1,
      episode: 1,
    });
  });

  it('leaves out what the page did not say', () => {
    const built = heartbeatFrom(message({ durationSeconds: undefined, hint: undefined }), deviceId);

    expect(built).not.toHaveProperty('durationSeconds');
    expect(built).not.toHaveProperty('hint');
    expect(() => heartbeatSchema.parse(built)).not.toThrow();
  });

  it('never rewrites the raw title, which the resolver needs as it was', () => {
    const messy = 'One.Piece.S01E1071.VOSTFR.1080p';

    expect(heartbeatFrom(message({ rawTitle: messy }), deviceId).rawTitle).toBe(messy);
  });

  it('keeps the moment the observation was made, not the moment it was sent', () => {
    expect(heartbeatFrom(message(), deviceId).observedAt).toBe('2026-09-17T22:00:00.000Z');
  });
});
