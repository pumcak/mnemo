import type { MediaHint } from '@mnemo/contracts';
import { CatalogueError } from '@mnemo/resolver';
import type { Candidate, Catalogues } from '@mnemo/resolver';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recordAlias } from './aliases';
import { backfillResolutions } from './backfill';
import { decideReview, pendingReviews } from './review';
import type { DatabaseHandle } from '../db/client';
import { playbackSessions, sources } from '../db/schema';
import { openMigratedDatabase, registerDevice, silentLogger } from '../testing/database';

const deviceId = '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11';

const film = (overrides: Partial<Candidate>): Candidate => ({
  catalogue: 'tmdb',
  id: 1,
  kind: 'movie',
  title: 'Untitled',
  alternativeTitles: [],
  ...overrides,
});

interface Fake {
  catalogues: Catalogues;
  calls: string[];
}

const catalogues = (answers: {
  movies?: Candidate[] | Error;
  series?: Candidate[] | Error;
  anime?: Candidate[] | Error;
}): Fake => {
  const calls: string[] = [];
  const reply = (name: string, value: Candidate[] | Error | undefined) => (query: string) => {
    calls.push(`${name}:${query}`);

    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value ?? []);
  };

  return {
    calls,
    catalogues: {
      tmdb: {
        searchMovies: reply('movie', answers.movies),
        searchSeries: reply('series', answers.series),
      },
      anilist: { searchAnime: reply('anime', answers.anime) },
    },
  };
};

describe('backfillResolutions', () => {
  let handle: DatabaseHandle;
  let sourceId: number;
  let clock: number;

  beforeEach(() => {
    handle = openMigratedDatabase();
    clock = Date.parse('2026-10-19T10:00:00.000Z');
    registerDevice(handle, deviceId, new Date(clock));
    sourceId = handle.db
      .insert(sources)
      .values({ kind: 'browser', app: 'example.test', createdAt: new Date(clock) })
      .returning({ id: sources.id })
      .get().id;
  });

  afterEach(() => {
    handle.close();
  });

  const session = (rawTitle: string, hint?: MediaHint): number => {
    clock += 1000;

    return handle.db
      .insert(playbackSessions)
      .values({
        deviceId,
        sourceId,
        rawTitle,
        ...(hint === undefined ? {} : { hint }),
        startedAt: new Date(clock),
        lastSeenAt: new Date(clock),
        lastPositionSeconds: 0,
      })
      .returning({ id: playbackSessions.id })
      .get().id;
  };

  const stateOf = (id: number) =>
    handle.db.select().from(playbackSessions).where(eq(playbackSessions.id, id)).get();

  const run = (fake: Fake, limit?: number) =>
    backfillResolutions(handle, {
      catalogues: fake.catalogues,
      logger: silentLogger,
      ...(limit === undefined ? {} : { limit }),
      now: () => new Date('2026-10-19T12:00:00.000Z'),
    });

  it('records a confident match on the session', async () => {
    const id = session('Oppenheimer.2023.MULTi.1080p.WEB.x264-GROUPE');

    const summary = await run(
      catalogues({ movies: [film({ id: 872585, title: 'Oppenheimer', year: 2023 })] }),
    );

    expect(summary).toEqual({ resolved: 1, queued: 0, unresolvable: 0, deferred: 0 });
    expect(stateOf(id)).toMatchObject({
      resolutionState: 'resolved',
      resolvedCatalogue: 'tmdb',
      resolvedExternalId: 872585,
      resolvedTitle: 'Oppenheimer',
      resolutionScore: 1,
    });
  });

  it('sends an unsure match to review instead of recording it', async () => {
    const id = session('Dune (2021)');

    const summary = await run(catalogues({ movies: [film({ title: 'Dune', year: 1984 })] }));

    expect(summary.queued).toBe(1);
    expect(stateOf(id)?.resolutionState).toBe('review');
    expect(stateOf(id)?.resolvedExternalId).toBeNull();
    expect(pendingReviews(handle)).toHaveLength(1);
  });

  it('marks a title recognised as nothing without asking anyone', async () => {
    const id = session('ONE PIECE 1071 REACTION!! | Luffy is back');
    const fake = catalogues({});

    await run(fake);

    expect(stateOf(id)?.resolutionState).toBe('unresolvable');
    expect(fake.calls).toEqual([]);
  });

  it('resolves a netflix episode through the hint stored with the session', async () => {
    const id = session('Welcome to the Playground', {
      seriesTitle: 'Arcane',
      season: 1,
      episode: 1,
    });

    await run(
      catalogues({ series: [film({ kind: 'series', id: 94605, title: 'Arcane', year: 2021 })] }),
    );

    expect(stateOf(id)?.resolvedExternalId).toBe(94605);
  });

  it('asks once for a title shared by several sessions', async () => {
    session('Heat (1995)');
    session('Heat (1995)');
    session('Heat (1995)');
    const fake = catalogues({ movies: [film({ title: 'Heat', year: 1995 })] });

    const summary = await run(fake);

    expect(summary.resolved).toBe(3);
    expect(fake.calls).toEqual(['movie:Heat']);
  });

  it('stops at a rate limit and leaves the rest waiting for the next pass', async () => {
    const first = session('[SubsPlease] One Piece - 1071 (1080p) [A1B2C3D4].mkv');
    const second = session('Heat (1995)');
    const fake = catalogues({
      anime: new CatalogueError('anilist', 'rate-limited', 'slow down', 60_000),
      series: new CatalogueError('tmdb', 'rate-limited', 'slow down', 1_000),
    });

    const summary = await run(fake);

    expect(summary).toEqual({ resolved: 0, queued: 0, unresolvable: 0, deferred: 2 });
    expect(stateOf(first)?.resolutionState).toBe('pending');
    expect(stateOf(second)?.resolutionState).toBe('pending');
    expect(fake.calls).not.toContain('movie:Heat');
  });

  it('keeps a session pending when a catalogue was down, rather than asking a person', async () => {
    const id = session('Heat (1995)');

    await run(
      catalogues({
        movies: new CatalogueError('tmdb', 'unavailable', 'no answer'),
        anime: [],
      }),
    );

    expect(stateOf(id)?.resolutionState).toBe('pending');
    expect(pendingReviews(handle)).toEqual([]);
  });

  it('answers from the alias dictionary without a search', async () => {
    recordAlias(handle, {
      searchTitle: 'Dune',
      kind: 'movie',
      catalogue: 'tmdb',
      externalId: 438631,
      title: 'Dune',
    });
    const id = session('Dune (2021)');
    const fake = catalogues({});

    await run(fake);

    expect(fake.calls).toEqual([]);
    expect(stateOf(id)?.resolvedExternalId).toBe(438631);
  });

  it('looks at no more sessions than it was told to', async () => {
    session('Heat (1995)');
    session('Heat (1986)');
    session('Heat (1972)');

    const summary = await run(catalogues({ movies: [film({ title: 'Heat', year: 1995 })] }), 2);

    expect(summary.resolved + summary.queued).toBe(2);
  });

  it('leaves resolved sessions alone on the next pass', async () => {
    session('Heat (1995)');
    const fake = catalogues({ movies: [film({ title: 'Heat', year: 1995 })] });

    await run(fake);
    await run(fake);

    expect(fake.calls).toHaveLength(1);
  });

  it('closes the loop: a review decision resolves the session on the following pass', async () => {
    const id = session('Dune (2021)');

    await run(catalogues({ movies: [film({ title: 'Dune', year: 1984 })] }));

    const [item] = pendingReviews(handle);

    decideReview(handle, item?.id ?? -1, {
      choose: { catalogue: 'tmdb', externalId: 438631, title: 'Dune', kind: 'movie' },
    });

    expect(stateOf(id)?.resolutionState).toBe('pending');

    const fake = catalogues({});

    await run(fake);

    expect(fake.calls).toEqual([]);
    expect(stateOf(id)).toMatchObject({ resolutionState: 'resolved', resolvedExternalId: 438631 });
  });

  it('marks a dismissed session as unresolvable for good', async () => {
    const id = session('Dune (2021)');

    await run(catalogues({ movies: [film({ title: 'Dune', year: 1984 })] }));

    const [item] = pendingReviews(handle);

    decideReview(handle, item?.id ?? -1, { dismiss: true });

    expect(stateOf(id)?.resolutionState).toBe('unresolvable');
  });
});
