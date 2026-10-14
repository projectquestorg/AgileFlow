import crypto from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { devService } from '../src/bootstrap';

export const BASE = 'http://localhost:8787';
export const ALL_WRITE = ['user:org:read', 'agileflow:read', 'agileflow:notes:write', 'agileflow:work:write', 'agileflow:runs:write', 'agileflow:controls:request'];

export type Harness = Awaited<ReturnType<typeof harness>>;

/** In-process service + helpers that mint real signed tokens through the dev issuer. */
export async function harness(opts: { now?: () => Date; webhookSecret?: string } = {}) {
  const svc = await devService({ publicUrl: BASE, now: opts.now, webhookSecret: opts.webhookSecret });
  const { issuer, directory } = svc.dev;
  const fetchApp = (input: string | URL | Request, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(new URL(String(input), BASE), init);
    return Promise.resolve(svc.app.fetch(req));
  };

  const member = (orgId: string, userId: string, role: 'admin' | 'member' = 'member', name = userId) => directory.set(orgId, userId, { role, user: { displayName: name } });

  const session = (userId: string, orgId: string | null, role: 'admin' | 'member' = 'admin') => issuer.session({ userId, orgId, orgRole: role, azp: BASE });

  const token = (o: { userId: string; orgId?: string; resource?: 'mcp' | 'cli' | 'local-control'; scopes?: string[]; clientId?: string; audience?: string; typ?: string; issuer?: string; ttlSec?: number }) =>
    issuer.accessToken({
      userId: o.userId,
      orgId: o.orgId,
      clientId: o.clientId ?? `client_${o.resource ?? 'mcp'}`,
      audience: o.audience ?? `${BASE}/${o.resource ?? 'mcp'}`,
      scopes: o.scopes ?? ['user:org:read', 'agileflow:read'],
      typ: o.typ,
      issuer: o.issuer,
      ttlSec: o.ttlSec,
    });

  /** Dashboard API call with a session bearer. */
  const api = async (sessionToken: string, method: string, path: string, body?: unknown) => {
    const res = await fetchApp(`${BASE}/api${path}`, {
      method,
      headers: { authorization: `Bearer ${sessionToken}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as any };
  };

  /** Connected CLI tool call. */
  const cliTool = async (accessToken: string, name: string, args: unknown) => {
    const res = await fetchApp(`${BASE}/cli/v1/tools/${name}`, { method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify(args) });
    return { status: res.status, headers: res.headers, body: (await res.json()) as any };
  };

  /** A real MCP SDK client over Streamable HTTP. */
  const mcp = async (accessToken: string) => {
    const client = new Client({ name: 'test-agent', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
      fetch: fetchApp as never,
      requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
    });
    await client.connect(transport);
    const call = async (name: string, args: Record<string, unknown>) => {
      const r = (await client.callTool({ name, arguments: args })) as { structuredContent?: any; isError?: boolean; content?: Array<{ text?: string }> };
      // Input that fails the published schema is rejected by the SDK before the domain runs.
      return r.structuredContent ?? { ok: false, error: { code: 'PROTOCOL_VALIDATION', message: r.content?.[0]?.text ?? '' } };
    };
    return { client, call };
  };

  /** Raw JSON-RPC POST to /mcp (to observe HTTP status and challenges). */
  const rawMcp = async (accessToken: string | null, body: unknown, headers: Record<string, string> = {}) => {
    const res = await fetchApp(`${BASE}/mcp`, {
      method: 'POST',
      headers: {
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
        ...headers,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, headers: res.headers, body: json };
  };

  return { svc, fetchApp, member, session, token, api, cliTool, mcp, rawMcp, rid: () => crypto.randomUUID() };
}

/** A workspace with an admin, a project, and a viewer and editor member. */
export async function seeded(h: Harness, orgId = 'org_acme') {
  h.member(orgId, 'user_admin', 'admin', 'Ada Admin');
  h.member(orgId, 'user_editor', 'member', 'Eddie Editor');
  h.member(orgId, 'user_viewer', 'member', 'Vera Viewer');
  const admin = await h.session('user_admin', orgId, 'admin');
  const project = (await h.api(admin, 'POST', '/projects', { name: 'Acme App' })).body.data;
  await h.api(admin, 'PUT', `/projects/${project.id}/grants/user_editor`, { role: 'editor', requestId: h.rid() });
  await h.api(admin, 'PUT', `/projects/${project.id}/grants/user_viewer`, { role: 'viewer', requestId: h.rid() });
  return { orgId, admin, projectId: project.id as string };
}
