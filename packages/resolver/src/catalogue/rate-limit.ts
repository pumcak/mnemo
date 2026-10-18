export interface RateLimiter {
  schedule: <T>(task: () => Promise<T>) => Promise<T>;
}

export interface RateLimiterOptions {
  /** The smallest gap allowed between the start of two calls. */
  minIntervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Spaces calls to a catalogue so the service never gets itself banned.
 *
 * Calls are chained rather than run in parallel: a burst of sessions resolving at
 * startup would otherwise fire every request at once and hit the limit with all of
 * them. A failed call releases its slot like a successful one, so one error does
 * not stall everything queued behind it.
 */
export const createRateLimiter = ({
  minIntervalMs,
  now = Date.now,
  sleep = realSleep,
}: RateLimiterOptions): RateLimiter => {
  let lastStart = Number.NEGATIVE_INFINITY;
  let chain: Promise<unknown> = Promise.resolve();

  return {
    schedule: <T>(task: () => Promise<T>): Promise<T> => {
      const run = chain.then(async () => {
        const wait = lastStart + minIntervalMs - now();

        if (wait > 0) {
          await sleep(wait);
        }

        lastStart = now();

        return task();
      });

      chain = run.catch(() => undefined);

      return run;
    },
  };
};
