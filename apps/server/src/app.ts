import { Hono } from 'hono';

export interface HealthPayload {
  status: 'ok';
  uptimeSeconds: number;
}

export const createApp = (): Hono =>
  new Hono().get('/health', (c) =>
    c.json<HealthPayload>({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }),
  );
