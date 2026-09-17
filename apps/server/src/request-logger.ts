import type { MiddlewareHandler } from 'hono';
import type { Logger } from './logger';

/**
 * Logs one line per request: method, path, status and duration.
 *
 * The query string is dropped on purpose. Capture sources send what somebody is
 * watching, and a log file is exactly the place where that should not end up.
 * Same reason nothing here touches the request body.
 */
export const requestLogger = (logger: Logger): MiddlewareHandler => {
  return async (c, next) => {
    const startedAt = performance.now();

    await next();

    logger.info(
      {
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        status: c.res.status,
        durationMs: Math.round(performance.now() - startedAt),
      },
      'request',
    );
  };
};
