import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import type { HealthPayload } from './app';

describe('health endpoint', () => {
  it('reports that the service is up and how long it has been up', async () => {
    const response = await createApp().request('/health');

    expect(response.status).toBe(200);

    const payload = (await response.json()) as HealthPayload;

    expect(payload.status).toBe('ok');
    expect(payload.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('answers nothing else', async () => {
    const response = await createApp().request('/');

    expect(response.status).toBe(404);
  });
});
