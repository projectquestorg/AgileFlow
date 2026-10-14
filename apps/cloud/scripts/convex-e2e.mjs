// End-to-end check against a running Convex deployment (real V8 runtime and HTTP actions).
// Needs a deployment with AGILEFLOW_DEV_AUTH=1 and dev keys (scripts/convex-dev-keys.mjs):
//   AGILEFLOW_API_URL=http://127.0.0.1:3211 AGILEFLOW_DEV_PRIVATE_JWK='{...}' CLERK_ISSUER=https://dev-issuer.agileflow.test \
//   node apps/cloud/scripts/convex-e2e.mjs
import crypto from 'node:crypto';
import { importJWK, SignJWT } from 'jose';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const B = (process.env.AGILEFLOW_API_URL ?? 'http://127.0.0.1:3211').replace(/\/+$/, '');
const jwk = JSON.parse(process.env.AGILEFLOW_DEV_PRIVATE_JWK);
const key = await importJWK(jwk, 'RS256');
const issuer = process.env.CLERK_ISSUER;
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, ...(detail !== undefined ? { detail } : {}) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== undefined ? `  ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
};
const rid = () => crypto.randomUUID();

const token = (o) =>
  new SignJWT({ scope: (o.scopes ?? ['user:org:read', 'agileflow:read']).join(' '), client_id: o.clientId ?? 'client_e2e', ...(o.orgId ? { org_id: o.orgId } : {}) })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid, typ: o.typ ?? 'at+jwt' })
    .setIssuer(o.issuer ?? issuer)
    .setSubject(o.userId)
    .setAudience(o.audience ?? `${B}/${o.resource ?? 'mcp'}`)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(key);

const call = async (path, { method = 'GET', bearer, body, headers = {} } = {}) => {
  const res = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, headers: res.headers, body: json ?? text };
};

const org = `org_e2e_${Date.now()}`;
const session = async (userId, role) => (await call('/dev/session', { method: 'POST', body: { userId, orgId: org, role, name: userId, orgName: 'E2E Org' } })).body.token;
const admin = await session('u_admin', 'admin');
const editorSession = await session('u_editor', 'member');
await session('u_viewer', 'member');
check('dev session minted', !!admin);

const created = await call('/api/projects', { method: 'POST', bearer: admin, body: { name: 'E2E Project' } });
const pid = created.body?.data?.id;
check('dashboard creates project', created.status === 200 && !!pid, created.body);
await call(`/api/projects/${pid}/grants/u_editor`, { method: 'PUT', bearer: admin, body: { role: 'editor', requestId: rid() } });
const vg = await call(`/api/projects/${pid}/grants/u_viewer`, { method: 'PUT', bearer: admin, body: { role: 'viewer', requestId: rid() } });
check('grants set', vg.status === 200, vg.body);

const tool = (bearer, name, args) => call(`/api/projects/${pid}/tools/${name}`, { method: 'POST', bearer, body: args });
const epic = (await tool(admin, 'agileflow_work_create', { kind: 'epic', title: 'Checkout', requestId: rid() })).body?.data;
const story = (await tool(admin, 'agileflow_work_create', { kind: 'story', title: 'Pay with card', epic: epic?.id, body: '## Acceptance Criteria\n\n- [ ] card accepted\n', requestId: rid() })).body?.data;
check('dashboard creates epic and story', /^EPIC-/.test(epic?.id ?? '') && story?.epic === epic?.id, { epic, story });

// MCP: real SDK client over Streamable HTTP.
const mcp = async (bearer) => {
  const client = new Client({ name: 'e2e', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${B}/mcp`), { requestInit: { headers: { authorization: `Bearer ${bearer}` } } }));
  return { client, call: async (name, args) => (await client.callTool({ name, arguments: args })).structuredContent };
};
const readTok = await token({ userId: 'u_editor', orgId: org });
const reader = await mcp(readTok);
const tools = await reader.client.listTools();
check('MCP lists 22 tools', tools.tools.length === 22, tools.tools.length);
const ctx = await reader.call('agileflow_context', {});
check('MCP context shows the project', ctx?.data?.projects?.some((p) => p.id === pid), ctx);
const got = await reader.call('agileflow_work_get', { projectId: pid, workId: story.id });
check('MCP reads the story', got?.data?.content?.body?.includes('card accepted'), got);

const denied = await call('/mcp', { method: 'POST', bearer: readTok, headers: { accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' }, body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'agileflow_note_add', arguments: { projectId: pid, kind: 'progress', body: 'x', requestId: rid() } } } });
check('read-only token gets 403 insufficient_scope', denied.status === 403 && /insufficient_scope/.test(denied.headers.get('www-authenticate') ?? ''), denied.status);

const WRITE = ['user:org:read', 'agileflow:read', 'agileflow:notes:write', 'agileflow:work:write', 'agileflow:runs:write', 'agileflow:controls:request'];
const writer = await mcp(await token({ userId: 'u_editor', orgId: org, scopes: WRITE }));
const note = await writer.call('agileflow_note_add', { projectId: pid, workId: story.id, kind: 'progress', body: 'Started on Convex.', requestId: rid() });
check('MCP adds a note', note?.ok === true, note);
const notes = await tool(admin, 'agileflow_note_list', { workId: story.id });
check('dashboard sees the agent note with server-derived author', notes.body?.data?.items?.[0]?.author?.kind === 'agent', notes.body);

const viewer = await mcp(await token({ userId: 'u_viewer', orgId: org, scopes: WRITE }));
const vw = await viewer.call('agileflow_work_create', { projectId: pid, kind: 'story', title: 'nope', requestId: rid() });
check('viewer cannot write even with every scope', vw?.error?.code === 'FORBIDDEN', vw);

// Runs and claims.
const run = (await writer.call('agileflow_run_start', { projectId: pid, workIds: [story.id], name: 'impl', intent: 'implement', requestId: rid() }))?.data;
const claim = await writer.call('agileflow_claim_acquire', { projectId: pid, storyId: story.id, runId: run?.id, requestId: rid() });
check('run started and story claimed', claim?.ok === true, claim);
const fin = await writer.call('agileflow_run_finish', { projectId: pid, runId: run?.id, expectedVersion: run?.version, outcome: 'completed', summary: 'done', requestId: rid() });
const after = (await tool(admin, 'agileflow_work_get', { workId: story.id })).body?.data;
check('run finish releases the claim and leaves the story status', fin?.data?.releasedClaims?.length === 1 && after?.status === 'backlog', { fin, status: after?.status });

// Pause blocks token work writes.
await call(`/api/projects/${pid}`, { method: 'PATCH', bearer: admin, body: { clientWritesPaused: true, requestId: rid() } });
const paused = await writer.call('agileflow_work_create', { projectId: pid, kind: 'story', title: 'x', requestId: rid() });
check('pause blocks connected-client work writes', paused?.error?.code === 'CLIENT_WRITES_PAUSED', paused);
await call(`/api/projects/${pid}`, { method: 'PATCH', bearer: admin, body: { clientWritesPaused: false, requestId: rid() } });

// Token verification boundary.
const list = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
const mcpHeaders = { accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' };
for (const [label, tok] of [
  ['cli audience at /mcp', await token({ userId: 'u_admin', orgId: org, resource: 'cli' })],
  ['wrong issuer', await token({ userId: 'u_admin', orgId: org, issuer: 'https://evil.example' })],
  ['wrong type', await token({ userId: 'u_admin', orgId: org, typ: 'JWT' })],
  ['missing organization', await token({ userId: 'u_admin' })],
  ['session token', admin],
]) {
  const r = await call('/mcp', { method: 'POST', bearer: tok, headers: mcpHeaders, body: list });
  check(`rejects ${label}`, r.status === 401, r.status);
}

// Connected CLI API.
const cliTok = await token({ userId: 'u_editor', orgId: org, resource: 'cli', clientId: 'agileflow-cli', scopes: WRITE });
const cliCtx = await call('/cli/v1/context', { bearer: cliTok });
check('CLI context', cliCtx.status === 200 && cliCtx.body?.data?.projects?.length === 1, cliCtx.body);
const cliList = await call('/cli/v1/tools/agileflow_work_list', { method: 'POST', bearer: cliTok, body: { projectId: pid } });
check('CLI tool call', cliList.status === 200 && cliList.body?.data?.items?.length === 2, cliList.body);

// Export, then import into a new project (native round trip).
const exp = await call(`/api/projects/${pid}/export`, { method: 'POST', bearer: admin, body: { complete: true } });
check('export produces native files and complete JSON', exp.status === 200 && Object.keys(exp.body?.data?.files ?? {}).length >= 4 && !!exp.body?.data?.complete, exp.status);
const p2 = (await call('/api/projects', { method: 'POST', bearer: admin, body: { name: 'E2E Copy' } })).body?.data?.id;
const prev = await call(`/api/projects/${p2}/import/preview`, { method: 'POST', bearer: admin, body: { files: exp.body?.data?.files, operationKey: rid() } });
const commit = await call(`/api/projects/${p2}/import/${prev.body?.data?.jobId}/commit`, { method: 'POST', bearer: admin, body: { requestId: rid() } });
const copy = (await call(`/api/projects/${p2}/tools/agileflow_work_get`, { method: 'POST', bearer: admin, body: { workId: story.id } })).body?.data;
check('import preview + commit keeps IDs and relations', commit.status === 200 && copy?.epic === epic.id, { preview: prev.body?.data?.preview?.counts, commit: commit.body, copy: copy?.id });

// Companion enrollment and delivery.
const lcTok = await token({ userId: 'u_admin', orgId: org, resource: 'local-control', clientId: 'agileflow-companion', scopes: ['user:org:read', 'agileflow:local:observe', 'agileflow:local:apply'] });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const secret = crypto.randomBytes(32).toString('base64url');
const lc = (path, body, credential) => call(`/local-control/v1/projects/${pid}${path}`, { method: 'POST', bearer: lcTok, body, headers: credential ? { 'x-agileflow-companion': credential } : {} });
const start = await lc('/enroll/start', { name: 'laptop', platform: 'linux-x64', version: '5.0.0', capabilities: ['questions.preference'], repoIdentity: 'github.com/acme/app', checkoutPathHash: sha('/w'), possessionHash: sha(secret) });
await call(`/api/projects/${pid}/enrollments/${start.body?.data?.enrollmentId}/approve`, { method: 'POST', bearer: admin, body: { capabilities: ['questions.preference'], requestId: rid() } });
const red = await lc('/enroll/redeem', { enrollmentId: start.body?.data?.enrollmentId, possessionSecret: secret });
const cred = red.body?.data?.credential;
await call(`/api/projects/${pid}/settings`, { method: 'PUT', bearer: admin, body: { desired: { questions: 'minimize' }, requestId: rid() } });
const poll = await lc('/poll', { version: '5.0.0' }, cred);
const op = poll.body?.data?.operations?.[0];
await lc(`/operations/${op?.id}/begin`, { planHash: op?.planHash }, cred);
const rec = await lc(`/operations/${op?.id}/receipt`, { state: 'applied', results: [{ target: 'interaction.questionPreference', outcome: 'applied' }], observation: { questions: 'minimize' } }, cred);
const settings = (await tool(admin, 'agileflow_settings_get', {})).body?.data;
check('companion enroll, poll, apply, receipt advances observed revision', rec.body?.data?.observedAdvanced === true && settings?.checkouts?.[0]?.observedRevision === 1, { rec: rec.body, checkouts: settings?.checkouts });

// Change feed.
const seq = (await call(`/api/projects/${pid}/changes`, { bearer: admin })).body?.data?.latestSeq;
check('change feed returns the activity sequence', Number.isInteger(seq) && seq > 0, seq);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
