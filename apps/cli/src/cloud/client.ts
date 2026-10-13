import crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { OperationError, writeFileAtomic, type Context } from '@agileflow/core';
import { resolveStore, type CredentialStore } from './credentials';

/** Resources the CLI signs in to. MCP is for agents and is not used here. */
export type CloudResource = 'cli' | 'local-control';

/** Injected effects, so tests run against the in-process service. */
export interface CloudDeps {
  fetch: typeof fetch;
  /** Overrides the credential store selection (tests). */
  store?: CredentialStore;
  /** Open the authorization URL (best effort; failure is not an error). */
  openBrowser: (url: string) => Promise<void> | void;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  arch: string;
  /** Loopback callback timeout (default 15 minutes). */
  loginTimeoutMs?: number;
}

function openBrowserDefault(url: string, platform: NodeJS.Platform): void {
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'explorer.exe' : 'xdg-open';
  try {
    const child = spawn(cmd, [url], { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // The URL is printed; opening a browser is a convenience.
  }
}

export function cloudDeps(ctx: Context, injected?: Partial<CloudDeps>): CloudDeps {
  return {
    fetch: injected?.fetch ?? ((input, init) => fetch(input, init)),
    store: injected?.store,
    openBrowser: injected?.openBrowser ?? ((url) => openBrowserDefault(url, ctx.platform)),
    now: injected?.now ?? (() => Date.now()),
    sleep: injected?.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    arch: injected?.arch ?? process.arch,
    loginTimeoutMs: injected?.loginTimeoutMs,
  };
}

export async function storeFor(ctx: Context, deps: CloudDeps, o: { insecureFileStore?: boolean; forWrite: boolean }): Promise<CredentialStore> {
  if (deps.store) return deps.store;
  return resolveStore({ platform: ctx.platform, env: ctx.env, homeDir: ctx.homeDir, insecureFileStore: o.insecureFileStore, forWrite: o.forWrite });
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export interface Discovery {
  schemaVersion: number;
  service: string;
  authorizationServer: string;
  resources: Record<'mcp' | 'cli' | 'local-control', string>;
  clients: { cli: string; companion: string };
  defaultScopes: Record<string, string[]>;
  /** `grants`: the identity provider cannot issue AgileFlow scopes; capabilities are granted per connection in the dashboard. */
  capabilitySource?: 'scopes' | 'grants';
  minimumVersions?: { cli?: string; companion?: string };
}

export function normalizeService(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new OperationError(`Invalid service URL: ${url}`, ['Pass the AgileFlow service origin, e.g. --service https://app.agileflow.projectquestorg.com']);
  }
  const loopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) {
    throw new OperationError(`The service URL must use https (got ${u.protocol}//${u.host}).`);
  }
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

function networkError(service: string, err: unknown): OperationError {
  return new OperationError(`Could not reach the AgileFlow service at ${service}: ${(err as Error)?.message ?? String(err)}`, [
    'Nothing was saved locally or remotely. Check the network and the service URL, then retry.',
  ]);
}

export async function discover(deps: CloudDeps, service: string): Promise<Discovery> {
  let res: Response;
  try {
    res = await deps.fetch(`${service}/.well-known/agileflow.json`, { headers: { accept: 'application/json' } });
  } catch (err) {
    throw networkError(service, err);
  }
  if (!res.ok) throw new OperationError(`${service} did not return AgileFlow discovery metadata (HTTP ${res.status}).`);
  const d = (await res.json()) as Discovery;
  if (!d?.resources?.cli || !d?.resources?.['local-control'] || !d.authorizationServer || !d.clients) {
    throw new OperationError(`${service} returned incomplete discovery metadata.`);
  }
  return d;
}

interface AsMetadata {
  issuer?: string;
  authorization_endpoint: string;
  token_endpoint: string;
  code_challenge_methods_supported?: string[];
}

/** RFC 8414 metadata: at the issuer (Clerk, dev server), then the path-inserted form, then OIDC. */
export async function authorizationServerMetadata(deps: CloudDeps, issuer: string): Promise<AsMetadata> {
  const u = new URL(issuer);
  const pathPart = u.pathname.replace(/\/+$/, '');
  const candidates = [
    `${issuer.replace(/\/+$/, '')}/.well-known/oauth-authorization-server`,
    `${u.origin}/.well-known/oauth-authorization-server${pathPart}`,
    `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`,
  ];
  for (const url of [...new Set(candidates)]) {
    try {
      const res = await deps.fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) continue;
      const m = (await res.json()) as AsMetadata;
      if (m.authorization_endpoint && m.token_endpoint) {
        if (m.code_challenge_methods_supported && !m.code_challenge_methods_supported.includes('S256')) {
          throw new OperationError('The authorization server does not support S256 PKCE; refusing to sign in.');
        }
        return m;
      }
    } catch (err) {
      if (err instanceof OperationError) throw err;
    }
  }
  throw new OperationError(`Could not read authorization server metadata for ${issuer}.`);
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export interface TokenRecord {
  schemaVersion: 1;
  service: string;
  resource: CloudResource;
  resourceUri: string;
  clientId: string;
  tokenEndpoint: string;
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms. */
  expiresAt: number;
  scopes: string[];
}

export const tokenAccount = (service: string, resource: CloudResource) => `oauth:${service}:${resource}`;

export const DEFAULT_SCOPES: Record<CloudResource, string[]> = {
  cli: ['user:org:read', 'agileflow:read'],
  'local-control': ['user:org:read', 'agileflow:local:observe'],
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

function page(title: string, body: string): string {
  return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title><body style="font:15px system-ui;background:#09090B;color:#BFC3C9;max-width:520px;margin:60px auto"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></body>`;
}

/** Wait for the OAuth redirect on a 127.0.0.1 ephemeral port. */
async function loopback(expectedState: string, timeoutMs: number) {
  let settle!: { resolve: (code: string) => void; reject: (err: Error) => void };
  const result = new Promise<string>((resolve, reject) => (settle = { resolve, reject }));
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/callback') {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    const send = (status: number, title: string, body: string) => res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(page(title, body));
    if (url.searchParams.get('state') !== expectedState) {
      send(400, 'Sign-in not completed', 'The response did not match this sign-in attempt (state mismatch). Close this tab and try again.');
      settle.reject(new OperationError('Sign-in failed: the authorization response did not match this attempt (state mismatch).'));
      return;
    }
    const error = url.searchParams.get('error');
    if (error) {
      const desc = url.searchParams.get('error_description') ?? '';
      send(400, 'Sign-in not completed', `${error}${desc ? `: ${desc}` : ''}`);
      settle.reject(new OperationError(`Sign-in was not completed: ${error}${desc ? ` (${desc.slice(0, 300)})` : ''}`));
      return;
    }
    const code = url.searchParams.get('code');
    if (!code) {
      send(400, 'Sign-in not completed', 'No authorization code was returned.');
      settle.reject(new OperationError('Sign-in failed: no authorization code was returned.'));
      return;
    }
    send(200, 'Signed in to AgileFlow', 'You can close this tab and return to the terminal.');
    settle.resolve(code);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as { port: number }).port;
  const timer = setTimeout(() => settle.reject(new OperationError('Sign-in timed out after 15 minutes. Run the command again.')), timeoutMs);
  timer.unref?.();
  const wait = result.finally(() => {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections?.();
  });
  wait.catch(() => {});
  return { redirectUri: `http://127.0.0.1:${port}/callback`, wait };
}

async function tokenRequest(deps: CloudDeps, endpoint: string, params: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }> {
  let res: Response;
  try {
    res = await deps.fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams(params).toString() });
  } catch (err) {
    throw networkError(new URL(endpoint).origin, err);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok || !body.access_token) {
    const e = new OperationError(`The authorization server refused the token request: ${String(body.error ?? `HTTP ${res.status}`)}${body.error_description ? ` (${String(body.error_description).slice(0, 200)})` : ''}`, [
      'Sign in again: agileflow cloud login',
    ]);
    (e as OperationError & { oauthError?: string }).oauthError = String(body.error ?? '');
    throw e;
  }
  return body as never;
}

/**
 * OAuth 2.1 authorization code + S256 PKCE with a loopback redirect.
 * The new credential replaces the old one only after it is stored.
 */
export async function login(o: {
  deps: CloudDeps;
  store: CredentialStore;
  service: string;
  discovery: Discovery;
  resource: CloudResource;
  scopes: string[];
  print: (line: string) => void;
}): Promise<TokenRecord> {
  const { deps, discovery } = o;
  const meta = await authorizationServerMetadata(deps, discovery.authorizationServer);
  const resourceUri = discovery.resources[o.resource];
  const clientId = o.resource === 'local-control' ? discovery.clients.companion : discovery.clients.cli;
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('base64url');
  const cb = await loopback(state, deps.loginTimeoutMs ?? 15 * 60_000);
  const url = new URL(meta.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: cb.redirectUri,
    scope: o.scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: resourceUri,
  }).toString();
  o.print('Opening your browser to sign in. If it does not open, visit:');
  o.print(`  ${url.toString()}`);
  try {
    await deps.openBrowser(url.toString());
  } catch {
    // the URL is printed above
  }
  const code = await cb.wait;
  const t = await tokenRequest(deps, meta.token_endpoint, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: cb.redirectUri,
    client_id: clientId,
    code_verifier: verifier,
    resource: resourceUri,
  });
  const record: TokenRecord = {
    schemaVersion: 1,
    service: o.service,
    resource: o.resource,
    resourceUri,
    clientId,
    tokenEndpoint: meta.token_endpoint,
    accessToken: t.access_token,
    ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}),
    expiresAt: deps.now() + (t.expires_in ?? 3600) * 1000,
    scopes: (t.scope ?? o.scopes.join(' ')).split(/\s+/).filter(Boolean),
  };
  await o.store.set(tokenAccount(o.service, o.resource), JSON.stringify(record));
  return record;
}

export async function readToken(store: CredentialStore, service: string, resource: CloudResource): Promise<TokenRecord | null> {
  const raw = await store.get(tokenAccount(service, resource));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenRecord;
  } catch {
    return null;
  }
}

const signInHint = (resource: CloudResource) => (resource === 'local-control' ? 'Enroll again: agileflow cloud companion enroll' : 'Sign in again: agileflow cloud login');

/** A valid access token, refreshed (with the resource parameter) within 30 s of expiry. */
export async function accessToken(deps: CloudDeps, store: CredentialStore, service: string, resource: CloudResource): Promise<TokenRecord> {
  const rec = await readToken(store, service, resource);
  if (!rec) throw new OperationError(`Not signed in to ${service}${resource === 'local-control' ? ' for local control' : ''}.`, [resource === 'local-control' ? 'Run: agileflow cloud companion enroll' : `Run: agileflow cloud login --service ${service}`]);
  if (rec.expiresAt - deps.now() > 30_000) return rec;
  if (!rec.refreshToken) throw new OperationError('Your AgileFlow sign-in expired.', [signInHint(resource)]);
  const t = await tokenRequest(deps, rec.tokenEndpoint, { grant_type: 'refresh_token', refresh_token: rec.refreshToken, client_id: rec.clientId, resource: rec.resourceUri });
  const next: TokenRecord = {
    ...rec,
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? rec.refreshToken,
    expiresAt: deps.now() + (t.expires_in ?? 3600) * 1000,
    scopes: t.scope ? t.scope.split(/\s+/).filter(Boolean) : rec.scopes,
  };
  await store.set(tokenAccount(service, resource), JSON.stringify(next));
  return next;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export interface ApiResult {
  status: number;
  body: any;
  headers: Headers;
}

/** Parse `scope="..."` from an insufficient_scope challenge. */
export function challengedScopes(headers: Headers): string[] | null {
  const h = headers.get('www-authenticate') ?? '';
  if (!/error="insufficient_scope"/.test(h)) return null;
  const m = /scope="([^"]*)"/.exec(h);
  return m ? m[1]!.split(/\s+/).filter(Boolean) : [];
}

/** Turn a failed response into an actionable error. Never suggests a local fallback. */
export function apiError(r: ApiResult, resource: CloudResource, current: string[] = []): OperationError {
  if (r.status === 401) {
    return new OperationError('The AgileFlow service did not accept your sign-in (expired, revoked, or for another resource).', [signInHint(resource)]);
  }
  const scopes = r.status === 403 ? challengedScopes(r.headers) : null;
  if (scopes) {
    const missing = scopes.filter((s) => !current.includes(s));
    const need = missing.length ? missing : scopes;
    const extra = need.filter((s) => s !== 'user:org:read' && s !== 'agileflow:read' && s !== 'agileflow:local:observe');
    return new OperationError(`This needs the OAuth scope(s): ${need.join(', ')}. Your sign-in does not include them.`, [
      resource === 'local-control'
        ? `Enroll with apply access if you agree: agileflow cloud companion enroll --apply`
        : `Sign in with that permission if you agree: agileflow cloud login ${extra.map((s) => `--scope ${s}`).join(' ')}`.trim(),
    ]);
  }
  const e = r.body?.error ?? {};
  const code = typeof e.code === 'string' ? e.code : `HTTP_${r.status}`;
  const message = typeof e.message === 'string' ? e.message : `The service answered HTTP ${r.status}.`;
  const hints =
    code === 'CLIENT_WRITES_PAUSED'
      ? ['Nothing was written locally. A project admin can resume connected-client changes in the dashboard.']
      : code === 'CAPABILITY_REQUIRED'
        ? [`Nothing was written. If you agree, grant "${e.capability}" to this CLI connection in the dashboard${typeof e.grantUrl === 'string' ? `: ${e.grantUrl}` : ' (Connections)'}, then run the command again.`]
        : code === 'CLIENT_NOT_ALLOWED'
          ? ['This client is not registered for this AgileFlow endpoint. Sign in again with: agileflow cloud login']
          : [];
  const err = new OperationError(`${message} (${code})`, hints);
  (err as OperationError & { code?: string }).code = code;
  return err;
}

export class CloudApi {
  constructor(
    readonly deps: CloudDeps,
    readonly store: CredentialStore,
    readonly service: string,
    readonly resource: CloudResource,
    readonly extraHeaders: Record<string, string> = {},
  ) {}

  scopes: string[] = [];

  /** Raw call (no throw on HTTP errors; throws on network failure or missing sign-in). */
  async raw(method: string, pathname: string, body?: unknown): Promise<ApiResult> {
    const tok = await accessToken(this.deps, this.store, this.service, this.resource);
    this.scopes = tok.scopes;
    let res: Response;
    try {
      res = await this.deps.fetch(`${this.service}${pathname}`, {
        method,
        headers: { authorization: `Bearer ${tok.accessToken}`, accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...this.extraHeaders },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw networkError(this.service, err);
    }
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { error: { code: `HTTP_${res.status}`, message: text.slice(0, 200) } };
    }
    return { status: res.status, body: parsed, headers: res.headers };
  }

  /** Call and require success (`ok: true`). */
  async call(method: string, pathname: string, body?: unknown): Promise<any> {
    const r = await this.raw(method, pathname, body);
    if (r.status >= 400 || r.body?.ok === false) throw apiError(r, this.resource, this.scopes);
    return r.body;
  }

  tool(name: string, args: Record<string, unknown>): Promise<any> {
    return this.call('POST', `/cli/v1/tools/${encodeURIComponent(name)}`, args);
  }
}

// ---------------------------------------------------------------------------
// Connection manifest (.agileflow/connection.json): public binding, no secrets
// ---------------------------------------------------------------------------

export const MANIFEST_REL = '.agileflow/connection.json';

export interface ConnectionManifest {
  schemaVersion: 1;
  service: string;
  projectId: string;
  workspaceId: string;
  authority: 'connected';
  repoIdentity: string | null;
  checkout: { pathHash: string };
  boundAt: string;
  minimumCliVersion: string;
}

export function manifestPath(root: string): string {
  return path.join(root, MANIFEST_REL);
}

export async function readManifest(root: string): Promise<ConnectionManifest | null> {
  let text: string;
  try {
    text = await fs.promises.readFile(manifestPath(root), 'utf8');
  } catch {
    return null;
  }
  let m: ConnectionManifest;
  try {
    m = JSON.parse(text) as ConnectionManifest;
  } catch {
    throw new OperationError(`${MANIFEST_REL} is not valid JSON.`, ['Fix it, or remove it with: agileflow cloud disconnect']);
  }
  if (m.schemaVersion !== 1) {
    throw new OperationError(`${MANIFEST_REL} has schemaVersion ${String(m.schemaVersion)}, which this CLI does not understand.`, ['Upgrade the CLI: npm install -g agileflow@latest']);
  }
  return m;
}

export async function writeManifest(root: string, m: ConnectionManifest): Promise<void> {
  await fs.promises.mkdir(path.dirname(manifestPath(root)), { recursive: true });
  await writeFileAtomic(manifestPath(root), JSON.stringify(m, null, 2) + '\n');
}

/** sha256 hex of the checkout's real path (the service only ever sees the hash). */
export async function checkoutPathHash(root: string): Promise<string> {
  const real = await fs.promises.realpath(root);
  return crypto.createHash('sha256').update(real).digest('hex');
}

/** Normalized `origin` remote: host/path, lower-case host, no credentials, no .git suffix. Null without a remote. */
export async function repoIdentity(root: string): Promise<string | null> {
  const url = await new Promise<string | null>((resolve) =>
    execFile('git', ['remote', 'get-url', 'origin'], { cwd: root }, (err, stdout) => resolve(err ? null : String(stdout).trim() || null)),
  );
  return url ? normalizeRemote(url) : null;
}

export function normalizeRemote(url: string): string {
  let host = '';
  let p = '';
  const scp = /^(?:[^@/]+@)?([^:/]+):(?!\/)(.+)$/.exec(url);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    try {
      const u = new URL(url);
      host = u.hostname;
      p = u.pathname;
    } catch {
      return url;
    }
  } else if (scp) {
    host = scp[1]!;
    p = scp[2]!;
  } else {
    return url;
  }
  return `${host.toLowerCase()}/${p.replace(/^\/+/, '').replace(/\.git$/, '').replace(/\/+$/, '')}`;
}
