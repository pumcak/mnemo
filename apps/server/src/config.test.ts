import { describe, expect, it } from 'vitest';
import { parseConfig } from './config';

describe('parseConfig', () => {
  it('falls back to the loopback interface and the default port', () => {
    const config = parseConfig({});

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(4870);
  });

  it('reads the port from the environment as a number', () => {
    const config = parseConfig({ MNEMO_PORT: '5123' });

    expect(config.port).toBe(5123);
  });

  it('accepts the other loopback spellings', () => {
    expect(parseConfig({ MNEMO_HOST: 'localhost' }).host).toBe('localhost');
    expect(parseConfig({ MNEMO_HOST: '::1' }).host).toBe('::1');
  });

  it('refuses to bind anywhere reachable from the network', () => {
    expect(() => parseConfig({ MNEMO_HOST: '0.0.0.0' })).toThrow();
    expect(() => parseConfig({ MNEMO_HOST: '192.168.1.20' })).toThrow();
  });

  it('refuses a privileged or out of range port', () => {
    expect(() => parseConfig({ MNEMO_PORT: '80' })).toThrow();
    expect(() => parseConfig({ MNEMO_PORT: '70000' })).toThrow();
  });

  it('refuses a port that is not a number', () => {
    expect(() => parseConfig({ MNEMO_PORT: 'eight' })).toThrow();
  });
});
