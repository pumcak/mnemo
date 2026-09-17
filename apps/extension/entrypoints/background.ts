import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { browserStore } from '../src/browser-store';
import { heartbeatFrom } from '../src/heartbeat';
import { extensionMessageSchema } from '../src/messages';
import { createPlaybackRegistry } from '../src/playback-registry';
import { createHeartbeatQueue } from '../src/queue';
import type { HeartbeatQueue } from '../src/queue';
import { createServiceClient } from '../src/service-client';
import { isPaired, loadSettings, saveSettings } from '../src/settings';
import type { Settings } from '../src/settings';

export default defineBackground(() => {
  const registry = createPlaybackRegistry();

  let settings: Settings | undefined;
  let queue: HeartbeatQueue | undefined;

  /**
   * Rebuilt whenever the settings change, because pairing is what gives the
   * queue somewhere to send to. Before that there is nothing to build.
   */
  const reload = async (): Promise<void> => {
    const loaded = await loadSettings(browserStore);

    settings = loaded;

    if (!isPaired(loaded)) {
      queue = undefined;

      return;
    }

    const client = createServiceClient({
      serviceUrl: loaded.serviceUrl,
      token: loaded.token,
    });

    queue = createHeartbeatQueue({
      send: client.sendHeartbeat,
      onUnpaired: () => {
        // The service no longer knows this device. Forgetting the identifier is
        // what makes the options page ask for pairing again.
        void (async () => {
          const { deviceId: _forgotten, ...rest } = await loadSettings(browserStore);

          await saveSettings(browserStore, rest);
        })();
      },
    });
  };

  browser.runtime.onInstalled.addListener(() => {
    void (async () => {
      await saveSettings(browserStore, await loadSettings(browserStore));
      await reload();
    })();
  });

  browser.storage.onChanged.addListener(() => {
    void reload();
  });

  void reload();

  // Returning a promise is how a listener answers a message: the browser waits
  // for it and sends the result back to the caller. The rule cannot know that.
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  browser.runtime.onMessage.addListener((raw, sender) => {
    const parsed = extensionMessageSchema.safeParse(raw);

    if (!parsed.success) {
      return undefined;
    }

    if (parsed.data.type === 'mnemo.nowPlaying') {
      return Promise.resolve(registry.nowPlaying());
    }

    const tabId = sender.tab?.id;

    if (tabId === undefined) {
      return undefined;
    }

    if (parsed.data.type === 'mnemo.pageContext') {
      registry.recordContext(tabId, parsed.data);

      return undefined;
    }

    const frameId = sender.frameId ?? 0;

    registry.recordPlayback(tabId, frameId, parsed.data);

    const current = settings;
    const pending = queue;

    if (pending === undefined || current === undefined || !isPaired(current)) {
      return undefined;
    }

    pending.enqueue(
      heartbeatFrom(registry.describe(tabId, frameId, parsed.data), current.deviceId),
    );

    return pending.flush();
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    registry.forget(tabId);
  });
});
