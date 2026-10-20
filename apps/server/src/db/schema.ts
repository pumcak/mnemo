import { devicePlatforms, playbackStates, sourceKinds } from '@mnemo/contracts';
import type { MediaHint, PlaybackState } from '@mnemo/contracts';
import { catalogueNames, workKinds } from '@mnemo/resolver';
import type { CatalogueName, ParsedTitle } from '@mnemo/resolver';
import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { reviewStatuses } from '../resolution/types';
import type { ResolutionState, ReviewCandidate } from '../resolution/types';

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
    /**
     * Where resolution stands for this session. Checked in code rather than by a
     * constraint: adding a table level check to an existing sqlite table means
     * rebuilding it, and this is the table every heartbeat points at.
     */
    resolutionState: text('resolution_state').$type<ResolutionState>().notNull().default('pending'),
    resolvedCatalogue: text('resolved_catalogue').$type<CatalogueName>(),
    resolvedExternalId: integer('resolved_external_id'),
    resolvedTitle: text('resolved_title'),
    resolutionScore: real('resolution_score'),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
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
    state: text('state').$type<PlaybackState>().notNull(),
    positionSeconds: real('position_seconds').notNull(),
    durationSeconds: real('duration_seconds'),
  },
  (table) => [
    index('heartbeats_session_observed').on(table.sessionId, table.observedAt),
    index('heartbeats_observed').on(table.observedAt),
    check('heartbeats_state_known', oneOf('state', playbackStates)),
  ],
);

/**
 * What somebody decided a title means, after the resolver got it wrong or was
 * not sure.
 *
 * Keyed on the normalised name the catalogues would be asked about and on the
 * kind of work, because "Dune" the film and "Dune" the series are two different
 * corrections. A correction is consulted before any catalogue is asked, so it is
 * also the cheapest resolution there is.
 */
export const aliases = sqliteTable(
  'aliases',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    normalizedTitle: text('normalized_title').notNull(),
    kind: text('kind').notNull(),
    catalogue: text('catalogue').notNull(),
    externalId: integer('external_id').notNull(),
    title: text('title').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    unique('aliases_title_kind').on(table.normalizedTitle, table.kind),
    check('aliases_kind_known', oneOf('kind', workKinds)),
    check('aliases_catalogue_known', oneOf('catalogue', catalogueNames)),
  ],
);

/**
 * Titles the resolver was not sure about, waiting for a person.
 *
 * One item per session: a title that keeps coming back while it plays updates
 * its item instead of filling the queue with copies. The candidates are stored
 * as they were scored, so the person decides on what the resolver saw rather
 * than on a fresh search that may answer differently.
 */
export const reviewItems = sqliteTable(
  'review_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => playbackSessions.id, { onDelete: 'cascade' }),
    rawTitle: text('raw_title').notNull(),
    parsed: text('parsed', { mode: 'json' }).$type<ParsedTitle>().notNull(),
    candidates: text('candidates', { mode: 'json' }).$type<ReviewCandidate[]>().notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    decidedAt: integer('decided_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    unique('review_items_session').on(table.sessionId),
    index('review_items_status').on(table.status, table.createdAt),
    check('review_items_status_known', oneOf('status', reviewStatuses)),
  ],
);
