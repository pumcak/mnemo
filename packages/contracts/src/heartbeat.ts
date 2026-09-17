import { z } from 'zod';
import { sourceSchema } from './source';

export const playbackStates = ['playing', 'paused', 'ended'] as const;

export const playbackStateSchema = z.enum(playbackStates);

/**
 * What a capture source already believes about the media. Adapters fill in
 * whatever the page or the player exposes. The resolver treats all of it as a
 * hint to score against, never as truth.
 */
export const mediaHintSchema = z.object({
  seriesTitle: z.string().trim().min(1).max(300).optional(),
  season: z.number().int().positive().optional(),
  episode: z.number().int().positive().optional(),
  year: z.number().int().min(1888).max(2200).optional(),
});

/**
 * One observation of playback at a point in time. Heartbeats are the only thing
 * capture sources send, and sessions are assembled from them later.
 */
export const heartbeatSchema = z
  .object({
    deviceId: z.uuid(),
    source: sourceSchema,
    rawTitle: z.string().trim().min(1).max(500),
    url: z.url().max(2000).optional(),
    state: playbackStateSchema,
    positionSeconds: z.number().nonnegative().finite(),
    durationSeconds: z.number().positive().finite().optional(),
    observedAt: z.iso.datetime({ offset: true }),
    hint: mediaHintSchema.optional(),
  })
  .refine(
    ({ positionSeconds, durationSeconds }) =>
      // Players round their own numbers, so one second of slack avoids rejecting
      // an otherwise valid observation taken right at the end of a file.
      durationSeconds === undefined || positionSeconds <= durationSeconds + 1,
    {
      error: 'positionSeconds cannot exceed durationSeconds',
      path: ['positionSeconds'],
    },
  );

export type PlaybackState = z.infer<typeof playbackStateSchema>;
export type MediaHint = z.infer<typeof mediaHintSchema>;
export type Heartbeat = z.infer<typeof heartbeatSchema>;
