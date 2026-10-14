/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { ConvexError } from 'convex/values';
import { internal } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import type { WirePrincipal } from '../../convex/lib/core';

/**
 * In-process Convex (convex-test) with the real schema and functions. Calls go
 * through the same internal entry points the HTTP layer uses: prepare
 * (membership mirror + connection), then ops.read / ops.write.
 */
export const modules = import.meta.glob('../../convex/**/!(*.*.*)*.*s');

process.env.AGILEFLOW_CURSOR_SECRET ??= 'test-cursor-secret';
process.env.AGILEFLOW_DEV_AUTH ??= '1';

export type T = ReturnType<typeof convexTest>;

export function setup() {
  const t = convexTest(schema, modules);
  let n = 0;
  const rid = () => `req-${Date.now()}-${n++}-${Math.random().toString(36).slice(2)}`;

  const session = (userId: string, orgId: string | null, orgRole: 'admin' | 'member' = 'admin'): WirePrincipal => ({ kind: 'session', issuer: 'https://issuer.test', userId, sessionId: `sess_${userId}`, orgId, orgRole: orgId ? orgRole : null });
  const token = (userId: string, orgId: string, opts: { resource?: 'mcp' | 'cli' | 'local-control'; scopes?: string[]; clientId?: string } = {}): WirePrincipal => {
    const resource = opts.resource ?? 'mcp';
    return { kind: 'token', issuer: 'https://issuer.test', userId, orgId, clientId: opts.clientId ?? `client_${resource}`, resource, resourceUri: `https://app.test/${resource}`, scopes: opts.scopes ?? ['user:org:read', 'agileflow:read'] };
  };

  /** Set what "Clerk" answers for a membership (null = not a member). */
  const member = (orgId: string, userId: string, role: 'admin' | 'member' | null, name = userId) =>
    t.mutation(internal.dev.directorySet, { orgId, userId, info: role ? { role, orgName: `Org ${orgId}`, user: { displayName: name } } : null });

  /** Run an operation like the HTTP layer: verify membership upstream (dev directory), prepare, run. */
  async function op(p: WirePrincipal, name: string, args: Record<string, unknown> = {}, opts: { write?: boolean } = {}) {
    const { READ_OPS } = await import('../../convex/ops');
    const isWrite = opts.write ?? !(name in READ_OPS);
    let freshSince: number | undefined;
    if (p.orgId) {
      freshSince = Date.now();
      const membership = await t.query(internal.dev.directoryGet, { orgId: p.orgId, userId: p.userId });
      await t.mutation(internal.ops.prepare, { principal: p, membership: membership ?? undefined, refreshMembership: true });
    }
    if (!isWrite) return (await t.query(internal.ops.read, { principal: p, name, args, freshSince })) as any;
    try {
      return (await t.mutation(internal.ops.write, { principal: p, name, args, freshSince })) as any;
    } catch (err) {
      if (err instanceof ConvexError) return err.data as any;
      throw err;
    }
  }

  /** Unwrap an ok outcome's envelope data, or fail with the error. */
  const data = (o: any) => {
    if (!o?.ok) throw new Error(`expected ok, got ${JSON.stringify(o)}`);
    return (o.value?.data ?? o.value) as any;
  };
  const code = (o: any) => (o?.ok ? 'OK' : (o?.error?.code ?? (o?.scope ? 'SCOPE' : 'UNKNOWN')));

  return { t, rid, session, token, member, op, data, code };
}

/** Workspace with an admin, an editor, a viewer, and one project. */
export async function seeded(h: ReturnType<typeof setup>, orgId = 'org_acme') {
  await h.member(orgId, 'user_admin', 'admin', 'Ada Admin');
  await h.member(orgId, 'user_editor', 'member', 'Eddie Editor');
  await h.member(orgId, 'user_viewer', 'member', 'Vera Viewer');
  const admin = h.session('user_admin', orgId, 'admin');
  const project = h.data(await h.op(admin, 'admin.createProject', { name: 'Acme App' }));
  await h.op(admin, 'admin.setGrant', { projectId: project.id, userId: 'user_editor', role: 'editor', requestId: h.rid() });
  await h.op(admin, 'admin.setGrant', { projectId: project.id, userId: 'user_viewer', role: 'viewer', requestId: h.rid() });
  return { orgId, admin, projectId: project.id as string };
}
