export interface BackoffOptions {
  /** Alarms are the only timer a suspended worker can rely on, and they do not fire sooner than this. */
  floorMs?: number;
  baseMs?: number;
  maxMs?: number;
  random?: () => number;
}

const defaults = {
  floorMs: 30_000,
  baseMs: 30_000,
  maxMs: 30 * 60_000,
};

/**
 * How long to wait before trying the service again.
 *
 * Doubling with a cap, plus a little noise so that several suspended workers
 * waking up together do not all knock at once. The floor exists because the
 * retry is scheduled with an alarm, and a browser refuses to fire one sooner
 * than half a minute.
 */
export const retryDelayMs = (failures: number, options: BackoffOptions = {}): number => {
  const { floorMs, baseMs, maxMs } = { ...defaults, ...options };
  const random = options.random ?? Math.random;
  const attempts = Math.max(0, Math.trunc(failures));
  const doubled = baseMs * 2 ** Math.min(attempts, 10);
  const jitter = 1 + random() * 0.25;

  return Math.min(Math.max(floorMs, Math.round(doubled * jitter)), maxMs);
};
