import type { Heartbeat } from '@mnemo/contracts';
import { describe, expect, it } from 'vitest';
import { queueKey, readStoredQueue, writeStoredQueue } from './queue-storage';
import { createMemoryStore } from './storage';

const heartbeat = (position: number): Heartbeat => ({
  deviceId: '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11',
  source: { kind: 'browser', app: 'netflix.com' },
  rawTitle: 'Arcane S01E01',
  state: 'playing',
  positionSeconds: position,
  observedAt: '2026-09-17T22:00:00.000Z',
});

describe('the queue that outlives the worker', () => {
  it('reads back what it wrote', async () => {
    const store = createMemoryStore();

    await writeStoredQueue(store, [heartbeat(1), heartbeat(2)]);

    expect(await readStoredQueue(store)).toHaveLength(2);
  });

  it('starts empty when nothing was ever stored', async () => {
    expect(await readStoredQueue(createMemoryStore())).toEqual([]);
  });

  it('starts empty rather than crashing on storage that no longer parses', async () => {
    const store = createMemoryStore({ [queueKey]: [{ nothing: 'like a heartbeat' }] });

    expect(await readStoredQueue(store)).toEqual([]);
  });

  it('starts empty on storage of the wrong type entirely', async () => {
    const store = createMemoryStore({ [queueKey]: 'corrupted' });

    expect(await readStoredQueue(store)).toEqual([]);
  });

  it('keeps observations in the order they were made', async () => {
    const store = createMemoryStore();

    await writeStoredQueue(store, [heartbeat(1), heartbeat(2), heartbeat(3)]);

    expect((await readStoredQueue(store)).map((item) => item.positionSeconds)).toEqual([1, 2, 3]);
  });
});
