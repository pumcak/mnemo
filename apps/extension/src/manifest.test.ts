import { describe, expect, it } from 'vitest';
import config from '../wxt.config';

/**
 * The manifest is a permission request, so it is worth a test rather than a
 * review. An extension that watches playback needs to read what a page already
 * exposes and nothing else: no tabs, no history, no access to any host but the
 * service on this machine.
 */
describe('the manifest we ask the browser for', () => {
  const manifest = config.manifest as {
    permissions?: string[];
    host_permissions?: string[];
    name?: string;
  };

  it('asks for storage and nothing more', () => {
    expect(manifest.permissions).toEqual(['storage']);
  });

  it('asks for no host beyond the loopback interface', () => {
    for (const pattern of manifest.host_permissions ?? []) {
      expect(pattern).toMatch(/^http:\/\/(127\.0\.0\.1|localhost)\//);
    }
  });

  it('never asks for the permissions that would turn it into a tracker', () => {
    const forbidden = ['tabs', 'history', 'webNavigation', 'cookies', 'bookmarks', '<all_urls>'];

    for (const permission of forbidden) {
      expect(manifest.permissions ?? []).not.toContain(permission);
      expect(manifest.host_permissions ?? []).not.toContain(permission);
    }
  });

  it('is named', () => {
    expect(manifest.name).toBe('Mnemo');
  });
});
