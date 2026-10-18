export interface Numbering {
  season?: number | undefined;
  episode?: number | undefined;
  start: number;
  end: number;
  /**
   * True when the numbering is a segment of its own, between separators, as in
   * "Breaking Bad - 5x14 - Ozymandias". That shape says the text after it is an
   * episode name; the glued shape does not.
   */
  standalone: boolean;
}

const romanValues: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

const fromRoman = (value: string): number | undefined => {
  const letters = value.toLowerCase().split('');
  let total = 0;

  for (const [index, letter] of letters.entries()) {
    const current = romanValues[letter];
    const next = romanValues[letters[index + 1] ?? ''];

    if (current === undefined) {
      return undefined;
    }

    total += next !== undefined && next > current ? -current : current;
  }

  return total > 0 && total < 50 ? total : undefined;
};

const positive = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

interface Rule {
  pattern: RegExp;
  read: (
    match: RegExpExecArray,
  ) => { season?: number | undefined; episode?: number | undefined } | undefined;
}

const seasonWord = '(?:saison|season|livre|book)';
const episodeWord = '(?:[eé]pisode|ep\\.?)';

/**
 * Every way a season and an episode get written, most explicit first.
 *
 * Order is the whole design: once "S01E1071" has matched, nothing else gets to
 * reinterpret those digits. The loose shapes at the end only run on strings where
 * nothing explicit was found.
 */
const rules: readonly Rule[] = [
  {
    pattern: /\bS(\d{1,3})\s*[.\-_ ]?\s*E(\d{1,4})\b/i,
    read: (match) => ({ season: positive(match[1]), episode: positive(match[2]) }),
  },
  {
    pattern: /\b(\d{1,3})x(\d{1,4})\b/i,
    read: (match) => ({ season: positive(match[1]), episode: positive(match[2]) }),
  },
  {
    pattern: new RegExp(
      `\\b${seasonWord}\\s*(\\d{1,3})\\s*[:\\-]?\\s*${episodeWord}\\s*(\\d{1,4})`,
      'i',
    ),
    read: (match) => ({ season: positive(match[1]), episode: positive(match[2]) }),
  },
  {
    pattern: new RegExp(
      `\\b${seasonWord}\\s+([ivxlcdm]+)\\s*[:\\-]?\\s*${episodeWord}\\s*(\\d{1,4})`,
      'i',
    ),
    read: (match) => {
      const season = match[1] === undefined ? undefined : fromRoman(match[1]);

      return season === undefined ? undefined : { season, episode: positive(match[2]) };
    },
  },
  {
    // No word boundary here: it is defined on ascii letters and never matches
    // before "É". A letter lookbehind does the same job and keeps "Sleep 3" whole.
    pattern: new RegExp(`(?<!\\p{L})${episodeWord}\\s*(\\d{1,4})`, 'iu'),
    read: (match) => ({ episode: positive(match[1]) }),
  },
  {
    pattern: /\bE(\d{1,4})\b/,
    read: (match) => ({ episode: positive(match[1]) }),
  },
];

const seasonOnlyRules: readonly Rule[] = [
  {
    pattern: new RegExp(`\\b${seasonWord}\\s*(\\d{1,3})\\b`, 'i'),
    read: (match) => ({ season: positive(match[1]) }),
  },
  {
    pattern: /\bS(\d{1,2})\b/i,
    read: (match) => ({ season: positive(match[1]) }),
  },
];

/**
 * The anime shape: a bare number at the very end, behind a dash. Restricted to
 * the end because a bare number anywhere else is a year, part of the name, or the
 * "1071" in the title of a reaction video.
 */
const trailingEpisode = /\s[-–]\s*(\d{1,4})\s*$/;

const separators = new Set(['-', '–', '|', ':']);

const isStandalone = (title: string, start: number, end: number): boolean => {
  const before = title.slice(0, start).trimEnd();
  const after = title.slice(end).trimStart();

  return (
    (before.length === 0 || separators.has(before.slice(-1))) &&
    (after.length === 0 || separators.has(after.slice(0, 1)))
  );
};

const apply = (title: string, rule: Rule): Numbering | undefined => {
  const match = rule.pattern.exec(title);

  if (match === null) {
    return undefined;
  }

  const read = rule.read(match);

  if (read === undefined || (read.season === undefined && read.episode === undefined)) {
    return undefined;
  }

  const start = match.index;
  const end = match.index + match[0].length;

  return { ...read, start, end, standalone: isStandalone(title, start, end) };
};

/**
 * Finds the season and the episode in a cleaned title.
 *
 * A season written alone, as anime does with "S2 - 05", is completed by the
 * episode number that follows it, and the two halves are reported as one span so
 * the caller can cut the title before the first of them.
 */
export const findNumbering = (title: string): Numbering | undefined => {
  for (const rule of rules) {
    const found = apply(title, rule);

    if (found !== undefined) {
      return found;
    }
  }

  for (const rule of seasonOnlyRules) {
    const season = apply(title, rule);

    if (season === undefined) {
      continue;
    }

    const trailing = trailingEpisode.exec(title);
    const episode = trailing === null ? undefined : positive(trailing[1]);

    if (episode === undefined || trailing === null || trailing.index < season.end) {
      return season;
    }

    return {
      ...season,
      episode,
      end: title.length,
      standalone: isStandalone(title, season.start, title.length),
    };
  }

  const trailing = trailingEpisode.exec(title);
  const episode = trailing === null ? undefined : positive(trailing[1]);

  if (trailing === null || episode === undefined) {
    return undefined;
  }

  const start = trailing.index + trailing[0].indexOf(trailing[1] ?? '');

  return {
    episode,
    start,
    end: title.length,
    standalone: isStandalone(title, start, title.length),
  };
};

export interface FoundYear {
  year: number;
  start: number;
  end: number;
}

/**
 * Picks the year out of a title.
 *
 * A bracketed year wins, because brackets are how people say "this is the year,
 * not part of the name". Without brackets the last candidate wins, which is what
 * tells "Blade Runner 2049 2017" apart from a film called 2049.
 */
export const findYear = (title: string): FoundYear | undefined => {
  const candidates = [
    ...title.matchAll(/([([])?\b(18[89]\d|19\d{2}|20\d{2}|21\d{2})\b([)\]])?/g),
  ].map((match) => ({
    year: Number.parseInt(match[2] ?? '', 10),
    start: match.index,
    end: match.index + match[0].length,
    bracketed: match[1] !== undefined && match[3] !== undefined,
  }));

  const bracketed = candidates.filter((candidate) => candidate.bracketed);
  const chosen = (bracketed.length > 0 ? bracketed : candidates).at(-1);

  return chosen === undefined
    ? undefined
    : { year: chosen.year, start: chosen.start, end: chosen.end };
};
