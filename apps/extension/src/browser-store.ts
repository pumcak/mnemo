import { browser } from 'wxt/browser';
import type { KeyValueStore } from './storage';

/** The real storage behind the interface the logic is written against. */
export const browserStore: KeyValueStore = {
  get: async (key) => {
    const bag = await browser.storage.local.get(key);

    return bag[key];
  },
  set: async (key, value) => {
    await browser.storage.local.set({ [key]: value });
  },
};
