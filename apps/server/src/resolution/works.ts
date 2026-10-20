import type { Candidate, ParsedTitle } from '@mnemo/resolver';
import { and, eq } from 'drizzle-orm';
import type { DatabaseHandle } from '../db/client';
import { episodes, seasons, works } from '../db/schema';

export interface PlacedWork {
  workId: number;
  /** Present when the title named an episode of a series. */
  episodeId?: number;
}

/**
 * Makes sure the work a session resolved to exists, with its season and episode
 * when the title named one, and returns where the session belongs.
 *
 * The catalogue answer refreshes the title and the year each time, since
 * catalogues correct their entries. A series title without an episode number
 * places the session on the work alone. Season 1 stands in when only an episode
 * is known, as anime numbering usually is.
 */
export const upsertWork = (
  db: DatabaseHandle['db'],
  candidate: Candidate,
  parsed: ParsedTitle,
  at: Date,
): PlacedWork => {
  const workId = db
    .insert(works)
    .values({
      catalogue: candidate.catalogue,
      externalId: candidate.id,
      kind: candidate.kind,
      title: candidate.title,
      year: candidate.year ?? null,
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: [works.catalogue, works.externalId],
      set: { title: candidate.title, year: candidate.year ?? null, updatedAt: at },
    })
    .returning({ id: works.id })
    .get().id;

  if (candidate.kind !== 'series' || parsed.episode === undefined) {
    return { workId };
  }

  const number = parsed.season ?? 1;

  db.insert(seasons).values({ workId, number }).onConflictDoNothing().run();

  const seasonId = db
    .select({ id: seasons.id })
    .from(seasons)
    .where(and(eq(seasons.workId, workId), eq(seasons.number, number)))
    .get()?.id;

  if (seasonId === undefined) {
    throw new Error('season row disappeared inside the upsert');
  }

  db.insert(episodes).values({ seasonId, number: parsed.episode }).onConflictDoNothing().run();

  const episodeId = db
    .select({ id: episodes.id })
    .from(episodes)
    .where(and(eq(episodes.seasonId, seasonId), eq(episodes.number, parsed.episode)))
    .get()?.id;

  return episodeId === undefined ? { workId } : { workId, episodeId };
};
