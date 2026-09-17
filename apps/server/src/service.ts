import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadOrCreateToken } from './auth/token';
import type { Config } from './config';
import { openDatabase } from './db/client';
import type { DatabaseHandle } from './db/client';
import { runMigrations } from './db/migrate';
import { pruneHeartbeats } from './db/retention';
import type { Logger } from './logger';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export interface Service {
  /** The address the service actually bound to, port included. */
  url: string;
  port: number;
  token: string;
  handle: DatabaseHandle;
  close: () => Promise<void>;
}

/**
 * Boots everything in the order that matters: the database has to be migrated
 * before a request can arrive, and the token has to exist before the guards can
 * ask for it.
 *
 * Returning the bound port is what lets a test start a real service on a port
 * the operating system picks, rather than hoping a hardcoded one is free.
 */
export const startService = async (config: Config, logger: Logger): Promise<Service> => {
  const handle = openDatabase(config.databasePath);

  runMigrations(handle, migrationsFolder, logger);
  pruneHeartbeats(handle, config.heartbeatRetentionDays, logger);

  const token = loadOrCreateToken(config.tokenPath);
  const app = createApp({
    handle,
    logger,
    token,
    allowedOrigins: config.allowedOrigins,
  });

  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port });

  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const port = (server.address() as AddressInfo).port;

  logger.info({ host: config.host, port }, 'listening');

  return {
    url: `http://${config.host}:${port}`,
    port,
    token,
    handle,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      handle.close();
    },
  };
};
