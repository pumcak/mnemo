import type { MediaHint } from '@mnemo/contracts';
import type { SiteAdapter } from './types';
import type { ExtractedMedia } from '../title/extract';

/**
 * Netflix sets the document title to the site name during playback and
 * publishes no structured data on the watch page, so the generic reader has
 * nothing but "Netflix" to work with. The player itself does say what is on
 * screen, in the title block it draws over the video.
 *
 * That block is only in the page while the player is mounted, and Netflix is
 * free to rename its classes at any time. Both cases return nothing here and
 * fall through to the generic reading, which is why this adapter never guesses.
 */
const titleBlockSelectors = ['[data-uia="video-title"]', '.video-title'] as const;

const seasonEpisodePatterns = [
  /\bS(\d{1,3})\s*[:.]\s*E(\d{1,4})\b/i,
  // A word boundary is defined on ascii word characters, so it never matches
  // next to an accented letter. The spelled out forms use a character class.
  /saison\s*(\d{1,3}).*?[eé]pisode\s*(\d{1,4})/i,
  /season\s*(\d{1,3}).*?episode\s*(\d{1,4})/i,
] as const;

const textOf = (element: Element | null | undefined): string | undefined => {
  const text = element?.textContent?.trim();

  return text !== undefined && text.length > 0 ? text : undefined;
};

const seasonEpisode = (line: string): { season: number; episode: number } | undefined => {
  for (const pattern of seasonEpisodePatterns) {
    const match = pattern.exec(line);
    const [, season, episode] = match ?? [];

    if (season !== undefined && episode !== undefined) {
      return { season: Number.parseInt(season, 10), episode: Number.parseInt(episode, 10) };
    }
  }

  return undefined;
};

const findTitleBlock = (doc: Document): Element | undefined => {
  for (const selector of titleBlockSelectors) {
    const found = doc.querySelector(selector);

    if (found !== null) {
      return found;
    }
  }

  return undefined;
};

export const netflixAdapter: SiteAdapter = {
  name: 'netflix',
  matches: (url) => url.hostname === 'netflix.com' || url.hostname.endsWith('.netflix.com'),
  extract: ({ doc }): ExtractedMedia | undefined => {
    const block = findTitleBlock(doc);

    if (block === undefined) {
      return undefined;
    }

    const heading = textOf(block.querySelector('h4'));
    const lines = [...block.querySelectorAll('span')]
      .map((span) => textOf(span))
      .filter((line): line is string => line !== undefined);

    const numbering = lines.map(seasonEpisode).find((found) => found !== undefined);
    const episodeTitle = lines.find((line) => seasonEpisode(line) === undefined);

    /**
     * For a film the block holds the film name and nothing else. For an episode
     * it holds the series name, the numbering and the episode name, and the
     * episode name is the better raw title: it is what a search would match.
     */
    const rawTitle = episodeTitle ?? heading;

    if (rawTitle === undefined) {
      return undefined;
    }

    const hint: MediaHint = {
      ...(heading === undefined || episodeTitle === undefined ? {} : { seriesTitle: heading }),
      ...(numbering === undefined ? {} : numbering),
    };

    return {
      rawTitle,
      source: 'site-adapter',
      ...(Object.keys(hint).length === 0 ? {} : { hint }),
    };
  },
};
