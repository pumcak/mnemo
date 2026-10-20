import { parseRawTitle } from '@mnemo/resolver';
import type { Candidate } from '@mnemo/resolver';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { upsertWork } from './works';
import type { DatabaseHandle } from '../db/client';
import { episodes, seasons, works } from '../db/schema';
import { openMigratedDatabase } from '../testing/database';

const at = new Date('2026-10-20T20:00:00.000Z');

const arcane: Candidate = {
  catalogue: 'tmdb',
  id: 94605,
  kind: 'series',
  title: 'Arcane',
  alternativeTitles: [],
  year: 2021,
};

describe('upsertWork', () => {
  let handle: DatabaseHandle;

  beforeEach(() => {
    handle = openMigratedDatabase();
  });

  afterEach(() => {
    handle.close();
  });

  it('places an episode under its season and work', () => {
    const placed = upsertWork(handle.db, arcane, parseRawTitle('Arcane S02E03'), at);

    expect(placed.episodeId).toBeTypeOf('number');
    expect(handle.db.select().from(seasons).get()?.number).toBe(2);
    expect(handle.db.select().from(episodes).get()?.number).toBe(3);
  });

  it('reuses the rows it already made', () => {
    const first = upsertWork(handle.db, arcane, parseRawTitle('Arcane S01E01'), at);
    const again = upsertWork(handle.db, arcane, parseRawTitle('Arcane S01E01'), at);
    const next = upsertWork(handle.db, arcane, parseRawTitle('Arcane S01E02'), at);

    expect(again).toEqual(first);
    expect(next.workId).toBe(first.workId);
    expect(handle.db.select().from(seasons).all()).toHaveLength(1);
    expect(handle.db.select().from(episodes).all()).toHaveLength(2);
  });

  it('files an anime episode without a season under season 1', () => {
    upsertWork(
      handle.db,
      { ...arcane, catalogue: 'anilist', id: 21, title: 'One Piece' },
      parseRawTitle('[SubsPlease] One Piece - 1071 (1080p) [A1B2C3D4].mkv'),
      at,
    );

    expect(handle.db.select().from(seasons).get()?.number).toBe(1);
    expect(handle.db.select().from(episodes).get()?.number).toBe(1071);
  });

  it('stores a film as a work alone', () => {
    const placed = upsertWork(
      handle.db,
      { ...arcane, id: 949, kind: 'movie', title: 'Heat', year: 1995 },
      parseRawTitle('Heat (1995)'),
      at,
    );

    expect(placed.episodeId).toBeUndefined();
    expect(handle.db.select().from(seasons).all()).toEqual([]);
  });

  it('takes the latest title the catalogue gives', () => {
    upsertWork(handle.db, arcane, parseRawTitle('Arcane S01E01'), at);
    upsertWork(
      handle.db,
      { ...arcane, title: 'Arcane: League of Legends' },
      parseRawTitle('Arcane S01E01'),
      new Date('2026-10-21T20:00:00.000Z'),
    );

    expect(handle.db.select().from(works).all()).toHaveLength(1);
    expect(handle.db.select().from(works).get()?.title).toBe('Arcane: League of Legends');
  });
});
