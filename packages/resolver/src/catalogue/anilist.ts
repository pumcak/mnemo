import { z } from 'zod';
import { createTtlCache } from './cache';
import type { ResponseCache } from './cache';
import { createRateLimiter } from './rate-limit';
import type { RateLimiter } from './rate-limit';
import { CatalogueError } from './types';
import type { Candidate } from './types';

/**
 * Adult entries are excluded in the query itself rather than filtered afterwards,
 * so they never reach the cache or the scoring.
 */
const searchQuery = `
query ($search: String, $year: Int) {
  Page(perPage: 10) {
    media(search: $search, type: ANIME, seasonYear: $year, isAdult: false, sort: SEARCH_MATCH) {
      id
      format
      episodes
      seasonYear
      startDate { year }
      popularity
      title { romaji english native }
      synonyms
    }
  }
}`;

const mediaSchema = z.object({
  id: z.number().int(),
  format: z.string().nullish(),
  episodes: z.number().int().nullish(),
  seasonYear: z.number().int().nullish(),
  startDate: z.object({ year: z.number().int().nullish() }).nullish(),
  popularity: z.number().nullish(),
  title: z.object({
    romaji: z.string().nullish(),
    english: z.string().nullish(),
    native: z.string().nullish(),
  }),
  synonyms: z.array(z.string()).nullish(),
});

const responseSchema = z.object({
  data: z.object({ Page: z.object({ media: z.array(mediaSchema) }) }),
});

export interface AniListClientOptions {
  fetcher?: typeof fetch;
  endpoint?: string;
  cache?: ResponseCache<Candidate[]>;
  limiter?: RateLimiter;
}

export interface AniListClient {
  searchAnime: (query: string, year?: number) => Promise<Candidate[]>;
}

const present = (value: string | null | undefined): value is string =>
  value !== null && value !== undefined && value.trim().length > 0;

const toCandidate = (media: z.infer<typeof mediaSchema>): Candidate | undefined => {
  // English first because it is what a western site writes in its page title,
  // romaji next because it is what a fansub release uses.
  const names = [media.title.english, media.title.romaji, media.title.native].filter(present);
  const title = names[0];

  if (title === undefined) {
    return undefined;
  }

  const alternativeTitles = [...new Set([...names.slice(1), ...(media.synonyms ?? [])])].filter(
    (name) => present(name) && name !== title,
  );
  const year = media.seasonYear ?? media.startDate?.year ?? undefined;

  return {
    catalogue: 'anilist',
    id: media.id,
    kind: media.format === 'MOVIE' ? 'movie' : 'series',
    title,
    alternativeTitles,
    ...(year === undefined || year === null ? {} : { year }),
    ...(media.episodes === undefined || media.episodes === null
      ? {}
      : { episodes: media.episodes }),
    ...(media.popularity === undefined || media.popularity === null
      ? {}
      : { popularity: media.popularity }),
  };
};

/**
 * Searches AniList, which knows anime far better than TMDB does: romanised and
 * native titles, synonyms, absolute episode counts.
 *
 * Its public limit is ninety requests a minute and it has run lower at times, so
 * calls are spaced well under that. A day of cache covers the same title coming
 * back every few seconds while an episode plays.
 */
export const createAniListClient = ({
  fetcher = fetch,
  endpoint = 'https://graphql.anilist.co',
  cache = createTtlCache<Candidate[]>({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 2000 }),
  limiter = createRateLimiter({ minIntervalMs: 1000 }),
}: AniListClientOptions = {}): AniListClient => ({
  searchAnime: async (query, year) => {
    const trimmed = query.trim();

    if (trimmed.length === 0) {
      return [];
    }

    const key = `anime|${trimmed.toLowerCase()}|${String(year ?? '')}`;
    const cached = cache.get(key);

    if (cached !== undefined) {
      return cached;
    }

    let response: Response;

    try {
      response = await limiter.schedule(() =>
        fetcher(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            query: searchQuery,
            variables: { search: trimmed, year: year ?? null },
          }),
        }),
      );
    } catch (error) {
      throw new CatalogueError(
        'anilist',
        'unavailable',
        `anilist did not answer: ${String(error)}`,
      );
    }

    if (response.status === 429) {
      const seconds = Number.parseInt(response.headers.get('retry-after') ?? '', 10);

      throw new CatalogueError(
        'anilist',
        'rate-limited',
        'anilist asked to slow down',
        Number.isInteger(seconds) ? seconds * 1000 : undefined,
      );
    }

    if (!response.ok) {
      throw new CatalogueError(
        'anilist',
        'unavailable',
        `anilist answered ${String(response.status)}`,
      );
    }

    const parsed = responseSchema.safeParse(await response.json());

    if (!parsed.success) {
      throw new CatalogueError(
        'anilist',
        'malformed',
        'anilist answered something that is not a page',
      );
    }

    const candidates = parsed.data.data.Page.media
      .map(toCandidate)
      .filter((candidate): candidate is Candidate => candidate !== undefined);

    cache.set(key, candidates);

    return candidates;
  },
});
