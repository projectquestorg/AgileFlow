import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import crypto from 'node:crypto';
import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { AuthError, bearerFrom, RESOURCE_SCOPES, verifyAccessToken, verifySessionToken, type AuthConfig, type Principal, type ResourceKind } from '../auth/verify';
import { AppError, ScopeError } from '../domain/errors';
import type { Services } from '../domain/services';
import { handleClerkEvent, verifySvix } from '../domain/webhooks';
import { callTool, requiredScopes } from '../mcp/dispatch';
import { createMcpServer } from '../mcp/server';
import { TOOL_BY_NAME, TOOLS, type ToolEnv } from '../mcp/tools';
import { dashboardRoutes } from '../dashboard/static';

export interface AppOptions {
  services: Services;
  auth: AuthConfig;
  publicUrl: string;
  authorizationServer: string;
  allowedOrigins: string[];
  devAuth: boolean;
  clerk: { publishableKey?: string; webhookSecret?: string; frontendApi?: string };
  cliClientId: string;
  companionClientId: string;
  /** Bearer secret for scheduled jobs (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). */
  cronSecret?: string;
  /** Extra routes mounted at /dev in development. */
  devRoutes?: Hono;
}

type Vars = { principal: Principal };

const MAX_JSON = 64 * 1024 * 1024;

export function createApp(o: AppOptions): Hono<{ Variables: Vars }> {
  const app = new Hono<{ Variables: Vars }>();
  const s = o.services;
  const metadataUrl = (kind: ResourceKind) => `${o.publicUrl}/.well-known/oauth-protected-resource${new URL(o.auth.resources[kind]).pathname}`;
  const env: ToolEnv = { approvalUrl: (pid, id) => `${o.publicUrl}/#/p/${encodeURIComponent(pid)}/approvals/${encodeURIComponent(id)}` };

  // ------------------------------------------------------------ helpers
  const challenge = (kind: ResourceKind, extra = '') => `Bearer resource_metadata="${metadataUrl(kind)}"${extra}`;

  const unauthorized = (c: Context, kind: ResourceKind, err?: AuthError) => {
    c.header('WWW-Authenticate', challenge(kind, err ? `, error="invalid_token", error_description="${err.message.replace(/"/g, "'")}"` : `, scope="${['user:org:read', kind === 'local-control' ? 'agileflow:local:observe' : 'agileflow:read'].join(' ')}"`));
    return c.json({ error: { code: 'UNAUTHENTICATED', message: err?.message ?? 'Sign in to continue.' } }, 401);
  };

  const insufficientScope = (c: Context, kind: ResourceKind, scopes: string[]) => {
    c.header('WWW-Authenticate', challenge(kind, `, error="insufficient_scope", scope="${scopes.join(' ')}"`));
    return c.json({ error: { code: 'SCOPE_REQUIRED', message: `This needs the OAuth scope(s): ${scopes.join(', ')}. Reconnect with them if the user agrees.`, scopes } }, 403);
  };

  const appError = (c: Context, err: unknown) => {
    if (err instanceof AppError) return c.json({ error: err.toJSON() }, err.status as 400);
    if (err instanceof SyntaxError) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Request body must be JSON.' } }, 400);
    console.error(JSON.stringify({ level: 'error', msg: 'request failed', path: c.req.path, error: (err as Error)?.message?.slice(0, 300) }));
    return c.json({ error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Unexpected error. Retry later.', retryable: true } }, 500);
  };

  const json = async (c: Context): Promise<any> => {
    const len = Number(c.req.header('content-length') ?? 0);
    if (len > MAX_JSON) throw new AppError('VALIDATION_ERROR', 'Request body too large.');
    return c.req.json();
  };

  /** Token-authenticated routes: verified OAuth access token for exactly this resource. */
  const tokenAuth = (kind: ResourceKind) => async (c: Context<{ Variables: Vars }>, next: () => Promise<void>) => {
    const { present, token } = bearerFrom(c.req.header('authorization'));
    if (!present) return unauthorized(c, kind);
    if (!token) return unauthorized(c, kind, new AuthError('malformed', 'Malformed Authorization header.'));
    try {
      c.set('principal', await verifyAccessToken(token, kind, o.auth));
    } catch (err) {
      if (err instanceof AuthError) return unauthorized(c, kind, err);
      throw err;
    }
    try {
      await next();
    } catch (err) {
      if (err instanceof ScopeError) return insufficientScope(c, kind, err.required);
      return appError(c, err);
    }
  };

  /**
   * Dashboard sessions. An explicit Authorization bearer takes precedence and
   * an invalid one never falls back to the cookie (per-tab organization).
   * Cookie-only mutations must come from an allowed Origin.
   */
  const sessionAuth = async (c: Context<{ Variables: Vars }>, next: () => Promise<void>) => {
    const { present, token } = bearerFrom(c.req.header('authorization'));
    let credential: string | null = token;
    if (present && !token) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Malformed Authorization header.' } }, 401);
    if (!present) {
      credential = getCookie(c, '__session') ?? null;
      if (credential && c.req.method !== 'GET' && !o.allowedOrigins.includes(c.req.header('origin') ?? '')) {
        return c.json({ error: { code: 'FORBIDDEN', message: 'Cross-origin request refused.' } }, 403);
      }
    }
    if (!credential) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401);
    try {
      c.set('principal', await verifySessionToken(credential, o.auth));
    } catch (err) {
      if (err instanceof AuthError) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Your session expired or is invalid. Sign in again.' } }, 401);
      throw err;
    }
    try {
      await next();
    } catch (err) {
      return appError(c, err);
    }
  };

  const onError = (fixed: ResourceKind | null) => (err: Error, c: Context) => {
    const kind = fixed ?? (c.req.path === '/mcp' ? 'mcp' : null);
    if (err instanceof ScopeError && kind) return insufficientScope(c, kind, err.required);
    if (err instanceof AuthError && kind) return unauthorized(c, kind, err);
    return appError(c, err);
  };
  app.onError(onError(null));

  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Frame-Options', 'DENY');
  });

  // ------------------------------------------------------------ discovery
  for (const kind of ['mcp', 'cli', 'local-control'] as const) {
    const path = new URL(o.auth.resources[kind]).pathname;
    app.get(`/.well-known/oauth-protected-resource${path}`, (c) =>
      c.json({
        resource: o.auth.resources[kind],
        authorization_servers: [o.authorizationServer],
        // Only the default minimum is advertised: some clients (observed: Claude Code 2.1.296) request every
        // scope in scopes_supported. Write scopes are obtained through the insufficient_scope step-up challenge.
        scopes_supported: kind === 'local-control' ? ['user:org:read', 'agileflow:local:observe'] : ['user:org:read', 'agileflow:read'],
        agileflow_optional_scopes: RESOURCE_SCOPES[kind].filter((sc) => !['user:org:read', 'agileflow:read', 'agileflow:local:observe'].includes(sc)),
        bearer_methods_supported: ['header'],
        resource_name: `AgileFlow ${kind === 'mcp' ? 'MCP' : kind === 'cli' ? 'connected CLI' : 'local companion'}`,
        resource_documentation: `${o.publicUrl}/docs/connect`,
      }),
    );
  }
  app.get('/.well-known/oauth-protected-resource', (c) => c.redirect(`/.well-known/oauth-protected-resource/mcp`, 307));
  app.get('/.well-known/agileflow.json', (c) =>
    c.json({
      schemaVersion: 1,
      service: o.publicUrl,
      authorizationServer: o.authorizationServer,
      resources: o.auth.resources,
      clients: { cli: o.cliClientId, companion: o.companionClientId },
      defaultScopes: { mcp: ['user:org:read', 'agileflow:read'], cli: ['user:org:read', 'agileflow:read'], 'local-control': ['user:org:read', 'agileflow:local:observe'] },
      dashboard: { devAuth: o.devAuth, clerkPublishableKey: o.clerk.publishableKey ?? null, clerkFrontendApi: o.clerk.frontendApi ?? null },
      tools: TOOLS.map((t) => ({ name: t.name, readOnly: t.readOnly })),
      minimumVersions: { cli: '5.0.0-alpha.1', companion: '5.0.0-alpha.1' },
    }),
  );
  app.get('/healthz', (c) => c.json({ ok: true }));

  // ------------------------------------------------------------------ MCP
  app.all('/mcp', tokenAuth('mcp'), async (c) => {
    const origin = c.req.header('origin');
    if (origin && !o.allowedOrigins.includes(origin)) return c.json({ error: { code: 'FORBIDDEN', message: 'Origin not allowed.' } }, 403);
    const principal = c.get('principal');
    let body: unknown;
    if (c.req.method === 'POST') {
      body = await json(c);
      // OAuth scope is enforced here, before any tool runs, so clients get the HTTP challenge.
      for (const m of Array.isArray(body) ? body : [body]) {
        const msg = m as { method?: string; params?: { name?: string; arguments?: unknown } };
        if (msg?.method === 'tools/call' && msg.params?.name && TOOL_BY_NAME.has(msg.params.name)) {
          const need = requiredScopes(msg.params.name, msg.params.arguments);
          const missing = need.filter((x) => principal.kind === 'token' && !principal.scopes.has(x));
          if (missing.length) return insufficientScope(c, 'mcp', need);
        }
        if (msg?.method === 'resources/read' && principal.kind === 'token' && !principal.scopes.has('agileflow:read')) return insufficientScope(c, 'mcp', ['agileflow:read']);
      }
    }
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    const server = createMcpServer(s, principal, env);
    await server.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw, { parsedBody: body });
    } finally {
      void server.close().catch(() => {});
    }
  });

  // ------------------------------------------------------- connected CLI
  const cli = new Hono<{ Variables: Vars }>();
  cli.onError(onError('cli'));
  cli.use('*', tokenAuth('cli'));
  cli.get('/context', async (c) => c.json({ ok: true, schemaVersion: 1, data: await s.admin.context(c.get('principal')) }));
  cli.post('/tools/:name', async (c) => {
    const name = c.req.param('name');
    const args = await json(c);
    const p = c.get('principal');
    const need = requiredScopes(name, args);
    if (p.kind === 'token' && need.some((x) => !p.scopes.has(x))) return insufficientScope(c, 'cli', need);
    const r = await callTool(s, p, name, args, env);
    return c.json(r.structured, r.status as 200);
  });
  cli.post('/projects/:pid/import/preview', async (c) => {
    const b = await json(c);
    const p = c.get('principal');
    if (p.kind === 'token' && !p.scopes.has('agileflow:work:write')) return insufficientScope(c, 'cli', ['agileflow:work:write']);
    const r = await s.portability.preview(p, { projectId: c.req.param('pid'), files: b.files, operationKey: String(b.operationKey ?? '') });
    return c.json({ ok: true, ...r, data: { ...r.data, reviewUrl: `${o.publicUrl}/#/p/${encodeURIComponent(c.req.param('pid'))}/import/${r.data.jobId}` } });
  });
  cli.post('/projects/:pid/export', async (c) => {
    const b = await json(c).catch(() => ({}));
    return c.json({ ok: true, ...(await s.portability.export(c.get('principal'), { projectId: c.req.param('pid'), complete: !!b.complete })) });
  });
  app.route('/cli/v1', cli);

  // ------------------------------------------------------- local control
  const lc = new Hono<{ Variables: Vars }>();
  lc.onError(onError('local-control'));
  lc.use('*', tokenAuth('local-control'));
  const cred = (c: Context) => c.req.header('x-agileflow-companion') ?? undefined;
  lc.post('/projects/:pid/enroll/start', async (c) => c.json({ ok: true, data: await s.controls.enrollStart(c.get('principal'), { ...(await json(c)), projectId: c.req.param('pid') }) }));
  lc.post('/projects/:pid/enroll/redeem', async (c) => c.json({ ok: true, data: await s.controls.enrollRedeem(c.get('principal'), { ...(await json(c)), projectId: c.req.param('pid') }) }));
  lc.post('/projects/:pid/poll', async (c) => c.json({ ok: true, data: await s.controls.companionPoll(c.get('principal'), cred(c), { ...(await json(c)), projectId: c.req.param('pid') }) }));
  lc.post('/projects/:pid/operations/:oid/begin', async (c) =>
    c.json({ ok: true, data: await s.controls.companionBegin(c.get('principal'), cred(c), { ...(await json(c)), projectId: c.req.param('pid'), operationId: c.req.param('oid') }) }),
  );
  lc.post('/projects/:pid/operations/:oid/receipt', async (c) =>
    c.json({ ok: true, data: await s.controls.companionReceipt(c.get('principal'), cred(c), { ...(await json(c)), projectId: c.req.param('pid'), operationId: c.req.param('oid') }) }),
  );
  app.route('/local-control/v1', lc);

  // ------------------------------------------------------------ dashboard
  const api = new Hono<{ Variables: Vars }>();
  api.onError(onError(null));
  api.use('*', sessionAuth);
  const P = (c: Context<{ Variables: Vars }>) => c.get('principal');
  const ok = (c: Context, data: unknown) => c.json({ ok: true, data });
  api.get('/me', async (c) => {
    const p = P(c);
    if (p.kind === 'session' && !p.orgId) return ok(c, { user: { id: p.userId }, workspace: null, projects: [], needsOrganization: true });
    return ok(c, { ...(await s.admin.context(p)), deletedProjects: await s.admin.deletedProjects(p) });
  });
  api.post('/projects', async (c) => ok(c, await s.admin.createProject(P(c), await json(c))));
  api.patch('/projects/:pid', async (c) => ok(c, (await s.admin.updateProject(P(c), { ...(await json(c)), projectId: c.req.param('pid') })).data));
  api.post('/projects/:pid/archive', async (c) => ok(c, (await s.admin.archiveProject(P(c), { ...(await json(c)), projectId: c.req.param('pid') })).data));
  api.post('/projects/:pid/delete', async (c) => ok(c, await s.admin.requestDeletion(P(c), { ...(await json(c)), projectId: c.req.param('pid') })));
  api.post('/projects/:pid/restore', async (c) => ok(c, await s.admin.restoreDeleted(P(c), { projectId: c.req.param('pid') })));
  api.get('/projects/:pid/members', async (c) => ok(c, (await s.admin.members(P(c), c.req.param('pid'))).data));
  api.put('/projects/:pid/grants/:uid', async (c) => ok(c, (await s.admin.setGrant(P(c), { ...(await json(c)), projectId: c.req.param('pid'), userId: c.req.param('uid') })).data));
  api.get('/connections', async (c) => ok(c, await s.admin.connections(P(c))));
  api.patch('/connections/:id', async (c) => ok(c, await s.admin.updateConnection(P(c), { ...(await json(c)), connectionId: c.req.param('id') })));
  api.put('/workspace/policy', async (c) => ok(c, await s.admin.setWorkspacePolicy(P(c), await json(c))));
  // The dashboard uses the same tool registry as agents (with a human session's authority).
  api.post('/projects/:pid/tools/:name', async (c) => {
    const r = await callTool(s, P(c), c.req.param('name'), { ...(await json(c)), projectId: c.req.param('pid') }, env);
    return c.json(r.structured, r.status as 200);
  });
  api.post('/projects/:pid/notes/:nid/edit', async (c) => ok(c, (await s.collab.noteEdit(P(c), { ...(await json(c)), projectId: c.req.param('pid'), noteId: c.req.param('nid') })).data));
  api.post('/projects/:pid/notes/:nid/redact', async (c) => ok(c, (await s.collab.noteRedact(P(c), { ...(await json(c)), projectId: c.req.param('pid'), noteId: c.req.param('nid') })).data));
  api.post('/projects/:pid/notes/:nid/promote', async (c) => {
    const b = await json(c);
    const pid = c.req.param('pid');
    const r = await s.collab.notePromote(P(c), { ...b, projectId: pid, noteId: c.req.param('nid') }, async (title, body) => (await s.work.create(P(c), { projectId: pid, kind: 'decision', title, body, requestId: `${b.requestId}:decision` })).data);
    return ok(c, r.data);
  });
  api.post('/projects/:pid/runs/:rid/cancel', async (c) => ok(c, (await s.collab.runCancel(P(c), { ...(await json(c)), projectId: c.req.param('pid'), runId: c.req.param('rid') })).data));
  api.get('/projects/:pid/claims', async (c) => ok(c, (await s.collab.claimsForProject(P(c), c.req.param('pid'))).data));
  api.get('/projects/:pid/approvals', async (c) => ok(c, (await s.collab.approvalList(P(c), c.req.param('pid'), c.req.query('state'))).data));
  api.post('/projects/:pid/approvals/:aid/decide', async (c) =>
    ok(c, (await s.collab.approvalDecide(P(c), { ...(await json(c)), projectId: c.req.param('pid'), approvalId: c.req.param('aid') }, (ctx, desired, ids, id) => s.controls.createRevision(ctx, desired, ids, id))).data),
  );
  api.put('/projects/:pid/settings', async (c) => ok(c, (await s.controls.setDesired(P(c), { ...(await json(c)), projectId: c.req.param('pid') })).data));
  api.get('/projects/:pid/companions', async (c) => ok(c, (await s.controls.listEnrollments(P(c), c.req.param('pid'))).data));
  api.post('/projects/:pid/enrollments/:eid/approve', async (c) => ok(c, (await s.controls.enrollApprove(P(c), { ...(await json(c)), projectId: c.req.param('pid'), enrollmentId: c.req.param('eid') })).data));
  api.post('/projects/:pid/companions/:cid/revoke', async (c) => ok(c, (await s.controls.revokeCompanion(P(c), { ...(await json(c)), projectId: c.req.param('pid'), companionId: c.req.param('cid') })).data));
  api.post('/projects/:pid/import/preview', async (c) => {
    const b = await json(c);
    return ok(c, (await s.portability.preview(P(c), { projectId: c.req.param('pid'), files: b.files, operationKey: String(b.operationKey ?? '') })).data);
  });
  api.get('/projects/:pid/import/:jid', async (c) => {
    const p = P(c);
    await s.core.authorize(p, c.req.param('pid'), 'read');
    const job = (await s.core.db.query<Record<string, any>>(`SELECT id, status, preview, result, expires_at FROM jobs WHERE id = $1 AND project_id = $2 AND owner_user_id = $3 AND kind = 'import'`, [c.req.param('jid'), c.req.param('pid'), p.userId])).rows[0];
    if (!job) throw new AppError('NOT_FOUND', 'The import preview was not found or is not available to you.');
    return ok(c, job);
  });
  api.post('/projects/:pid/import/:jid/commit', async (c) => {
    const b = await json(c);
    const pid = c.req.param('pid');
    return ok(c, (await s.portability.commit(P(c), { ...b, projectId: pid, jobId: c.req.param('jid') })).data);
  });
  api.post('/projects/:pid/export', async (c) => {
    const b = await json(c).catch(() => ({}));
    return ok(c, (await s.portability.export(P(c), { projectId: c.req.param('pid'), complete: !!b.complete })).data);
  });
  /** Short-poll invalidation: the latest activity sequence, rechecked against current access. */
  /**
   * Change feed: returns at once when the project is past `since`, otherwise
   * long-polls (up to `wait` seconds, max 25) for an outbox delivery. Access is
   * rechecked before answering, so a revoked user stops receiving changes.
   */
  api.get('/projects/:pid/changes', async (c) => {
    const pid = c.req.param('pid');
    const a = await s.core.authorize(P(c), pid, 'read');
    const since = Number(c.req.query('since') ?? -1);
    const waitSec = Math.min(25, Math.max(0, Number(c.req.query('wait') ?? 0)));
    let latest = Number(a.project.activity_seq);
    // Woken by this instance's outbox delivery, or by a database recheck every 1.5 s
    // (serverless instances do not share in-process notifications).
    const deadline = Date.now() + waitSec * 1000;
    while (Number.isFinite(since) && latest <= since && Date.now() < deadline && !c.req.raw.signal.aborted) {
      await s.outbox.notifier.wait(pid, since, Math.min(1500, deadline - Date.now()), c.req.raw.signal);
      latest = Number((await s.core.authorize(P(c), pid, 'read')).project.activity_seq);
    }
    return ok(c, { latestSeq: latest });
  });
  app.route('/api', api);

  // ------------------------------------------------------- scheduled jobs
  const cron = (job: () => Promise<unknown>) => async (c: Context) => {
    const { token } = bearerFrom(c.req.header('authorization'));
    if (!o.cronSecret || !token || token.length !== o.cronSecret.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(o.cronSecret))) {
      return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Scheduled job credential required.' } }, 401);
    }
    return c.json({ ok: true, data: await job() });
  };
  app.get('/internal/cron/outbox', cron(async () => {
    let delivered = 0;
    for (let i = 0; i < 20; i++) {
      const n = await s.outbox.runOnce();
      delivered += n;
      if (n === 0) break;
    }
    return { delivered, ...(await s.outbox.stats()) };
  }));
  app.get('/internal/cron/purge', cron(async () => ({ purged: await s.admin.purgeExpired() })));

  // ------------------------------------------------------------- webhooks
  app.post('/webhooks/clerk', async (c) => {
    if (!o.clerk.webhookSecret) return c.json({ error: 'webhooks not configured' }, 404);
    const raw = await c.req.text();
    const headers = { id: c.req.header('svix-id'), timestamp: c.req.header('svix-timestamp'), signature: c.req.header('svix-signature') };
    if (!verifySvix(o.clerk.webhookSecret, headers, raw)) return c.json({ error: 'invalid signature' }, 400);
    try {
      return c.json(await handleClerkEvent(s.core, headers.id!, raw));
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: 'webhook failed', event: headers.id, error: (err as Error).message.slice(0, 300) }));
      return c.json({ error: 'processing failed' }, 500);
    }
  });

  if (o.devRoutes) {
    // RFC 8414 path-inserted discovery for the /dev issuer (clients try this form first).
    const dev = o.devRoutes;
    for (const doc of ['oauth-authorization-server', 'openid-configuration']) {
      app.get(`/.well-known/${doc}/dev`, (c) => dev.fetch(new Request(new URL(`/.well-known/${doc}`, c.req.url))));
    }
    app.route('/dev', dev);
  }
  app.route('/', dashboardRoutes(o.publicUrl, o.clerk.frontendApi));
  return app;
}
