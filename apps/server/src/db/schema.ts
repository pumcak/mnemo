import { devicePlatforms, sourceKinds } from '@mnemo/contracts';
import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

/**
 * Builds a check constraint from the values the contracts package already
 * declares, so the database and the schemas the capture sources validate
 * against cannot drift apart.
 */
const oneOf = (column: string, values: readonly string[]): ReturnType<typeof sql> =>
  sql.raw(`${column} in (${values.map((value) => `'${value}'`).join(', ')})`);

export const devices = sqliteTable(
  'devices',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    platform: text('platform').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
  },
  () => [check('devices_platform_known', oneOf('platform', devicePlatforms))],
);

/**
 * One row per capture path actually observed, such as the browser on
 * netflix.com or the system media session reporting vlc. Heartbeats will point
 * here instead of repeating the pair on every row.
 */
export const sources = sqliteTable(
  'sources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind').notNull(),
    app: text('app').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    unique('sources_kind_app').on(table.kind, table.app),
    check('sources_kind_known', oneOf('kind', sourceKinds)),
  ],
);
