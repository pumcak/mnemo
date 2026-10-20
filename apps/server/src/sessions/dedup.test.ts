import type { SourceKind } from '@mnemo/contracts';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { markDuplicates, sameTitle } from './dedup';
import { promoteViews } from './views';
import type { DatabaseHandle } from '../db/client';
import { playbackSessions, sources, views } from '../db/schema';
import { openMigratedDatabase, registerDevice } from '../testing/database';

const deviceId = '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11';
const otherDeviceId = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const now = new Date('2026-10-20T22:00:00.000Z');
const minute = 60 * 1000;

describe('sameTitle', () => {
  it('matches the page title with what the media session reports', () => {
    expect(
      sameTitle('Arcane: Season 1: Welcome to the Playground', 'Welcome to the Playground'),
    ).toBe(true);
  });

  it('matches spellings that differ only in punctuation and case', () => {
    expect(sameTitle("Frieren: Beyond Journey's End - 12", 'frieren beyond journeys end 12')).toBe(
      true,
    );
  });

  it('does not match a short word found inside a longer title', () => {
    expect(sameTitle('Heat', 'The Heat of the Night')).toBe(false);
  });

  it('does not match two different episodes', () => {
    expect(sameTitle('One Piece - 1071', 'One Piece - 1072')).toBe(false);
  });
});

describe('markDuplicates', () => {
  let handle: DatabaseHandle;

  beforeEach(() => {
    handle = openMigratedDatabase();
    registerDevice(handle, deviceId, now);
    registerDevice(handle, otherDeviceId, now);
  });

  afterEach(() => {
    handle.close();
  });

  const sourceOf = (kind: SourceKind, app: string): number => {
    handle.db.insert(sources).values({ kind, app, createdAt: now }).onConflictDoNothing().run();

    return (
      handle.db.select({ id: sources.id }).from(sources).where(eq(sources.app, app)).get()?.id ?? -1
    );
  };

  const session = (
    kind: SourceKind,
    app: string,
    rawTitle: string,
    {
      from = -30,
      to = 0,
      duration = 2520,
      device = deviceId,
      watched = 0,
    }: {
      from?: number;
      to?: number;
      duration?: number | null;
      device?: string;
      watched?: number;
    } = {},
  ): number =>
    handle.db
      .insert(playbackSessions)
      .values({
        deviceId: device,
        sourceId: sourceOf(kind, app),
        rawTitle,
        startedAt: new Date(now.getTime() + from * minute),
        lastSeenAt: new Date(now.getTime() + to * minute),
        lastPositionSeconds: 0,
        durationSeconds: duration,
        watchedSeconds: watched,
      })
      .returning({ id: playbackSessions.id })
      .get().id;

  const duplicateOf = (id: number) =>
    handle.db.select().from(playbackSessions).where(eq(playbackSessions.id, id)).get()?.duplicateOf;

  it('keeps the browser session over the media session reporting the same episode', () => {
    const page = session('browser', 'netflix.com', 'Arcane: Season 1: Welcome to the Playground');
    const system = session('smtc', 'chrome', 'Welcome to the Playground', { from: -29 });

    expect(markDuplicates(handle, now)).toBe(1);
    expect(duplicateOf(system)).toBe(page);
    expect(duplicateOf(page)).toBeNull();
  });

  it('keeps the earlier session between two paths of the same rank', () => {
    const first = session('smtc', 'vlc', 'Heat (1995)', { from: -30 });
    const second = session('smtc', 'mpc-hc', 'Heat (1995)', { from: -20 });

    markDuplicates(handle, now);

    expect(duplicateOf(second)).toBe(first);
  });

  it('leaves sessions that did not overlap in time', () => {
    session('browser', 'netflix.com', 'Heat (1995)', { from: -180, to: -60 });
    session('smtc', 'chrome', 'Heat (1995)', { from: -30 });

    expect(markDuplicates(handle, now)).toBe(0);
  });

  it('leaves the same title on two devices', () => {
    session('browser', 'netflix.com', 'Heat (1995)');
    session('smtc', 'chrome', 'Heat (1995)', { device: otherDeviceId });

    expect(markDuplicates(handle, now)).toBe(0);
  });

  it('leaves two files of the same title with different durations', () => {
    session('smtc', 'vlc', 'Dune', { duration: 9300 });
    session('browser', 'example.test', 'Dune', { duration: 8220 });

    expect(markDuplicates(handle, now)).toBe(0);
  });

  it('takes the view away from a duplicate and never gives it one again', () => {
    const page = session('browser', 'netflix.com', 'Heat (1995)', { watched: 1500 });
    const system = session('smtc', 'chrome', 'Heat (1995)', { watched: 1500 });

    promoteViews(handle, now);
    markDuplicates(handle, now);
    promoteViews(handle, now);

    expect(
      handle.db
        .select()
        .from(views)
        .all()
        .map((view) => view.sessionId),
    ).toEqual([page]);
    expect(duplicateOf(system)).toBe(page);
  });
});
