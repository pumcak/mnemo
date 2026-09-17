import { serve } from '@hono/node-server';
import { createApp } from './app';
import { parseConfig } from './config';
import { createLogger } from './logger';

const config = parseConfig(process.env);
const logger = createLogger(config);

serve({ fetch: createApp(logger).fetch, hostname: config.host, port: config.port }, (info) => {
  logger.info({ host: config.host, port: info.port }, 'listening');
});
