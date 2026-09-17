import type { PageContextMessage, PlaybackMessage } from './messages';

export interface NowPlaying extends PlaybackMessage {
  tabId: number;
  frameId: number;
}

/**
 * What is playing right now, one entry per tab.
 *
 * The join between a frame and its tab is the point of this registry. An
 * embedded player reports playback from a frame that does not know what it is
 * playing, while the top frame knows the title and has no video. Neither is
 * usable alone.
 */
export interface PlaybackRegistry {
  recordContext: (tabId: number, context: PageContextMessage) => void;
  recordPlayback: (tabId: number, frameId: number, message: PlaybackMessage) => void;
  forget: (tabId: number) => void;
  nowPlaying: () => NowPlaying[];
}

const topFrameId = 0;

interface TabState {
  context?: PageContextMessage;
  playbackByFrame: Map<number, PlaybackMessage>;
}

/**
 * A frame that only carries a player says so by having nothing but a weak
 * title. When the tab knows better, the tab wins.
 */
const describedBy = (
  playback: PlaybackMessage,
  frameId: number,
  context: PageContextMessage | undefined,
): PlaybackMessage => {
  if (frameId === topFrameId || context === undefined) {
    return playback;
  }

  return {
    ...playback,
    rawTitle: context.rawTitle,
    app: context.app,
    titleSource: context.titleSource,
    url: context.url,
    ...(context.hint === undefined ? {} : { hint: context.hint }),
  };
};

export const createPlaybackRegistry = (): PlaybackRegistry => {
  const tabs = new Map<number, TabState>();

  const stateFor = (tabId: number): TabState => {
    const existing = tabs.get(tabId);

    if (existing !== undefined) {
      return existing;
    }

    const created: TabState = { playbackByFrame: new Map() };

    tabs.set(tabId, created);

    return created;
  };

  return {
    recordContext: (tabId, context) => {
      stateFor(tabId).context = context;
    },
    recordPlayback: (tabId, frameId, message) => {
      const state = stateFor(tabId);
      const known = state.playbackByFrame.get(frameId);

      // Messages from one frame can arrive out of order, and an older one must
      // not overwrite what is more recent.
      if (known !== undefined && Date.parse(known.observedAt) > Date.parse(message.observedAt)) {
        return;
      }

      state.playbackByFrame.set(frameId, message);
    },
    forget: (tabId) => {
      tabs.delete(tabId);
    },
    nowPlaying: () =>
      [...tabs.entries()].flatMap(([tabId, state]) =>
        [...state.playbackByFrame.entries()]
          .filter(([, playback]) => playback.state === 'playing')
          .map(([frameId, playback]) => ({
            ...describedBy(playback, frameId, state.context),
            tabId,
            frameId,
          })),
      ),
  };
};
