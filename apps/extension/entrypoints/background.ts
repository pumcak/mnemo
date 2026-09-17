import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { browserStore } from '../src/browser-store';
import { loadSettings, saveSettings } from '../src/settings';

export default defineBackground(() => {
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
});
