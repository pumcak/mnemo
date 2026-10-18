import { cleanTitle } from './clean';
import { findNumbering, findYear } from './numbering';
import type { ParsedTitle } from './types';

/**
 * Words that mean the video is about a work rather than a viewing of it. Kept
 * narrow on purpose: "live" alone would catch "Live Free or Die Hard".
 */
const notAViewing =
  /(?<![\p{L}])(trailer|teaser|bande[- ]annonce|r[eé]action|reacts?|recap)(?![\p{L}])|^live\s*:/iu;

const trimEdges = (value: string): string =>
  value
    .replace(/^[\s\-–|:,.]+/, '')
    .replace(/[\s\-–|:,.([]+$/, '')
    .trim();

const without = (value: string, start: number, end: number): string =>
  trimEdges(`${value.slice(0, start)} ${value.slice(end)}`.replace(/\s+/g, ' '));

/**
 * Turns a raw title into what it says, without asking any catalogue.
 *
 * For an episode, the text before the numbering names the series and the text
 * after it may name the episode. It only counts as an episode name when the
 * numbering stands alone between separators, or when the text after it has more
 * than one word: "One Piece Épisode 1071 - SiteExemple" ends with a site name, and
 * one word glued after the numbering is more often that than a title.
 */
export const parseRawTitle = (raw: string): ParsedTitle => {
  const { title: cleaned, removed } = cleanTitle(raw);

  if (cleaned.length === 0 || notAViewing.test(cleaned)) {
    return { kind: 'unknown', title: cleaned, removed };
  }

  const numbering = findNumbering(cleaned);

  if (numbering?.episode !== undefined) {
    const before = cleaned.slice(0, numbering.start);
    const after = trimEdges(cleaned.slice(numbering.end));
    // A year before the numbering dates the series, as in "Doctor Who 2005", so
    // it moves to the year field unless it is the whole name.
    const yearInSeries = findYear(before);
    const seriesWithoutYear =
      yearInSeries === undefined ? '' : without(before, yearInSeries.start, yearInSeries.end);
    const keepsYear = yearInSeries !== undefined && seriesWithoutYear.length > 0;
    const series = keepsYear ? seriesWithoutYear : trimEdges(before);
    const episodeTitle =
      after.length > 0 && (numbering.standalone || after.includes(' ')) ? after : undefined;

    return {
      kind: 'episode',
      title: episodeTitle ?? series,
      ...(episodeTitle !== undefined && series.length > 0 ? { series } : {}),
      ...(numbering.season === undefined ? {} : { season: numbering.season }),
      episode: numbering.episode,
      ...(keepsYear ? { year: yearInSeries.year } : {}),
      removed,
    };
  }

  const year = findYear(cleaned);

  if (year !== undefined) {
    const title = without(cleaned, year.start, year.end);

    if (title.length > 0) {
      return { kind: 'movie', title, year: year.year, removed };
    }
  }

  return { kind: 'unknown', title: cleaned, removed };
};
