import { heartbeatSchema } from '@mnemo/contracts';
import { Hono } from 'hono';
import { recordHeartbeat, UnknownDeviceError } from './record-heartbeat';
import type { DatabaseHandle } from '../db/client';
import type { Logger } from '../logger';

export interface IngestDeps {
  handle: DatabaseHandle;
  logger: Logger;
}

export const createIngestRoutes = ({ handle, logger }: IngestDeps): Hono =>
  new Hono().post('/heartbeat', async (c) => {
    let body: unknown;

    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'body must be json' }, 400);
    }

    const parsed = heartbeatSchema.safeParse(body);

    if (!parsed.success) {
      // The capture sources validate against the same schema before sending, so
      // a rejection here means a source is out of date or something else is
      // talking to the endpoint. Worth a log line either way.
      logger.warn({ issues: parsed.error.issues.length }, 'heartbeat rejected');

      return c.json(
        {
          error: 'heartbeat does not match the contract',
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        400,
      );
    }

    try {
      const recorded = recordHeartbeat(handle, parsed.data);

      return c.json(recorded, 202);
    } catch (error) {
      if (error instanceof UnknownDeviceError) {
        return c.json({ error: 'unknown device' }, 404);
      }

      throw error;
    }
  });
