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

  it('logs at info level unless told otherwise', () => {
    expect(parseConfig({}).logLevel).toBe('info');
    expect(parseConfig({ MNEMO_LOG_LEVEL: 'debug' }).logLevel).toBe('debug');
  });

  it('refuses a log level pino would not understand', () => {
    expect(() => parseConfig({ MNEMO_LOG_LEVEL: 'loud' })).toThrow();
  });

  it('places the database in the per user data directory of the platform', () => {
    const windows = parseConfig({ LOCALAPPDATA: 'C:\\Users\\someone\\AppData\\Local' }, 'win32');
    const linux = parseConfig({ XDG_DATA_HOME: '/data' }, 'linux');

    expect(windows.databasePath).toContain('AppData');
    expect(linux.databasePath).toContain('data');
    expect(windows.databasePath.endsWith('mnemo.db')).toBe(true);
  });

  it('keeps raw heartbeats for a month unless told otherwise', () => {
    expect(parseConfig({}).heartbeatRetentionDays).toBe(30);
    expect(parseConfig({ MNEMO_HEARTBEAT_RETENTION_DAYS: '7' }).heartbeatRetentionDays).toBe(7);
  });

  it('refuses a retention window of zero days', () => {
    expect(() => parseConfig({ MNEMO_HEARTBEAT_RETENTION_DAYS: '0' })).toThrow();
  });

  it('lets the environment point the database somewhere else', () => {
    const config = parseConfig({ MNEMO_DB_PATH: '/tmp/somewhere/else.db' }, 'linux');

    expect(config.databasePath).toBe('/tmp/somewhere/else.db');
  });
});
