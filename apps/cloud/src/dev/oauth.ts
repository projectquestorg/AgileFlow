import crypto from 'node:crypto';
import { Hono } from 'hono';
import { DEFAULT_SCOPES, RESOURCE_SCOPES, type ResourceKind } from '../auth/verify';
import type { DevDirectory } from '../auth/membership';
import type { DevIssuer } from './issuer';

/**
 * Development OAuth authorization server (AGILEFLOW_DEV_AUTH=1 only). It
 * implements the same contract AgileFlow requires from Clerk: S256 PKCE,
 * resource-bound tokens, organization selection, minimum default scopes,
 * refresh, and dynamic client registration, so CLI, companion, and MCP
 * clients exercise the real code path locally. Not for production.
 */
export function devOAuthRoutes(issuer: DevIssuer, directory: DevDirectory, resources: Record<ResourceKind, string>, sessionAzp: string): Hono {
  const app = new Hono();
  const codes = new Map<string, { clientId: string; redirectUri: string; challenge: string; resource: string; scopes: string[]; userId: string; orgId: string; exp: number }>();
  const refresh = new Map<string, { clientId: string; resource: string; scopes: string[]; userId: string; orgId: string }>();
  const clients = new Map<string, { redirect_uris: string[]; client_name?: string }>();
  const resourceKinds = new Map(Object.entries(resources).map(([k, v]) => [v, k as ResourceKind]));

  const metadata = () => ({
    issuer: issuer.issuer,
    authorization_endpoint: `${issuer.issuer}/oauth/authorize`,
    token_endpoint: `${issuer.issuer}/oauth/token`,
    registration_endpoint: `${issuer.issuer}/oauth/register`,
    jwks_uri: `${issuer.issuer}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...new Set(Object.values(RESOURCE_SCOPES).flat())],
    client_id_metadata_document_supported: false,
  });

  app.get('/.well-known/oauth-authorization-server', (c) => c.json(metadata()));
  app.get('/.well-known/openid-configuration', (c) => c.json(metadata()));
  app.get('/.well-known/jwks.json', (c) => c.json(issuer.jwks));

  app.post('/oauth/register', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { redirect_uris?: string[]; client_name?: string };
    const id = `dcr_${crypto.randomBytes(8).toString('hex')}`;
    clients.set(id, { redirect_uris: body.redirect_uris ?? [], client_name: body.client_name });
    return c.json({ client_id: id, redirect_uris: body.redirect_uris ?? [], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }, 201);
  });

  /** Dev "sign in": a session token for the dashboard, with org selection. */
  app.post('/session', async (c) => {
    const b = (await c.req.json()) as { userId: string; orgId?: string; role?: 'admin' | 'member'; name?: string; orgName?: string };
    if (!/^[\w-]{1,64}$/.test(b.userId ?? '')) return c.json({ error: 'userId required' }, 400);
    if (b.orgId) {
      if (!/^[\w-]{1,64}$/.test(b.orgId)) return c.json({ error: 'invalid orgId' }, 400);
      directory.set(b.orgId, b.userId, { role: b.role ?? 'admin', user: { displayName: b.name ?? b.userId, email: `${b.userId}@example.test` } });
      if (b.orgName) directory.orgNames.set(b.orgId, b.orgName);
    }
    const token = await issuer.session({ userId: b.userId, orgId: b.orgId ?? null, orgRole: b.role ?? 'admin', azp: sessionAzp });
    return c.json({ token });
  });

  app.get('/oauth/authorize', (c) => {
    const q = c.req.query();
    const err = validateAuthorize(q, resourceKinds);
    if (err) return c.text(err, 400);
    const kind = resourceKinds.get(q.resource!)!;
    const requested = (q.scope ?? DEFAULT_SCOPES.join(' ')).split(/\s+/).filter((s) => RESOURCE_SCOPES[kind].includes(s));
    const boxes = RESOURCE_SCOPES[kind]
      .map((s) => `<label><input type="checkbox" name="scope" value="${s}" ${requested.includes(s) ? 'checked' : ''} ${s === 'user:org:read' ? 'checked disabled' : ''}> ${s}</label>`)
      .join('<br>');
    const hidden = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'resource']
      .map((k) => `<input type="hidden" name="${k}" value="${escapeHtml(q[k] ?? '')}">`)
      .join('');
    return c.html(`<!doctype html><meta charset="utf-8"><title>AgileFlow dev sign-in</title>
<style>body{font:14px system-ui;background:#09090B;color:#BFC3C9;max-width:520px;margin:40px auto}input[type=text],select{width:100%;padding:6px;margin:4px 0 12px;background:#18181b;color:#e4e4e7;border:1px solid #3f3f46}button{padding:8px 16px;background:#BFC3C9;color:#09090B;border:0;font-weight:600}</style>
<h2>Development authorization</h2><p>Client <code>${escapeHtml(q.client_id!)}</code> requests access to <code>${escapeHtml(q.resource!)}</code>.</p>
<form method="post">${hidden}
<label>User ID<input type="text" name="user" value="user_dev" required></label>
<label>Organization ID<input type="text" name="org" value="org_dev" required></label>
<label>Role<select name="role"><option value="admin">admin</option><option value="member">member</option></select></label>
<fieldset><legend>Scopes</legend>${boxes}</fieldset><br><button>Authorize</button></form>`);
  });

  app.post('/oauth/authorize', async (c) => {
    const form = await c.req.formData();
    const q = Object.fromEntries([...form.entries()].filter(([k]) => k !== 'scope').map(([k, v]) => [k, String(v)])) as Record<string, string>;
    const err = validateAuthorize(q, resourceKinds);
    if (err) return c.text(err, 400);
    const kind = resourceKinds.get(q.resource!)!;
    const scopes = ['user:org:read', ...form.getAll('scope').map(String)].filter((s, i, a) => RESOURCE_SCOPES[kind].includes(s) && a.indexOf(s) === i);
    const user = String(form.get('user') ?? '');
    const org = String(form.get('org') ?? '');
    if (!/^[\w-]{1,64}$/.test(user) || !/^[\w-]{1,64}$/.test(org)) return c.text('invalid user or org', 400);
    if (!(await directory.fetch(org, user))) directory.set(org, user, { role: form.get('role') === 'member' ? 'member' : 'admin', user: { displayName: user } });
    const code = crypto.randomBytes(24).toString('base64url');
    codes.set(code, { clientId: q.client_id!, redirectUri: q.redirect_uri!, challenge: q.code_challenge!, resource: q.resource!, scopes, userId: user, orgId: org, exp: Date.now() + 300_000 });
    const to = new URL(q.redirect_uri!);
    to.searchParams.set('code', code);
    if (q.state) to.searchParams.set('state', q.state);
    return c.redirect(to.toString(), 302);
  });

  app.post('/oauth/token', async (c) => {
    const form = await c.req.parseBody();
    const grant = String(form.grant_type ?? '');
    const issue = async (g: { clientId: string; resource: string; scopes: string[]; userId: string; orgId: string }) => {
      const rt = crypto.randomBytes(24).toString('base64url');
      refresh.set(rt, g);
      // Short lifetimes (AGILEFLOW_DEV_TOKEN_TTL) let refresh be exercised with real clients.
      const ttl = Math.max(10, Number(process.env.AGILEFLOW_DEV_TOKEN_TTL ?? 3600));
      const access = await issuer.accessToken({ userId: g.userId, orgId: g.orgId, clientId: g.clientId, audience: g.resource, scopes: g.scopes, ttlSec: ttl });
      return c.json({ access_token: access, token_type: 'Bearer', expires_in: ttl, refresh_token: rt, scope: g.scopes.join(' ') });
    };
    if (grant === 'authorization_code') {
      const entry = codes.get(String(form.code ?? ''));
      codes.delete(String(form.code ?? ''));
      if (!entry || entry.exp < Date.now()) return c.json({ error: 'invalid_grant' }, 400);
      const verifier = String(form.code_verifier ?? '');
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      if (challenge !== entry.challenge || form.redirect_uri !== entry.redirectUri || form.client_id !== entry.clientId) return c.json({ error: 'invalid_grant' }, 400);
      if (form.resource && form.resource !== entry.resource) return c.json({ error: 'invalid_target' }, 400);
      return issue(entry);
    }
    if (grant === 'refresh_token') {
      const g = refresh.get(String(form.refresh_token ?? ''));
      if (!g || (form.client_id && form.client_id !== g.clientId)) return c.json({ error: 'invalid_grant' }, 400);
      if (form.resource && form.resource !== g.resource) return c.json({ error: 'invalid_target' }, 400);
      refresh.delete(String(form.refresh_token));
      return issue(g);
    }
    return c.json({ error: 'unsupported_grant_type' }, 400);
  });

  return app;
}

function validateAuthorize(q: Record<string, string | undefined>, kinds: Map<string, ResourceKind>): string | null {
  if (q.response_type !== 'code') return 'response_type must be code';
  if (!q.client_id) return 'client_id is required';
  if (q.code_challenge_method !== 'S256' || !q.code_challenge) return 'S256 PKCE is required';
  if (!q.resource || !kinds.has(q.resource)) return 'resource must be one of the AgileFlow resources';
  try {
    const u = new URL(q.redirect_uri ?? '');
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost'))) return 'redirect_uri must be https or loopback';
  } catch {
    return 'redirect_uri is invalid';
  }
  return null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}
