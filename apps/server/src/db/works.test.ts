import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from './client';
import { episodes, seasons, works } from './schema';
import { openMigratedDatabase } from '../testing/database';

const now = new Date('2026-10-20T20:00:00.000Z');

describe('works, seasons and episodes tables', () => {
  let handle: DatabaseHandle;

  beforeEach(() => {
    handle = openMigratedDatabase();
  });

  afterEach(() => {
    handle.close();
  });

  const arcane = (): number =>
    handle.db
      .insert(works)
      .values({
        catalogue: 'tmdb',
        externalId: 94605,
        kind: 'series',
        title: 'Arcane',
        year: 2021,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: works.id })
      .get().id;

  it('refuses the same catalogue entry twice', () => {
    arcane();

    expect(arcane).toThrow();
  });

  it('refuses a season number twice for one work', () => {
    const workId = arcane();

    handle.db.insert(seasons).values({ workId, number: 1 }).run();

    expect(() => handle.db.insert(seasons).values({ workId, number: 1 }).run()).toThrow();
  });

  it('takes seasons and episodes with the work when it is deleted', () => {
    const workId = arcane();
    const seasonId = handle.db
      .insert(seasons)
      .values({ workId, number: 1 })
      .returning({ id: seasons.id })
      .get().id;

    handle.db.insert(episodes).values({ seasonId, number: 1 }).run();
    handle.db.delete(works).run();

    expect(handle.db.select().from(episodes).all()).toEqual([]);
  });
});
