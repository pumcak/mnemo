import { z } from 'zod';
import { devicePlatformSchema } from './device';

/**
 * What a capture source sends once to become a known device.
 *
 * The token is not in the body: it travels in the Authorization header like on
 * every other call, so there is exactly one way to present it.
 */
export const pairRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  platform: devicePlatformSchema,
});

export const pairResponseSchema = z.object({
  deviceId: z.uuid(),
});

export type PairRequest = z.infer<typeof pairRequestSchema>;
export type PairResponse = z.infer<typeof pairResponseSchema>;
