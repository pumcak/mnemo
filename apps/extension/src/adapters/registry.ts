import type { SiteAdapter, AdapterContext } from './types';
import type { ExtractedMedia } from '../title/extract';
import { extractMedia } from '../title/extract';

export interface ResolvedMedia extends ExtractedMedia {
  /** The application name the service records, such as netflix.com. */
  app: string;
  /** Which adapter produced this, or "generic" when none matched. */
  adapter: string;
}

/**
 * The name the service will store for this capture source. The leading www is
 * dropped so netflix.com and www.netflix.com are one source rather than two.
 */
export const appNameFor = (url: URL): string => url.hostname.replace(/^www\./, '');

export interface AdapterRegistry {
  find: (url: URL) => SiteAdapter | undefined;
  resolve: (context: AdapterContext) => ResolvedMedia | undefined;
}

export const createAdapterRegistry = (adapters: readonly SiteAdapter[]): AdapterRegistry => {
  const find = (url: URL): SiteAdapter | undefined =>
    adapters.find((adapter) => adapter.matches(url));

  return {
    find,
    resolve: (context) => {
      const adapter = find(context.url);
      const app = appNameFor(context.url);

      if (adapter !== undefined) {
        const extracted = adapter.extract(context);

        if (extracted !== undefined) {
          return { ...extracted, app, adapter: adapter.name };
        }
      }

      /**
       * A site adapter that finds nothing is not a reason to report nothing: a
       * player redesign should degrade to the blunt reading rather than make the
       * site invisible.
       */
      const fallback = extractMedia(context.doc, context.session);

      return fallback === undefined ? undefined : { ...fallback, app, adapter: 'generic' };
    },
  };
};
