/**
 * Stage 0 interoperability gate against a REAL deployment and Clerk instance.
 *
 *   AGILEFLOW_SERVICE=https://... \
 *   STAGE0_MCP_READ_TOKEN=...     # access token from a real client consent, default scopes, /mcp audience
 *   STAGE0_MCP_WRITE_TOKEN=...    # after explicit write step-up (optional scopes granted)
 *   STAGE0_CLI_TOKEN=...          # from `agileflow cloud login` (/cli audience)
 *   STAGE0_PROJECT_ID=...         # a test project the user can edit
 *   npx tsx apps/cloud/scripts/stage0.ts > stage0-results.json
 *
 * Tokens come from real OAuth flows (a client's consent screen, `agileflow cloud
 * login`); this script never mints them. Each check records pass/fail/skipped.
 */
const svc = (process.env.AGILEFLOW_SERVICE ?? '').replace(/\/+$/, '');
if (!svc) throw new Error('AGILEFLOW_SERVICE is required');
const env = (k: string) => process.env[k] || null;
type Result = { gate: string; check: string; status: 'pass' | 'fail' | 'skipped'; detail?: string };
const results: Result[] = [];
const rec = (gate: string, check: string, ok: boolean | null, detail?: string) => results.push({ gate, check, status: ok === null ? 'skipped' : ok ? 'pass' : 'fail', ...(detail ? { detail } : {}) });

async function rpc(token: string | null, method: string, params: unknown) {
  const res = await fetch(`${svc}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, challenge: res.headers.get('www-authenticate') ?? '', body };
}
const tool = (t: string | null, name: string, args: unknown) => rpc(t, 'tools/call', { name, arguments: args });

const disc = await (await fetch(`${svc}/.well-known/agileflow.json`)).json() as any;
rec('Discovery and transport', 'agileflow.json served', !!disc.resources?.mcp);
const prm = await fetch(`${svc}/.well-known/oauth-protected-resource/mcp`);
const prmBody = await prm.json() as any;
rec('Discovery and transport', 'protected-resource metadata names the Clerk issuer', prm.ok && prmBody.resource === `${svc}/mcp` && prmBody.authorization_servers?.length === 1, JSON.stringify(prmBody.authorization_servers));
const asMeta = await fetch(`${prmBody.authorization_servers[0]}/.well-known/oauth-authorization-server`);
rec('Discovery and transport', 'authorization server advertises S256', asMeta.ok && ((await asMeta.json()) as any).code_challenge_methods_supported?.includes('S256'));
const anon = await rpc(null, 'tools/list', {});
rec('Token rejection', 'anonymous request gets 401 with resource_metadata', anon.status === 401 && anon.challenge.includes('resource_metadata'));
rec('Token rejection', 'garbage token rejected', (await rpc('a.b.c', 'tools/list', {})).status === 401);

const read = env('STAGE0_MCP_READ_TOKEN');
const write = env('STAGE0_MCP_WRITE_TOKEN');
const cli = env('STAGE0_CLI_TOKEN');
const pid = env('STAGE0_PROJECT_ID');
if (read) {
  const list = await rpc(read, 'tools/list', {});
  rec('Consent and tenant binding', 'real token lists 22 tools', list.status === 200 && list.body?.result?.tools?.length === 22, `status ${list.status}`);
  const ctx = await tool(read, 'agileflow_context', {});
  rec('Consent and tenant binding', 'verified organization reaches policy (context has workspace)', !!ctx.body?.result?.structuredContent?.data?.workspace?.orgId);
  const denied = pid ? await tool(read, 'agileflow_note_add', { projectId: pid, kind: 'comment', body: 'stage0', requestId: `stage0-${Date.now()}` }) : null;
  rec('Application isolation', 'default read-only grant gets 403 insufficient_scope on write', denied ? denied.status === 403 && denied.challenge.includes('insufficient_scope') : null);
} else rec('Consent and tenant binding', 'real read token', null, 'STAGE0_MCP_READ_TOKEN not set');
if (write && pid) {
  const note = await tool(write, 'agileflow_note_add', { projectId: pid, kind: 'comment', body: 'Stage 0 write check', requestId: `stage0-${Date.now()}` });
  rec('Consent and tenant binding', 'explicit write step-up permits a note', note.body?.result?.structuredContent?.ok === true);
} else rec('Consent and tenant binding', 'write step-up', null, 'STAGE0_MCP_WRITE_TOKEN/STAGE0_PROJECT_ID not set');
if (cli) {
  rec('Token rejection', 'CLI-audience token refused at /mcp', (await rpc(cli, 'tools/list', {})).status === 401);
  const ctx = await fetch(`${svc}/cli/v1/context`, { headers: { authorization: `Bearer ${cli}` } });
  rec('Consent and tenant binding', 'CLI token accepted at /cli', ctx.ok);
} else rec('Token rejection', 'cross-audience', null, 'STAGE0_CLI_TOKEN not set');
rec('Client lifecycle', 'refresh in the selected client', null, 'manual: record per client in STAGE0.md');
rec('Companion enrollment', 'enroll/approve/redeem/revoke', null, 'manual: `agileflow cloud companion enroll` against this deployment');

console.log(JSON.stringify({ service: svc, at: new Date().toISOString(), results }, null, 2));
process.exitCode = results.some((r) => r.status === 'fail') ? 1 : 0;
export {};
