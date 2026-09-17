// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { netflixAdapter } from './netflix';

const watchPage = new URL('https://www.netflix.com/watch/81435684');

const context = () => ({ doc: document, url: watchPage });

describe('netflixAdapter', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = 'Netflix';
  });

  it('claims netflix and nothing else', () => {
    expect(netflixAdapter.matches(watchPage)).toBe(true);
    expect(netflixAdapter.matches(new URL('https://www.netflix.com/browse'))).toBe(true);
    expect(netflixAdapter.matches(new URL('https://notnetflix.com/watch/1'))).toBe(false);
  });

  it('reads the series, the numbering and the episode from the player', () => {
    document.body.innerHTML = `
      <div data-uia="video-title">
        <h4>Arcane</h4>
        <span>S1:E1</span>
        <span>Welcome to the Playground</span>
      </div>`;

    expect(netflixAdapter.extract(context())).toEqual({
      rawTitle: 'Welcome to the Playground',
      source: 'site-adapter',
      hint: { seriesTitle: 'Arcane', season: 1, episode: 1 },
    });
  });

  it('reads a film, which has a name and no numbering', () => {
    document.body.innerHTML = '<div data-uia="video-title"><h4>Oppenheimer</h4></div>';

    expect(netflixAdapter.extract(context())).toEqual({
      rawTitle: 'Oppenheimer',
      source: 'site-adapter',
    });
  });

  it('understands the french numbering, since the interface follows the account', () => {
    document.body.innerHTML = `
      <div data-uia="video-title">
        <h4>Arcane</h4>
        <span>Saison 2 : Épisode 3</span>
        <span>Fini de jouer</span>
      </div>`;

    expect(netflixAdapter.extract(context())?.hint).toEqual({
      seriesTitle: 'Arcane',
      season: 2,
      episode: 3,
    });
  });

  it('still works from the older class name', () => {
    document.body.innerHTML = `
      <div class="video-title"><h4>Arcane</h4><span>S1:E2</span><span>Some Mysteries</span></div>`;

    expect(netflixAdapter.extract(context())?.rawTitle).toBe('Some Mysteries');
  });

  it('reports nothing while the player has not drawn its title yet', () => {
    expect(netflixAdapter.extract(context())).toBeUndefined();
  });

  it('reports nothing rather than guessing when the block is empty', () => {
    document.body.innerHTML = '<div data-uia="video-title"></div>';

    expect(netflixAdapter.extract(context())).toBeUndefined();
  });

  it('keeps the episode name as the raw title, which is what a search matches', () => {
    document.body.innerHTML = `
      <div data-uia="video-title">
        <h4>One Piece</h4>
        <span>S1:E1071</span>
        <span>Luffy Rise</span>
      </div>`;

    const extracted = netflixAdapter.extract(context());

    expect(extracted?.rawTitle).toBe('Luffy Rise');
    expect(extracted?.hint?.episode).toBe(1071);
  });
});
