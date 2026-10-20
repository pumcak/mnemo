import type { Catalogues, Resolution } from '@mnemo/resolver';
import { asc, eq } from 'drizzle-orm';
import { resolveWithAliases } from './aliases';
import { queueForReview } from './review';
import { upsertWork } from './works';
import type { DatabaseHandle } from '../db/client';
import { playbackSessions } from '../db/schema';
import type { Logger } from '../logger';

export interface BackfillOptions {
  catalogues: Catalogues;
  logger: Logger;
  /** How many sessions one pass looks at, so a large backlog never blocks for long. */
  limit?: number;
  now?: () => Date;
}

export interface BackfillSummary {
  resolved: number;
  queued: number;
  unresolvable: number;
  /** Left pending because a catalogue could not be asked, to be tried on a later pass. */
  deferred: number;
}

type Outcome = keyof BackfillSummary;

/**
 * Resolves the sessions still waiting for it, oldest first.
 *
 * Sessions sharing a raw title are resolved once per pass: a binge of the same
 * series opens many sessions whose titles differ, but a show watched every night
 * repeats them, and each repeat would otherwise cost a search.
 *
 * A catalogue that asks to slow down ends the pass. The remaining sessions stay
 * pending for the next one, which is cheaper than piling more refused requests on
 * a limit that has already been reached.
 */
export const backfillResolutions = async (
  handle: DatabaseHandle,
  { catalogues, logger, limit = 50, now = () => new Date() }: BackfillOptions,
): Promise<BackfillSummary> => {
  const summary: BackfillSummary = { resolved: 0, queued: 0, unresolvable: 0, deferred: 0 };
  const waiting = handle.db
    .select()
    .from(playbackSessions)
    .where(eq(playbackSessions.resolutionState, 'pending'))
    .orderBy(asc(playbackSessions.startedAt), asc(playbackSessions.id))
    .limit(limit)
    .all();
  const memo = new Map<string, Resolution>();

  for (const session of waiting) {
    const key = `${session.rawTitle}\u0000${JSON.stringify(session.hint ?? null)}`;
    const resolution =
      memo.get(key) ??
      (await resolveWithAliases(handle, session.rawTitle, catalogues, session.hint ?? undefined));

    memo.set(key, resolution);

    const outcome = settle(handle, session.id, session.rawTitle, resolution, now());

    summary[outcome] += 1;

    if (resolution.failures.some((failure) => failure.reason === 'rate-limited')) {
      logger.warn({ failures: resolution.failures }, 'resolution paused by a rate limit');
      summary.deferred += waiting.length - waiting.indexOf(session) - 1;
      break;
    }
  }

  if (waiting.length > 0) {
    logger.info({ ...summary }, 'resolution pass');
  }

  return summary;
};

const settle = (
  handle: DatabaseHandle,
  sessionId: number,
  rawTitle: string,
  resolution: Resolution,
  at: Date,
): Outcome => {
  const mark = (values: Partial<typeof playbackSessions.$inferInsert>): void => {
    handle.db.update(playbackSessions).set(values).where(eq(playbackSessions.id, sessionId)).run();
  };

  if (resolution.confident && resolution.best !== undefined) {
    const placed = upsertWork(handle.db, resolution.best.candidate, resolution.parsed, at);

    mark({
      workId: placed.workId,
      episodeId: placed.episodeId ?? null,
      resolutionState: 'resolved',
      resolvedCatalogue: resolution.best.candidate.catalogue,
      resolvedExternalId: resolution.best.candidate.id,
      resolvedTitle: resolution.best.candidate.title,
      resolutionScore: resolution.best.score,
      resolvedAt: at,
    });

    return 'resolved';
  }

  if (resolution.parsed.kind === 'unknown') {
    mark({ resolutionState: 'unresolvable', resolvedAt: at });

    return 'unresolvable';
  }

  /**
   * Nothing confident and a catalogue failed: the answer may be one retry away,
   * so the session waits rather than burdening a person with a question the
   * catalogue never got the chance to answer.
   */
  if (resolution.failures.length > 0) {
    return 'deferred';
  }

  queueForReview(handle, sessionId, rawTitle, resolution, at);
  mark({ resolutionState: 'review' });

  return 'queued';
};
