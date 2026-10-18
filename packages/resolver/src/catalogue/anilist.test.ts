import { describe, expect, it } from 'vitest';
import { createAniListClient } from './anilist';
import { createRateLimiter } from './rate-limit';
import type { Candidate } from './types';

interface Call {
  method: string | undefined;
  body: { query: string; variables: { search: string; year: number | null } };
}

const page = (media: unknown[]): Response =>
  new Response(JSON.stringify({ data: { Page: { media } } }), {
    headers: { 'content-type': 'application/json' },
  });

const answering = (reply: () => Response) => {
  const calls: Call[] = [];
  const fetcher: typeof fetch = (_input, init) => {
    calls.push({
      method: init?.method,
      body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Call['body'],
    });

    return Promise.resolve(reply());
  };

  return {
    calls,
    client: createAniListClient({ fetcher, limiter: createRateLimiter({ minIntervalMs: 0 }) }),
  };
};

const onePiece = {
  id: 21,
  format: 'TV',
  episodes: null,
  seasonYear: 1999,
  startDate: { year: 1999 },
  popularity: 500000,
  title: { romaji: 'ONE PIECE', english: 'ONE PIECE', native: 'ONE PIECE' },
  synonyms: ['ワンピース', 'OP'],
};

const frieren = {
  id: 154587,
  format: 'TV',
  episodes: 28,
  seasonYear: 2023,
  startDate: { year: 2023 },
  popularity: 300000,
  title: {
    romaji: 'Sousou no Frieren',
    english: "Frieren: Beyond Journey's End",
    native: '葬送のフリーレン',
  },
  synonyms: ['Frieren at the Funeral'],
};

describe('createAniListClient', () => {
  it('posts a graphql query that asks for anime only and never for adult entries', async () => {
    const { calls, client } = answering(() => page([]));

    await client.searchAnime('Sousou no Frieren', 2023);

    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.body.variables).toEqual({ search: 'Sousou no Frieren', year: 2023 });
    expect(calls[0]?.body.query).toContain('type: ANIME');
    expect(calls[0]?.body.query).toContain('isAdult: false');
  });

  it('sends a missing year as null, which tells anilist not to filter on it', async () => {
    const { calls, client } = answering(() => page([]));

    await client.searchAnime('One Piece');

    expect(calls[0]?.body.variables.year).toBeNull();
  });

  it('prefers the english title and keeps every other name for matching', async () => {
    const { client } = answering(() => page([frieren]));

    expect(await client.searchAnime('Frieren')).toEqual<Candidate[]>([
      {
        catalogue: 'anilist',
        id: 154587,
        kind: 'series',
        title: "Frieren: Beyond Journey's End",
        alternativeTitles: ['Sousou no Frieren', '葬送のフリーレン', 'Frieren at the Funeral'],
        year: 2023,
        episodes: 28,
        popularity: 300000,
      },
    ]);
  });

  it('lists each alternative name once', async () => {
    const { client } = answering(() => page([onePiece]));

    expect((await client.searchAnime('One Piece'))[0]?.alternativeTitles).toEqual([
      'ワンピース',
      'OP',
    ]);
  });

  it('leaves out an episode count anilist does not know, as for a show still airing', async () => {
    const { client } = answering(() => page([onePiece]));

    expect((await client.searchAnime('One Piece'))[0]).not.toHaveProperty('episodes');
  });

  it('calls an anime film a film', async () => {
    const { client } = answering(() =>
      page([{ ...frieren, id: 1, format: 'MOVIE', title: { romaji: 'Kimi no Na wa.' } }]),
    );

    expect((await client.searchAnime('Kimi no Na wa'))[0]?.kind).toBe('movie');
  });

  it('falls back to the start date when the season year is missing', async () => {
    const { client } = answering(() =>
      page([{ ...frieren, seasonYear: null, startDate: { year: 2022 } }]),
    );

    expect((await client.searchAnime('Frieren'))[0]?.year).toBe(2022);
  });

  it('drops an entry that has no title in any script', async () => {
    const { client } = answering(() => page([{ ...frieren, title: {} }]));

    expect(await client.searchAnime('Frieren')).toEqual([]);
  });

  it('asks once for a title that keeps coming back', async () => {
    const { calls, client } = answering(() => page([]));

    await client.searchAnime('One Piece');
    await client.searchAnime('one piece ');

    expect(calls).toHaveLength(1);
  });

  it('answers an empty query without a request', async () => {
    const { calls, client } = answering(() => page([]));

    expect(await client.searchAnime('  ')).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('passes on how long anilist asked to wait', async () => {
    const { client } = answering(
      () => new Response('{}', { status: 429, headers: { 'retry-after': '60' } }),
    );

    await expect(client.searchAnime('One Piece')).rejects.toMatchObject({
      reason: 'rate-limited',
      retryAfterMs: 60_000,
    });
  });

  it('refuses an answer carrying errors instead of data', async () => {
    const { client } = answering(
      () => new Response(JSON.stringify({ data: null, errors: [{ message: 'bad' }] })),
    );

    await expect(client.searchAnime('One Piece')).rejects.toMatchObject({ reason: 'malformed' });
  });
});
