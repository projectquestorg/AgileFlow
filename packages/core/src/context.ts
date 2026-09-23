import os from 'node:os';
import path from 'node:path';

/**
 * Everything that differs between machines, users, and tests.
 *
 * Commands receive a Context instead of reading `process` directly so the
 * same code can run against temporary home/config/cache directories.
 */
export interface Context {
  /** Directory the command was invoked from. */
  cwd: string;
  /** User home directory (global skills live under `<homeDir>/.agents/skills`). */
  homeDir: string;
  /** AgileFlow user configuration directory (config.yaml, global lock, state). */
  configDir: string;
  /** AgileFlow cache directory (package cache, per-project transient state). */
  cacheDir: string;
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
}

export interface ContextOverrides {
  cwd?: string;
  homeDir?: string;
  configDir?: string;
  cacheDir?: string;
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
}

/**
 * Platform-native config directory:
 * - macOS/Linux: `$XDG_CONFIG_HOME/agileflow` or `~/.config/agileflow`
 * - Windows: `%APPDATA%\AgileFlow`
 */
export function defaultConfigDir(
  homeDir: string,
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
): string {
  if (env.AGILEFLOW_CONFIG_DIR) return path.resolve(env.AGILEFLOW_CONFIG_DIR);
  if (platform === 'win32') {
    const appData = env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
    return path.join(appData, 'AgileFlow');
  }
  const xdg = env.XDG_CONFIG_HOME;
  return path.join(xdg && path.isAbsolute(xdg) ? xdg : path.join(homeDir, '.config'), 'agileflow');
}

/**
 * Platform-native cache directory:
 * - macOS/Linux: `$XDG_CACHE_HOME/agileflow` or `~/.cache/agileflow`
 * - Windows: `%LOCALAPPDATA%\AgileFlow\cache`
 */
export function defaultCacheDir(
  homeDir: string,
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
): string {
  if (env.AGILEFLOW_CACHE_DIR) return path.resolve(env.AGILEFLOW_CACHE_DIR);
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
    return path.join(local, 'AgileFlow', 'cache');
  }
  const xdg = env.XDG_CACHE_HOME;
  return path.join(xdg && path.isAbsolute(xdg) ? xdg : path.join(homeDir, '.cache'), 'agileflow');
}

export function createContext(overrides: ContextOverrides = {}): Context {
  const env = overrides.env ?? process.env;
  const platform = overrides.platform ?? process.platform;
  const homeDir = overrides.homeDir ?? env.AGILEFLOW_HOME ?? os.homedir();
  return {
    cwd: overrides.cwd ?? process.cwd(),
    homeDir,
    configDir: overrides.configDir ?? defaultConfigDir(homeDir, env, platform),
    cacheDir: overrides.cacheDir ?? defaultCacheDir(homeDir, env, platform),
    env,
    platform,
  };
}
