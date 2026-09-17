import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface RootManifest {
  engines?: { node?: string };
}

const manifestPath = fileURLToPath(new URL('../package.json', import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as RootManifest;

const declaredRange = manifest.engines?.node;

/**
 * Turns a dotted version into a single comparable number. Node never ships a
 * minor or patch above 999, so the weights below cannot collide.
 */
const toComparable = (version: string): number => {
  const parts = version.split('.').map((part) => Number.parseInt(part, 10));

  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) {
    throw new Error(`unsupported version string: ${version}`);
  }

  const [major = 0, minor = 0, patch = 0] = parts;

  return major * 1_000_000 + minor * 1_000 + patch;
};

describe('runtime environment', () => {
  it('declares a minimum node version in the root manifest', () => {
    expect(declaredRange).toMatch(/^>=\d+\.\d+\.\d+$/);
  });

  it('runs on a node version that satisfies the declared minimum', () => {
    if (declaredRange === undefined) {
      throw new Error('engines.node is missing from the root manifest');
    }

    const minimum = declaredRange.replace('>=', '');

    expect(toComparable(process.versions.node)).toBeGreaterThanOrEqual(toComparable(minimum));
  });
});
