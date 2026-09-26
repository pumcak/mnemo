import { describe, expect, it } from 'vitest';
import { cleanTitle } from './clean';

const cleaned = (raw: string): string => cleanTitle(raw).title;

describe('cleanTitle', () => {
  it('turns a dotted release name back into words', () => {
    expect(cleaned('The.Bear.S03E01.MULTi.1080p.WEB.H264-FRATERNiTY')).toBe('The Bear S03E01');
  });

  it('leaves the dots of a real title alone', () => {
    expect(cleaned('Mission: Impossible - Dead Reckoning Part One (2023)')).toBe(
      'Mission: Impossible - Dead Reckoning Part One (2023)',
    );
  });

  it('keeps the numbering, which is the only structure the string has', () => {
    expect(cleaned('One.Piece.S01E1071.VOSTFR.1080p.WEB-DL.x264-GROUPE')).toBe(
      'One Piece S01E1071',
    );
  });

  it('keeps a year, since it names the work rather than the file', () => {
    expect(cleaned('Oppenheimer.2023.MULTi.VFF.2160p.UHD.BluRay.x265-QUALITE')).toBe(
      'Oppenheimer 2023',
    );
    expect(cleaned('Heat (1995) [Remux-1080p].mkv')).toBe('Heat (1995)');
  });

  it('keeps a year that is part of the title next to the real one', () => {
    expect(cleaned('Blade.Runner.2049.2017.1080p.BluRay.x264')).toBe('Blade Runner 2049 2017');
  });

  it('drops a release group but not a tag that looks like one', () => {
    expect(cleaned('Severance.S02E10.1080p.ATVP.WEB-DL.DDP5.1.Atmos.H.264-FLUX')).toBe(
      'Severance S02E10',
    );
  });

  it('drops the subtitling group and the hash an anime release carries', () => {
    expect(cleaned('[SubsPlease] One Piece - 1071 (1080p) [A1B2C3D4].mkv')).toBe(
      'One Piece - 1071',
    );
    expect(cleaned('[Erai-raws] Sousou no Frieren - 04 [1080p][Multiple Subtitle].mkv')).toBe(
      'Sousou no Frieren - 04',
    );
  });

  it('keeps a bracketed group that says something about the work', () => {
    expect(cleaned('The.Office.US.S02E01.720p.HDTV')).toBe('The Office US S02E01');
  });

  it('drops the site name a page title ends with', () => {
    expect(cleaned('Watch Arcane | Netflix')).toBe('Arcane');
    expect(cleaned('One Piece Season 21 Episode 1071 - Luffy Rise - Crunchyroll')).toBe(
      'One Piece Season 21 Episode 1071 - Luffy Rise',
    );
  });

  it('drops what a streaming page wraps a title in', () => {
    expect(cleaned('Voir Oppenheimer (2023) en streaming VF complet HD gratuit')).toBe(
      'Oppenheimer (2023)',
    );
    expect(cleaned('Regarder One Piece Épisode 1071 VOSTFR en streaming - SiteExemple')).toBe(
      'One Piece Épisode 1071 - SiteExemple',
    );
  });

  it('decodes an entity that survived into the title', () => {
    expect(
      cleaned('Frieren: Beyond Journey&apos;s End Episode 4 - The Land Where Souls Rest'),
    ).toBe("Frieren: Beyond Journey's End Episode 4 - The Land Where Souls Rest");
  });

  it('leaves a title made of digits and dashes intact', () => {
    expect(cleaned('9-1-1.S07E01.1080p.WEB.h264')).toBe('9-1-1 S07E01');
    expect(cleaned('1917 (2019) 1080p')).toBe('1917 (2019)');
  });

  it('does not touch the words that carry the numbering', () => {
    expect(cleaned('Attack on Titan Final Season Part 3 - Episode 2')).toBe(
      'Attack on Titan Final Season Part 3 - Episode 2',
    );
    expect(cleaned('Kaamelott.Livre.I.Episode.12.FRENCH.DVDRip')).toBe(
      'Kaamelott Livre I Episode 12',
    );
  });

  it('ends up with nothing when the string was nothing but tags', () => {
    expect(cleaned('1080p')).toBe('');
    expect(cleaned('   ')).toBe('');
    expect(cleaned('')).toBe('');
  });

  it('reports what it took out, so a wrong result can be explained', () => {
    const result = cleanTitle('The.Bear.S03E01.MULTi.1080p.WEB.H264-FRATERNiTY');

    expect(result.removed).toContain('MULTi');
    expect(result.removed).toContain('1080p');
    expect(result.removed).toContain('-FRATERNiTY');
  });

  it('leaves a title that needs no cleaning exactly as it was', () => {
    for (const title of ['Welcome to the Playground', 'Oppenheimer', 'Arcane', 'film a voir']) {
      expect(cleaned(title)).toBe(title);
    }
  });
});
