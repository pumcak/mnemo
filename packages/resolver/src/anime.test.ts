import { describe, expect, it } from 'vitest';
import { detectAnimeRelease } from './anime';
import { parseRawTitle } from './parse';

describe('detectAnimeRelease', () => {
  it.each([
    '[SubsPlease] One Piece - 1071 (1080p) [A1B2C3D4].mkv',
    '[Erai-raws] Sousou no Frieren - 04 [1080p][Multiple Subtitle].mkv',
    'Kaguya-sama wa Kokurasetai S2 - 05 (1080p)',
    '[SubsPlease] Dandadan - 01v2 (1080p) [5F3C2A1B].mkv',
  ])('recognises %s', (raw) => {
    expect(detectAnimeRelease(raw).matches).toBe(true);
  });

  it.each([
    'The.Bear.S03E01.MULTi.1080p.WEB.H264-FRATERNiTY',
    'Breaking Bad - 5x14 - Ozymandias',
    'Oppenheimer (2023)',
    'Welcome to the Playground',
  ])('leaves %s alone', (raw) => {
    expect(detectAnimeRelease(raw).matches).toBe(false);
  });

  it('does not take one weak signal as enough', () => {
    expect(detectAnimeRelease('Some Documentary - 2').matches).toBe(false);
  });

  it('names the release group', () => {
    expect(detectAnimeRelease('[Erai-raws] Sousou no Frieren - 04 [1080p].mkv').releaseGroup).toBe(
      'Erai-raws',
    );
  });

  it('does not take a bracketed quality tag for a group', () => {
    expect(detectAnimeRelease('[1080p] Some Show - 04').releaseGroup).toBeUndefined();
  });

  it('reads the version of a reissued release', () => {
    expect(detectAnimeRelease('[SubsPlease] Dandadan - 01v2 (1080p) [5F3C2A1B].mkv').version).toBe(
      2,
    );
  });
});

describe('anime numbering', () => {
  it('reads the episode of a reissued release, ignoring the version', () => {
    expect(parseRawTitle('[SubsPlease] Dandadan - 01v2 (1080p) [5F3C2A1B].mkv')).toMatchObject({
      kind: 'episode',
      title: 'Dandadan',
      episode: 1,
    });
  });

  it('reads a pack as its first episode', () => {
    expect(
      parseRawTitle('[Erai-raws] Kimetsu no Yaiba - 01 ~ 26 [1080p][Batch].mkv'),
    ).toMatchObject({ kind: 'episode', title: 'Kimetsu no Yaiba', episode: 1 });
  });

  it('reads a sequel season named the anime way', () => {
    expect(
      parseRawTitle('[Judas] Shingeki no Kyojin 2nd Season - 05 [1080p][HEVC x265 10bit].mkv'),
    ).toMatchObject({ kind: 'episode', title: 'Shingeki no Kyojin', season: 2, episode: 5 });
  });
});
