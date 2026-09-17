import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { browserStore } from '../src/browser-store';
import { extensionMessageSchema } from '../src/messages';
import { createPlaybackRegistry } from '../src/playback-registry';
import { loadSettings, saveSettings } from '../src/settings';

export default defineBackground(() => {
  const registry = createPlaybackRegistry();

  /**
   * Writing the settings back on install turns the defaults into stored values,
   * so the options page has something to show and later increments can rely on
   * the keys existing.
   */
  browser.runtime.onInstalled.addListener(() => {
    void (async () => {
      await saveSettings(browserStore, await loadSettings(browserStore));
    })();
  });

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

    if (tabId !== undefined) {
      registry.record(tabId, parsed.data);
    }

    return undefined;
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    registry.forget(tabId);
  });
});
