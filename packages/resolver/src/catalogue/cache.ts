export interface ResponseCache<V> {
  get: (key: string) => V | undefined;
  set: (key: string, value: V) => void;
}

export interface CacheOptions {
  ttlMs: number;
  maxEntries: number;
  now?: () => number;
}

/**
 * Remembers catalogue answers for a while.
 *
 * The same title arrives every fifteen seconds of playback, and asking a
 * catalogue each time would burn the rate limit on questions already answered.
 * Bounded, because a long running service must not grow without end, and least
 * recently used first out, because what was asked recently is what gets asked
 * again.
 */
export const createTtlCache = <V>({
  ttlMs,
  maxEntries,
  now = Date.now,
}: CacheOptions): ResponseCache<V> => {
  const entries = new Map<string, { value: V; expiresAt: number }>();

  return {
    get: (key) => {
      const entry = entries.get(key);

      if (entry === undefined) {
        return undefined;
      }

      if (entry.expiresAt <= now()) {
        entries.delete(key);

        return undefined;
      }

      // Reinserting moves the key to the back, which is what makes this least
      // recently used rather than first in first out.
      entries.delete(key);
      entries.set(key, entry);

      return entry.value;
    },
    set: (key, value) => {
      entries.delete(key);
      entries.set(key, { value, expiresAt: now() + ttlMs });

      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;

        if (oldest === undefined) {
          break;
        }

        entries.delete(oldest);
      }
    },
  };
};
