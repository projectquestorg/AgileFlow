import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Isolated environment for provider runs and the judge: a throwaway HOME
 * with its own XDG and AgileFlow directories, so personal skills, plugins,
 * instructions, and settings (~/.claude, ~/.agents/skills, ~/.codex, ...) never
 * reach an eval. Only each provider's known login files are copied in; API key
 * environment variables pass through unchanged.
 *
 * Providers refresh OAuth tokens during a run. A refreshed credential file is
 * written back to its original location on dispose, unless the original
 * changed meanwhile (another session refreshed it first), so an eval never
 * leaves the user's own login with a rotated-out token.
 */

type Env = Record<string, string | undefined>;

interface CredentialSpec {
  provider: string;
  source: string;
  /** Path relative to the isolated HOME. */
  target: string;
  /** `filter` keeps only these top-level JSON keys; such files are never written back. */
  keep?: string[];
}

export interface CopiedCredential {
  provider: string;
  /** Path relative to the isolated HOME (for reports; never the content). */
  file: string;
}

export interface IsolatedEnv {
  /** The isolated HOME directory. */
  home: string;
  /** Environment for provider and setup processes. */
  env: Env;
  credentials: CopiedCredential[];
  /** Write refreshed credentials back, then delete the isolated HOME. */
  dispose(): Promise<void>;
}

export interface IsolationOptions {
  /** The caller's environment (API keys, PATH, and provider options pass through). */
  env: Env;
  /** Providers whose login files are copied in (`claude`, `codex`, `gemini`, `opencode`). */
  providers: string[];
  /** The real HOME to copy credentials from (default: `env.HOME`, else the OS home). */
  realHome?: string;
  platform?: NodeJS.Platform;
  /** Create the isolated HOME at this path (default: a new temp directory). */
  home?: string;
}

/** Variables that point providers at user-scope configuration; removed so defaults resolve inside the isolated HOME. */
const CLEARED = [
  'CLAUDE_CONFIG_DIR',
  'OPENCODE_CONFIG',
  'OPENCODE_CONFIG_DIR',
  'OPENCODE_CONFIG_CONTENT',
  'GEMINI_CLI_HOME',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
];

/** Top-level `~/.claude.json` keys that carry the login; everything else (projects, MCP servers, history) stays out. */
const CLAUDE_CONFIG_KEYS = ['oauthAccount', 'userID', 'hasCompletedOnboarding', 'lastOnboardingVersion', 'primaryApiKey', 'customApiKeyResponses'];

export function realHomeDir(env: Env): string {
  return env.HOME || env.USERPROFILE || os.homedir();
}

/** Known login files per provider, resolved against the real HOME and the caller's overrides. */
export function credentialSpecs(provider: string, realHome: string, env: Env): CredentialSpec[] {
  switch (provider) {
    case 'claude': {
      const configDir = env.CLAUDE_CONFIG_DIR || path.join(realHome, '.claude');
      const globalConfig = env.CLAUDE_CONFIG_DIR ? path.join(env.CLAUDE_CONFIG_DIR, '.claude.json') : path.join(realHome, '.claude.json');
      return [
        { provider, source: path.join(configDir, '.credentials.json'), target: '.claude/.credentials.json' },
        { provider, source: globalConfig, target: '.claude.json', keep: CLAUDE_CONFIG_KEYS },
      ];
    }
    case 'codex': {
      const codexHome = env.CODEX_HOME || path.join(realHome, '.codex');
      return [{ provider, source: path.join(codexHome, 'auth.json'), target: '.codex/auth.json' }];
    }
    case 'gemini': {
      const dir = path.join(realHome, '.gemini');
      return [
        { provider, source: path.join(dir, 'oauth_creds.json'), target: '.gemini/oauth_creds.json' },
        { provider, source: path.join(dir, 'google_accounts.json'), target: '.gemini/google_accounts.json' },
        { provider, source: path.join(dir, '.env'), target: '.gemini/.env' },
        // The selected auth method; the rest of settings.json (MCP servers, extensions) stays out.
        { provider, source: path.join(dir, 'settings.json'), target: '.gemini/settings.json', keep: ['security', 'selectedAuthType'] },
      ];
    }
    case 'opencode': {
      const dataHome = env.XDG_DATA_HOME && path.isAbsolute(env.XDG_DATA_HOME) ? env.XDG_DATA_HOME : path.join(realHome, '.local', 'share');
      return [{ provider, source: path.join(dataHome, 'opencode', 'auth.json'), target: '.local/share/opencode/auth.json' }];
    }
    default:
      return [];
  }
}

function filterJson(text: string, keep: string[], provider: string): string | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const out: Record<string, unknown> = {};
  for (const key of keep) {
    const value = (data as Record<string, unknown>)[key];
    if (value === undefined) continue;
    // Gemini: only the auth part of `security`.
    if (provider === 'gemini' && key === 'security') {
      const auth = (value as Record<string, unknown> | null)?.auth;
      if (auth !== undefined) out.security = { auth };
      continue;
    }
    out[key] = value;
  }
  return Object.keys(out).length ? JSON.stringify(out, null, 2) + '\n' : null;
}

async function writePrivate(file: string, content: Buffer | string): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.promises.writeFile(file, content, { mode: 0o600 });
}

/** Replace `file` (following symlinks) with `content`, keeping its permissions. */
async function writeBack(file: string, content: Buffer): Promise<void> {
  const real = await fs.promises.realpath(file);
  const mode = (await fs.promises.stat(real)).mode & 0o777;
  const tmp = `${real}.agileflow-${process.pid}-${Date.now()}.tmp`;
  await fs.promises.writeFile(tmp, content, { mode });
  await fs.promises.chmod(tmp, mode);
  await fs.promises.rename(tmp, real);
}

export async function createIsolatedEnv(options: IsolationOptions): Promise<IsolatedEnv> {
  const platform = options.platform ?? process.platform;
  const realHome = options.realHome ?? realHomeDir(options.env);
  const home = options.home ?? (await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agileflow-eval-home-')));
  await fs.promises.mkdir(home, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(home, 0o700);

  const env: Env = { ...options.env };
  for (const key of CLEARED) delete env[key];
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local', 'share'),
    XDG_CACHE_HOME: path.join(home, '.cache'),
    XDG_STATE_HOME: path.join(home, '.local', 'state'),
    AGILEFLOW_HOME: home,
    AGILEFLOW_CONFIG_DIR: path.join(home, '.config', 'agileflow'),
    AGILEFLOW_CACHE_DIR: path.join(home, '.cache', 'agileflow'),
    CODEX_HOME: path.join(home, '.codex'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
  });
  if (platform === 'win32') {
    env.APPDATA = path.join(home, 'AppData', 'Roaming');
    env.LOCALAPPDATA = path.join(home, 'AppData', 'Local');
  }
  // A predictable git identity without the user's hooks, signing, or URL rewrites.
  await fs.promises.writeFile(
    path.join(home, '.gitconfig'),
    '[user]\n\tname = AgileFlow Eval\n\temail = eval@agileflow.invalid\n[commit]\n\tgpgsign = false\n[tag]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n',
  );

  const copied: Array<{ spec: CredentialSpec; original: Buffer }> = [];
  const credentials: CopiedCredential[] = [];
  for (const provider of [...new Set(options.providers)]) {
    for (const spec of credentialSpecs(provider, realHome, options.env)) {
      let original: Buffer;
      try {
        original = await fs.promises.readFile(spec.source);
      } catch {
        continue; // not logged in this way; API key env vars may still work
      }
      const target = path.join(home, spec.target);
      if (spec.keep) {
        const filtered = filterJson(original.toString('utf8'), spec.keep, provider);
        if (filtered === null) continue;
        await writePrivate(target, filtered);
      } else {
        await writePrivate(target, original);
        copied.push({ spec, original });
      }
      credentials.push({ provider, file: spec.target });
    }
  }

  let disposed = false;
  return {
    home,
    env,
    credentials,
    async dispose() {
      if (disposed) return;
      disposed = true;
      try {
        for (const { spec, original } of copied) {
          const refreshed = await fs.promises.readFile(path.join(home, spec.target)).catch(() => null);
          if (!refreshed || refreshed.length === 0 || refreshed.equals(original)) continue;
          const current = await fs.promises.readFile(spec.source).catch(() => null);
          // Someone else refreshed or removed the login meanwhile: theirs wins.
          if (!current || !current.equals(original)) continue;
          await writeBack(spec.source, refreshed).catch(() => undefined);
        }
      } finally {
        await fs.promises.rm(home, { recursive: true, force: true });
      }
    },
  };
}

/**
 * Names of personal (user-scope) skills and commands the providers would load
 * from the real HOME. A provider that reports one of these as visible inside
 * an isolated run means isolation failed.
 */
export async function personalSkillNames(realHome: string, env: Env): Promise<Set<string>> {
  const names = new Set<string>();
  const configHome = env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : path.join(realHome, '.config');
  const claudeDir = env.CLAUDE_CONFIG_DIR || path.join(realHome, '.claude');
  const skillDirs = [
    path.join(claudeDir, 'skills'),
    path.join(realHome, '.agents', 'skills'),
    path.join(env.CODEX_HOME || path.join(realHome, '.codex'), 'skills'),
    path.join(realHome, '.gemini', 'skills'),
    path.join(configHome, 'opencode', 'skill'),
    path.join(configHome, 'opencode', 'skills'),
  ];
  for (const dir of skillDirs) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) if (!e.name.startsWith('.') && (e.isDirectory() || e.isSymbolicLink())) names.add(e.name);
  }
  // Claude commands: `commands/x.md` is `x`, `commands/ns/x.md` is `ns:x`.
  const commands = path.join(claudeDir, 'commands');
  async function walk(dir: string, prefix: string[]): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) await walk(path.join(dir, e.name), [...prefix, e.name]);
      else if (e.name.endsWith('.md')) names.add([...prefix, e.name.slice(0, -3)].join(':'));
    }
  }
  await walk(commands, []);
  return names;
}
