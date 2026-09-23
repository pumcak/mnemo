import { z } from 'zod';
import { titleKindSchema } from './types';

/**
 * Where a title of this shape comes from. Kept per entry so coverage can be
 * checked: a resolver that only handles release names would pass a corpus made
 * of release names.
 */
export const corpusOrigins = [
  'netflix',
  'crunchyroll',
  'unofficial',
  'release-name',
  'local-file',
  'video-platform',
  'generic',
] as const;

export const corpusEntrySchema = z.object({
  /**
   * Exactly what a capture source would report, character for character. Empty
   * and blank strings are allowed on purpose: the ingest contract refuses them,
   * but the resolver is also called from places that have no contract in front
   * of them, such as the desktop capture and a manual correction.
   */
  raw: z.string(),
  origin: z.enum(corpusOrigins),
  /** Why this entry is in the corpus, when that is not obvious from the string. */
  note: z.string().optional(),
  expected: z.object({
    kind: titleKindSchema,
    title: z.string(),
    series: z.string().optional(),
    season: z.number().int().positive().optional(),
    episode: z.number().int().positive().optional(),
    year: z.number().int().min(1888).max(2200).optional(),
  }),
});

export type CorpusEntry = z.infer<typeof corpusEntrySchema>;

/**
 * The titles the resolver has to survive.
 *
 * This list is the point of the whole phase. Everything downstream is measured
 * against it, so it is written before the code that reads it and it grows with
 * whatever real usage throws up. Expectations say what a correct answer looks
 * like, including the entries where the correct answer is to admit nothing was
 * recognised.
 */
export const corpus: readonly CorpusEntry[] = [
  {
    raw: 'Welcome to the Playground',
    origin: 'netflix',
    note: 'What the Netflix adapter reports: an episode name with no numbering in it.',
    expected: { kind: 'episode', title: 'Welcome to the Playground' },
  },
  {
    raw: 'Oppenheimer',
    origin: 'netflix',
    expected: { kind: 'movie', title: 'Oppenheimer' },
  },
  {
    raw: 'Watch Arcane | Netflix',
    origin: 'netflix',
    note: 'The generic reading of a Netflix page, wrapped in site furniture.',
    expected: { kind: 'unknown', title: 'Arcane' },
  },
  {
    raw: 'One Piece Season 21 Episode 1071 - Luffy Rise - Crunchyroll',
    origin: 'crunchyroll',
    expected: {
      kind: 'episode',
      title: 'Luffy Rise',
      series: 'One Piece',
      season: 21,
      episode: 1071,
    },
  },
  {
    raw: 'Frieren: Beyond Journey&apos;s End Episode 4 - The Land Where Souls Rest',
    origin: 'crunchyroll',
    note: 'An html entity that survived into the title, and an episode with no season.',
    expected: {
      kind: 'episode',
      title: 'The Land Where Souls Rest',
      series: "Frieren: Beyond Journey's End",
      episode: 4,
    },
  },
  {
    raw: 'One.Piece.S01E1071.VOSTFR.1080p.WEB-DL.x264-GROUPE',
    origin: 'release-name',
    expected: { kind: 'episode', title: 'One Piece', season: 1, episode: 1071 },
  },
  {
    raw: 'The.Bear.S03E01.MULTi.1080p.WEB.H264-FRATERNiTY',
    origin: 'release-name',
    expected: { kind: 'episode', title: 'The Bear', season: 3, episode: 1 },
  },
  {
    raw: 'Oppenheimer.2023.MULTi.VFF.2160p.UHD.BluRay.x265-QUALITE',
    origin: 'release-name',
    expected: { kind: 'movie', title: 'Oppenheimer', year: 2023 },
  },
  {
    raw: 'Blade.Runner.2049.2017.1080p.BluRay.x264',
    origin: 'release-name',
    note: 'The trap of the phase: 2049 belongs to the title, 2017 is the year.',
    expected: { kind: 'movie', title: 'Blade Runner 2049', year: 2017 },
  },
  {
    raw: 'Dune.Part.Two.2024.FRENCH.1080p.WEB.x264-NOGROUP',
    origin: 'release-name',
    expected: { kind: 'movie', title: 'Dune Part Two', year: 2024 },
  },
  {
    raw: 'Doctor.Who.2005.S01E01.1080p.BluRay',
    origin: 'release-name',
    note: 'A year that disambiguates the series rather than dating this episode.',
    expected: { kind: 'episode', title: 'Doctor Who', season: 1, episode: 1, year: 2005 },
  },
  {
    raw: 'The.Office.US.S02E01.720p.HDTV',
    origin: 'release-name',
    expected: { kind: 'episode', title: 'The Office US', season: 2, episode: 1 },
  },
  {
    raw: 'Kaamelott.Livre.I.Episode.12.FRENCH.DVDRip',
    origin: 'release-name',
    note: 'A season numbered with a roman numeral, in french.',
    expected: { kind: 'episode', title: 'Kaamelott', season: 1, episode: 12 },
  },
  {
    raw: '[SubsPlease] One Piece - 1071 (1080p) [A1B2C3D4].mkv',
    origin: 'release-name',
    note: 'The anime convention: a bare absolute episode number and no season.',
    expected: { kind: 'episode', title: 'One Piece', episode: 1071 },
  },
  {
    raw: '[Erai-raws] Sousou no Frieren - 04 [1080p][Multiple Subtitle].mkv',
    origin: 'release-name',
    expected: { kind: 'episode', title: 'Sousou no Frieren', episode: 4 },
  },
  {
    raw: 'Kaguya-sama wa Kokurasetai S2 - 05 (1080p)',
    origin: 'release-name',
    note: 'A season written the anime way, glued to the title.',
    expected: { kind: 'episode', title: 'Kaguya-sama wa Kokurasetai', season: 2, episode: 5 },
  },
  {
    raw: 'Regarder One Piece Épisode 1071 VOSTFR en streaming - SiteExemple',
    origin: 'unofficial',
    expected: { kind: 'episode', title: 'One Piece', episode: 1071 },
  },
  {
    raw: 'Voir Oppenheimer (2023) en streaming VF complet HD gratuit',
    origin: 'unofficial',
    expected: { kind: 'movie', title: 'Oppenheimer', year: 2023 },
  },
  {
    raw: 'Arcane 2x03 VF - Fini de jouer - streaming',
    origin: 'unofficial',
    expected: { kind: 'episode', title: 'Arcane', season: 2, episode: 3 },
  },
  {
    raw: 'The Bear - Saison 3 Épisode 1 en streaming VOSTFR',
    origin: 'unofficial',
    expected: { kind: 'episode', title: 'The Bear', season: 3, episode: 1 },
  },
  {
    raw: 'Arcane S01E03 - The Base Violence Necessary for Change.mkv',
    origin: 'local-file',
    expected: {
      kind: 'episode',
      title: 'The Base Violence Necessary for Change',
      series: 'Arcane',
      season: 1,
      episode: 3,
    },
  },
  {
    raw: 'Heat (1995) [Remux-1080p].mkv',
    origin: 'local-file',
    expected: { kind: 'movie', title: 'Heat', year: 1995 },
  },
  {
    raw: 'film a voir.mp4',
    origin: 'local-file',
    note: 'A file somebody renamed by hand. Nothing here identifies a work.',
    expected: { kind: 'unknown', title: 'film a voir' },
  },
  {
    raw: 'ONE PIECE 1071 REACTION!! | Luffy is back',
    origin: 'video-platform',
    note: 'A reaction video is not the episode, and must not be recorded as one.',
    expected: { kind: 'unknown', title: 'ONE PIECE 1071 REACTION!! | Luffy is back' },
  },
  {
    raw: 'Oppenheimer - Official Trailer',
    origin: 'video-platform',
    note: 'A trailer names the film but is not a viewing of it.',
    expected: { kind: 'unknown', title: 'Oppenheimer - Official Trailer' },
  },
  {
    raw: 'LIVE: direct 24/7 actualites',
    origin: 'video-platform',
    note: 'A continuous live stream is a viewing of nothing in particular.',
    expected: { kind: 'unknown', title: 'LIVE: direct 24/7 actualites' },
  },
  {
    raw: 'YouTube',
    origin: 'video-platform',
    note: 'A page title before the player has loaded anything.',
    expected: { kind: 'unknown', title: 'YouTube' },
  },
  {
    raw: '',
    origin: 'generic',
    note: 'Not reachable through the contract, which refuses an empty title, but the resolver is called from more than one place.',
    expected: { kind: 'unknown', title: '' },
  },
  {
    raw: '   ',
    origin: 'generic',
    note: 'Whitespace only, which is what a player reports between two episodes.',
    expected: { kind: 'unknown', title: '' },
  },
  {
    raw: '1080p',
    origin: 'generic',
    note: 'Everything in the string is a tag, so nothing is left to identify.',
    expected: { kind: 'unknown', title: '' },
  },
  {
    raw: 'Arcane',
    origin: 'generic',
    note: 'A bare series name with no episode: a series page, not a viewing.',
    expected: { kind: 'unknown', title: 'Arcane' },
  },
  {
    raw: 'One Piece S01E1071-E1072 VOSTFR',
    origin: 'unofficial',
    note: 'Two episodes in one file. The first is the one being watched.',
    expected: { kind: 'episode', title: 'One Piece', season: 1, episode: 1071 },
  },
  {
    raw: 'Severance.S02E10.1080p.ATVP.WEB-DL.DDP5.1.Atmos.H.264-FLUX',
    origin: 'release-name',
    note: 'Audio tags that contain digits, which must not be read as numbering.',
    expected: { kind: 'episode', title: 'Severance', season: 2, episode: 10 },
  },
  {
    raw: 'Shogun.2024.S01E01.MULTi.1080p.WEB.H264',
    origin: 'release-name',
    expected: { kind: 'episode', title: 'Shogun', season: 1, episode: 1, year: 2024 },
  },
  {
    raw: '9-1-1.S07E01.1080p.WEB.h264',
    origin: 'release-name',
    note: 'A title made of digits and dashes, which any numbering pattern will want to eat.',
    expected: { kind: 'episode', title: '9-1-1', season: 7, episode: 1 },
  },
  {
    raw: '1917 (2019) 1080p',
    origin: 'local-file',
    note: 'A title that is a year, next to the real year.',
    expected: { kind: 'movie', title: '1917', year: 2019 },
  },
  {
    raw: 'Mission: Impossible - Dead Reckoning Part One (2023)',
    origin: 'generic',
    note: 'Punctuation that belongs to the title.',
    expected: { kind: 'movie', title: 'Mission: Impossible - Dead Reckoning Part One', year: 2023 },
  },
  {
    raw: 'Attack on Titan Final Season Part 3 - Episode 2',
    origin: 'unofficial',
    note: 'A season named rather than numbered.',
    expected: { kind: 'episode', title: 'Attack on Titan Final Season Part 3', episode: 2 },
  },
  {
    raw: 'Breaking Bad - 5x14 - Ozymandias',
    origin: 'unofficial',
    expected: {
      kind: 'episode',
      title: 'Ozymandias',
      series: 'Breaking Bad',
      season: 5,
      episode: 14,
    },
  },
  {
    raw: 'Le Comte de Monte-Cristo (2024) FRENCH 1080p WEB-DL',
    origin: 'release-name',
    expected: { kind: 'movie', title: 'Le Comte de Monte-Cristo', year: 2024 },
  },
];
