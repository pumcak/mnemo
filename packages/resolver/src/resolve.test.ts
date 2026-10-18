import { describe, expect, it } from 'vitest';
import { CatalogueError } from './catalogue/types';
import type { Candidate } from './catalogue/types';
import { parseRawTitle } from './parse';
import { applyHint, planRoute, resolveTitle } from './resolve';
import type { Catalogues } from './resolve';

interface Asked {
  catalogue: string;
  query: string;
  year: number | undefined;
}

const candidate = (overrides: Partial<Candidate>): Candidate => ({
  catalogue: 'tmdb',
  id: 1,
  kind: 'movie',
  title: 'Untitled',
  alternativeTitles: [],
  ...overrides,
});

const fakeCatalogues = (answers: {
  movies?: Candidate[] | Error;
  series?: Candidate[] | Error;
  anime?: Candidate[] | Error;
}): { catalogues: Catalogues; asked: Asked[] } => {
  const asked: Asked[] = [];
  const reply =
    (catalogue: string, value: Candidate[] | Error | undefined) =>
    (query: string, year?: number): Promise<Candidate[]> => {
      asked.push({ catalogue, query, year });

      return value instanceof Error ? Promise.reject(value) : Promise.resolve(value ?? []);
    };

  return {
    asked,
    catalogues: {
      tmdb: {
        searchMovies: reply('tmdb-movie', answers.movies),
        searchSeries: reply('tmdb-series', answers.series),
      },
      anilist: { searchAnime: reply('anilist', answers.anime) },
    },
  };
};

describe('planRoute', () => {
  it('asks tmdb first for a film and keeps anilist for anime films', () => {
    const raw = 'Oppenheimer.2023.MULTi.1080p.WEB.x264-GROUPE';

    expect(planRoute(parseRawTitle(raw), raw)).toEqual(['tmdb-movie', 'anilist']);
  });

  it('asks anilist first when the name has the shape of an anime release', () => {
    const raw = '[SubsPlease] One Piece - 1071 (1080p) [A1B2C3D4].mkv';

    expect(planRoute(parseRawTitle(raw), raw)).toEqual(['anilist', 'tmdb-series']);
  });

  it('asks nothing about a title recognised as nothing', () => {
    for (const raw of ['ONE PIECE 1071 REACTION!! | Luffy is back', 'Arcane', '1080p']) {
      expect(planRoute(parseRawTitle(raw), raw)).toEqual([]);
    }
  });
});

describe('applyHint', () => {
  it('turns a bare episode name into an episode of the series the source named', () => {
    const parsed = applyHint(parseRawTitle('Welcome to the Playground'), {
      seriesTitle: 'Arcane',
      season: 1,
      episode: 1,
    });

    expect(parsed).toEqual({
      kind: 'episode',
      title: 'Welcome to the Playground',
      series: 'Arcane',
      season: 1,
      episode: 1,
      removed: [],
    });
  });

  it('keeps what the raw title said explicitly over what the hint claims', () => {
    const parsed = applyHint(parseRawTitle('Arcane S02E03'), { seriesTitle: 'Arcane', episode: 9 });

    expect(parsed.episode).toBe(3);
    expect(parsed.season).toBe(2);
  });

  it('only borrows the year when that is all the hint carries', () => {
    expect(applyHint(parseRawTitle('Heat'), { year: 1995 })).toMatchObject({
      kind: 'unknown',
      year: 1995,
    });
  });

  it('changes nothing without a hint', () => {
    const parsed = parseRawTitle('Heat (1995)');

    expect(applyHint(parsed, undefined)).toBe(parsed);
  });
});

describe('resolveTitle', () => {
  it('stops at the first catalogue that gives a confident answer', async () => {
    const { catalogues, asked } = fakeCatalogues({
      movies: [candidate({ id: 872585, title: 'Oppenheimer', year: 2023 })],
    });

    const resolution = await resolveTitle(
      'Oppenheimer.2023.MULTi.1080p.WEB.x264-GROUPE',
      catalogues,
    );

    expect(resolution.confident).toBe(true);
    expect(resolution.best?.candidate.id).toBe(872585);
    expect(asked.map((call) => call.catalogue)).toEqual(['tmdb-movie']);
    expect(asked[0]).toMatchObject({ query: 'Oppenheimer', year: 2023 });
  });

  it('moves on to the next catalogue when the first one is not sure', async () => {
    const { catalogues, asked } = fakeCatalogues({
      movies: [candidate({ title: 'Your Name Engraved Herein', year: 2020 })],
      anime: [candidate({ catalogue: 'anilist', id: 21519, title: 'Your Name.', year: 2016 })],
    });

    const resolution = await resolveTitle('Your Name (2016)', catalogues);

    expect(asked.map((call) => call.catalogue)).toEqual(['tmdb-movie', 'anilist']);
    expect(resolution.best?.candidate.id).toBe(21519);
  });

  it('asks about the series of an episode, not the episode name', async () => {
    const { catalogues, asked } = fakeCatalogues({
      series: [candidate({ kind: 'series', id: 1396, title: 'Breaking Bad', year: 2008 })],
    });

    await resolveTitle('Breaking Bad - 5x14 - Ozymandias', catalogues);

    expect(asked[0]).toMatchObject({ catalogue: 'tmdb-series', query: 'Breaking Bad' });
  });

  it('resolves a netflix episode through the hint the adapter sent', async () => {
    const { catalogues, asked } = fakeCatalogues({
      series: [candidate({ kind: 'series', id: 94605, title: 'Arcane', year: 2021 })],
    });

    const resolution = await resolveTitle('Welcome to the Playground', catalogues, {
      seriesTitle: 'Arcane',
      season: 1,
      episode: 1,
    });

    expect(asked[0]?.query).toBe('Arcane');
    expect(resolution.confident).toBe(true);
    expect(resolution.parsed.episode).toBe(1);
  });

  it('queries nothing and claims nothing for a reaction video', async () => {
    const { catalogues, asked } = fakeCatalogues({});

    const resolution = await resolveTitle('ONE PIECE 1071 REACTION!! | Luffy is back', catalogues);

    expect(asked).toEqual([]);
    expect(resolution.best).toBeUndefined();
    expect(resolution.confident).toBe(false);
  });

  it('carries on when a catalogue is down, and says which one', async () => {
    const { catalogues, asked } = fakeCatalogues({
      anime: new CatalogueError('anilist', 'rate-limited', 'slow down', 60_000),
      series: [candidate({ kind: 'series', id: 37854, title: 'One Piece', year: 1999 })],
    });

    const resolution = await resolveTitle(
      '[SubsPlease] One Piece - 1071 (1080p) [A1B2C3D4].mkv',
      catalogues,
    );

    expect(resolution.failures).toEqual([
      { catalogue: 'anilist', reason: 'rate-limited', retryAfterMs: 60_000 },
    ]);
    expect(asked.map((call) => call.catalogue)).toEqual(['anilist', 'tmdb-series']);
    expect(resolution.best?.candidate.id).toBe(37854);
  });

  it('lets a real bug through instead of hiding it as a catalogue failure', async () => {
    const { catalogues } = fakeCatalogues({ movies: new TypeError('undefined is not a function') });

    await expect(resolveTitle('Heat (1995)', catalogues)).rejects.toBeInstanceOf(TypeError);
  });

  it('reports an answer it is unsure of without calling it confident', async () => {
    const { catalogues } = fakeCatalogues({
      movies: [candidate({ title: 'Dune', year: 1984 })],
      anime: [],
    });

    const resolution = await resolveTitle('Dune (2021)', catalogues);

    expect(resolution.best?.candidate.title).toBe('Dune');
    expect(resolution.confident).toBe(false);
  });

  it('works with only one catalogue configured', async () => {
    const resolution = await resolveTitle('Heat (1995)', {
      tmdb: {
        searchMovies: () => Promise.resolve([candidate({ title: 'Heat', year: 1995 })]),
        searchSeries: () => Promise.resolve([]),
      },
    });

    expect(resolution.confident).toBe(true);
    expect(resolution.asked).toEqual(['tmdb-movie']);
  });
});
