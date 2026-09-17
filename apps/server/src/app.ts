import { Hono } from 'hono';
import type { DatabaseHandle } from './db/client';
import { createIngestRoutes } from './ingest/routes';
import type { Logger } from './logger';
import { requestLogger } from './request-logger';

export interface HealthPayload {
  status: 'ok';
  uptimeSeconds: number;
}

export interface AppDeps {
  handle: DatabaseHandle;
  logger: Logger;
}

export const createApp = (deps: AppDeps): Hono =>
  new Hono()
    .use('*', requestLogger(deps.logger))
    .get('/health', (c) =>
      c.json<HealthPayload>({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }),
    )
    .route('/ingest', createIngestRoutes(deps));
