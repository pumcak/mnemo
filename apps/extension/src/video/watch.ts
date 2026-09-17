import type { PlaybackState } from '@mnemo/contracts';

export type ObservationReason = 'state-change' | 'progress' | 'seek';

export interface Observation {
  state: PlaybackState;
  positionSeconds: number;
  durationSeconds?: number;
  reason: ObservationReason;
}

export interface WatchOptions {
  onObservation: (observation: Observation) => void;
  /** How often progress alone is worth reporting. */
  throttleMs?: number;
  now?: () => number;
}

const defaultThrottleMs = 15_000;

/**
 * A duration is only worth reporting when it is a real number of seconds. A
 * player reports NaN before it has metadata and Infinity for a live stream, and
 * the contract accepts neither.
 */
const usableDuration = (duration: number): number | undefined =>
  Number.isFinite(duration) && duration > 0 ? duration : undefined;

/**
 * Players sometimes report a position a hair past the end. Clamping here keeps
 * the observation inside what the contract accepts instead of having the
 * service reject the last heartbeat of every episode.
 */
const positionWithin = (position: number, duration: number | undefined): number => {
  const safe = Number.isFinite(position) && position > 0 ? position : 0;

  return duration === undefined ? safe : Math.min(safe, duration);
};

const stateOf = (video: HTMLVideoElement): PlaybackState => {
  if (video.ended) {
    return 'ended';
  }

  return video.paused ? 'paused' : 'playing';
};

/**
 * Turns the events of one video element into observations.
 *
 * Transitions are reported as they happen, because they are the moments that
 * decide what a session looks like. Progress is reported on a timer instead: a
 * player fires timeupdate four times a second, and none of those are news.
 */
export const watchVideo = (video: HTMLVideoElement, options: WatchOptions): (() => void) => {
  const throttleMs = options.throttleMs ?? defaultThrottleMs;
  const now = options.now ?? (() => Date.now());

  let lastReportedAt = Number.NEGATIVE_INFINITY;

  const report = (reason: ObservationReason): void => {
    const duration = usableDuration(video.duration);

    lastReportedAt = now();

    options.onObservation({
      state: stateOf(video),
      positionSeconds: positionWithin(video.currentTime, duration),
      reason,
      ...(duration === undefined ? {} : { durationSeconds: duration }),
    });
  };

  const onStateChange = (): void => {
    report('state-change');
  };

  const onSeeked = (): void => {
    report('seek');
  };

  const onTimeUpdate = (): void => {
    if (video.paused || video.ended) {
      return;
    }

    if (now() - lastReportedAt < throttleMs) {
      return;
    }

    report('progress');
  };

  const listeners: [string, () => void][] = [
    ['play', onStateChange],
    ['playing', onStateChange],
    ['pause', onStateChange],
    ['ended', onStateChange],
    ['seeked', onSeeked],
    ['timeupdate', onTimeUpdate],
  ];

  for (const [event, listener] of listeners) {
    video.addEventListener(event, listener);
  }

  return () => {
    for (const [event, listener] of listeners) {
      video.removeEventListener(event, listener);
    }
  };
};
