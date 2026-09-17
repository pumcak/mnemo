import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { parseConfig } from './config';
import { openDatabase } from './db/client';
import { runMigrations } from './db/migrate';
import { pruneHeartbeats } from './db/retention';
import { createLogger } from './logger';

const config = parseConfig(process.env);
const logger = createLogger(config);

const handle = openDatabase(config.databasePath);
runMigrations(handle, join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations'), logger);

pruneHeartbeats(handle, config.heartbeatRetentionDays, logger);

logger.info({ path: config.databasePath }, 'database ready');

const app = createApp({ handle, logger });

serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  logger.info({ host: config.host, port: info.port }, 'listening');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    handle.close();
    logger.info({ signal }, 'stopped');
    process.exit(0);
  });
}
