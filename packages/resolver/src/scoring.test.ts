import { describe, expect, it } from 'vitest';
import type { Candidate } from './catalogue/types';
import { parseRawTitle } from './parse';
import { confidentScore, rankCandidates, scoreCandidate, searchTitleOf } from './scoring';
import { normalizeTitle, titleSimilarity } from './similarity';
import type { ParsedTitle } from './types';

const film = (overrides: Partial<Candidate> = {}): Candidate => ({
  catalogue: 'tmdb',
  id: 1,
  kind: 'movie',
  title: 'Oppenheimer',
  alternativeTitles: [],
  year: 2023,
  ...overrides,
});

const show = (overrides: Partial<Candidate> = {}): Candidate => ({
  catalogue: 'anilist',
  id: 2,
  kind: 'series',
  title: "Frieren: Beyond Journey's End",
  alternativeTitles: ['Sousou no Frieren'],
  year: 2023,
  episodes: 28,
  ...overrides,
});

const movie = (title: string, year?: number): ParsedTitle => ({
  kind: 'movie',
  title,
  ...(year === undefined ? {} : { year }),
  removed: [],
});

describe('titleSimilarity', () => {
  it('treats spellings that differ only in punctuation and accents as equal', () => {
    expect(normalizeTitle("Frieren: Beyond Journey's End")).toBe(
      normalizeTitle('Frieren Beyond Journeys End'),
    );
    expect(titleSimilarity('Pokémon', 'Pokemon')).toBe(1);
  });

  it('forgives a small difference', () => {
    expect(titleSimilarity('The Office US', 'The Office')).toBeGreaterThan(0.8);
  });

  it('keeps unrelated titles far apart', () => {
    expect(titleSimilarity('Heat', 'Oppenheimer')).toBeLessThan(0.3);
  });

  it('says nothing about an empty title', () => {
    expect(titleSimilarity('', 'Heat')).toBe(0);
  });
});

describe('scoreCandidate', () => {
  it('is fully confident about an exact name, the right year and the right kind', () => {
    expect(scoreCandidate(movie('Oppenheimer', 2023), film()).score).toBe(1);
  });

  it('stays confident about an exact name of the right kind when there is no year', () => {
    const scored = scoreCandidate(movie('Oppenheimer'), film());

    expect(scored.score).toBe(0.85);
    expect(scored.score).toBeGreaterThanOrEqual(confidentScore);
  });

  it('sends an exact name with the wrong year to review, which is how a remake slips in', () => {
    const scored = scoreCandidate(movie('Dune', 2021), film({ title: 'Dune', year: 1984 }));

    expect(scored.score).toBe(0.7);
    expect(scored.score).toBeLessThan(confidentScore);
  });

  it('sends an exact name of the wrong kind to review', () => {
    const scored = scoreCandidate(
      movie('Dune', 2021),
      film({ title: 'Dune', kind: 'series', year: 2021 }),
    );

    expect(scored.score).toBe(0.75);
    expect(scored.score).toBeLessThan(confidentScore);
  });

  it('allows a year off by one, since december releases get dated both ways', () => {
    expect(scoreCandidate(movie('Heat', 1995), film({ title: 'Heat', year: 1996 })).score).toBe(
      0.88,
    );
  });

  it('matches through an alternative title, which is how fansub names find their show', () => {
    const parsed = parseRawTitle('[Erai-raws] Sousou no Frieren - 04 [1080p].mkv');

    expect(scoreCandidate(parsed, show()).score).toBeGreaterThanOrEqual(confidentScore);
  });

  it('halves the score for an episode past the known count instead of ruling it out', () => {
    const parsed: ParsedTitle = {
      kind: 'episode',
      title: 'Sousou no Frieren',
      episode: 40,
      removed: [],
    };
    const scored = scoreCandidate(parsed, show());

    expect(scored.score).toBeLessThan(confidentScore);
    expect(scored.score).toBeGreaterThan(0);
    expect(scored.reasons.join()).toContain('past the 28 known');
  });

  it('does not apply that rule once a season is known, since counts are then per season', () => {
    const parsed: ParsedTitle = {
      kind: 'episode',
      title: 'Sousou no Frieren',
      season: 2,
      episode: 40,
      removed: [],
    };

    expect(scoreCandidate(parsed, show()).reasons.join()).not.toContain('past the');
  });

  it('never fully trusts a title whose kind is unknown', () => {
    const parsed: ParsedTitle = { kind: 'unknown', title: 'Oppenheimer', removed: [] };

    expect(scoreCandidate(parsed, film()).score).toBeLessThan(confidentScore);
  });

  it('explains itself', () => {
    expect(scoreCandidate(movie('Oppenheimer', 2023), film()).reasons).toEqual([
      'title 1.00',
      'year 1.00',
      'kind 1.00',
    ]);
  });
});

describe('rankCandidates', () => {
  it('puts the sequel ahead of the original when the title names the sequel', () => {
    const parsed = parseRawTitle('Blade.Runner.2049.2017.1080p.BluRay.x264');
    const ranked = rankCandidates(parsed, [
      film({ id: 78, title: 'Blade Runner', year: 1982 }),
      film({ id: 335984, title: 'Blade Runner 2049', year: 2017 }),
    ]);

    expect(ranked[0]?.candidate.id).toBe(335984);
  });

  it('uses popularity only to break a tie', () => {
    const ranked = rankCandidates(movie('Heat'), [
      film({ id: 1, title: 'Heat', year: 1995, popularity: 10 }),
      film({ id: 2, title: 'Heat', year: 1986, popularity: 90 }),
    ]);

    expect(ranked[0]?.candidate.id).toBe(2);
  });

  it('never lets popularity outvote the title', () => {
    const ranked = rankCandidates(movie('Heat', 1995), [
      film({ id: 1, title: 'Heat', year: 1995, popularity: 1 }),
      film({ id: 2, title: 'Oppenheimer', year: 2023, popularity: 1000 }),
    ]);

    expect(ranked[0]?.candidate.id).toBe(1);
  });

  it('asks about the series, not the episode name', () => {
    expect(searchTitleOf(parseRawTitle('Breaking Bad - 5x14 - Ozymandias'))).toBe('Breaking Bad');
  });
});
