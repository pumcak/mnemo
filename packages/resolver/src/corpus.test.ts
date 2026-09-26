import { describe, expect, it } from 'vitest';
import { corpus, corpusEntrySchema, corpusOrigins } from './corpus';

/**
 * The corpus is an asset, so it gets tested like one. A malformed entry, a
 * duplicate or a whole origin nobody covered would quietly weaken every test
 * written against it later.
 */
describe('the corpus of raw titles', () => {
  it('is entirely well formed', () => {
    for (const entry of corpus) {
      expect(() => corpusEntrySchema.parse(entry)).not.toThrow();
    }
  });

  it('holds no duplicate raw title', () => {
    const raws = corpus.map((entry) => entry.raw);

    expect(new Set(raws).size).toBe(raws.length);
  });

  it('covers every origin a title can come from', () => {
    for (const origin of corpusOrigins) {
      expect(corpus.filter((entry) => entry.origin === origin).length).toBeGreaterThan(0);
    }
  });

  it('holds enough of each answer to be worth measuring against', () => {
    const counts = {
      movie: corpus.filter((entry) => entry.expected.kind === 'movie').length,
      episode: corpus.filter((entry) => entry.expected.kind === 'episode').length,
      unknown: corpus.filter((entry) => entry.expected.kind === 'unknown').length,
    };

    expect(counts.movie).toBeGreaterThanOrEqual(5);
    expect(counts.episode).toBeGreaterThanOrEqual(15);
    expect(counts.unknown).toBeGreaterThanOrEqual(5);
  });

  it('expects a season and an episode on nothing but episodes', () => {
    for (const entry of corpus) {
      if (entry.expected.kind !== 'episode') {
        expect(entry.expected.episode).toBeUndefined();
        expect(entry.expected.season).toBeUndefined();
      }
    }
  });

  it('keeps the traps that make this phase difficult', () => {
    const raws = corpus.map((entry) => entry.raw);

    // A year inside the title, next to the real one.
    expect(raws).toContain('Blade.Runner.2049.2017.1080p.BluRay.x264');
    // A title made only of digits and separators.
    expect(raws).toContain('9-1-1.S07E01.1080p.WEB.h264');
    // An absolute episode number with no season, which anime uses everywhere.
    expect(raws).toContain('[SubsPlease] One Piece - 1071 (1080p) [A1B2C3D4].mkv');
    // Audio tags full of digits.
    expect(raws).toContain('Severance.S02E10.1080p.ATVP.WEB-DL.DDP5.1.Atmos.H.264-FLUX');
  });

  it('records what a viewing is not, which is as important as what it is', () => {
    const notViewings = corpus.filter(
      (entry) => entry.expected.kind === 'unknown' && entry.note !== undefined,
    );

    expect(notViewings.map((entry) => entry.raw)).toContain(
      'ONE PIECE 1071 REACTION!! | Luffy is back',
    );
    expect(notViewings.map((entry) => entry.raw)).toContain('Oppenheimer - Official Trailer');
  });

  it('justifies every entry that is expected to resolve to nothing', () => {
    for (const entry of corpus.filter((item) => item.expected.kind === 'unknown')) {
      expect(
        entry.note,
        `no note explains why ${JSON.stringify(entry.raw)} resolves to nothing`,
      ).toBeDefined();
    }
  });
});
