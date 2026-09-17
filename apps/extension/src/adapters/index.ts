import type { SiteAdapter } from './types';

/**
 * Site adapters, in priority order. Empty for now: the registry falls back to
 * reading the page the generic way, which is what every site gets until one
 * earns its own adapter.
 */
export const adapters: readonly SiteAdapter[] = [];
