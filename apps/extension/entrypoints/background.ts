import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { retryDelayMs } from '../src/backoff';
import { browserStore } from '../src/browser-store';
import { heartbeatFrom } from '../src/heartbeat';
import { extensionMessageSchema } from '../src/messages';
import { createPlaybackRegistry } from '../src/playback-registry';
import { createHeartbeatQueue } from '../src/queue';
import type { HeartbeatQueue } from '../src/queue';
import { readStoredQueue, writeStoredQueue } from '../src/queue-storage';
import { createServiceClient } from '../src/service-client';
import { isPaired, loadSettings, saveSettings } from '../src/settings';
import type { Settings } from '../src/settings';

const retryAlarm = 'mnemo.retry';

export default defineBackground(() => {
  const registry = createPlaybackRegistry();

  let settings: Settings | undefined;
  let queue: HeartbeatQueue | undefined;

  /**
   * Schedules the next attempt through an alarm rather than a timer, because a
   * suspended worker never runs a timer it was holding.
   */
  const scheduleRetry = (pending: HeartbeatQueue): void => {
    if (pending.pending().length === 0) {
      void browser.alarms.clear(retryAlarm);

      return;
    }

    void browser.alarms.create(retryAlarm, {
      when: Date.now() + retryDelayMs(pending.failures()),
    });
  };

  const drain = async (): Promise<void> => {
    const pending = queue;

    if (pending === undefined) {
      return;
    }

    await pending.flush();
    scheduleRetry(pending);
  };

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

    const built = createHeartbeatQueue({
      send: client.sendHeartbeat,
      onChange: (waiting) => {
        void writeStoredQueue(browserStore, waiting);
      },
      onUnpaired: () => {
        // The service no longer knows this device. Forgetting the identifier is
        // what makes the options page ask for pairing again.
        void (async () => {
          const { deviceId: _forgotten, ...rest } = await loadSettings(browserStore);

          await saveSettings(browserStore, rest);
        })();
      },
    });

    queue = built;
    built.restore(await readStoredQueue(browserStore));
    await drain();
  };

  browser.runtime.onInstalled.addListener(() => {
    void (async () => {
      await saveSettings(browserStore, await loadSettings(browserStore));
      await reload();
    })();
  });

  browser.storage.onChanged.addListener((changes) => {
    // The queue writes to storage itself, and reacting to that would rebuild
    // the queue on every observation.
    if (Object.keys(changes).every((key) => key === 'mnemo.queue')) {
      return;
    }

    void reload();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === retryAlarm) {
      void drain();
    }
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

    return drain();
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    registry.forget(tabId);
  });
});
