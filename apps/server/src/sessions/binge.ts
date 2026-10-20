import type { MediaHint } from '@mnemo/contracts';
import { normalizeTitle, parseRawTitle } from '@mnemo/resolver';

/** The longest break between two episodes that still keeps them in one binge. */
export const bingeBreakMs = 10 * 60 * 1000;

export interface BingeSession {
  id: number;
  deviceId: string;
  rawTitle: string;
  hint: MediaHint | null;
  startedAt: Date;
  lastSeenAt: Date;
}

interface Placed {
  session: BingeSession;
  series: string;
  season: number;
  episode: number;
}

/**
 * Where a session sits in a series, from the hint the source sent first and the
 * raw title after. Nothing when it is not an episode at all.
 */
const placeOf = (session: BingeSession): Placed | undefined => {
  const parsed = parseRawTitle(session.rawTitle);
  // Without an episode name after the numbering, the parser leaves the series in
  // the title.
  const series =
    session.hint?.seriesTitle ??
    parsed.series ??
    (parsed.kind === 'episode' ? parsed.title : undefined);
  const episode = session.hint?.episode ?? parsed.episode;

  if (series === undefined || episode === undefined) {
    return undefined;
  }

  return {
    session,
    series: normalizeTitle(series),
    season: session.hint?.season ?? parsed.season ?? 1,
    episode,
  };
};

const follows = (previous: Placed, next: Placed): boolean =>
  next.session.deviceId === previous.session.deviceId &&
  next.series === previous.series &&
  next.session.startedAt.getTime() - previous.session.lastSeenAt.getTime() <= bingeBreakMs &&
  (next.season > previous.season ||
    (next.season === previous.season && next.episode > previous.episode));

/**
 * Groups sessions into binges: episodes of one series played one after the
 * other on the same device, moving forward, with short breaks between them.
 *
 * Going back to an earlier episode ends the binge, since that is a rewatch rather
 * than a run. Only runs of two episodes or more are returned, as session ids in
 * the order they were played.
 */
export const findBinges = (sessions: readonly BingeSession[]): number[][] => {
  const placed = sessions
    .map(placeOf)
    .filter((place): place is Placed => place !== undefined)
    .sort((a, b) => a.session.startedAt.getTime() - b.session.startedAt.getTime());
  const open: Placed[][] = [];
  const binges: Placed[][] = [];

  for (const place of placed) {
    const run = open.find((candidate) => {
      const last = candidate.at(-1);

      return last !== undefined && follows(last, place);
    });

    if (run === undefined) {
      const started = [place];

      open.push(started);
      binges.push(started);
    } else {
      run.push(place);
    }
  }

  return binges.filter((run) => run.length >= 2).map((run) => run.map((place) => place.session.id));
};
