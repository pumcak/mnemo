import type { PlaybackMessage } from './messages';

export interface NowPlaying extends PlaybackMessage {
  tabId: number;
}

/**
 * What is playing right now, one entry per tab.
 *
 * The background needs this before it needs anything else: a tab that paused
 * two hours ago is not what somebody is watching, and the options page has to be
 * able to answer "is this thing working" without waiting for the next
 * heartbeat.
 */
export interface PlaybackRegistry {
  record: (tabId: number, message: PlaybackMessage) => void;
  forget: (tabId: number) => void;
  nowPlaying: () => NowPlaying[];
}

export const createPlaybackRegistry = (): PlaybackRegistry => {
  const byTab = new Map<number, PlaybackMessage>();

  return {
    record: (tabId, message) => {
      const known = byTab.get(tabId);

      // Messages from one tab can arrive out of order, and an older one must not
      // overwrite what is more recent.
      if (known !== undefined && Date.parse(known.observedAt) > Date.parse(message.observedAt)) {
        return;
      }

      byTab.set(tabId, message);
    },
    forget: (tabId) => {
      byTab.delete(tabId);
    },
    nowPlaying: () =>
      [...byTab.entries()]
        .filter(([, message]) => message.state === 'playing')
        .map(([tabId, message]) => ({ ...message, tabId })),
  };
};
