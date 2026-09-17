/**
 * Watches a document for video elements, present or to come.
 *
 * Streaming sites build their player after the page has loaded, swap the video
 * element when the next episode starts, and sometimes hold several at once for
 * trailers and previews. A one shot query at startup would therefore find
 * nothing on Netflix and everything on a static page, so detection has to keep
 * running for as long as the tab lives.
 *
 * Known limit: a video inside a shadow root or a cross origin frame is not
 * visible from here. Frames are handled by running the content script in each
 * of them.
 */
export type VideoHandler = (video: HTMLVideoElement) => () => void;

const videosIn = (node: Node): HTMLVideoElement[] => {
  if (!(node instanceof Element)) {
    return [];
  }

  const found = node instanceof HTMLVideoElement ? [node] : [];

  return [...found, ...node.querySelectorAll('video')];
};

export const observeVideos = (root: Document, onVideo: VideoHandler): (() => void) => {
  const released = new Map<HTMLVideoElement, () => void>();

  const attach = (video: HTMLVideoElement): void => {
    if (released.has(video)) {
      return;
    }

    released.set(video, onVideo(video));
  };

  const release = (video: HTMLVideoElement): void => {
    const stop = released.get(video);

    if (stop === undefined) {
      return;
    }

    released.delete(video);
    stop();
  };

  for (const video of root.querySelectorAll('video')) {
    attach(video);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        videosIn(node).forEach(attach);
      }

      for (const node of record.removedNodes) {
        // A move shows up as a removal followed by an insertion, and by the
        // time this callback runs the element is back in the document. Letting
        // go on the removal alone would throw away the state of a video that
        // never stopped playing, which is what happens whenever a player
        // reparents its element.
        videosIn(node)
          .filter((video) => !video.isConnected)
          .forEach(release);
      }
    }
  });

  observer.observe(root.documentElement, { childList: true, subtree: true });

  return () => {
    observer.disconnect();

    for (const video of [...released.keys()]) {
      release(video);
    }
  };
};
