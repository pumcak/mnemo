import { describe, expect, it } from 'vitest';
import { corpus } from './corpus';
import { parseRawTitle } from './parse';

const answerOf = (raw: string) => {
  const { removed: _removed, ...answer } = parseRawTitle(raw);

  return answer;
};

describe('parseRawTitle against the corpus', () => {
  const reachable = corpus.filter((entry) => entry.needsHint !== true);

  it.each(reachable.map((entry) => [entry.raw, entry] as const))('reads %j', (_raw, entry) => {
    expect(answerOf(entry.raw)).toEqual(entry.expected);
  });

  it('leaves only a handful of entries to the hint, so the flag stays an exception', () => {
    expect(corpus.filter((entry) => entry.needsHint === true).length).toBeLessThanOrEqual(3);
  });

  it('says nothing it cannot know for the entries that need a hint', () => {
    for (const entry of corpus.filter((item) => item.needsHint === true)) {
      expect(parseRawTitle(entry.raw).kind).toBe('unknown');
    }
  });
});

describe('parseRawTitle beyond the corpus', () => {
  it('refuses a trailer even when it carries a year', () => {
    expect(answerOf('Oppenheimer (2023) - Official Trailer').kind).toBe('unknown');
  });

  it('refuses a french trailer', () => {
    expect(answerOf('Dune Deuxième Partie - Bande-annonce VF (2024)').kind).toBe('unknown');
  });

  it('keeps a title that happens to contain live', () => {
    expect(answerOf('Live Free or Die Hard (2007)')).toEqual({
      kind: 'movie',
      title: 'Live Free or Die Hard',
      year: 2007,
    });
  });

  it('does not read an episode out of a word that ends in ep', () => {
    expect(answerOf('Sleep 3 (2021)').kind).toBe('movie');
  });

  it('treats a season with no episode as nothing watched yet', () => {
    expect(answerOf('Arcane Season 2').kind).toBe('unknown');
  });

  it('keeps an episode name when the numbering stands alone', () => {
    expect(answerOf('Breaking Bad - 5x14 - Ozymandias')).toMatchObject({
      title: 'Ozymandias',
      series: 'Breaking Bad',
    });
  });

  it('drops one glued word after the numbering, which is usually a site', () => {
    expect(answerOf('One Piece Épisode 1071 - SiteExemple')).toEqual({
      kind: 'episode',
      title: 'One Piece',
      episode: 1071,
    });
  });

  it('reports what cleaning removed, so a bad answer can be traced', () => {
    expect(parseRawTitle('The.Bear.S03E01.MULTi.1080p.WEB.H264-FRATERNiTY').removed).toContain(
      '1080p',
    );
  });
});
