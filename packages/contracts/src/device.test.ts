import { describe, expect, it } from 'vitest';
import { deviceSchema } from './device';

describe('deviceSchema', () => {
  it('accepts a device with a uuid and a known platform', () => {
    const parsed = deviceSchema.parse({
      id: '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11',
      name: 'desktop',
      platform: 'windows',
    });

    expect(parsed.platform).toBe('windows');
  });

  it('rejects an identifier that is not a uuid', () => {
    const result = deviceSchema.safeParse({
      id: 'desktop-1',
      name: 'desktop',
      platform: 'windows',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unknown platform', () => {
    const result = deviceSchema.safeParse({
      id: '6f2b1c4e-9a7d-4f3b-8c1e-2d5a7b9c0e11',
      name: 'phone',
      platform: 'android',
    });

    expect(result.success).toBe(false);
  });
});
