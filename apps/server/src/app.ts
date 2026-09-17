import { Hono } from 'hono';
import type { Logger } from './logger';
import { requestLogger } from './request-logger';

export interface HealthPayload {
  status: 'ok';
  uptimeSeconds: number;
}

export const createApp = (logger: Logger): Hono =>
  new Hono()
    .use('*', requestLogger(logger))
    .get('/health', (c) =>
      c.json<HealthPayload>({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }),
    );
