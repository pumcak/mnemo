import { createAniListClient, createTmdbClient } from '@mnemo/resolver';
import type { Catalogues } from '@mnemo/resolver';
import { parseConfig } from './config';
import { createLogger } from './logger';
import { startService } from './service';

const config = parseConfig(process.env);
const logger = createLogger(config);

/**
 * AniList needs no key, so anime always resolves. TMDB needs a token, and without
 * one the service still runs: films and western series just wait unresolved until
 * a token is configured, rather than the whole service refusing to start.
 */
const catalogues: Catalogues = {
  anilist: createAniListClient(),
  ...(config.tmdbToken === undefined
    ? {}
    : { tmdb: createTmdbClient({ token: config.tmdbToken }) }),
};

if (config.tmdbToken === undefined) {
  logger.warn({}, 'no tmdb token, films and western series will not be resolved');
}

const service = await startService(config, logger, { catalogues });

logger.info({ database: config.databasePath, token: config.tokenPath }, 'ready');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void service.close().then(() => {
      logger.info({ signal }, 'stopped');
      process.exit(0);
    });
  });
}
