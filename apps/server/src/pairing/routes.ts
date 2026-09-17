import { randomUUID } from 'node:crypto';
import { pairRequestSchema } from '@mnemo/contracts';
import type { PairResponse } from '@mnemo/contracts';
import { Hono } from 'hono';
import { tokenMatches } from '../auth/token';
import type { DatabaseHandle } from '../db/client';
import { devices } from '../db/schema';
import type { Logger } from '../logger';

export interface PairingDeps {
  handle: DatabaseHandle;
  logger: Logger;
  token: string;
}

export const createPairingRoutes = ({ handle, logger, token }: PairingDeps): Hono =>
  new Hono().post('/', async (c) => {
    let body: unknown;

    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'body must be json' }, 400);
    }

    const parsed = pairRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'pairing request does not match the contract' }, 400);
    }

    if (!tokenMatches(token, parsed.data.token)) {
      logger.warn({ name: parsed.data.name }, 'pairing refused');

      return c.json({ error: 'invalid token' }, 401);
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
