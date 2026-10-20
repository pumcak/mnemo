import type { PlaybackState } from '@mnemo/contracts';

/**
 * The most playing time one interval between two heartbeats can earn.
 *
 * Sources report every few seconds while playing. A longer interval that still
 * falls inside the session gap means the source went quiet, a throttled
 * background tab or a sleeping laptop, and nobody can say how much of it was
 * spent watching. Crediting the whole interval would inflate the watched time
 * by however long the lid stayed shut.
 */
export const maxCreditedSeconds = 60;

export interface Observation {
  observedAt: Date;
  state: PlaybackState;
}

/**
 * Seconds of playback between two consecutive observations of a session.
 *
 * The state of the earlier observation is what held during the interval: a
 * pause reported at 20:00 means the minutes up to the next observation were not
 * watched, whatever the next one says. Wall time is counted rather than the move
 * in position, so a seek forward earns nothing and rewinding to see a scene again
 * still counts as watching.
 */
export const playedBetween = (previous: Observation, current: Observation): number => {
  if (previous.state !== 'playing') {
    return 0;
  }

  const seconds = (current.observedAt.getTime() - previous.observedAt.getTime()) / 1000;

  return Math.min(Math.max(seconds, 0), maxCreditedSeconds);
};

export interface PositionedSession {
  lastPositionSeconds: number;
  durationSeconds: number | null;
}

/**
 * How far into the media the session last was, between 0 and 1. Unknown when
 * the source never reported a duration, as live streams and some players do not.
 */
export const sessionProgress = ({
  lastPositionSeconds,
  durationSeconds,
}: PositionedSession): number | undefined => {
  if (durationSeconds === null || durationSeconds <= 0) {
    return undefined;
  }

  return Math.min(Math.max(lastPositionSeconds / durationSeconds, 0), 1);
};
