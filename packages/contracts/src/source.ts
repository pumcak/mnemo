import { z } from 'zod';

/** Capture paths a heartbeat can come from. */
export const sourceKinds = ['browser', 'smtc', 'vlc', 'mpv', 'plex', 'jellyfin'] as const;

export const sourceKindSchema = z.enum(sourceKinds);

export const sourceSchema = z.object({
  kind: sourceKindSchema,
  /** Site or application the playback was observed on, such as netflix.com or vlc. */
  app: z.string().trim().min(1).max(200),
});

export type SourceKind = z.infer<typeof sourceKindSchema>;
export type Source = z.infer<typeof sourceSchema>;
