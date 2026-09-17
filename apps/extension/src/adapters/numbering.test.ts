import { describe, expect, it } from 'vitest';
import { episodeIn, seasonEpisodeIn } from './numbering';

describe('seasonEpisodeIn', () => {
  it.each([
    ['S1:E1', 1, 1],
    ['S2 E13', 2, 13],
    ['S01E02', 1, 2],
    ['Season 3 Episode 7', 3, 7],
    ['Saison 2 : Épisode 3', 2, 3],
    ['Saison 2 : Episode 3', 2, 3],
    ['2x05', 2, 5],
    ['One Piece S21:E1071 sub', 21, 1071],
  ])('reads %s', (text, season, episode) => {
    expect(seasonEpisodeIn(text)).toEqual({ season, episode });
  });

  it.each(['Welcome to the Playground', 'Oppenheimer (2023)', 'S0:E0', '1080p', 'Episode 1071'])(
    'finds no numbering in %s',
    (text) => {
      expect(seasonEpisodeIn(text)).toBeUndefined();
    },
  );
});

describe('episodeIn', () => {
  it.each([
    ['Episode 1071', 1071],
    ['Épisode 12', 12],
    ['One Piece E1071', 1071],
    ['#1071', 1071],
  ])('reads %s', (text, episode) => {
    expect(episodeIn(text)).toBe(episode);
  });

  it('says nothing when a season is present, since the other reader owns that', () => {
    expect(episodeIn('S1:E1')).toBeUndefined();
  });

  it.each(['Oppenheimer 2023', '1080p', 'Arcane'])('refuses the bare number in %s', (text) => {
    expect(episodeIn(text)).toBeUndefined();
  });
});
