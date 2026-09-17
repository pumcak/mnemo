import { z } from 'zod';
import { devicePlatformSchema } from './device';

/**
 * What a capture source sends once to become a known device.
 *
 * The token proves the caller can read a file on the machine, which a web page
 * cannot, so it is what separates the extension from any other page that can
 * reach the loopback interface.
 */
export const pairRequestSchema = z.object({
  token: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(120),
  platform: devicePlatformSchema,
});

export const pairResponseSchema = z.object({
  deviceId: z.uuid(),
});

export type PairRequest = z.infer<typeof pairRequestSchema>;
export type PairResponse = z.infer<typeof pairResponseSchema>;
