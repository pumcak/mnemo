import type { MediaHint } from '@mnemo/contracts';

export type TitleSource =
  'site-adapter' | 'media-session' | 'json-ld' | 'og-title' | 'document-title';

export interface ExtractedMedia {
  rawTitle: string;
  source: TitleSource;
  hint?: MediaHint;
}

/** What `navigator.mediaSession.metadata` offers, reduced to what is useful. */
export interface SessionMetadata {
  title?: string | undefined;
  artist?: string | undefined;
  album?: string | undefined;
}

const clean = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim().slice(0, 500);

  return trimmed.length > 0 ? trimmed : undefined;
};

const positiveInteger = (value: unknown): number | undefined => {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value;

  return typeof parsed === 'number' && Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const year = (value: unknown): number | undefined => {
  const candidate = clean(value);
  const parsed = candidate === undefined ? undefined : Number.parseInt(candidate.slice(0, 4), 10);

  return parsed !== undefined && parsed >= 1888 && parsed <= 2200 ? parsed : undefined;
};

const withoutEmptyFields = (hint: MediaHint): MediaHint | undefined =>
  Object.values(hint).some((value) => value !== undefined) ? hint : undefined;

const hintFrom = (values: {
  seriesTitle?: string | undefined;
  season?: number | undefined;
  episode?: number | undefined;
  year?: number | undefined;
}): MediaHint | undefined =>
  withoutEmptyFields({
    ...(values.seriesTitle === undefined ? {} : { seriesTitle: values.seriesTitle }),
    ...(values.season === undefined ? {} : { season: values.season }),
    ...(values.episode === undefined ? {} : { episode: values.episode }),
    ...(values.year === undefined ? {} : { year: values.year }),
  });

const videoTypes = new Set(['TVEpisode', 'Movie', 'VideoObject', 'TVSeries', 'Episode']);

const flatten = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) {
    return value.flatMap(flatten);
  }

  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const graph = record['@graph'];

  return graph === undefined ? [record] : [record, ...flatten(graph)];
};

const typeOf = (record: Record<string, unknown>): string[] => {
  const declared = record['@type'];

  if (typeof declared === 'string') {
    return [declared];
  }

  return Array.isArray(declared)
    ? declared.filter((item): item is string => typeof item === 'string')
    : [];
};

/**
 * Reads the structured description a site publishes for search engines.
 *
 * When it is there it is the best source in the page: it names the series, the
 * season and the episode separately, which is exactly what the resolver would
 * otherwise have to guess from a string.
 */
const fromJsonLd = (doc: Document): ExtractedMedia | undefined => {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(script.textContent ?? '');
    } catch {
      // A site with broken structured data is not a reason to stop looking.
      continue;
    }

    for (const record of flatten(parsed)) {
      if (!typeOf(record).some((type) => videoTypes.has(type))) {
        continue;
      }

      const rawTitle = clean(record.name);

      if (rawTitle === undefined) {
        continue;
      }

      const series = record.partOfSeries;
      const season = record.partOfSeason;

      return {
        rawTitle,
        source: 'json-ld',
        ...(() => {
          const hint = hintFrom({
            seriesTitle:
              typeof series === 'object' && series !== null
                ? clean((series as Record<string, unknown>).name)
                : undefined,
            season:
              typeof season === 'object' && season !== null
                ? positiveInteger((season as Record<string, unknown>).seasonNumber)
                : undefined,
            episode: positiveInteger(record.episodeNumber),
            year: year(record.datePublished),
          });

          return hint === undefined ? {} : { hint };
        })(),
      };
    }
  }

  return undefined;
};

/**
 * What the page says it is playing, in order of how much it can be trusted.
 *
 * The media session comes first because a player fills it in to drive the
 * keyboard and the system controls, so it describes the media rather than the
 * page. The document title comes last: it is always there and it is always the
 * vaguest, wrapped in the site name and whatever the marketing team wanted.
 */
export const extractMedia = (
  doc: Document,
  session?: SessionMetadata | null,
): ExtractedMedia | undefined => {
  const sessionTitle = clean(session?.title);

  if (sessionTitle !== undefined) {
    const hint = hintFrom({ seriesTitle: clean(session?.album) ?? clean(session?.artist) });

    return {
      rawTitle: sessionTitle,
      source: 'media-session',
      ...(hint === undefined ? {} : { hint }),
    };
  }

  const structured = fromJsonLd(doc);

  if (structured !== undefined) {
    return structured;
  }

  const openGraph = clean(doc.querySelector('meta[property="og:title"]')?.getAttribute('content'));

  if (openGraph !== undefined) {
    return { rawTitle: openGraph, source: 'og-title' };
  }

  const documentTitle = clean(doc.title);

  return documentTitle === undefined
    ? undefined
    : { rawTitle: documentTitle, source: 'document-title' };
};
