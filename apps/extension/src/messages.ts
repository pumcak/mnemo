import { mediaHintSchema, playbackStateSchema } from '@mnemo/contracts';
import { z } from 'zod';

/**
 * What a content script tells the background when a player does something.
 *
 * It is validated on arrival like anything else: a content script runs in a
 * page, and a page is not a trusted place for the background to take data from
 * without looking.
 */
export const playbackMessageSchema = z.object({
  type: z.literal('mnemo.playback'),
  observedAt: z.iso.datetime({ offset: true }),
  state: playbackStateSchema,
  positionSeconds: z.number().nonnegative().finite(),
  durationSeconds: z.number().positive().finite().optional(),
  rawTitle: z.string().trim().min(1).max(500),
  app: z.string().trim().min(1).max(200),
  hint: mediaHintSchema.optional(),
  titleSource: z.enum(['media-session', 'json-ld', 'og-title', 'document-title']),
  url: z.url().max(2000),
  reason: z.enum(['state-change', 'progress', 'seek']),
});

export type PlaybackMessage = z.infer<typeof playbackMessageSchema>;

export const nowPlayingQuerySchema = z.object({
  type: z.literal('mnemo.nowPlaying'),
});

export const extensionMessageSchema = z.union([playbackMessageSchema, nowPlayingQuerySchema]);

export type ExtensionMessage = z.infer<typeof extensionMessageSchema>;
