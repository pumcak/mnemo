import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { adapters } from '../src/adapters';
import { createAdapterRegistry } from '../src/adapters/registry';
import type { ResolvedMedia } from '../src/adapters/registry';
import { browserStore } from '../src/browser-store';
import type { PageContextMessage, PlaybackMessage } from '../src/messages';
import { isBlocked, loadSettings } from '../src/settings';
import { observeVideos } from '../src/video/observe';
import { watchVideo } from '../src/video/watch';

/**
 * Runs everywhere and in every frame, and that is the point: the players worth
 * following are not all on a list of known sites, and an embedded one lives in
 * a frame served by somebody else. It stays silent on a page without a video,
 * which is nearly all of them, and it never looks at anything but the video
 * elements and what the page already published about itself.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  main: async () => {
    const settings = await loadSettings(browserStore);

    if (settings.paused || isBlocked(settings, location.hostname)) {
      return;
    }

    const registry = createAdapterRegistry(adapters);
    const describe = (): ResolvedMedia | undefined =>
      registry.resolve({
        doc: document,
        url: new URL(location.href),
        session: navigator.mediaSession?.metadata,
      });

    if (window.top === window) {
      /**
       * The frame holding an embedded player cannot read the page around it, so
       * the top frame is the only one that can say what the page is about. It
       * says so on arrival and whenever the title changes, which is how a single
       * page application moves to the next episode.
       */
      const announce = (): void => {
        const media = describe();

        if (media === undefined) {
          return;
        }

        const message: PageContextMessage = {
          type: 'mnemo.pageContext',
          rawTitle: media.rawTitle,
          app: media.app,
          titleSource: media.source,
          url: location.href,
          ...(media.hint === undefined ? {} : { hint: media.hint }),
        };

        void browser.runtime.sendMessage(message);
      };

      announce();

      const title = document.querySelector('title');

      if (title !== null) {
        new MutationObserver(announce).observe(title, { childList: true, characterData: true });
      }
    }

    observeVideos(document, (video) =>
      watchVideo(video, {
        onObservation: (observation) => {
          // Read the title at every observation rather than once: the next
          // episode starts in the same page, with the same video element.
          const media = describe();

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
