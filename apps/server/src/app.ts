import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requireLocalHost, requireToken } from './auth/middleware';
import type { DatabaseHandle } from './db/client';
import { failureHandler, notFoundHandler } from './http/errors';
import { createIngestRoutes } from './ingest/routes';
import type { Logger } from './logger';
import { createPairingRoutes } from './pairing/routes';
import { requestLogger } from './request-logger';

export interface HealthPayload {
  status: 'ok';
  uptimeSeconds: number;
}

export interface AppDeps {
  handle: DatabaseHandle;
  logger: Logger;
  token: string;
  allowedOrigins?: readonly string[];
}

/**
 * Route layout and the guards in front of it.
 *
 * Health stays open: a capture source needs to know whether the service is up
 * before it has a token, and the answer carries nothing but an uptime. Every
 * route that touches the history sits behind the token.
 */
export const createApp = ({ handle, logger, token, allowedOrigins = [] }: AppDeps): Hono =>
  new Hono()
    .onError(failureHandler(logger))
    .notFound(notFoundHandler)
    .use('*', requestLogger(logger))
    .use('*', requireLocalHost())
    .use(
      '*',
      cors({
        origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
        allowHeaders: ['content-type', 'authorization'],
        allowMethods: ['GET', 'POST'],
        maxAge: 600,
      }),
    )
    .use('/pair', requireToken(token))
    .use('/ingest/*', requireToken(token))
    .get('/health', (c) =>
      c.json<HealthPayload>({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }),
    )
    .route('/pair', createPairingRoutes({ handle, logger }))
    .route('/ingest', createIngestRoutes({ handle, logger }));
