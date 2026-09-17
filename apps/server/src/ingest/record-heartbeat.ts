import type { Heartbeat } from '@mnemo/contracts';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { DatabaseHandle } from '../db/client';
import { devices, heartbeats, playbackSessions, sources } from '../db/schema';

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
 */
export const recordHeartbeat = (
  handle: DatabaseHandle,
  heartbeat: Heartbeat,
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

    const open = tx
      .select({ id: playbackSessions.id })
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

    if (open !== undefined) {
      tx.update(playbackSessions)
        .set({
          lastSeenAt: observedAt,
          lastPositionSeconds: heartbeat.positionSeconds,
          durationSeconds: heartbeat.durationSeconds ?? null,
        })
        .where(eq(playbackSessions.id, sessionId))
        .run();
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
