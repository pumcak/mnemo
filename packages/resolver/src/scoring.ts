import type { Candidate } from './catalogue/types';
import { titleSimilarity } from './similarity';
import type { ParsedTitle } from './types';

export interface ScoredCandidate {
  candidate: Candidate;
  /** From zero to one. Compared against the confidence threshold, not against other works. */
  score: number;
  /** One line per component, so a wrong match can be explained without a debugger. */
  reasons: string[];
}

/**
 * Below this a match goes to manual review instead of being recorded.
 *
 * Set so that a title match alone is not enough. With these weights an exact name
 * with the wrong year scores 0.70, an exact name with the wrong kind of work
 * scores 0.75, and an exact name of the right kind with no year to compare scores
 * 0.85: the first two are where a person should look, because that is how a
 * remake or a same name series ends up in the history.
 */
export const confidentScore = 0.8;

const weights = { title: 0.45, year: 0.3, kind: 0.25 } as const;

/** The name the catalogue should be asked about: the series for an episode, the title otherwise. */
export const searchTitleOf = (parsed: ParsedTitle): string =>
  parsed.kind === 'episode' && parsed.series !== undefined ? parsed.series : parsed.title;

const yearScore = (wanted: number | undefined, offered: number | undefined): number => {
  if (wanted === undefined) {
    // Nothing to compare: neither rewarded nor punished.
    return 0.5;
  }

  if (offered === undefined) {
    return 0.4;
  }

  const gap = Math.abs(wanted - offered);

  // A film released late in December is dated a year apart by different sources.
  return gap === 0 ? 1 : gap === 1 ? 0.6 : 0;
};

const kindScore = (parsed: ParsedTitle, candidate: Candidate): number => {
  if (parsed.kind === 'unknown') {
    return 0.5;
  }

  const wanted = parsed.kind === 'episode' ? 'series' : 'movie';

  return wanted === candidate.kind ? 1 : 0;
};

/**
 * Scores how well one catalogue entry fits what the title said.
 *
 * An episode number past the known episode count halves the score rather than
 * zeroing it: a catalogue that counts by season and a release that counts in
 * absolute numbers disagree all the time, and that disagreement is worth a review,
 * not a silent rejection.
 */
export const scoreCandidate = (parsed: ParsedTitle, candidate: Candidate): ScoredCandidate => {
  const wanted = searchTitleOf(parsed);
  const names = [candidate.title, ...candidate.alternativeTitles];
  const title = Math.max(0, ...names.map((name) => titleSimilarity(wanted, name)));
  const year = yearScore(parsed.year, candidate.year);
  const kind = kindScore(parsed, candidate);
  const beyondEpisodes =
    parsed.episode !== undefined &&
    candidate.episodes !== undefined &&
    parsed.season === undefined &&
    parsed.episode > candidate.episodes;

  const weighted = title * weights.title + year * weights.year + kind * weights.kind;
  const score = Math.round((beyondEpisodes ? weighted / 2 : weighted) * 1000) / 1000;

  return {
    candidate,
    score,
    reasons: [
      `title ${title.toFixed(2)}`,
      `year ${year.toFixed(2)}`,
      `kind ${kind.toFixed(2)}`,
      ...(beyondEpisodes
        ? [`episode ${String(parsed.episode)} past the ${String(candidate.episodes)} known`]
        : []),
    ],
  };
};

/** Best first. Popularity only breaks ties, so it can never outvote the title. */
export const rankCandidates = (
  parsed: ParsedTitle,
  candidates: readonly Candidate[],
): ScoredCandidate[] =>
  candidates
    .map((candidate) => scoreCandidate(parsed, candidate))
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.candidate.popularity ?? 0) - (left.candidate.popularity ?? 0),
    );
