import type { MediaHint } from '@mnemo/contracts';
import { detectAnimeRelease } from './anime';
import type { AniListClient } from './catalogue/anilist';
import type { TmdbClient } from './catalogue/tmdb';
import { CatalogueError } from './catalogue/types';
import type { Candidate, CatalogueName } from './catalogue/types';
import { parseRawTitle } from './parse';
import { confidentScore, rankCandidates, searchTitleOf } from './scoring';
import type { ScoredCandidate } from './scoring';
import type { ParsedTitle } from './types';

export type Route = 'tmdb-movie' | 'tmdb-series' | 'anilist';

export interface Catalogues {
  tmdb?: Pick<TmdbClient, 'searchMovies' | 'searchSeries'>;
  anilist?: Pick<AniListClient, 'searchAnime'>;
}

export interface CatalogueFailure {
  catalogue: CatalogueName;
  reason: CatalogueError['reason'];
  retryAfterMs?: number;
}

export interface Resolution {
  parsed: ParsedTitle;
  /** The best candidate, present only when one scored above zero. */
  best?: ScoredCandidate;
  confident: boolean;
  /** Every candidate seen across the catalogues asked, best first. */
  ranked: ScoredCandidate[];
  /** The searches that actually ran, in order. */
  asked: Route[];
  failures: CatalogueFailure[];
}

/**
 * Folds in what the capture source already knew.
 *
 * The Netflix adapter reports "Welcome to the Playground" as the title and Arcane,
 * season one, episode one as the hint. The string alone is a mystery; with the
 * hint it is an episode of a known series. Whatever the parse found explicitly
 * stays, because the raw title is the more direct evidence of the two.
 */
export const applyHint = (parsed: ParsedTitle, hint: MediaHint | undefined): ParsedTitle => {
  if (hint === undefined) {
    return parsed;
  }

  const year = parsed.year ?? hint.year;
  const series = parsed.series ?? hint.seriesTitle;

  if (hint.seriesTitle === undefined && hint.episode === undefined) {
    return year === undefined ? parsed : { ...parsed, year };
  }

  const season = parsed.season ?? hint.season;
  const episode = parsed.episode ?? hint.episode;

  return {
    kind: 'episode',
    title: parsed.title,
    ...(series === undefined || series === parsed.title ? {} : { series }),
    ...(season === undefined ? {} : { season }),
    ...(episode === undefined ? {} : { episode }),
    ...(year === undefined ? {} : { year }),
    removed: parsed.removed,
  };
};

/**
 * Which catalogues to ask, most likely first.
 *
 * A title recognised as nothing is not searched at all: a reaction video or a
 * trailer names a work, and the closest catalogue match would be recorded as a
 * viewing of it. AniList is only asked first when the name has the shape of an
 * anime release, because its rate limit is the tighter of the two and most
 * western series would waste a request there.
 */
export const planRoute = (parsed: ParsedTitle, raw: string): Route[] => {
  if (parsed.kind === 'unknown' || searchTitleOf(parsed).length === 0) {
    return [];
  }

  const western: Route = parsed.kind === 'movie' ? 'tmdb-movie' : 'tmdb-series';

  return detectAnimeRelease(raw).matches ? ['anilist', western] : [western, 'anilist'];
};

const search = async (
  route: Route,
  parsed: ParsedTitle,
  catalogues: Catalogues,
): Promise<Candidate[] | undefined> => {
  const query = searchTitleOf(parsed);

  if (route === 'anilist') {
    return catalogues.anilist?.searchAnime(
      query,
      parsed.kind === 'movie' ? parsed.year : undefined,
    );
  }

  if (route === 'tmdb-movie') {
    return catalogues.tmdb?.searchMovies(query, parsed.year);
  }

  return catalogues.tmdb?.searchSeries(query, parsed.year);
};

/**
 * Turns a raw title into the work it most likely names.
 *
 * Catalogues are asked in route order and the search stops at the first
 * confident answer, so a clear match costs one request. A catalogue that fails is
 * recorded and skipped rather than failing the whole resolution: one of the two
 * being down should cost accuracy, not the ability to resolve anything.
 */
export const resolveTitle = async (
  raw: string,
  catalogues: Catalogues,
  hint?: MediaHint,
): Promise<Resolution> => {
  const parsed = applyHint(parseRawTitle(raw), hint);
  const route = planRoute(parsed, raw);
  const seen: Candidate[] = [];
  const asked: Route[] = [];
  const failures: CatalogueFailure[] = [];

  for (const step of route) {
    let found: Candidate[] | undefined;

    try {
      found = await search(step, parsed, catalogues);
    } catch (error) {
      if (!(error instanceof CatalogueError)) {
        throw error;
      }

      failures.push({
        catalogue: error.catalogue,
        reason: error.reason,
        ...(error.retryAfterMs === undefined ? {} : { retryAfterMs: error.retryAfterMs }),
      });
      continue;
    }

    if (found === undefined) {
      continue;
    }

    asked.push(step);
    seen.push(...found);

    const top = rankCandidates(parsed, found)[0];

    if (top !== undefined && top.score >= confidentScore) {
      break;
    }
  }

  const ranked = rankCandidates(parsed, seen);
  const best = ranked[0] !== undefined && ranked[0].score > 0 ? ranked[0] : undefined;

  return {
    parsed,
    ...(best === undefined ? {} : { best }),
    confident: best !== undefined && best.score >= confidentScore,
    ranked,
    asked,
    failures,
  };
};
