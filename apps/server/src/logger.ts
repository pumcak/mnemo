import { pino } from 'pino';
import type { Config } from './config';

/**
 * The subset of pino the rest of the service is allowed to depend on. Keeping
 * it narrow means a test can pass a recorder instead of capturing stdout.
 */
export interface Logger {
  debug: (fields: Record<string, unknown>, message: string) => void;
  info: (fields: Record<string, unknown>, message: string) => void;
  warn: (fields: Record<string, unknown>, message: string) => void;
  error: (fields: Record<string, unknown>, message: string) => void;
}

/**
 * Logs are written as JSON lines, with no pretty printing built in. A developer
 * who wants them readable pipes the output through pino-pretty, which keeps the
 * service free of a formatting dependency it does not need in production.
 */
export const createLogger = (config: Config): Logger => pino({ level: config.logLevel });
