import { describe, expect, it } from 'vitest';
import type { PageContextMessage, PlaybackMessage } from './messages';
import { createPlaybackRegistry } from './playback-registry';

const playback = (overrides: Partial<PlaybackMessage> = {}): PlaybackMessage => ({
  type: 'mnemo.playback',
  observedAt: '2026-09-17T22:00:00.000Z',
  state: 'playing',
  positionSeconds: 30,
  durationSeconds: 2520,
  reason: 'progress',
  rawTitle: 'Arcane S01E01',
  app: 'netflix.com',
  titleSource: 'document-title',
  url: 'https://www.netflix.com/watch/81435684',
  ...overrides,
});

const context = (overrides: Partial<PageContextMessage> = {}): PageContextMessage => ({
  type: 'mnemo.pageContext',
  rawTitle: 'One Piece 1071 VOSTFR',
  app: 'somestream.example',
  titleSource: 'og-title',
  url: 'https://somestream.example/one-piece/1071',
  hint: { seriesTitle: 'One Piece', episode: 1071 },
  ...overrides,
});

describe('createPlaybackRegistry', () => {
  it('reports what the top frame of a tab is playing', () => {
    const registry = createPlaybackRegistry();

    registry.recordPlayback(7, 0, playback());

    expect(registry.nowPlaying()).toEqual([{ ...playback(), tabId: 7, frameId: 0 }]);
  });

  it('keeps one entry per tab', () => {
    const registry = createPlaybackRegistry();

    registry.recordPlayback(1, 0, playback());
    registry.recordPlayback(2, 0, playback({ rawTitle: 'Oppenheimer' }));

    expect(registry.nowPlaying()).toHaveLength(2);
  });

  it('replaces what it knew about a frame', () => {
    const registry = createPlaybackRegistry();

    registry.recordPlayback(1, 0, playback({ positionSeconds: 30 }));
    registry.recordPlayback(
      1,
      0,
      playback({ positionSeconds: 45, observedAt: '2026-09-17T22:00:15.000Z' }),
    );

    expect(registry.nowPlaying()[0]?.positionSeconds).toBe(45);
  });

  it('ignores a message that arrived late, so it cannot rewind the truth', () => {
    const registry = createPlaybackRegistry();

    registry.recordPlayback(
      1,
      0,
      playback({ positionSeconds: 45, observedAt: '2026-09-17T22:00:15.000Z' }),
    );
    registry.recordPlayback(1, 0, playback({ positionSeconds: 30 }));

    expect(registry.nowPlaying()[0]?.positionSeconds).toBe(45);
  });

  it('leaves out a tab that is paused, since nobody is watching it', () => {
    const registry = createPlaybackRegistry();

    registry.recordPlayback(1, 0, playback({ state: 'paused' }));

    expect(registry.nowPlaying()).toEqual([]);
  });

  it('forgets a tab that closed', () => {
    const registry = createPlaybackRegistry();

    registry.recordPlayback(1, 0, playback());
    registry.forget(1);

    expect(registry.nowPlaying()).toEqual([]);
  });

  it('describes a framed player with what the page around it says', () => {
    const registry = createPlaybackRegistry();

    registry.recordContext(3, context());
    registry.recordPlayback(3, 12, playback({ rawTitle: 'Player', app: 'cdn.example' }));

    expect(registry.nowPlaying()[0]).toMatchObject({
      rawTitle: 'One Piece 1071 VOSTFR',
      app: 'somestream.example',
      titleSource: 'og-title',
      hint: { seriesTitle: 'One Piece', episode: 1071 },
      frameId: 12,
      positionSeconds: 30,
    });
  });

  it('keeps what a framed player knows when the page around it says nothing', () => {
    const registry = createPlaybackRegistry();

    registry.recordPlayback(3, 12, playback({ rawTitle: 'Player', app: 'cdn.example' }));

    expect(registry.nowPlaying()[0]).toMatchObject({ rawTitle: 'Player', app: 'cdn.example' });
  });

  it('never lets the page description override the top frame, which knows better', () => {
    const registry = createPlaybackRegistry();

    registry.recordContext(3, context({ rawTitle: 'vague page title' }));
    registry.recordPlayback(3, 0, playback({ rawTitle: 'Welcome to the Playground' }));

    expect(registry.nowPlaying()[0]?.rawTitle).toBe('Welcome to the Playground');
  });

  it('keeps the playback numbers of the frame, not the page', () => {
    const registry = createPlaybackRegistry();

    registry.recordContext(3, context());
    registry.recordPlayback(3, 12, playback({ positionSeconds: 1200, durationSeconds: 1440 }));

    expect(registry.nowPlaying()[0]).toMatchObject({
      positionSeconds: 1200,
      durationSeconds: 1440,
    });
  });

  it('reports two players in one tab separately, since a page can hold both', () => {
    const registry = createPlaybackRegistry();

    registry.recordPlayback(3, 0, playback({ rawTitle: 'trailer' }));
    registry.recordPlayback(3, 12, playback({ rawTitle: 'feature' }));

    expect(registry.nowPlaying()).toHaveLength(2);
  });
});
