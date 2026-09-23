import { z } from 'zod';

/**
 * What a raw title turned out to be.
 *
 * `unknown` is a real answer, not a failure to report. A reaction video, a live
 * stream or a page title with nothing in it must end up here rather than being
 * forced onto some work that happens to score highest.
 */
export const titleKinds = ['movie', 'episode', 'unknown'] as const;

export const titleKindSchema = z.enum(titleKinds);

export const parsedTitleSchema = z.object({
  kind: titleKindSchema,
  /** The cleaned title, as close to what a catalogue would call it as parsing can get. */
  title: z.string(),
  series: z.string().optional(),
  season: z.number().int().positive().optional(),
  episode: z.number().int().positive().optional(),
  year: z.number().int().min(1888).max(2200).optional(),
  /** Everything taken out of the raw title, in the order it was removed. */
  removed: z.array(z.string()),
});

export type TitleKind = z.infer<typeof titleKindSchema>;
export type ParsedTitle = z.infer<typeof parsedTitleSchema>;
