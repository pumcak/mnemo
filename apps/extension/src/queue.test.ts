import type { Heartbeat } from '@mnemo/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createHeartbeatQueue } from './queue';
import type { DeliveryOutcome } from './service-client';

const heartbeat = (position: number): Heartbeat => ({
  deviceId: '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11',
  source: { kind: 'browser', app: 'netflix.com' },
  rawTitle: 'Arcane S01E01',
  state: 'playing',
  positionSeconds: position,
  observedAt: new Date(Date.parse('2026-09-17T22:00:00.000Z') + position * 1000).toISOString(),
});

describe('createHeartbeatQueue', () => {
  it('sends what it holds, oldest first', async () => {
    const sent: number[] = [];
    const queue = createHeartbeatQueue({
      send: (item) => {
        sent.push(item.positionSeconds);

        return Promise.resolve<DeliveryOutcome>('sent');
      },
    });

    queue.enqueue(heartbeat(1));
    queue.enqueue(heartbeat(2));
    queue.enqueue(heartbeat(3));
    await queue.flush();

    expect(sent).toEqual([1, 2, 3]);
    expect(queue.pending()).toEqual([]);
  });

  it('keeps an observation the service could not take', async () => {
    const queue = createHeartbeatQueue({ send: () => Promise.resolve<DeliveryOutcome>('retry') });

    queue.enqueue(heartbeat(1));
    await queue.flush();

    expect(queue.pending()).toHaveLength(1);
  });

  it('stops at the first failure instead of reordering what follows', async () => {
    const sent: number[] = [];
    const queue = createHeartbeatQueue({
      send: (item) => {
        if (item.positionSeconds === 2) {
          return Promise.resolve<DeliveryOutcome>('retry');
        }

        sent.push(item.positionSeconds);

        return Promise.resolve<DeliveryOutcome>('sent');
      },
    });

    queue.enqueue(heartbeat(1));
    queue.enqueue(heartbeat(2));
    queue.enqueue(heartbeat(3));
    await queue.flush();

    expect(sent).toEqual([1]);
    expect(queue.pending().map((item) => item.positionSeconds)).toEqual([2, 3]);
  });

  it('throws away an observation the service refused, since it will refuse it again', async () => {
    const queue = createHeartbeatQueue({ send: () => Promise.resolve<DeliveryOutcome>('refused') });

    queue.enqueue(heartbeat(1));
    await queue.flush();

    expect(queue.pending()).toEqual([]);
  });

  it('asks to be paired again and keeps what it holds', async () => {
    const onUnpaired = vi.fn();
    const queue = createHeartbeatQueue({
      send: () => Promise.resolve<DeliveryOutcome>('unpaired'),
      onUnpaired,
    });

    queue.enqueue(heartbeat(1));
    await queue.flush();

    expect(onUnpaired).toHaveBeenCalledOnce();
    expect(queue.pending()).toHaveLength(1);
  });

  it('drops the oldest rather than growing without a bound', async () => {
    const queue = createHeartbeatQueue({
      send: () => Promise.resolve<DeliveryOutcome>('retry'),
      maxSize: 3,
    });

    for (const position of [1, 2, 3, 4, 5]) {
      queue.enqueue(heartbeat(position));
    }

    await queue.flush();

    expect(queue.pending().map((item) => item.positionSeconds)).toEqual([3, 4, 5]);
    expect(queue.dropped()).toBe(2);
  });

  it('does not start a second flush while one is running', async () => {
    let inFlight = 0;
    let concurrent = 0;
    const queue = createHeartbeatQueue({
      send: async () => {
        inFlight += 1;
        concurrent = Math.max(concurrent, inFlight);
        await Promise.resolve();
        inFlight -= 1;

        return 'sent';
      },
    });

    queue.enqueue(heartbeat(1));
    queue.enqueue(heartbeat(2));

    await Promise.all([queue.flush(), queue.flush()]);

    expect(concurrent).toBe(1);
    expect(queue.pending()).toEqual([]);
  });
});
