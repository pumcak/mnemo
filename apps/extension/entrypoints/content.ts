import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { browserStore } from '../src/browser-store';
import type { PlaybackMessage } from '../src/messages';
import { adapters } from '../src/adapters';
import { createAdapterRegistry } from '../src/adapters/registry';
import { isBlocked, loadSettings } from '../src/settings';
import { observeVideos } from '../src/video/observe';
import { watchVideo } from '../src/video/watch';

/**
 * Runs everywhere, and that is the point: the players worth following are not
 * all on a list of known sites. It stays silent on a page without a video,
 * which is nearly all of them, and it never looks at anything but the video
 * elements and the title the page already published.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main: async () => {
    const settings = await loadSettings(browserStore);

    if (settings.paused || isBlocked(settings, location.hostname)) {
      return;
    }

    const registry = createAdapterRegistry(adapters);

    observeVideos(document, (video) =>
      watchVideo(video, {
        onObservation: (observation) => {
          // Read the title at every observation rather than once: the next
          // episode starts in the same page, with the same video element.
          const media = registry.resolve({
            doc: document,
            url: new URL(location.href),
            session: navigator.mediaSession?.metadata,
          });

          if (media === undefined) {
            return;
          }

          const message: PlaybackMessage = {
            type: 'mnemo.playback',
            observedAt: new Date().toISOString(),
            state: observation.state,
            positionSeconds: observation.positionSeconds,
            rawTitle: media.rawTitle,
            app: media.app,
            titleSource: media.source,
            url: location.href,
            reason: observation.reason,
            ...(media.hint === undefined ? {} : { hint: media.hint }),
            ...(observation.durationSeconds === undefined
              ? {}
              : { durationSeconds: observation.durationSeconds }),
          };

          void browser.runtime.sendMessage(message);
        },
      }),
    );
  },
});
