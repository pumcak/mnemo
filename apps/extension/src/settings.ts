import { z } from 'zod';
import type { KeyValueStore } from './storage';

export const settingsKey = 'mnemo.settings';

/**
 * What the extension remembers between sessions.
 *
 * `paused` and `blockedDomains` exist because a viewing history is not
 * something to collect by accident: there has to be a switch that stops
 * everything, and a way to say that one site is nobody else business.
 */
export const settingsSchema = z.object({
  serviceUrl: z.url().default('http://127.0.0.1:4870'),
  paused: z.boolean().default(false),
  blockedDomains: z.array(z.string().trim().min(1)).default([]),
  /**
   * Filled in by pairing. Until both are there the extension observes nothing
   * worth sending, because the service would refuse it anyway.
   */
  token: z.string().min(1).max(200).optional(),
  deviceId: z.uuid().optional(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const defaultSettings = (): Settings => settingsSchema.parse({});

const fieldOr = <T>(schema: z.ZodType<T>, value: unknown, fallback: T): T => {
  const parsed = schema.safeParse(value);

  return parsed.success ? parsed.data : fallback;
};

/**
 * Reads the settings, field by field, falling back to the default for whatever
 * is missing or unusable.
 *
 * Going field by field matters: one unreadable value must not cost the others.
 * Somebody who blocked a domain should not silently start being recorded on it
 * because an unrelated setting got corrupted.
 */
export const loadSettings = async (store: KeyValueStore): Promise<Settings> => {
  const stored = await store.get(settingsKey);
  const direct = settingsSchema.safeParse(stored ?? {});

  if (direct.success) {
    return direct.data;
  }

  const record = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<
    string,
    unknown
  >;
  const base = defaultSettings();

  const token = fieldOr(settingsSchema.shape.token, record.token, undefined);
  const deviceId = fieldOr(settingsSchema.shape.deviceId, record.deviceId, undefined);

  return {
    serviceUrl: fieldOr(settingsSchema.shape.serviceUrl, record.serviceUrl, base.serviceUrl),
    paused: fieldOr(settingsSchema.shape.paused, record.paused, base.paused),
    blockedDomains: fieldOr(
      settingsSchema.shape.blockedDomains,
      record.blockedDomains,
      base.blockedDomains,
    ),
    ...(token === undefined ? {} : { token }),
    ...(deviceId === undefined ? {} : { deviceId }),
  };
};

export const saveSettings = async (store: KeyValueStore, settings: Settings): Promise<void> => {
  await store.set(settingsKey, settingsSchema.parse(settings));
};

/** True once pairing has given the extension everything it needs to report. */
export const isPaired = (
  settings: Settings,
): settings is Settings & { token: string; deviceId: string } =>
  settings.token !== undefined && settings.deviceId !== undefined;

/** True when the extension should stay out of the way for this hostname. */
export const isBlocked = (settings: Settings, hostname: string): boolean =>
  settings.blockedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
