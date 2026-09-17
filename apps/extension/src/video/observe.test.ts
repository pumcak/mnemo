// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { observeVideos } from './observe';

/** MutationObserver delivers asynchronously, so a test has to let it run. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('observeVideos', () => {
  let attached: HTMLVideoElement[];
  let releaseCount: number;
  let stop: () => void;

  beforeEach(() => {
    document.body.innerHTML = '';
    attached = [];
    releaseCount = 0;
  });

  afterEach(() => {
    stop?.();
  });

  const start = (): void => {
    stop = observeVideos(document, (video) => {
      attached.push(video);

      return () => {
        releaseCount += 1;
      };
    });
  };

  it('finds a video that was already on the page', () => {
    document.body.innerHTML = '<video></video>';

    start();

    expect(attached).toHaveLength(1);
  });

  it('finds a video added after the page settled, which is how players load', async () => {
    start();

    document.body.append(document.createElement('video'));
    await settle();

    expect(attached).toHaveLength(1);
  });

  it('finds a video buried inside a subtree that appeared in one go', async () => {
    start();

    const player = document.createElement('div');
    player.innerHTML = '<div class="shell"><div><video></video></div></div>';
    document.body.append(player);
    await settle();

    expect(attached).toHaveLength(1);
  });

  it('finds several videos, since a page can hold a trailer and a feature', async () => {
    start();

    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<video></video><video></video>';
    document.body.append(wrapper);
    await settle();

    expect(attached).toHaveLength(2);
  });

  it('attaches once per element, even when the tree moves around it', async () => {
    document.body.innerHTML = '<div id="from"><video></video></div><div id="to"></div>';

    start();

    const video = document.querySelector('video');
    document.querySelector('#to')?.append(video as Node);
    await settle();

    expect(attached).toHaveLength(1);
  });

  it('lets go of a video that left the page, which is what episode changes do', async () => {
    document.body.innerHTML = '<div id="player"><video></video></div>';

    start();
    document.querySelector('#player')?.remove();
    await settle();

    expect(releaseCount).toBe(1);
  });

  it('lets go of everything when it is told to stop', () => {
    document.body.innerHTML = '<video></video><video></video>';

    start();
    stop();

    expect(releaseCount).toBe(2);
  });

  it('stops finding videos once stopped', async () => {
    start();
    stop();

    document.body.append(document.createElement('video'));
    await settle();

    expect(attached).toHaveLength(0);
  });
});
