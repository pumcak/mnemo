// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Observation } from './watch';
import { watchVideo } from './watch';

interface FakePlayer {
  video: HTMLVideoElement;
  set: (values: {
    position?: number;
    duration?: number;
    paused?: boolean;
    ended?: boolean;
  }) => void;
  fire: (event: string) => void;
}

/**
 * happy-dom does not simulate playback, so the element is given the properties
 * a real player would expose and the events are fired by hand.
 */
const fakePlayer = (): FakePlayer => {
  const video = document.createElement('video');
  const state = { position: 0, duration: 2520, paused: true, ended: false };

  Object.defineProperties(video, {
    currentTime: { get: () => state.position, configurable: true },
    duration: { get: () => state.duration, configurable: true },
    paused: { get: () => state.paused, configurable: true },
    ended: { get: () => state.ended, configurable: true },
  });

  return {
    video,
    set: (values) => Object.assign(state, values),
    fire: (event) => video.dispatchEvent(new Event(event)),
  };
};

describe('watchVideo', () => {
  let player: FakePlayer;
  let seen: Observation[];
  let clock: number;
  let stop: () => void;

  beforeEach(() => {
    player = fakePlayer();
    seen = [];
    clock = 0;
    stop = watchVideo(player.video, {
      onObservation: (observation) => seen.push(observation),
      throttleMs: 15_000,
      now: () => clock,
    });
  });

  it('reports the moment playback starts', () => {
    player.set({ paused: false, position: 12 });
    player.fire('play');

    expect(seen).toEqual([
      { state: 'playing', positionSeconds: 12, durationSeconds: 2520, reason: 'state-change' },
    ]);
  });

  it('reports a pause', () => {
    player.set({ paused: true, position: 30 });
    player.fire('pause');

    expect(seen[0]?.state).toBe('paused');
  });

  it('reports the end', () => {
    player.set({ paused: true, ended: true, position: 2520 });
    player.fire('ended');

    expect(seen[0]?.state).toBe('ended');
  });

  it('says nothing for the four timeupdates a player fires every second', () => {
    player.set({ paused: false, position: 1 });
    player.fire('timeupdate');
    seen = [];

    clock += 200;
    player.fire('timeupdate');
    clock += 200;
    player.fire('timeupdate');

    expect(seen).toHaveLength(0);
  });

  it('reports progress once the window has passed', () => {
    player.set({ paused: false, position: 1 });
    player.fire('timeupdate');
    seen = [];

    clock += 15_000;
    player.set({ position: 16 });
    player.fire('timeupdate');

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ reason: 'progress', positionSeconds: 16 });
  });

  it('reports a seek at once, because the position stopped meaning what it did', () => {
    player.set({ paused: false, position: 1 });
    player.fire('timeupdate');
    seen = [];

    clock += 500;
    player.set({ position: 1200 });
    player.fire('seeked');

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ reason: 'seek', positionSeconds: 1200 });
  });

  it('ignores progress while paused, since nothing is being watched', () => {
    player.set({ paused: true, position: 30 });

    clock += 60_000;
    player.fire('timeupdate');

    expect(seen).toHaveLength(0);
  });

  it('leaves the duration out before the player knows it', () => {
    player.set({ paused: false, duration: Number.NaN, position: 0 });
    player.fire('play');

    expect(seen[0]).not.toHaveProperty('durationSeconds');
  });

  it('leaves the duration out for a live stream', () => {
    player.set({ paused: false, duration: Number.POSITIVE_INFINITY, position: 42 });
    player.fire('play');

    expect(seen[0]).not.toHaveProperty('durationSeconds');
    expect(seen[0]?.positionSeconds).toBe(42);
  });

  it('never reports a position past the duration, which the contract refuses', () => {
    player.set({ paused: false, duration: 100, position: 100.4 });
    player.fire('play');

    expect(seen[0]?.positionSeconds).toBe(100);
  });

  it('reports zero rather than a negative or unknown position', () => {
    player.set({ paused: false, position: Number.NaN });
    player.fire('play');

    expect(seen[0]?.positionSeconds).toBe(0);
  });

  it('says nothing more once stopped', () => {
    stop();

    player.set({ paused: false });
    player.fire('play');

    expect(seen).toHaveLength(0);
  });
});
