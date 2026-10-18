import type { Candidate, Catalogues } from '@mnemo/resolver';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findAlias, recordAlias, resolveWithAliases } from './aliases';
import type { DatabaseHandle } from '../db/client';
import { aliases } from '../db/schema';
import { openMigratedDatabase } from '../testing/database';

const recording = (answer: Candidate[] = []): { catalogues: Catalogues; calls: string[] } => {
  const calls: string[] = [];
  const reply = (name: string) => (query: string) => {
    calls.push(`${name}:${query}`);

    return Promise.resolve(answer);
  };

  return {
    calls,
    catalogues: {
      tmdb: { searchMovies: reply('movie'), searchSeries: reply('series') },
      anilist: { searchAnime: reply('anime') },
    },
  };
};

describe('the alias dictionary', () => {
  let handle: DatabaseHandle;

  beforeEach(() => {
    handle = openMigratedDatabase();
  });

  afterEach(() => {
    handle.close();
  });

  const correct = (searchTitle: string, kind: 'movie' | 'series', externalId: number): void => {
    recordAlias(handle, {
      searchTitle,
      kind,
      catalogue: 'tmdb',
      externalId,
      title: searchTitle,
    });
  };

  it('finds a correction whatever the spelling it is asked with', () => {
    correct("Frieren: Beyond Journey's End", 'series', 209867);

    expect(findAlias(handle, 'frieren beyond journeys end', 'series')?.externalId).toBe(209867);
  });

  it('keeps a film and a series of the same name apart', () => {
    correct('Dune', 'movie', 438631);

    expect(findAlias(handle, 'Dune', 'series')).toBeUndefined();
  });

  it('replaces an older correction instead of keeping two', () => {
    correct('Dune', 'movie', 841);
    correct('Dune', 'movie', 438631);

    expect(handle.db.select().from(aliases).all()).toHaveLength(1);
    expect(findAlias(handle, 'Dune', 'movie')?.externalId).toBe(438631);
  });

  it('refuses a catalogue the resolver does not know', () => {
    expect(() =>
      recordAlias(handle, {
        searchTitle: 'Heat',
        kind: 'movie',
        catalogue: 'imdb' as never,
        externalId: 1,
        title: 'Heat',
      }),
    ).toThrow();
  });
});

describe('resolveWithAliases', () => {
  let handle: DatabaseHandle;

  beforeEach(() => {
    handle = openMigratedDatabase();
  });

  afterEach(() => {
    handle.close();
  });

  it('answers from a correction without asking any catalogue', async () => {
    recordAlias(handle, {
      searchTitle: 'Dune',
      kind: 'movie',
      catalogue: 'tmdb',
      externalId: 438631,
      title: 'Dune',
    });
    const { catalogues, calls } = recording();

    const resolution = await resolveWithAliases(handle, 'Dune (2021)', catalogues);

    expect(calls).toEqual([]);
    expect(resolution.confident).toBe(true);
    expect(resolution.best?.candidate).toMatchObject({ catalogue: 'tmdb', id: 438631 });
    expect(resolution.best?.reasons).toEqual(['alias']);
  });

  it('asks the catalogues when nobody corrected the title', async () => {
    const { catalogues, calls } = recording();

    await resolveWithAliases(handle, 'Heat (1995)', catalogues);

    expect(calls[0]).toBe('movie:Heat');
  });

  it('looks up an episode by its series, which is what was corrected', async () => {
    recordAlias(handle, {
      searchTitle: 'Arcane',
      kind: 'series',
      catalogue: 'tmdb',
      externalId: 94605,
      title: 'Arcane',
    });
    const { catalogues, calls } = recording();

    const resolution = await resolveWithAliases(handle, 'Welcome to the Playground', catalogues, {
      seriesTitle: 'Arcane',
      season: 1,
      episode: 1,
    });

    expect(calls).toEqual([]);
    expect(resolution.best?.candidate.id).toBe(94605);
    expect(resolution.parsed.episode).toBe(1);
  });

  it('never applies a correction to a title recognised as nothing', async () => {
    recordAlias(handle, {
      searchTitle: 'ONE PIECE 1071 REACTION!! | Luffy is back',
      kind: 'series',
      catalogue: 'anilist',
      externalId: 21,
      title: 'One Piece',
    });
    const { catalogues } = recording();

    const resolution = await resolveWithAliases(
      handle,
      'ONE PIECE 1071 REACTION!! | Luffy is back',
      catalogues,
    );

    expect(resolution.best).toBeUndefined();
  });
});
