import type { MediaHint } from '@mnemo/contracts';
import {
  applyHint,
  normalizeTitle,
  parseRawTitle,
  resolveTitle,
  searchTitleOf,
} from '@mnemo/resolver';
import type { CatalogueName, Catalogues, ParsedTitle, Resolution, WorkKind } from '@mnemo/resolver';
import { and, eq } from 'drizzle-orm';
import type { DatabaseHandle } from '../db/client';
import { aliases } from '../db/schema';

export interface AliasInput {
  /** The name the catalogues would be asked about, before normalising. */
  searchTitle: string;
  kind: WorkKind;
  catalogue: CatalogueName;
  externalId: number;
  title: string;
}

export type Alias = typeof aliases.$inferSelect;

export const kindOf = (parsed: ParsedTitle): WorkKind | undefined => {
  if (parsed.kind === 'episode') {
    return 'series';
  }

  return parsed.kind === 'movie' ? 'movie' : undefined;
};

/** A newer correction replaces an older one, since the person changed their mind. */
export const recordAlias = (handle: DatabaseHandle, input: AliasInput, now = new Date()): void => {
  const values = {
    normalizedTitle: normalizeTitle(input.searchTitle),
    kind: input.kind,
    catalogue: input.catalogue,
    externalId: input.externalId,
    title: input.title,
    createdAt: now,
  };

  handle.db
    .insert(aliases)
    .values(values)
    .onConflictDoUpdate({
      target: [aliases.normalizedTitle, aliases.kind],
      set: {
        catalogue: values.catalogue,
        externalId: values.externalId,
        title: values.title,
        createdAt: values.createdAt,
      },
    })
    .run();
};

export const findAlias = (
  handle: DatabaseHandle,
  searchTitle: string,
  kind: WorkKind,
): Alias | undefined =>
  handle.db
    .select()
    .from(aliases)
    .where(and(eq(aliases.normalizedTitle, normalizeTitle(searchTitle)), eq(aliases.kind, kind)))
    .get();

/**
 * Resolves a title, asking the correction dictionary before any catalogue.
 *
 * A correction is trusted fully: somebody looked at this title and said what it
 * is, which is better evidence than any score. It also costs no request, so a
 * title corrected once never spends the rate limit again.
 */
export const resolveWithAliases = async (
  handle: DatabaseHandle,
  raw: string,
  catalogues: Catalogues,
  hint?: MediaHint,
): Promise<Resolution> => {
  const parsed = applyHint(parseRawTitle(raw), hint);
  const kind = kindOf(parsed);
  const alias = kind === undefined ? undefined : findAlias(handle, searchTitleOf(parsed), kind);

  if (alias === undefined || kind === undefined) {
    return resolveTitle(raw, catalogues, hint);
  }

  const best = {
    candidate: {
      // The column is a plain string to drizzle, but its check constraint only
      // admits catalogue names, so the narrowing cannot be wrong.
      catalogue: alias.catalogue as CatalogueName,
      id: alias.externalId,
      kind,
      title: alias.title,
      alternativeTitles: [],
    },
    score: 1,
    reasons: ['alias'],
  };

  return { parsed, best, confident: true, ranked: [best], asked: [], failures: [] };
};
