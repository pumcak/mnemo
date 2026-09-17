export interface Numbering {
  season: number;
  episode: number;
}

/**
 * How players write a season and an episode on screen.
 *
 * A word boundary in a JavaScript regular expression is defined on ascii word
 * characters, so it never matches next to an accented letter. The spelled out
 * forms therefore use character classes instead of boundaries.
 */
const patterns = [
  /\bS(\d{1,3})\s*[:.\s]\s*E(\d{1,4})\b/i,
  /\bS(\d{1,3})E(\d{1,4})\b/i,
  /saison\s*(\d{1,3}).*?[eé]pisode\s*(\d{1,4})/i,
  /season\s*(\d{1,3}).*?episode\s*(\d{1,4})/i,
  /\b(\d{1,3})x(\d{1,4})\b/i,
] as const;

export const seasonEpisodeIn = (text: string): Numbering | undefined => {
  for (const pattern of patterns) {
    const [, season, episode] = pattern.exec(text) ?? [];

    if (season !== undefined && episode !== undefined) {
      const numbering = {
        season: Number.parseInt(season, 10),
        episode: Number.parseInt(episode, 10),
      };

      if (numbering.season > 0 && numbering.episode > 0) {
        return numbering;
      }
    }
  }

  return undefined;
};

/**
 * An episode number on its own, for the sites and the release names that never
 * mention a season. Deliberately narrow: only the forms that say what the
 * number means, because a bare number in a title is usually a year or a part of
 * the name.
 */
const loneEpisodePatterns = [
  /\bepisode\s*(\d{1,4})\b/i,
  /[eé]pisode\s*(\d{1,4})/i,
  /\bE(\d{1,4})\b/,
  // No boundary before the hash: a boundary needs an ascii word character on
  // one side, and a string starting with # has none.
  /#(\d{1,4})\b/,
] as const;

export const episodeIn = (text: string): number | undefined => {
  if (seasonEpisodeIn(text) !== undefined) {
    return undefined;
  }

  for (const pattern of loneEpisodePatterns) {
    const [, episode] = pattern.exec(text) ?? [];

    if (episode !== undefined) {
      const parsed = Number.parseInt(episode, 10);

      if (parsed > 0) {
        return parsed;
      }
    }
  }

  return undefined;
};
