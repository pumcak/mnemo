import { randomUUID } from 'node:crypto';
import { pairRequestSchema } from '@mnemo/contracts';
import type { PairResponse } from '@mnemo/contracts';
import { Hono } from 'hono';
import type { DatabaseHandle } from '../db/client';
import { devices } from '../db/schema';
import { fail, zodDetails } from '../http/errors';
import type { Logger } from '../logger';

export interface PairingDeps {
  handle: DatabaseHandle;
  logger: Logger;
}

/** The token is checked by the guard in front of this route, not here. */
export const createPairingRoutes = ({ handle, logger }: PairingDeps): Hono =>
  new Hono().post('/', async (c) => {
    let body: unknown;

    try {
      body = await c.req.json();
    } catch {
      return fail(c, 400, 'invalid_body', 'body must be json');
    }

    const parsed = pairRequestSchema.safeParse(body);

    if (!parsed.success) {
      return fail(
        c,
        400,
        'contract_violation',
        'pairing request does not match the contract',
        zodDetails(parsed.error),
      );
    }

    const now = new Date();
    const deviceId = randomUUID();

    handle.db
      .insert(devices)
      .values({
        id: deviceId,
        name: parsed.data.name,
        platform: parsed.data.platform,
        createdAt: now,
        lastSeenAt: now,
      })
      .run();

    logger.info({ deviceId, name: parsed.data.name }, 'device paired');

    return c.json<PairResponse>({ deviceId }, 201);
  });
