/** Exported as values so the database can build its check constraints from them. */
export const catalogueNames = ['tmdb', 'anilist'] as const;
export const workKinds = ['movie', 'series'] as const;

export type CatalogueName = (typeof catalogueNames)[number];
export type WorkKind = (typeof workKinds)[number];

/**
 * One work a catalogue offered for a query, in the shape every catalogue is
 * reduced to before scoring. Scoring never sees a catalogue specific payload, so a
 * third catalogue would only have to produce this.
 */
export interface Candidate {
  catalogue: CatalogueName;
  id: number;
  kind: WorkKind;
  title: string;
  /** Original, romanised and translated titles, and synonyms. Matching tries them all. */
  alternativeTitles: string[];
  year?: number;
  /** Known episode count, which can rule a candidate out for a given episode number. */
  episodes?: number;
  popularity?: number;
}

export class CatalogueError extends Error {
  constructor(
    readonly catalogue: CatalogueName,
    readonly reason: 'unauthorized' | 'rate-limited' | 'unavailable' | 'malformed',
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'CatalogueError';
  }
}
