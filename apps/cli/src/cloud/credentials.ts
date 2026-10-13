import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { OperationError, writeFileAtomic } from '@agileflow/core';

/**
 * Where connected-mode secrets live: OAuth access/refresh tokens per
 * (service, resource) and the companion installation credential. Never in
 * the project (the connection manifest holds no secrets).
 */
export interface CredentialStore {
  /** Human label shown in `cloud status` and on login. */
  readonly label: string;
  /** True for the plaintext file store the user explicitly opted into. */
  readonly insecure: boolean;
  get(account: string): Promise<string | null>;
  set(account: string, secret: string): Promise<void>;
  delete(account: string): Promise<boolean>;
}

const SERVICE = 'agileflow';

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

function exec(cmd: string, args: string[], input?: string, env?: Record<string, string | undefined>): Promise<ExecResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env: env as NodeJS.ProcessEnv });
    } catch (err) {
      resolve({ code: 127, stdout: '', stderr: (err as Error).message });
      return;
    }
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => resolve({ code: 127, stdout, stderr: err.message }));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.stdin.end(input ?? '');
  });
}

function onPath(bin: string, env: Record<string, string | undefined>): boolean {
  for (const dir of (env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    try {
      fs.accessSync(path.join(dir, bin), fs.constants.X_OK);
      return true;
    } catch {
      // keep looking
    }
  }
  return false;
}

/** macOS Keychain through `security` (secret base64-encoded so no quoting can break it). */
function macKeychain(env: Record<string, string | undefined>): CredentialStore {
  return {
    label: 'macOS Keychain',
    insecure: false,
    async get(account) {
      const r = await exec('security', ['find-generic-password', '-s', SERVICE, '-a', account, '-w'], undefined, env);
      if (r.code !== 0) return null;
      return Buffer.from(r.stdout.trim(), 'base64').toString('utf8');
    },
    async set(account, secret) {
      const r = await exec('security', ['add-generic-password', '-U', '-s', SERVICE, '-a', account, '-l', `AgileFlow ${account}`, '-w', Buffer.from(secret).toString('base64')], undefined, env);
      if (r.code !== 0) throw new OperationError(`Could not save the credential in the macOS Keychain: ${r.stderr.trim() || `exit ${r.code}`}`);
    },
    async delete(account) {
      return (await exec('security', ['delete-generic-password', '-s', SERVICE, '-a', account], undefined, env)).code === 0;
    },
  };
}

/** Linux Secret Service (GNOME Keyring, KWallet) through libsecret's `secret-tool`; the secret goes over stdin. */
function secretTool(env: Record<string, string | undefined>): CredentialStore {
  return {
    label: 'Secret Service (libsecret)',
    insecure: false,
    async get(account) {
      const r = await exec('secret-tool', ['lookup', 'service', SERVICE, 'account', account], undefined, env);
      return r.code === 0 && r.stdout ? r.stdout : null;
    },
    async set(account, secret) {
      const r = await exec('secret-tool', ['store', `--label=AgileFlow ${account}`, 'service', SERVICE, 'account', account], secret, env);
      if (r.code !== 0) {
        throw new OperationError(`Could not save the credential with secret-tool: ${r.stderr.trim() || `exit ${r.code}`}`, [
          'Make sure a Secret Service provider (GNOME Keyring or KWallet) is running and unlocked in this session.',
        ]);
      }
    },
    async delete(account) {
      const had = (await this.get(account)) !== null;
      await exec('secret-tool', ['clear', 'service', SERVICE, 'account', account], undefined, env);
      return had;
    },
  };
}

/** Plaintext JSON file (0600). Used only when the user explicitly asks for it. */
export function fileStore(file: string): CredentialStore {
  const readAll = async (): Promise<Record<string, string>> => {
    try {
      return JSON.parse(await fs.promises.readFile(file, 'utf8')) as Record<string, string>;
    } catch {
      return {};
    }
  };
  const writeAll = async (all: Record<string, string>) => {
    await fs.promises.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await writeFileAtomic(file, JSON.stringify(all, null, 2) + '\n');
    await fs.promises.chmod(file, 0o600);
  };
  return {
    label: `plaintext file ${file}`,
    insecure: true,
    async get(account) {
      return (await readAll())[account] ?? null;
    },
    async set(account, secret) {
      await writeAll({ ...(await readAll()), [account]: secret });
    },
    async delete(account) {
      const all = await readAll();
      if (!(account in all)) return false;
      delete all[account];
      if (Object.keys(all).length) await writeAll(all);
      else await fs.promises.rm(file, { force: true });
      return true;
    },
  };
}

/** In-memory store (tests). */
export function memoryStore(label = 'memory'): CredentialStore & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    label,
    insecure: false,
    entries,
    async get(account) {
      return entries.get(account) ?? null;
    },
    async set(account, secret) {
      entries.set(account, secret);
    },
    async delete(account) {
      return entries.delete(account);
    },
  };
}

export function insecureFilePath(homeDir: string): string {
  return path.join(homeDir, '.agileflow', 'credentials.json');
}

/** The OS credential store for this platform, or null when none is usable. */
export function osCredentialStore(platform: NodeJS.Platform, env: Record<string, string | undefined>): CredentialStore | null {
  if (platform === 'darwin' && onPath('security', env)) return macKeychain(env);
  if (platform === 'linux' && onPath('secret-tool', env)) return secretTool(env);
  return null;
}

/**
 * Pick the store. Secure OS storage when available; the plaintext file only
 * when the user passed --insecure-file-store (or already opted in earlier, so
 * later commands find the credential). Never a silent plaintext fallback.
 */
export async function resolveStore(o: {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  homeDir: string;
  insecureFileStore?: boolean;
  forWrite: boolean;
}): Promise<CredentialStore> {
  const file = insecureFilePath(o.homeDir);
  if (o.insecureFileStore) return fileStore(file);
  const secure = osCredentialStore(o.platform, o.env);
  if (secure) return secure;
  let optedIn = false;
  try {
    await fs.promises.access(file);
    optedIn = true;
  } catch {
    // no opted-in file
  }
  if (optedIn) return fileStore(file);
  if (!o.forWrite) return memoryStore('none');
  throw new OperationError('No secure credential store is available on this system, so AgileFlow will not save your sign-in.', [
    o.platform === 'linux'
      ? 'Install libsecret tools (e.g. `apt install libsecret-tools`) with a running GNOME Keyring or KWallet, then sign in again.'
      : o.platform === 'darwin'
        ? 'The macOS `security` tool was not found on PATH.'
        : `Secure credential storage is not supported on ${o.platform} yet.`,
    `To store credentials as plaintext in ${file} (mode 0600) instead, pass --insecure-file-store. Anyone who can read that file can act as you.`,
  ]);
}
