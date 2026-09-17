import { describe, expect, it } from 'vitest';
import config from '../wxt.config';

interface BuiltManifest {
  permissions?: string[];
  host_permissions?: string[];
  name?: string;
  browser_specific_settings?: { gecko?: { id?: string } };
}

/**
 * The manifest is a permission request, so it is worth a test rather than a
 * review. An extension that watches playback needs to read what a page already
 * exposes and nothing else: no tabs, no history, no access to any host but the
 * service on this machine.
 */
const manifestFor = (browser: string): BuiltManifest => {
  const declared = config.manifest;

  if (typeof declared !== 'function') {
    throw new Error('the manifest should be built per browser');
  }

  return declared({
    browser,
    manifestVersion: 3,
    mode: 'production',
    command: 'build',
  }) as BuiltManifest;
};

describe.each(['chrome', 'firefox'])('the manifest we ask %s for', (browser) => {
  const manifest = manifestFor(browser);

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

describe('the identifier Firefox needs', () => {
  it('is sent to Firefox, so an install can be updated in place', () => {
    expect(manifestFor('firefox').browser_specific_settings?.gecko?.id).toBe(
      'mnemo@pumcak.github.io',
    );
  });

  it('is not sent to Chrome, which has no use for it', () => {
    expect(manifestFor('chrome').browser_specific_settings).toBeUndefined();
  });
});
