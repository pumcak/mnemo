import { describe, expect, it } from 'vitest';
import { findBinges } from './binge';
import type { BingeSession } from './binge';

const deviceId = '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11';
const minute = 60 * 1000;
const evening = Date.parse('2026-10-20T20:00:00.000Z');

let nextId = 0;

const episode = (
  rawTitle: string,
  startMinute: number,
  lengthMinutes = 24,
  overrides: Partial<BingeSession> = {},
): BingeSession => {
  nextId += 1;

  return {
    id: nextId,
    deviceId,
    rawTitle,
    hint: null,
    startedAt: new Date(evening + startMinute * minute),
    lastSeenAt: new Date(evening + (startMinute + lengthMinutes) * minute),
    ...overrides,
  };
};

describe('findBinges', () => {
  it('chains episodes played back to back', () => {
    const one = episode('Frieren S01E01', 0);
    const two = episode('Frieren S01E02', 25);
    const three = episode('Frieren S01E03', 50);

    expect(findBinges([three, one, two])).toEqual([[one.id, two.id, three.id]]);
  });

  it('crosses into the next season', () => {
    const last = episode('Arcane S01E09', 0, 40);
    const first = episode('Arcane S02E01', 42, 40);

    expect(findBinges([last, first])).toEqual([[last.id, first.id]]);
  });

  it('reads the series from the hint a page sent', () => {
    const one = episode('Welcome to the Playground', 0, 40, {
      hint: { seriesTitle: 'Arcane', season: 1, episode: 1 },
    });
    const two = episode('Some Mysteries Are Better Left Unsolved', 41, 40, {
      hint: { seriesTitle: 'Arcane', season: 1, episode: 2 },
    });

    expect(findBinges([one, two])).toEqual([[one.id, two.id]]);
  });

  it('ends the binge after a long break', () => {
    expect(findBinges([episode('Frieren S01E01', 0), episode('Frieren S01E02', 60)])).toEqual([]);
  });

  it('does not count going back an episode', () => {
    expect(findBinges([episode('Frieren S01E05', 0), episode('Frieren S01E04', 25)])).toEqual([]);
  });

  it('keeps two series watched in turn apart', () => {
    const frieren = episode('Frieren S01E01', 0);
    const arcane = episode('Arcane S01E01', 25);

    expect(findBinges([frieren, arcane])).toEqual([]);
  });

  it('ignores films', () => {
    expect(findBinges([episode('Heat (1995)', 0, 170), episode('Dune (2021)', 171)])).toEqual([]);
  });
});
