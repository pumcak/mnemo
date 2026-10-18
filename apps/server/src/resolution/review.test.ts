import type { Resolution } from '@mnemo/resolver';
import { parseRawTitle } from '@mnemo/resolver';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findAlias } from './aliases';
import { decideReview, pendingReviews, queueForReview, ReviewNotPendingError } from './review';
import type { DatabaseHandle } from '../db/client';
import { playbackSessions, reviewItems, sources } from '../db/schema';
import { openMigratedDatabase, registerDevice } from '../testing/database';

const deviceId = '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11';

const unsure = (raw: string): Resolution => {
  const parsed = parseRawTitle(raw);
  const candidate = {
    catalogue: 'tmdb' as const,
    id: 438631,
    kind: 'movie' as const,
    title: 'Dune',
    alternativeTitles: [],
    year: 2021,
  };
  const scored = { candidate, score: 0.7, reasons: ['title 1.00', 'year 0.00', 'kind 1.00'] };

  return {
    parsed,
    best: scored,
    confident: false,
    ranked: [scored],
    asked: ['tmdb-movie'],
    failures: [],
  };
};

describe('the review queue', () => {
  let handle: DatabaseHandle;
  let sessionId: number;

  beforeEach(() => {
    handle = openMigratedDatabase();
    const at = new Date('2026-10-19T10:00:00.000Z');

    registerDevice(handle, deviceId, at);

    const source = handle.db
      .insert(sources)
      .values({ kind: 'browser', app: 'somestream.example', createdAt: at })
      .returning({ id: sources.id })
      .get();

    sessionId = handle.db
      .insert(playbackSessions)
      .values({
        deviceId,
        sourceId: source.id,
        rawTitle: 'Dune (1984)',
        startedAt: at,
        lastSeenAt: at,
        lastPositionSeconds: 0,
      })
      .returning({ id: playbackSessions.id })
      .get().id;
  });

  afterEach(() => {
    handle.close();
  });

  const queue = (raw = 'Dune (1984)', at = new Date('2026-10-19T10:00:00.000Z')): void => {
    queueForReview(handle, sessionId, raw, unsure(raw), at);
  };

  it('keeps what the resolver saw, so the decision is made on the same evidence', () => {
    queue();

    const [item] = pendingReviews(handle);

    expect(item?.rawTitle).toBe('Dune (1984)');
    expect(item?.parsed.year).toBe(1984);
    expect(item?.candidates).toEqual([
      {
        catalogue: 'tmdb',
        externalId: 438631,
        kind: 'movie',
        title: 'Dune',
        year: 2021,
        score: 0.7,
      },
    ]);
  });

  it('holds one item per session however often the title comes back', () => {
    queue();
    queue();
    queue();

    expect(handle.db.select().from(reviewItems).all()).toHaveLength(1);
  });

  it('records the choice as an alias, which is what teaches the resolver', () => {
    queue();

    const [item] = pendingReviews(handle);

    decideReview(handle, item?.id ?? -1, {
      choose: { catalogue: 'tmdb', externalId: 841, title: 'Dune', kind: 'movie' },
    });

    expect(pendingReviews(handle)).toEqual([]);
    expect(findAlias(handle, 'Dune', 'movie')?.externalId).toBe(841);
  });

  it('leaves nothing for the resolver to reuse when the title is dismissed', () => {
    queue();

    const [item] = pendingReviews(handle);

    decideReview(handle, item?.id ?? -1, { dismiss: true });

    expect(
      handle.db
        .select()
        .from(reviewItems)
        .where(eq(reviewItems.id, item?.id ?? -1))
        .get()?.status,
    ).toBe('dismissed');
    expect(findAlias(handle, 'Dune', 'movie')).toBeUndefined();
  });

  it('refuses to decide the same item twice', () => {
    queue();

    const [item] = pendingReviews(handle);

    decideReview(handle, item?.id ?? -1, { dismiss: true });

    expect(() => {
      decideReview(handle, item?.id ?? -1, { dismiss: true });
    }).toThrow(ReviewNotPendingError);
  });

  it('does not reopen an item a person already decided', () => {
    queue();

    const [item] = pendingReviews(handle);

    decideReview(handle, item?.id ?? -1, { dismiss: true });
    queue();

    expect(pendingReviews(handle)).toEqual([]);
  });

  it('rolls the decision back when the alias cannot be written', () => {
    queue();

    const [item] = pendingReviews(handle);

    expect(() => {
      decideReview(handle, item?.id ?? -1, {
        choose: { catalogue: 'imdb' as never, externalId: 1, title: 'Dune', kind: 'movie' },
      });
    }).toThrow();

    expect(pendingReviews(handle)).toHaveLength(1);
  });

  it('lists the oldest waiting item first', () => {
    queue('Dune (1984)', new Date('2026-10-19T12:00:00.000Z'));

    const other = handle.db
      .insert(playbackSessions)
      .values({
        deviceId,
        sourceId: 1,
        rawTitle: 'Heat',
        startedAt: new Date('2026-10-19T09:00:00.000Z'),
        lastSeenAt: new Date('2026-10-19T09:00:00.000Z'),
        lastPositionSeconds: 0,
      })
      .returning({ id: playbackSessions.id })
      .get().id;

    queueForReview(
      handle,
      other,
      'Heat (1986)',
      unsure('Heat (1986)'),
      new Date('2026-10-19T08:00:00.000Z'),
    );

    expect(pendingReviews(handle).map((item) => item.rawTitle)).toEqual([
      'Heat (1986)',
      'Dune (1984)',
    ]);
  });

  it('goes away with its session', () => {
    queue();

    handle.db.delete(playbackSessions).where(eq(playbackSessions.id, sessionId)).run();

    expect(handle.db.select().from(reviewItems).all()).toEqual([]);
  });
});
