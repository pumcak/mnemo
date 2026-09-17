import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const tokenBytes = 32;

/**
 * Reads the pairing token, creating it on first run.
 *
 * The token lives in a file because that is the one thing a web page cannot
 * reach. The service listens on loopback, so any page open in the browser can
 * send it requests, but none of them can read the disk. Holding the token is
 * therefore proof of being the person at the keyboard.
 *
 * The file is written with owner only permissions. Windows ignores that mode, so
 * on Windows the protection is the user profile directory it sits in, not the
 * bits.
 */
export const loadOrCreateToken = (path: string): string => {
  try {
    const existing = readFileSync(path, 'utf8').trim();

    if (existing.length > 0) {
      return existing;
    }
  } catch {
    // Missing or unreadable means first run, which is handled below.
  }

  const token = randomBytes(tokenBytes).toString('base64url');

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${token}\n`, { mode: 0o600 });

  return token;
};

/**
 * Compares in constant time, so a caller cannot learn the token one character
 * at a time by measuring how long a rejection takes.
 */
export const tokenMatches = (expected: string, provided: string): boolean => {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
};
