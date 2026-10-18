import { searchTitleOf } from '@mnemo/resolver';
import type { Resolution } from '@mnemo/resolver';
import { asc, eq } from 'drizzle-orm';
import { kindOf, recordAlias } from './aliases';
import type { ReviewCandidate } from './types';
import type { DatabaseHandle } from '../db/client';
import { playbackSessions, reviewItems } from '../db/schema';

export type ReviewItem = typeof reviewItems.$inferSelect;

const shownCandidates = 5;

const candidatesOf = (resolution: Resolution): ReviewCandidate[] =>
  resolution.ranked.slice(0, shownCandidates).map(({ candidate, score }) => ({
    catalogue: candidate.catalogue,
    externalId: candidate.id,
    kind: candidate.kind,
    title: candidate.title,
    score,
    ...(candidate.year === undefined ? {} : { year: candidate.year }),
  }));

/**
 * Puts a session in front of a person, or refreshes what it shows if it is
 * already waiting. A session that was already decided is left alone: the decision
 * stands, and the next resolution pass will find it through the alias it left.
 */
export const queueForReview = (
  handle: DatabaseHandle,
  sessionId: number,
  rawTitle: string,
  resolution: Resolution,
  now = new Date(),
): void => {
  const existing = handle.db
    .select()
    .from(reviewItems)
    .where(eq(reviewItems.sessionId, sessionId))
    .get();

  if (existing !== undefined && existing.status !== 'pending') {
    return;
  }

  handle.db
    .insert(reviewItems)
    .values({
      sessionId,
      rawTitle,
      parsed: resolution.parsed,
      candidates: candidatesOf(resolution),
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: reviewItems.sessionId,
      set: { rawTitle, parsed: resolution.parsed, candidates: candidatesOf(resolution) },
    })
    .run();
};

/** Oldest first, so nothing waits forever behind newer arrivals. */
export const pendingReviews = (handle: DatabaseHandle): ReviewItem[] =>
  handle.db
    .select()
    .from(reviewItems)
    .where(eq(reviewItems.status, 'pending'))
    .orderBy(asc(reviewItems.createdAt), asc(reviewItems.id))
    .all();

export type ReviewDecision =
  | { choose: Pick<ReviewCandidate, 'catalogue' | 'externalId' | 'title' | 'kind'> }
  | { dismiss: true };

export class ReviewNotPendingError extends Error {
  constructor(readonly itemId: number) {
    super(`review item ${String(itemId)} is not waiting for a decision`);
    this.name = 'ReviewNotPendingError';
  }
}

/**
 * Settles an item.
 *
 * Choosing a work also records an alias, which is how one correction teaches the
 * resolver for good: the next time the same name arrives, it is answered from the
 * dictionary without a search and without a review. Dismissing says the title is
 * not a viewing at all, and leaves nothing behind for the resolver to reuse.
 *
 * The alias is written through the handle rather than the transaction object.
 * better-sqlite3 holds a single connection, so it lands inside the same
 * transaction all the same, and a refusal to write it rolls back the decision.
 */
export const decideReview = (
  handle: DatabaseHandle,
  itemId: number,
  decision: ReviewDecision,
  now = new Date(),
): void => {
  handle.db.transaction((tx) => {
    const item = tx.select().from(reviewItems).where(eq(reviewItems.id, itemId)).get();

    if (item?.status !== 'pending') {
      throw new ReviewNotPendingError(itemId);
    }

    if ('dismiss' in decision) {
      tx.update(reviewItems)
        .set({ status: 'dismissed', decidedAt: now })
        .where(eq(reviewItems.id, itemId))
        .run();
      tx.update(playbackSessions)
        .set({ resolutionState: 'unresolvable', resolvedAt: now })
        .where(eq(playbackSessions.id, item.sessionId))
        .run();

      return;
    }

    recordAlias(
      handle,
      {
        searchTitle: searchTitleOf(item.parsed),
        // The kind the title was read as is the one the next lookup will use.
        kind: kindOf(item.parsed) ?? decision.choose.kind,
        catalogue: decision.choose.catalogue,
        externalId: decision.choose.externalId,
        title: decision.choose.title,
      },
      now,
    );

    tx.update(reviewItems)
      .set({ status: 'resolved', decidedAt: now })
      .where(eq(reviewItems.id, itemId))
      .run();

    // Back to pending rather than resolved here: the next pass answers it from
    // the alias just written, through the same path every other session takes.
    tx.update(playbackSessions)
      .set({ resolutionState: 'pending' })
      .where(eq(playbackSessions.id, item.sessionId))
      .run();
  });
};
