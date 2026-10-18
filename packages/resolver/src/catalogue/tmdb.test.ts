import { describe, expect, it } from 'vitest';
import { createTtlCache } from './cache';
import { createRateLimiter } from './rate-limit';
import { createTmdbClient } from './tmdb';
import type { Candidate } from './types';
import { CatalogueError } from './types';

interface Call {
  url: URL;
  headers: Headers;
}

const answering = (reply: () => Response) => {
  const calls: Call[] = [];
  const fetcher: typeof fetch = (input, init) => {
    calls.push({
      url: new URL(input instanceof Request ? input.url : input.toString()),
      headers: new Headers(init?.headers),
    });

    return Promise.resolve(reply());
  };

  return { calls, fetcher };
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const noWait = createRateLimiter({ minIntervalMs: 0 });

const client = (fetcher: typeof fetch) =>
  createTmdbClient({ token: 'read-token', fetcher, limiter: noWait });

describe('createTmdbClient', () => {
  it('searches films with the token and the year', async () => {
    const { calls, fetcher } = answering(() =>
      json({
        results: [
          {
            id: 872585,
            title: 'Oppenheimer',
            original_title: 'Oppenheimer',
            release_date: '2023-07-19',
            popularity: 80.5,
          },
        ],
      }),
    );

    const found = await client(fetcher).searchMovies('  Oppenheimer ', 2023);

    expect(calls[0]?.url.pathname).toBe('/3/search/movie');
    expect(calls[0]?.url.searchParams.get('query')).toBe('Oppenheimer');
    expect(calls[0]?.url.searchParams.get('year')).toBe('2023');
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer read-token');
    expect(found).toEqual<Candidate[]>([
      {
        catalogue: 'tmdb',
        id: 872585,
        kind: 'movie',
        title: 'Oppenheimer',
        alternativeTitles: [],
        year: 2023,
        popularity: 80.5,
      },
    ]);
  });

  it('searches series by first air date, which is the year tmdb understands for them', async () => {
    const { calls, fetcher } = answering(() =>
      json({
        results: [
          {
            id: 37854,
            name: 'One Piece',
            original_name: 'ワンピース',
            first_air_date: '1999-10-20',
          },
        ],
      }),
    );

    const found = await client(fetcher).searchSeries('One Piece', 1999);

    expect(calls[0]?.url.pathname).toBe('/3/search/tv');
    expect(calls[0]?.url.searchParams.get('first_air_date_year')).toBe('1999');
    expect(found[0]).toMatchObject({
      kind: 'series',
      title: 'One Piece',
      alternativeTitles: ['ワンピース'],
      year: 1999,
    });
  });

  it('never asks for adult results', async () => {
    const { calls, fetcher } = answering(() => json({ results: [] }));

    await client(fetcher).searchMovies('Heat');

    expect(calls[0]?.url.searchParams.get('include_adult')).toBe('false');
  });

  it('answers an empty query without a request', async () => {
    const { calls, fetcher } = answering(() => json({ results: [] }));

    expect(await client(fetcher).searchMovies('   ')).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('asks once for a title that keeps coming back', async () => {
    const { calls, fetcher } = answering(() => json({ results: [] }));
    const tmdb = client(fetcher);

    await tmdb.searchSeries('Arcane');
    await tmdb.searchSeries('arcane');
    await tmdb.searchSeries('Arcane ');

    expect(calls).toHaveLength(1);
  });

  it('asks again once the cache has expired', async () => {
    let clock = 0;
    const { calls, fetcher } = answering(() => json({ results: [] }));
    const tmdb = createTmdbClient({
      token: 'read-token',
      fetcher,
      limiter: noWait,
      cache: createTtlCache({ ttlMs: 1000, maxEntries: 10, now: () => clock }),
    });

    await tmdb.searchMovies('Heat');
    clock += 1001;
    await tmdb.searchMovies('Heat');

    expect(calls).toHaveLength(2);
  });

  it('keeps a film and a series of the same name apart in the cache', async () => {
    const { calls, fetcher } = answering(() => json({ results: [] }));
    const tmdb = client(fetcher);

    await tmdb.searchMovies('Dune');
    await tmdb.searchSeries('Dune');

    expect(calls).toHaveLength(2);
  });

  it('leaves out a year tmdb does not know', async () => {
    const { fetcher } = answering(() =>
      json({ results: [{ id: 1, title: 'Untitled', release_date: '' }] }),
    );

    expect((await client(fetcher).searchMovies('Untitled'))[0]).not.toHaveProperty('year');
  });

  it('says the token was refused, which retrying will not fix', async () => {
    const { fetcher } = answering(() => json({ status_message: 'Invalid API key' }, 401));

    await expect(client(fetcher).searchMovies('Heat')).rejects.toMatchObject({
      reason: 'unauthorized',
    });
  });

  it('passes on how long tmdb asked to wait', async () => {
    const { fetcher } = answering(() => json({}, 429, { 'retry-after': '3' }));

    await expect(client(fetcher).searchMovies('Heat')).rejects.toMatchObject({
      reason: 'rate-limited',
      retryAfterMs: 3000,
    });
  });

  it('says tmdb is unavailable when it cannot be reached', async () => {
    const fetcher: typeof fetch = () => Promise.reject(new Error('getaddrinfo ENOTFOUND'));

    await expect(client(fetcher).searchMovies('Heat')).rejects.toBeInstanceOf(CatalogueError);
  });

  it('refuses an answer that is not a search page rather than guessing', async () => {
    const { fetcher } = answering(() => json({ page: 1, results: 'nothing' }));

    await expect(client(fetcher).searchMovies('Heat')).rejects.toMatchObject({
      reason: 'malformed',
    });
  });

  it('does not cache a failure, so the next call gets a real chance', async () => {
    let fail = true;
    const { calls, fetcher } = answering(() => (fail ? json({}, 503) : json({ results: [] })));
    const tmdb = client(fetcher);

    await expect(tmdb.searchMovies('Heat')).rejects.toBeInstanceOf(CatalogueError);

    fail = false;

    expect(await tmdb.searchMovies('Heat')).toEqual([]);
    expect(calls).toHaveLength(2);
  });
});
