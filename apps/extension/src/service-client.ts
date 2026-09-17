import type { Heartbeat, PairResponse } from '@mnemo/contracts';
import { pairResponseSchema } from '@mnemo/contracts';
import type { DevicePlatform } from '@mnemo/contracts';

/**
 * What happened to one heartbeat, from the point of view of whoever has to
 * decide what to do next.
 *
 * The distinction that matters is between a refusal and a failure. A refused
 * heartbeat will be refused again, so keeping it would block everything behind
 * it forever. A failed one is worth another try.
 */
export type DeliveryOutcome = 'sent' | 'refused' | 'unpaired' | 'retry';

export interface ServiceClientOptions {
  serviceUrl: string;
  token: string;
  fetcher?: typeof fetch;
}

export interface ServiceClient {
  reachable: () => Promise<boolean>;
  pair: (name: string, platform: DevicePlatform) => Promise<PairResponse>;
  sendHeartbeat: (heartbeat: Heartbeat) => Promise<DeliveryOutcome>;
}

const outcomeFor = (status: number): DeliveryOutcome => {
  if (status >= 200 && status < 300) {
    return 'sent';
  }

  /**
   * The service says 401 when the token is wrong and 404 when it does not know
   * this device. Both mean the pairing is stale, which the extension has to fix
   * rather than retry.
   */
  if (status === 401 || status === 404) {
    return 'unpaired';
  }

  return status >= 400 && status < 500 ? 'refused' : 'retry';
};

export const createServiceClient = ({
  serviceUrl,
  token,
  fetcher = fetch,
}: ServiceClientOptions): ServiceClient => {
  const call = async (path: string, body?: unknown): Promise<Response> =>
    fetcher(new URL(path, serviceUrl).toString(), {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  return {
    reachable: async () => {
      try {
        return (await call('/health')).ok;
      } catch {
        return false;
      }
    },
    pair: async (name, platform) => {
      const response = await call('/pair', { name, platform });

      if (!response.ok) {
        throw new Error(`pairing was refused with status ${String(response.status)}`);
      }

      return pairResponseSchema.parse(await response.json());
    },
    sendHeartbeat: async (heartbeat) => {
      try {
        return outcomeFor((await call('/ingest/heartbeat', heartbeat)).status);
      } catch {
        // The service is not running, or the machine just woke up. Worth
        // another try rather than a lost observation.
        return 'retry';
      }
    },
  };
};
