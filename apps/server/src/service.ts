import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import type { Catalogues } from '@mnemo/resolver';
import { createApp } from './app';
import { loadOrCreateToken } from './auth/token';
import type { Config } from './config';
import { openDatabase } from './db/client';
import type { DatabaseHandle } from './db/client';
import { runMigrations } from './db/migrate';
import { pruneHeartbeats } from './db/retention';
import type { Logger } from './logger';
import { backfillResolutions } from './resolution/backfill';
import type { BackfillSummary } from './resolution/backfill';
import { closeIdleSessions } from './sessions/assembly';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export interface Service {
  /** The address the service actually bound to, port included. */
  url: string;
  port: number;
  token: string;
  handle: DatabaseHandle;
  /** Runs one resolution pass now. Resolves to nothing when no catalogue is configured. */
  resolvePending: () => Promise<BackfillSummary | undefined>;
  close: () => Promise<void>;
}

export interface ServiceOptions {
  /**
   * The catalogues to resolve titles against. Left out, nothing is resolved and
   * nothing touches the network, which is what tests and an offline start want.
   */
  catalogues?: Catalogues;
}

/**
 * Boots everything in the order that matters: the database has to be migrated
 * before a request can arrive, and the token has to exist before the guards can
 * ask for it.
 *
 * Returning the bound port is what lets a test start a real service on a port
 * the operating system picks, rather than hoping a hardcoded one is free.
 */
export const startService = async (
  config: Config,
  logger: Logger,
  { catalogues }: ServiceOptions = {},
): Promise<Service> => {
  const handle = openDatabase(config.databasePath);

  runMigrations(handle, migrationsFolder, logger);
  pruneHeartbeats(handle, config.heartbeatRetentionDays, logger);
  closeIdleSessions(handle);

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

  let running: Promise<BackfillSummary> | undefined;

  /**
   * One pass at a time: a slow catalogue can make a pass outlast the interval,
   * and two passes over the same pending sessions would resolve them twice.
   */
  const resolvePending = async (): Promise<BackfillSummary | undefined> => {
    if (catalogues === undefined) {
      return undefined;
    }

    running ??= backfillResolutions(handle, { catalogues, logger }).finally(() => {
      running = undefined;
    });

    return running;
  };

  const runInBackground = (): void => {
    resolvePending().catch((error: unknown) => {
      logger.error({ err: String(error) }, 'resolution pass failed');
    });
  };

  const timer =
    catalogues === undefined
      ? undefined
      : setInterval(runInBackground, config.resolveIntervalMinutes * 60 * 1000);

  const sweeper = setInterval(() => closeIdleSessions(handle), 60 * 1000);

  // Timers that are only there for background work must not keep the process alive.
  timer?.unref();
  sweeper.unref();
  runInBackground();

  return {
    url: `http://${config.host}:${port}`,
    port,
    token,
    handle,
    resolvePending,
    close: async () => {
      clearInterval(timer);
      clearInterval(sweeper);
      await running?.catch(() => undefined);
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
