import type { ExtractedMedia, SessionMetadata } from '../title/extract';

export interface AdapterContext {
  doc: Document;
  url: URL;
  session?: SessionMetadata | null;
}

/**
 * What one site knows about itself that the generic reader cannot guess.
 *
 * Adapters exist because the generic reader is honest but blunt: it will happily
 * report "Watch Arcane | Netflix" as a title. A site adapter knows where that
 * site puts the episode name, and nothing else about it.
 */
export interface SiteAdapter {
  /** Used in logs and in the app name reported to the service. */
  name: string;
  matches: (url: URL) => boolean;
  extract: (context: AdapterContext) => ExtractedMedia | undefined;
}
