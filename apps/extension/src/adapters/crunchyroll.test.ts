// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { crunchyrollAdapter } from './crunchyroll';

const watchPage = new URL('https://www.crunchyroll.com/watch/GRDQPM1ZY/luffy-rise');

const context = () => ({ doc: document, url: watchPage });

describe('crunchyrollAdapter', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = '';
  });

  it('claims crunchyroll and nothing else', () => {
    expect(crunchyrollAdapter.matches(watchPage)).toBe(true);
    expect(crunchyrollAdapter.matches(new URL('https://beta.crunchyroll.com/x'))).toBe(true);
    expect(crunchyrollAdapter.matches(new URL('https://crunchyroll.example/x'))).toBe(false);
  });

  it('reads the series, the numbering and the episode from the player', () => {
    document.body.innerHTML = `
      <div class="erc-current-media-info">
        <h4><a href="/series/one-piece">One Piece</a></h4>
        <h1 class="title">Luffy Rise</h1>
        <span class="season-episode">S21 E1071</span>
      </div>`;

    expect(crunchyrollAdapter.extract(context())).toEqual({
      rawTitle: 'Luffy Rise',
      source: 'site-adapter',
      hint: { seriesTitle: 'One Piece', season: 21, episode: 1071 },
    });
  });

  it('keeps an episode number that comes without a season, as anime often does', () => {
    document.body.innerHTML = `
      <div class="erc-current-media-info">
        <h4>One Piece</h4>
        <h1 class="title">Luffy Rise</h1>
        <span class="season-episode">Episode 1071</span>
      </div>`;

    expect(crunchyrollAdapter.extract(context())?.hint).toEqual({
      seriesTitle: 'One Piece',
      episode: 1071,
    });
  });

  it('falls back to the document title, which this site fills in usefully', () => {
    document.title = 'One Piece Season 21 Episode 1071 - Luffy Rise - Crunchyroll';

    expect(crunchyrollAdapter.extract(context())).toEqual({
      rawTitle: 'One Piece Season 21 Episode 1071 - Luffy Rise',
      source: 'site-adapter',
      hint: { season: 21, episode: 1071 },
    });
  });

  it('drops the site name whichever separator it came with', () => {
    document.title = 'Frieren Episode 4 | Crunchyroll';

    expect(crunchyrollAdapter.extract(context())?.rawTitle).toBe('Frieren Episode 4');
  });

  it('reports nothing on a page with neither a player nor a title', () => {
    expect(crunchyrollAdapter.extract(context())).toBeUndefined();
  });

  it('reads a series title from the older markup', () => {
    document.body.innerHTML = `
      <h1 class="title">Fini de jouer</h1>
      <span class="show-title">Arcane</span>
      <span class="season-episode">Saison 2 : Épisode 3</span>`;

    expect(crunchyrollAdapter.extract(context())?.hint).toEqual({
      seriesTitle: 'Arcane',
      season: 2,
      episode: 3,
    });
  });
});
