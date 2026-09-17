import { z } from 'zod';

export const devicePlatforms = ['windows', 'linux', 'macos'] as const;

export const devicePlatformSchema = z.enum(devicePlatforms);

export const deviceSchema = z.object({
  id: z.uuid(),
  /** Human readable name, so a viewing history can say where something was watched. */
  name: z.string().trim().min(1).max(120),
  platform: devicePlatformSchema,
});

export type DevicePlatform = z.infer<typeof devicePlatformSchema>;
export type Device = z.infer<typeof deviceSchema>;
