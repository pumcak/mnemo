import { homedir } from 'node:os';
import { join } from 'node:path';

export interface DefaultPathInput {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  home?: string;
}

/**
 * Where the database lives when nothing says otherwise: the per user data
 * directory of the platform, never the repository and never the current working
 * directory, so running the service from anywhere finds the same history.
 */
export const resolveDefaultDatabasePath = ({ platform, env, home }: DefaultPathInput): string => {
  const base = home ?? homedir();

  if (platform === 'win32') {
    return join(env.LOCALAPPDATA ?? join(base, 'AppData', 'Local'), 'mnemo', 'mnemo.db');
  }

  if (platform === 'darwin') {
    return join(base, 'Library', 'Application Support', 'mnemo', 'mnemo.db');
  }

  return join(env.XDG_DATA_HOME ?? join(base, '.local', 'share'), 'mnemo', 'mnemo.db');
};
