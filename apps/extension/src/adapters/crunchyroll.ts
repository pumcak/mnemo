import type { MediaHint } from '@mnemo/contracts';
import { episodeIn, seasonEpisodeIn } from './numbering';
import type { SiteAdapter } from './types';
import type { ExtractedMedia } from '../title/extract';

/**
 * Crunchyroll is the opposite case from Netflix: its document title is
 * informative rather than a placeholder, so this adapter has two ways in and
 * prefers the player, which is more precise.
 *
 * Anime numbering is the reason this site needs an adapter at all. An episode
 * number here routinely runs past a thousand and often comes with no season,
 * which is exactly the shape a generic reader gets wrong.
 */
const episodeTitleSelectors = [
  '.erc-current-media-info h1.title',
  '.erc-current-media-info .title',
  'h1.title',
] as const;

const seriesTitleSelectors = [
  '.erc-current-media-info h4 a',
  '.erc-current-media-info h4',
  '.show-title',
  'h4.show-title a',
] as const;

const numberingSelectors = ['.erc-current-media-info .season-episode', '.season-episode'] as const;

const textFrom = (doc: Document, selectors: readonly string[]): string | undefined => {
  for (const selector of selectors) {
    const text = doc.querySelector(selector)?.textContent?.trim();

    if (text !== undefined && text.length > 0) {
      return text;
    }
  }

  return undefined;
};

const siteSuffix = /\s*[-|]\s*crunchyroll\s*$/i;

const fromDocumentTitle = (doc: Document): ExtractedMedia | undefined => {
  const title = doc.title.replace(siteSuffix, '').trim();

  if (title.length === 0) {
    return undefined;
  }

  const numbering = seasonEpisodeIn(title);
  const episode = episodeIn(title);

  const hint: MediaHint = {
    ...(numbering === undefined ? {} : numbering),
    ...(numbering === undefined && episode !== undefined ? { episode } : {}),
  };

  return {
    rawTitle: title,
    source: 'site-adapter',
    ...(Object.keys(hint).length === 0 ? {} : { hint }),
  };
};

export const crunchyrollAdapter: SiteAdapter = {
  name: 'crunchyroll',
  matches: (url) => url.hostname === 'crunchyroll.com' || url.hostname.endsWith('.crunchyroll.com'),
  extract: ({ doc }): ExtractedMedia | undefined => {
    const episodeTitle = textFrom(doc, episodeTitleSelectors);
    const seriesTitle = textFrom(doc, seriesTitleSelectors);
    const numberingText = textFrom(doc, numberingSelectors);

    if (episodeTitle === undefined) {
      return fromDocumentTitle(doc);
    }

    const numbering = numberingText === undefined ? undefined : seasonEpisodeIn(numberingText);
    const loneEpisode =
      numbering !== undefined
        ? undefined
        : (episodeIn(numberingText ?? '') ?? episodeIn(episodeTitle));

    const hint: MediaHint = {
      ...(seriesTitle === undefined ? {} : { seriesTitle }),
      ...(numbering === undefined ? {} : numbering),
      ...(loneEpisode === undefined ? {} : { episode: loneEpisode }),
    };

    return {
      rawTitle: episodeTitle,
      source: 'site-adapter',
      ...(Object.keys(hint).length === 0 ? {} : { hint }),
    };
  },
};
