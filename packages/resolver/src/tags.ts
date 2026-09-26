/**
 * Words that describe a file rather than a work.
 *
 * Grouped by what they are so the lists stay readable and so a mistake stays
 * local. Nothing here is about seasons, episodes or years: those carry meaning
 * and are read out of the title rather than thrown away.
 */
export const tagGroups = {
  resolution: [
    '480p',
    '576p',
    '720p',
    '1080p',
    '1440p',
    '2160p',
    '4320p',
    '2k',
    '4k',
    '8k',
    'uhd',
    'fhd',
    'qhd',
    'hd',
    'sd',
    'hdr',
    'hdr10',
    'hdr10plus',
    'sdr',
    'dovi',
    '10bit',
    '8bit',
    'hi10p',
  ],
  source: [
    'web',
    'webrip',
    'web-dl',
    'webdl',
    'bluray',
    'blu-ray',
    'brrip',
    'bdrip',
    'bdremux',
    'remux',
    'dvdrip',
    'dvd',
    'dvd5',
    'dvd9',
    'hdtv',
    'pdtv',
    'hdrip',
    'camrip',
    'telesync',
    'vodrip',
  ],
  platform: ['nf', 'amzn', 'atvp', 'dsnp', 'hulu', 'hmax', 'stan', 'crav', 'it', 'pcok'],
  codec: [
    'x264',
    'x265',
    'h264',
    'h265',
    'h.264',
    'h.265',
    'hevc',
    'avc',
    'xvid',
    'divx',
    'av1',
    'vp9',
  ],
  audio: [
    'aac',
    'aac2.0',
    'ac3',
    'eac3',
    'dd',
    'dd5.1',
    'ddp',
    'ddp5.1',
    'dts',
    'dts-hd',
    'truehd',
    'atmos',
    'flac',
    'opus',
    'mp3',
    '2.0',
    '5.1',
    '7.1',
    'dualaudio',
  ],
  language: [
    'multi',
    'multi-vf',
    'french',
    'truefrench',
    'subfrench',
    'vostfr',
    'vost',
    'vo',
    'vf',
    'vff',
    'vfq',
    'vfi',
    'vfstfr',
    'vosta',
    'eng',
    'english',
    'ita',
    'jap',
    'japonais',
    'subbed',
    'dubbed',
    'multiplesubtitle',
  ],
  edition: [
    'proper',
    'repack',
    'internal',
    'limited',
    'extended',
    'unrated',
    'uncut',
    'remastered',
    'integrale',
    'integral',
  ],
  /** What a streaming site wraps a title in when it wants to be found. */
  furniture: ['streaming', 'stream', 'gratuit', 'gratuitement', 'complet', 'online', 'vostfree'],
} as const;

/**
 * Words only removed at the very start of a string.
 *
 * "Voir" opens a french streaming page title, and it is also an ordinary word
 * that belongs in a filename somebody typed. Position is what tells them apart.
 */
export const leadingFurniture = ['watch', 'regarder', 'voir', 'lire', 'ver'] as const;

/** Phrases have to go before single words, or their pieces get eaten separately. */
export const tagPhrases = [
  'en streaming',
  'film complet',
  'serie complete',
  'voir en streaming',
  'streaming vf',
  'en direct',
] as const;

/**
 * Sites that wrap a title in their own name. Only used to strip a trailing
 * segment, never to decide anything about the work.
 */
export const siteNames = [
  'netflix',
  'crunchyroll',
  'prime video',
  'amazon prime video',
  'disney+',
  'disney plus',
  'youtube',
  'dailymotion',
  'max',
  'hbo max',
  'apple tv+',
  'canal+',
  'france tv',
  'arte',
  'wakanim',
  'adn',
  'anime digital network',
] as const;

/** Longest first, so an alternation matches web-dl before it matches web. */
export const allTags: readonly string[] = Object.values(tagGroups)
  .flat()
  .sort((left, right) => right.length - left.length);

const tagSet = new Set(allTags);

export const isTag = (token: string): boolean => tagSet.has(token.toLowerCase());
