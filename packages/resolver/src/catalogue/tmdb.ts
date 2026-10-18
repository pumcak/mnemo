import { z } from 'zod';
import { createTtlCache } from './cache';
import type { ResponseCache } from './cache';
import { createRateLimiter } from './rate-limit';
import type { RateLimiter } from './rate-limit';
import { CatalogueError } from './types';
import type { Candidate } from './types';

const yearOf = (date: string | null | undefined): number | undefined => {
  const year =
    date === undefined || date === null ? Number.NaN : Number.parseInt(date.slice(0, 4), 10);

  return Number.isInteger(year) && year >= 1888 ? year : undefined;
};

const movieSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  original_title: z.string().optional(),
  release_date: z.string().nullish(),
  popularity: z.number().optional(),
});

const seriesSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  original_name: z.string().optional(),
  first_air_date: z.string().nullish(),
  popularity: z.number().optional(),
});

const pageOf = <T extends z.ZodType>(item: T) => z.object({ results: z.array(item) });

const alternatives = (title: string, original: string | undefined): string[] =>
  original !== undefined && original !== title ? [original] : [];

export interface TmdbClientOptions {
  /** A read access token, sent as a bearer token. Lives in the environment, never in the repository. */
  token: string;
  fetcher?: typeof fetch;
  language?: string;
  baseUrl?: string;
  cache?: ResponseCache<Candidate[]>;
  limiter?: RateLimiter;
}

export interface TmdbClient {
  searchMovies: (query: string, year?: number) => Promise<Candidate[]>;
  searchSeries: (query: string, year?: number) => Promise<Candidate[]>;
}

/**
 * Searches TMDB for films and series.
 *
 * TMDB tolerates a few dozen requests a second, so the limiter here is about
 * staying polite rather than staying under a hard ceiling. A day of cache is
 * enough: catalogue entries change slowly, and a title asked once is asked again
 * every few seconds while it plays.
 */
export const createTmdbClient = ({
  token,
  fetcher = fetch,
  language = 'en-US',
  baseUrl = 'https://api.themoviedb.org/3',
  cache = createTtlCache<Candidate[]>({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 2000 }),
  limiter = createRateLimiter({ minIntervalMs: 50 }),
}: TmdbClientOptions): TmdbClient => {
  const request = async (path: string, params: Record<string, string>): Promise<unknown> => {
    const url = new URL(`${baseUrl}${path}`);

    for (const [key, value] of Object.entries({ ...params, language, include_adult: 'false' })) {
      url.searchParams.set(key, value);
    }

    let response: Response;

    try {
      response = await limiter.schedule(() =>
        fetcher(url.toString(), {
          headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
        }),
      );
    } catch (error) {
      throw new CatalogueError('tmdb', 'unavailable', `tmdb did not answer: ${String(error)}`);
    }

    if (response.status === 401) {
      throw new CatalogueError('tmdb', 'unauthorized', 'tmdb refused the token');
    }

    if (response.status === 429) {
      const seconds = Number.parseInt(response.headers.get('retry-after') ?? '', 10);

      throw new CatalogueError(
        'tmdb',
        'rate-limited',
        'tmdb asked to slow down',
        Number.isInteger(seconds) ? seconds * 1000 : undefined,
      );
    }

    if (!response.ok) {
      throw new CatalogueError('tmdb', 'unavailable', `tmdb answered ${String(response.status)}`);
    }

    return response.json();
  };

  const search = async (
    kind: 'movie' | 'series',
    query: string,
    year: number | undefined,
  ): Promise<Candidate[]> => {
    const trimmed = query.trim();

    if (trimmed.length === 0) {
      return [];
    }

    const key = `${kind}|${language}|${trimmed.toLowerCase()}|${String(year ?? '')}`;
    const cached = cache.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const yearParam: Record<string, string> =
      year === undefined
        ? {}
        : kind === 'movie'
          ? { year: String(year) }
          : { first_air_date_year: String(year) };
    const payload = await request(kind === 'movie' ? '/search/movie' : '/search/tv', {
      query: trimmed,
      ...yearParam,
    });

    const candidates = kind === 'movie' ? parseMovies(payload) : parseSeries(payload);

    cache.set(key, candidates);

    return candidates;
  };

  return {
    searchMovies: (query, year) => search('movie', query, year),
    searchSeries: (query, year) => search('series', query, year),
  };
};

const malformed = (): CatalogueError =>
  new CatalogueError('tmdb', 'malformed', 'tmdb answered something that is not a search page');

const parseMovies = (payload: unknown): Candidate[] => {
  const parsed = pageOf(movieSchema).safeParse(payload);

  if (!parsed.success) {
    throw malformed();
  }

  return parsed.data.results.map((movie) => {
    const year = yearOf(movie.release_date);

    return {
      catalogue: 'tmdb',
      id: movie.id,
      kind: 'movie',
      title: movie.title,
      alternativeTitles: alternatives(movie.title, movie.original_title),
      ...(year === undefined ? {} : { year }),
      ...(movie.popularity === undefined ? {} : { popularity: movie.popularity }),
    };
  });
};

const parseSeries = (payload: unknown): Candidate[] => {
  const parsed = pageOf(seriesSchema).safeParse(payload);

  if (!parsed.success) {
    throw malformed();
  }

  return parsed.data.results.map((series) => {
    const year = yearOf(series.first_air_date);

    return {
      catalogue: 'tmdb',
      id: series.id,
      kind: 'series',
      title: series.name,
      alternativeTitles: alternatives(series.name, series.original_name),
      ...(year === undefined ? {} : { year }),
      ...(series.popularity === undefined ? {} : { popularity: series.popularity }),
    };
  });
};
