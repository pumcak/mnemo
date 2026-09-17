// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { appNameFor, createAdapterRegistry } from './registry';
import type { SiteAdapter } from './types';

const adapterFor = (host: string, title: string | undefined): SiteAdapter => ({
  name: host,
  matches: (url) => url.hostname.endsWith(host),
  extract: () => (title === undefined ? undefined : { rawTitle: title, source: 'json-ld' }),
});

describe('appNameFor', () => {
  it('drops the leading www so one site is one source', () => {
    expect(appNameFor(new URL('https://www.netflix.com/watch/1'))).toBe('netflix.com');
    expect(appNameFor(new URL('https://netflix.com/watch/1'))).toBe('netflix.com');
  });

  it('keeps a subdomain that is not www', () => {
    expect(appNameFor(new URL('https://beta.crunchyroll.com/x'))).toBe('beta.crunchyroll.com');
  });
});

describe('createAdapterRegistry', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.title = '';
  });

  const context = (href: string) => ({ doc: document, url: new URL(href) });

  it('uses the adapter that matches the site', () => {
    const registry = createAdapterRegistry([
      adapterFor('netflix.com', 'Welcome to the Playground'),
    ]);

    expect(registry.resolve(context('https://www.netflix.com/watch/1'))).toEqual({
      rawTitle: 'Welcome to the Playground',
      source: 'json-ld',
      app: 'netflix.com',
      adapter: 'netflix.com',
    });
  });

  it('keeps the first adapter that matches, so order is the priority', () => {
    const registry = createAdapterRegistry([
      adapterFor('netflix.com', 'first'),
      adapterFor('netflix.com', 'second'),
    ]);

    expect(registry.resolve(context('https://netflix.com/watch/1'))?.rawTitle).toBe('first');
  });

  it('reads the page the blunt way when no adapter knows the site', () => {
    document.title = 'Some Player | randomstream.example';

    const registry = createAdapterRegistry([adapterFor('netflix.com', 'not used here')]);

    expect(registry.resolve(context('https://randomstream.example/watch'))).toEqual({
      rawTitle: 'Some Player | randomstream.example',
      source: 'document-title',
      app: 'randomstream.example',
      adapter: 'generic',
    });
  });

  it('degrades to the blunt reading when a site adapter finds nothing', () => {
    document.title = 'Watch Arcane | Netflix';

    const registry = createAdapterRegistry([adapterFor('netflix.com', undefined)]);

    expect(registry.resolve(context('https://www.netflix.com/watch/1'))).toMatchObject({
      rawTitle: 'Watch Arcane | Netflix',
      adapter: 'generic',
    });
  });

  it('reports nothing when the page says nothing at all', () => {
    const registry = createAdapterRegistry([]);

    expect(registry.resolve(context('https://empty.example/'))).toBeUndefined();
  });

  it('can be asked which adapter handles a site', () => {
    const registry = createAdapterRegistry([adapterFor('netflix.com', 'x')]);

    expect(registry.find(new URL('https://www.netflix.com/watch/1'))?.name).toBe('netflix.com');
    expect(registry.find(new URL('https://example.com/'))).toBeUndefined();
  });
});
