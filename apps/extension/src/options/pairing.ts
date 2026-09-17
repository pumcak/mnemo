import type { DevicePlatform } from '@mnemo/contracts';
import { createServiceClient } from '../service-client';
import type { ServiceClient } from '../service-client';
import { loadSettings, saveSettings } from '../settings';
import type { KeyValueStore } from '../storage';

export type PairingResult = 'paired' | 'unreachable' | 'refused' | 'invalid';

export interface PairingRequest {
  store: KeyValueStore;
  serviceUrl: string;
  token: string;
  name: string;
  platform: DevicePlatform;
  clientFactory?: (serviceUrl: string, token: string) => ServiceClient;
}

/**
 * Reads the hostname the running browser says it is on. Chosen from the user
 * agent rather than asked of the person, because a wrong answer here would
 * label their history with the wrong machine.
 */
export const detectPlatform = (userAgent: string): DevicePlatform => {
  if (/windows/i.test(userAgent)) {
    return 'windows';
  }

  return /mac os|macintosh|iphone|ipad/i.test(userAgent) ? 'macos' : 'linux';
};

/**
 * Pairs this browser with the service and remembers the result.
 *
 * Unreachable and refused are told apart on purpose: one means the service is
 * not running, the other means the token is wrong, and somebody staring at the
 * options page needs to know which.
 */
export const pairDevice = async ({
  store,
  serviceUrl,
  token,
  name,
  platform,
  clientFactory = (url, bearer) => createServiceClient({ serviceUrl: url, token: bearer }),
}: PairingRequest): Promise<PairingResult> => {
  if (token.trim().length === 0 || name.trim().length === 0) {
    return 'invalid';
  }

  const client = clientFactory(serviceUrl, token.trim());

  if (!(await client.reachable())) {
    return 'unreachable';
  }

  try {
    const paired = await client.pair(name.trim(), platform);
    const settings = await loadSettings(store);

    await saveSettings(store, {
      ...settings,
      serviceUrl,
      token: token.trim(),
      deviceId: paired.deviceId,
    });

    return 'paired';
  } catch {
    return 'refused';
  }
};
