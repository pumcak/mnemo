import { describe, expect, it } from 'vitest';
import type { PlaybackMessage } from './messages';
import { createPlaybackRegistry } from './playback-registry';

const message = (overrides: Partial<PlaybackMessage> = {}): PlaybackMessage => ({
  type: 'mnemo.playback',
  observedAt: '2026-09-17T22:00:00.000Z',
  state: 'playing',
  positionSeconds: 30,
  durationSeconds: 2520,
  rawTitle: 'Arcane S01E01',
  url: 'https://www.netflix.com/watch/81435684',
  reason: 'progress',
  ...overrides,
});

describe('createPlaybackRegistry', () => {
  it('reports what a tab is playing', () => {
    const registry = createPlaybackRegistry();

    registry.record(7, message());

    expect(registry.nowPlaying()).toEqual([{ ...message(), tabId: 7 }]);
  });

  it('keeps one entry per tab', () => {
    const registry = createPlaybackRegistry();

    registry.record(1, message({ rawTitle: 'Arcane S01E01' }));
    registry.record(2, message({ rawTitle: 'One Piece 1071' }));

    expect(registry.nowPlaying()).toHaveLength(2);
  });

  it('replaces what it knew about a tab', () => {
    const registry = createPlaybackRegistry();

    registry.record(1, message({ positionSeconds: 30 }));
    registry.record(1, message({ positionSeconds: 45, observedAt: '2026-09-17T22:00:15.000Z' }));

    expect(registry.nowPlaying()[0]?.positionSeconds).toBe(45);
  });

  it('ignores a message that arrived late, so it cannot rewind the truth', () => {
    const registry = createPlaybackRegistry();

    registry.record(1, message({ positionSeconds: 45, observedAt: '2026-09-17T22:00:15.000Z' }));
    registry.record(1, message({ positionSeconds: 30, observedAt: '2026-09-17T22:00:00.000Z' }));

    expect(registry.nowPlaying()[0]?.positionSeconds).toBe(45);
  });

  it('leaves out a tab that is paused, since nobody is watching it', () => {
    const registry = createPlaybackRegistry();

    registry.record(1, message({ state: 'paused' }));

    expect(registry.nowPlaying()).toEqual([]);
  });

  it('leaves out a tab that finished', () => {
    const registry = createPlaybackRegistry();

    registry.record(1, message({ state: 'ended' }));

    expect(registry.nowPlaying()).toEqual([]);
  });

  it('forgets a tab that closed', () => {
    const registry = createPlaybackRegistry();

    registry.record(1, message());
    registry.forget(1);

    expect(registry.nowPlaying()).toEqual([]);
  });
});
