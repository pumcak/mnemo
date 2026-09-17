// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { extractMedia } from './extract';

const withJsonLd = (payload: unknown): void => {
  const script = document.createElement('script');

  script.type = 'application/ld+json';
  script.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload);
  document.head.append(script);
};

describe('extractMedia', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.title = '';
  });

  it('finds nothing on a page that says nothing', () => {
    expect(extractMedia(document)).toBeUndefined();
  });

  it('falls back to the document title, vague as it is', () => {
    document.title = 'Watch Arcane | Netflix';

    expect(extractMedia(document)).toEqual({
      rawTitle: 'Watch Arcane | Netflix',
      source: 'document-title',
    });
  });

  it('prefers the open graph title over the document title', () => {
    document.title = 'Watch Arcane | Netflix';
    document.head.innerHTML =
      '<meta property="og:title" content="Arcane: Welcome to the Playground">';

    expect(extractMedia(document)?.source).toBe('og-title');
  });

  it('prefers the structured description over open graph', () => {
    document.title = 'anything';
    document.head.innerHTML = '<meta property="og:title" content="og wins nothing">';
    withJsonLd({ '@type': 'TVEpisode', name: 'Welcome to the Playground' });

    expect(extractMedia(document)).toMatchObject({
      rawTitle: 'Welcome to the Playground',
      source: 'json-ld',
    });
  });

  it('takes the series, the season and the episode when they are published separately', () => {
    withJsonLd({
      '@type': 'TVEpisode',
      name: 'Welcome to the Playground',
      episodeNumber: 1,
      partOfSeries: { '@type': 'TVSeries', name: 'Arcane' },
      partOfSeason: { '@type': 'TVSeason', seasonNumber: '1' },
      datePublished: '2021-11-06',
    });

    expect(extractMedia(document)?.hint).toEqual({
      seriesTitle: 'Arcane',
      season: 1,
      episode: 1,
      year: 2021,
    });
  });

  it('reads a description wrapped in a graph', () => {
    withJsonLd({
      '@context': 'https://schema.org',
      '@graph': [{ '@type': 'WebPage' }, { '@type': 'Movie', name: 'Oppenheimer' }],
    });

    expect(extractMedia(document)?.rawTitle).toBe('Oppenheimer');
  });

  it('reads a description delivered as an array', () => {
    withJsonLd([
      { '@type': 'Organization', name: 'Netflix' },
      { '@type': 'Movie', name: 'Heat' },
    ]);

    expect(extractMedia(document)?.rawTitle).toBe('Heat');
  });

  it('keeps looking when a site publishes broken structured data', () => {
    withJsonLd('{ this is not json');
    withJsonLd({ '@type': 'Movie', name: 'Heat' });

    expect(extractMedia(document)?.rawTitle).toBe('Heat');
  });

  it('ignores structured data that describes something other than a video', () => {
    document.title = 'fallback';
    withJsonLd({ '@type': 'BreadcrumbList', name: 'not a video' });

    expect(extractMedia(document)?.source).toBe('document-title');
  });

  it('trusts the media session above everything, because the player fills it in', () => {
    document.title = 'anything';
    withJsonLd({ '@type': 'Movie', name: 'json-ld wins nothing' });

    expect(extractMedia(document, { title: 'Welcome to the Playground', album: 'Arcane' })).toEqual(
      {
        rawTitle: 'Welcome to the Playground',
        source: 'media-session',
        hint: { seriesTitle: 'Arcane' },
      },
    );
  });

  it('uses the artist when the media session has no album', () => {
    expect(extractMedia(document, { title: 'One Piece 1071', artist: 'One Piece' })?.hint).toEqual({
      seriesTitle: 'One Piece',
    });
  });

  it('skips a media session that is empty rather than reporting a blank title', () => {
    document.title = 'Watch Arcane | Netflix';

    expect(extractMedia(document, { title: '   ' })?.source).toBe('document-title');
  });

  it('refuses a season or episode number that is not one', () => {
    withJsonLd({
      '@type': 'TVEpisode',
      name: 'Welcome to the Playground',
      episodeNumber: 'pilot',
      partOfSeason: { seasonNumber: 0 },
    });

    expect(extractMedia(document)?.hint).toBeUndefined();
  });
});
