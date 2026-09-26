import { allTags, isTag, leadingFurniture, siteNames, tagPhrases } from './tags';

export interface CleanedTitle {
  /** What is left once everything describing the file has been taken out. */
  title: string;
  /** Everything removed, in the order it was removed, for debugging a bad result. */
  removed: string[];
}

const entities: Record<string, string> = {
  '&amp;': '&',
  '&apos;': "'",
  '&#39;': "'",
  '&quot;': '"',
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
};

const decodeEntities = (value: string): string =>
  value.replace(/&[a-z]+;|&#\d+;/gi, (match) => entities[match.toLowerCase()] ?? match);

const fileExtension = /\.(mkv|mp4|avi|m4v|mov|wmv|flv|webm|ts|m2ts|mpg|mpeg)$/i;

/**
 * A release name separates words with dots. A real title uses spaces and its
 * dots mean something, as in "Mission: Impossible" or "H.264", so the
 * substitution only happens when the string has no spaces at all.
 */
const looksDotted = (value: string): boolean =>
  !value.includes(' ') && (value.match(/\./g)?.length ?? 0) >= 2;

const hash = /^[0-9a-f]{8}$/i;

const isThrowawayGroup = (inner: string): boolean => {
  const trimmed = inner.trim();

  if (trimmed.length === 0 || hash.test(trimmed)) {
    return true;
  }

  // Some groups are one tag written with spaces, such as "Multiple Subtitle".
  if (isTag(trimmed.replace(/[\s.\-_]+/g, ''))) {
    return true;
  }

  const words = trimmed.split(/[\s.\-_]+/).filter((word) => word.length > 0);

  return words.every((word) => isTag(word));
};

/** An anime release opens with the subtitling group in brackets, always. */
const stripLeadingGroup = (value: string, removed: string[]): string =>
  value.replace(/^\s*\[[^\]]+\]\s*/, (match) => {
    removed.push(match.trim());

    return '';
  });

/**
 * Removes a bracketed group only when everything in it describes the file.
 * "(2023)" and "(US)" say something about the work and stay.
 */
const stripGroups = (value: string, removed: string[]): string =>
  value.replace(/[[({]([^[\]({})]*)[\])}]/g, (match, inner: string) => {
    if (isThrowawayGroup(inner)) {
      removed.push(match.trim());

      return ' ';
    }

    return match;
  });

/**
 * A release group is glued to the end behind a dash, with no space before it.
 * The space is what separates it from an episode number or a site name, both of
 * which sit behind a spaced dash and must survive.
 *
 * This runs on the string as it arrived, because removing tags inserts spaces
 * and destroys the one signal it relies on. A title like "Spider-Man" is why it
 * asks for a release name shape or a shouted name before taking anything.
 */
const stripReleaseGroup = (value: string, removed: string[], dotted: boolean): string =>
  value.replace(/(?<!\s)-([A-Za-z][A-Za-z0-9]*)\s*$/, (match, group: string) => {
    const shouted = /^[A-Z0-9]{2,}$/.test(group);

    if (isTag(group) || !(dotted || shouted)) {
      return match;
    }

    removed.push(match.trim());

    return '';
  });

const escapeForPattern = (value: string): string => value.replace(/[.+*?^${}()|[\]\\]/g, '\\$&');

const stripSiteSuffix = (value: string, removed: string[]): string => {
  for (const site of siteNames) {
    const pattern = new RegExp(`\\s*[|\\-–—:]\\s*${escapeForPattern(site)}\\s*$`, 'i');
    const match = pattern.exec(value);

    if (match !== null) {
      removed.push(match[0].trim());

      return value.replace(pattern, '');
    }
  }

  return value;
};

const stripLeadingFurniture = (value: string, removed: string[]): string => {
  const pattern = new RegExp(`^\\s*(${leadingFurniture.join('|')})\\b\\s*`, 'i');

  return value.replace(pattern, (match) => {
    removed.push(match.trim());

    return '';
  });
};

const stripPhrases = (value: string, removed: string[]): string => {
  let result = value;

  for (const phrase of tagPhrases) {
    result = result.replace(new RegExp(`\\b${phrase}\\b`, 'gi'), (match) => {
      removed.push(match.trim());

      return ' ';
    });
  }

  return result;
};

const tagPattern = new RegExp(
  `(?<![\\w])(${allTags.map(escapeForPattern).join('|')})(?![\\w])`,
  'gi',
);

const stripTags = (value: string, removed: string[]): string =>
  value.replace(tagPattern, (match) => {
    removed.push(match.trim());

    return ' ';
  });

const tidy = (value: string): string =>
  value
    .replace(/\s+/g, ' ')
    .replace(/\s*([-–—|:])\s*\1+/g, ' ')
    .replace(/^[\s\-–—|:,.]+/, '')
    .replace(/[\s\-–—|:,.]+$/, '')
    .trim();

/**
 * Takes a raw title down to what might name a work.
 *
 * Nothing here reads a season, an episode or a year. Those carry meaning and are
 * extracted from what this leaves behind, so removing them would throw away the
 * only structure the string has.
 *
 * Tags go before the dotted separators are turned into spaces, because a tag can
 * contain a dot of its own: "DDP5.1" and "H.264" stop being recognisable once
 * every dot has become a space.
 */
export const cleanTitle = (raw: string): CleanedTitle => {
  const removed: string[] = [];
  let title = decodeEntities(raw).trim();
  const dotted = looksDotted(title);

  title = title.replace(fileExtension, (match) => {
    removed.push(match);

    return '';
  });

  title = stripReleaseGroup(title, removed, dotted);
  title = stripLeadingGroup(title, removed);
  title = stripGroups(title, removed);
  title = stripSiteSuffix(title, removed);
  title = stripPhrases(title, removed);
  title = stripTags(title, removed);
  title = stripLeadingFurniture(title, removed);

  if (dotted) {
    title = title.replace(/[._]+/g, ' ');
  }

  return { title: tidy(title), removed };
};
