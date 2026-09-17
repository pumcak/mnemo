import { dirname, join } from 'node:path';
import { z } from 'zod';
import { resolveDefaultDatabasePath } from './db/paths';

/**
 * Mnemo stores a complete viewing history, and the service is reachable by any
 * page open in the browser. Binding anywhere but the loopback interface would
 * put that history on the network, so the config refuses to describe it.
 */
const loopbackHosts = ['127.0.0.1', 'localhost', '::1'] as const;

export const configSchema = z.object({
  host: z
    .string()
    .default('127.0.0.1')
    .refine((host): boolean => (loopbackHosts as readonly string[]).includes(host), {
      error: `host must be one of ${loopbackHosts.join(', ')}`,
    }),
  port: z.coerce.number().int().min(1024).max(65535).default(4870),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  databasePath: z.string().min(1),
  heartbeatRetentionDays: z.coerce.number().int().min(1).max(3650).default(30),
  tokenPath: z.string().min(1),
  /**
   * Origins allowed to call the service from a browser. Empty by default: until
   * an extension is built and its origin is known, no cross origin caller has
   * any business here.
   */
  allowedOrigins: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
});

export type Config = z.infer<typeof configSchema>;

export const parseConfig = (
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform = process.platform,
): Config => {
  const databasePath = env.MNEMO_DB_PATH ?? resolveDefaultDatabasePath({ platform, env });

  return configSchema.parse({
    host: env.MNEMO_HOST,
    port: env.MNEMO_PORT,
    logLevel: env.MNEMO_LOG_LEVEL,
    databasePath,
    heartbeatRetentionDays: env.MNEMO_HEARTBEAT_RETENTION_DAYS,
    tokenPath: env.MNEMO_TOKEN_PATH ?? join(dirname(databasePath), 'mnemo.token'),
    allowedOrigins: env.MNEMO_ALLOWED_ORIGINS,
  });
};
