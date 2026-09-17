import { z } from 'zod';

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
});

export type Config = z.infer<typeof configSchema>;

export const parseConfig = (env: Record<string, string | undefined>): Config =>
  configSchema.parse({
    host: env.MNEMO_HOST,
    port: env.MNEMO_PORT,
  });
