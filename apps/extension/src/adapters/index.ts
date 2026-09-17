import { netflixAdapter } from './netflix';
import type { SiteAdapter } from './types';

/**
 * Site adapters, in priority order. Anything not listed here gets the generic
 * reading, which is the normal case rather than a failure.
 */
export const adapters: readonly SiteAdapter[] = [netflixAdapter];
