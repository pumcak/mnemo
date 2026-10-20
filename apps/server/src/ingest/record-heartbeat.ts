import type { Heartbeat } from '@mnemo/contracts';
import { and, desc, eq, isNull, lte, sql } from 'drizzle-orm';
import type { DatabaseHandle } from '../db/client';
import { devices, heartbeats, playbackSessions, sources } from '../db/schema';
import { continuesSession, defaultSessionGapMs } from '../sessions/assembly';
import { playedBetween } from '../sessions/progress';

/**
 * Raised when a heartbeat names a device nobody registered. Devices carry a
 * name and a platform that a heartbeat does not, so inventing a row here would
 * mean inventing that data. Pairing is what registers a device.
 */
export class UnknownDeviceError extends Error {
  constructor(readonly deviceId: string) {
    super(`unknown device ${deviceId}`);
    this.name = 'UnknownDeviceError';
  }
}

export interface RecordOptions {
  /** How long a session may stay silent and still be continued. */
  gapMs?: number;
}

export interface RecordedHeartbeat {
  sessionId: number;
  heartbeatId: number;
}

/**
 * Stores one observation, attaching it to the session it continues.
 *
 * Sessions are matched on the raw title, not on a resolved work: resolution
 * happens later and must not be on the path of an ingest that runs every few
 * seconds. Everything happens in one transaction, so a heartbeat never lands
 * without the session it belongs to.
 *
 * An open session silent for longer than the gap is closed where it stopped and
 * a new one begins, and an `ended` observation closes its session right away,
 * so the next play of the same title starts a sitting of its own.
 */
export const recordHeartbeat = (
  handle: DatabaseHandle,
  heartbeat: Heartbeat,
  { gapMs = defaultSessionGapMs }: RecordOptions = {},
): RecordedHeartbeat => {
  const observedAt = new Date(heartbeat.observedAt);

  return handle.db.transaction((tx): RecordedHeartbeat => {
    const device = tx.select().from(devices).where(eq(devices.id, heartbeat.deviceId)).get();

    if (device === undefined) {
      throw new UnknownDeviceError(heartbeat.deviceId);
    }

    tx.update(devices).set({ lastSeenAt: observedAt }).where(eq(devices.id, device.id)).run();

    tx.insert(sources)
      .values({ kind: heartbeat.source.kind, app: heartbeat.source.app, createdAt: observedAt })
      .onConflictDoNothing()
      .run();

    const source = tx
      .select({ id: sources.id })
      .from(sources)
      .where(and(eq(sources.kind, heartbeat.source.kind), eq(sources.app, heartbeat.source.app)))
      .get();

    if (source === undefined) {
      throw new Error('source row disappeared inside the ingest transaction');
    }

    const latest = tx
      .select({ id: playbackSessions.id, lastSeenAt: playbackSessions.lastSeenAt })
      .from(playbackSessions)
      .where(
        and(
          eq(playbackSessions.deviceId, device.id),
          eq(playbackSessions.sourceId, source.id),
          eq(playbackSessions.rawTitle, heartbeat.rawTitle),
          isNull(playbackSessions.closedAt),
        ),
      )
      .orderBy(desc(playbackSessions.lastSeenAt))
      .get();

    const open =
      latest !== undefined && continuesSession(latest.lastSeenAt, observedAt, gapMs)
        ? latest
        : undefined;

    if (latest !== undefined && open === undefined) {
      tx.update(playbackSessions)
        .set({ closedAt: latest.lastSeenAt })
        .where(eq(playbackSessions.id, latest.id))
        .run();
    }

    // A new title on a source that was playing something else is autoplay moving
    // to the next episode: the previous one ends where it was last seen, instead
    // of staying open until the idle sweep notices.
    if (open === undefined) {
      tx.update(playbackSessions)
        .set({ closedAt: sql`${playbackSessions.lastSeenAt}` })
        .where(
          and(
            eq(playbackSessions.deviceId, device.id),
            eq(playbackSessions.sourceId, source.id),
            isNull(playbackSessions.closedAt),
            lte(playbackSessions.lastSeenAt, observedAt),
          ),
        )
        .run();
    }

    const sessionId =
      open?.id ??
      tx
        .insert(playbackSessions)
        .values({
          deviceId: device.id,
          sourceId: source.id,
          rawTitle: heartbeat.rawTitle,
          url: heartbeat.url ?? null,
          hint: heartbeat.hint ?? null,
          startedAt: observedAt,
          lastSeenAt: observedAt,
          lastPositionSeconds: heartbeat.positionSeconds,
          durationSeconds: heartbeat.durationSeconds ?? null,
        })
        .returning({ id: playbackSessions.id })
        .get().id;

    // A late observation is still stored, but it must not move the session back
    // to a position and a time it has already left.
    if (open !== undefined && observedAt >= open.lastSeenAt) {
      const previous = tx
        .select({ observedAt: heartbeats.observedAt, state: heartbeats.state })
        .from(heartbeats)
        .where(eq(heartbeats.sessionId, sessionId))
        .orderBy(desc(heartbeats.observedAt), desc(heartbeats.id))
        .get();
      const played =
        previous === undefined
          ? 0
          : playedBetween(previous, { observedAt, state: heartbeat.state });

      tx.update(playbackSessions)
        .set({
          watchedSeconds: sql`${playbackSessions.watchedSeconds} + ${played}`,
          lastSeenAt: observedAt,
          lastPositionSeconds: heartbeat.positionSeconds,
          durationSeconds: heartbeat.durationSeconds ?? null,
        })
        .where(eq(playbackSessions.id, sessionId))
        .run();
    }

    if (heartbeat.state === 'ended') {
      const closedAt =
        open !== undefined && open.lastSeenAt > observedAt ? open.lastSeenAt : observedAt;

      tx.update(playbackSessions).set({ closedAt }).where(eq(playbackSessions.id, sessionId)).run();
    }

    const stored = tx
      .insert(heartbeats)
      .values({
        sessionId,
        observedAt,
        state: heartbeat.state,
        positionSeconds: heartbeat.positionSeconds,
        durationSeconds: heartbeat.durationSeconds ?? null,
      })
      .returning({ id: heartbeats.id })
      .get();

    return { sessionId, heartbeatId: stored.id };
  });
};
