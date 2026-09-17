import { parseConfig } from './config';
import { createLogger } from './logger';
import { startService } from './service';

const config = parseConfig(process.env);
const logger = createLogger(config);

const service = await startService(config, logger);

logger.info({ database: config.databasePath, token: config.tokenPath }, 'ready');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void service.close().then(() => {
      logger.info({ signal }, 'stopped');
      process.exit(0);
    });
  });
}
