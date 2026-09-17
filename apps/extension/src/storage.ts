/**
 * The bit of extension storage the rest of the code is allowed to see.
 *
 * Keeping it to two methods means every piece of logic can be tested with a
 * plain object, without a fake browser or a running extension.
 */
export interface KeyValueStore {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
}

export const createMemoryStore = (initial: Record<string, unknown> = {}): KeyValueStore => {
  const values = new Map<string, unknown>(Object.entries(initial));

  return {
    get: (key) => Promise.resolve(values.get(key)),
    set: (key, value) => {
      values.set(key, value);

      return Promise.resolve();
    },
  };
};
