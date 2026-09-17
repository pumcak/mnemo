import { devicePlatforms, playbackStates, sourceKinds } from '@mnemo/contracts';
import type { MediaHint } from '@mnemo/contracts';
import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

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

/**
 * A stretch of playback of one thing, assembled from heartbeats. The raw title
 * is kept as reported, because resolution happens later and has to be redoable
 * when the resolver improves.
 *
 * `watchedSeconds` accumulates time actually spent playing, which is what
 * decides whether a session becomes a view. Position alone would not: someone
 * who drags the slider to the end has not watched anything.
 */
export const playbackSessions = sqliteTable(
  'playback_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    deviceId: text('device_id')
      .notNull()
      .references(() => devices.id),
    sourceId: integer('source_id')
      .notNull()
      .references(() => sources.id),
    rawTitle: text('raw_title').notNull(),
    url: text('url'),
    hint: text('hint', { mode: 'json' }).$type<MediaHint>(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
    lastPositionSeconds: real('last_position_seconds').notNull(),
    durationSeconds: real('duration_seconds'),
    watchedSeconds: real('watched_seconds').notNull().default(0),
    closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('playback_sessions_device_last_seen').on(table.deviceId, table.lastSeenAt),
    index('playback_sessions_open').on(table.closedAt),
  ],
);

/**
 * The raw observations. This is the table that grows: one row every few seconds
 * of playback, which is why it gets pruned rather than kept forever.
 *
 * Two indexes, one per reader: the session assembler walks a session in order,
 * and the pruner sweeps by age.
 */
export const heartbeats = sqliteTable(
  'heartbeats',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => playbackSessions.id, { onDelete: 'cascade' }),
    observedAt: integer('observed_at', { mode: 'timestamp_ms' }).notNull(),
    state: text('state').notNull(),
    positionSeconds: real('position_seconds').notNull(),
    durationSeconds: real('duration_seconds'),
  },
  (table) => [
    index('heartbeats_session_observed').on(table.sessionId, table.observedAt),
    index('heartbeats_observed').on(table.observedAt),
    check('heartbeats_state_known', oneOf('state', playbackStates)),
  ],
);
