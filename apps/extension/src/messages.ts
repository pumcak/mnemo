import { mediaHintSchema, playbackStateSchema } from '@mnemo/contracts';
import { z } from 'zod';

export const titleSourceSchema = z.enum([
  'site-adapter',
  'media-session',
  'json-ld',
  'og-title',
  'document-title',
]);

/** What a page says it is about, whether or not a video is playing in it. */
const mediaDescription = {
  rawTitle: z.string().trim().min(1).max(500),
  app: z.string().trim().min(1).max(200),
  hint: mediaHintSchema.optional(),
  titleSource: titleSourceSchema,
  url: z.url().max(2000),
};

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
  reason: z.enum(['state-change', 'progress', 'seek']),
  ...mediaDescription,
});

/**
 * Sent by the top frame only.
 *
 * An embedded player usually lives in a frame served by another domain. That
 * frame can see the video but not what it is: its own title is the player name
 * or nothing, and the page around it is cross origin, so it cannot be read from
 * inside. The top frame therefore says what the page is about, and the
 * background joins the two by tab.
 */
export const pageContextMessageSchema = z.object({
  type: z.literal('mnemo.pageContext'),
  ...mediaDescription,
});

export const nowPlayingQuerySchema = z.object({
  type: z.literal('mnemo.nowPlaying'),
});

export const extensionMessageSchema = z.union([
  playbackMessageSchema,
  pageContextMessageSchema,
  nowPlayingQuerySchema,
]);

export type PlaybackMessage = z.infer<typeof playbackMessageSchema>;
export type PageContextMessage = z.infer<typeof pageContextMessageSchema>;
export type ExtensionMessage = z.infer<typeof extensionMessageSchema>;
