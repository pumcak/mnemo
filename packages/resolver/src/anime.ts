import { cleanTitle } from './clean';
import { isTag } from './tags';

export interface AnimeReleaseShape {
  /** True when the name follows the conventions of a fansub or simulcast release. */
  matches: boolean;
  releaseGroup?: string;
  /** A release reissued after a fix, "01v2", carries the version separately. */
  version?: number;
}

const leadingGroup = /^\s*\[([^\]]+)\]/;
const checksum = /\[[0-9a-f]{8}\]/i;
const versionSuffix = /\b\d{1,4}v(\d)\b/i;
const bareEpisodeAtEnd = /\s[-–]\s*\d{1,4}(?:v\d)?(?:\s*[-~]\s*\d{1,4}(?:v\d)?)?\s*$/i;
const gluedSeason = /\bS\d{1,2}\s+[-–]\s*\d{1,4}\b/i;

/**
 * Says whether a raw title looks like an anime release.
 *
 * It decides which catalogue gets asked first, so it weighs several weak signals
 * rather than trusting one: a bracketed group up front, a checksum at the end, a
 * bare episode number behind a dash, a version suffix. Any one of them shows up
 * outside anime, two of them together rarely do.
 */
export const detectAnimeRelease = (raw: string): AnimeReleaseShape => {
  const group = leadingGroup.exec(raw)?.[1]?.trim();
  const releaseGroup = group !== undefined && !isTag(group) ? group : undefined;
  const version = versionSuffix.exec(raw)?.[1];
  const cleaned = cleanTitle(raw).title;

  const signals = [
    releaseGroup !== undefined,
    checksum.test(raw),
    bareEpisodeAtEnd.test(cleaned),
    version !== undefined,
    gluedSeason.test(cleaned),
  ].filter(Boolean).length;

  return {
    matches: signals >= 2,
    ...(releaseGroup === undefined ? {} : { releaseGroup }),
    ...(version === undefined ? {} : { version: Number.parseInt(version, 10) }),
  };
};
