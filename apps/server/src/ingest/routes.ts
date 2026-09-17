import { heartbeatSchema } from '@mnemo/contracts';
import { Hono } from 'hono';
import { recordHeartbeat, UnknownDeviceError } from './record-heartbeat';
import type { DatabaseHandle } from '../db/client';
import { fail, zodDetails } from '../http/errors';
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
      return fail(c, 400, 'invalid_body', 'body must be json');
    }

    const parsed = heartbeatSchema.safeParse(body);

    if (!parsed.success) {
      // The capture sources validate against the same schema before sending, so
      // a rejection here means a source is out of date or something else is
      // talking to the endpoint. Worth a log line either way.
      logger.warn({ issues: parsed.error.issues.length }, 'heartbeat rejected');

      return fail(
        c,
        400,
        'contract_violation',
        'heartbeat does not match the contract',
        zodDetails(parsed.error),
      );
    }

    try {
      return c.json(recordHeartbeat(handle, parsed.data), 202);
    } catch (error) {
      if (error instanceof UnknownDeviceError) {
        return fail(c, 404, 'unknown_device', 'this device needs to pair first');
      }

      throw error;
    }
  });
