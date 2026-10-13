import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { assertSafeRelativePath, findGitRoot, loadWorkspace, OperationError, projectScope, readProjectConfig, writeFileAtomic } from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, findProject, mutate, servicesFor, UsageError } from '../runtime';
import { cliVersion } from '../version';
import {
  accessToken,
  apiError,
  checkoutPathHash,
  CloudApi,
  cloudDeps,
  DEFAULT_SCOPES,
  discover,
  login,
  MANIFEST_REL,
  manifestPath,
  normalizeService,
  readManifest,
  readToken,
  repoIdentity,
  storeFor,
  tokenAccount,
  writeManifest,
  type CloudDeps,
  type CloudResource,
  type ConnectionManifest,
} from '../cloud/client';
import type { CredentialStore } from '../cloud/credentials';
import {
  applyPlan,
  COMPANION_CAPABILITIES,
  COMPANION_PLATFORMS,
  companionAccount,
  inventory,
  receiptState,
  type CompanionCredential,
  type PlanStep,
} from '../cloud/companion';

export interface CloudOptions {
  service?: string;
  scope?: string[];
  resource?: string;
  insecureFileStore?: boolean;
  json?: boolean;
  project?: string;
}

const deps = (cli: Cli): CloudDeps => cloudDeps(cli.ctx, cli.cloud);

/** The checkout this command is about: the AgileFlow project, else the Git root, else the current directory. */
async function checkoutRoot(cli: Cli): Promise<string> {
  return (await findProject(cli.ctx)) ?? (await findGitRoot(cli.ctx.cwd)) ?? path.resolve(cli.ctx.cwd);
}

/** The hosted AgileFlow service; --service, the project manifest, or AGILEFLOW_CLOUD_URL override it. */
export const DEFAULT_SERVICE = 'https://app.agileflow.projectquestorg.com';

async function resolveService(cli: Cli, explicit?: string): Promise<{ service: string; manifest: ConnectionManifest | null; root: string }> {
  const root = await checkoutRoot(cli);
  const manifest = await readManifest(root);
  const raw = explicit ?? manifest?.service ?? cli.ctx.env.AGILEFLOW_CLOUD_URL ?? DEFAULT_SERVICE;
  return { service: normalizeService(raw), manifest, root };
}

function resourceOf(value: string | undefined): CloudResource {
  if (!value || value === 'cli') return 'cli';
  if (value === 'local-control') return 'local-control';
  throw new UsageError('--resource must be cli or local-control');
}

async function readStore(cli: Cli): Promise<CredentialStore> {
  return storeFor(cli.ctx, deps(cli), { forWrite: false });
}

function announceStore(cli: Cli, store: CredentialStore): void {
  if (store.insecure) {
    cli.out.warn(`PLAINTEXT CREDENTIALS: your AgileFlow tokens are stored unencrypted in ${store.label.replace(/^plaintext file /, '')} (mode 0600). Anyone who can read that file can act as you. Run \`agileflow cloud logout\` to remove them.`);
  }
}

// ---------------------------------------------------------------------------
// login / logout
// ---------------------------------------------------------------------------

export async function runCloudLogin(cli: Cli, options: CloudOptions): Promise<number> {
  const d = deps(cli);
  const { service } = await resolveService(cli, options.service);
  const resource = resourceOf(options.resource);
  const store = await storeFor(cli.ctx, d, { insecureFileStore: options.insecureFileStore, forWrite: true });
  const discovery = await discover(d, service);
  const requested = (options.scope ?? []).flatMap((s) => s.split(/[\s,]+/)).filter(Boolean);
  if (discovery.capabilitySource === 'grants' && requested.some((s) => s.startsWith('agileflow:'))) {
    // The identity provider cannot issue AgileFlow scopes; asking for them would fail at consent.
    throw new UsageError('This AgileFlow service grants write access per connection in the dashboard, not through sign-in scopes.', [
      `Sign in without --scope, then grant the capability to the "AgileFlow CLI" connection: ${service}/#/connections`,
    ]);
  }
  const base = discovery.capabilitySource === 'grants' ? (discovery.defaultScopes[resource] ?? ['user:org:read']) : DEFAULT_SCOPES[resource];
  const scopes = [...new Set([...base, ...requested])];
  const record = await login({ deps: d, store, service, discovery, resource, scopes, print: (l) => cli.out.note(l) });
  announceStore(cli, store);
  if (cli.out.jsonMode) {
    cli.out.json({ ok: true, schema: 1, command: 'cloud login', service, resource, scopes: record.scopes, store: store.label });
    return EXIT.OK;
  }
  cli.out.line(`Signed in to ${service} (${resource}).`);
  cli.out.line(`Scopes: ${record.scopes.join(' ')}`);
  cli.out.line(`Stored in: ${store.label}`);
  return EXIT.OK;
}

export async function runCloudLogout(cli: Cli, options: CloudOptions): Promise<number> {
  const { service } = await resolveService(cli, options.service);
  const store = await readStore(cli);
  const removed: string[] = [];
  for (const r of options.resource ? [resourceOf(options.resource)] : (['cli', 'local-control'] as const)) {
    if (await store.delete(tokenAccount(service, r))) removed.push(r);
  }
  const note = 'Remote access is not revoked by signing out locally. Revoke it in the AgileFlow dashboard: Connections.';
  if (cli.out.jsonMode) {
    cli.out.json({ ok: true, schema: 1, command: 'cloud logout', service, removed, remoteRevocation: 'unconfirmed', note });
    return EXIT.OK;
  }
  cli.out.line(removed.length ? `Removed local credentials for ${service} (${removed.join(', ')}).` : `No local credentials for ${service}.`);
  cli.out.line(note);
  return EXIT.OK;
}

// ---------------------------------------------------------------------------
// status: four separate states, never collapsed
// ---------------------------------------------------------------------------

interface StateResult {
  ok: boolean;
  detail?: string;
  [k: string]: unknown;
}

export async function runCloudStatus(cli: Cli, options: CloudOptions): Promise<number> {
  const d = deps(cli);
  const root = await checkoutRoot(cli);
  const manifest = await readManifest(root);
  const raw = options.service ?? manifest?.service ?? cli.ctx.env.AGILEFLOW_CLOUD_URL ?? DEFAULT_SERVICE;
  const service = raw ? normalizeService(raw) : null;
  const store = await readStore(cli);
  const token = service ? await readToken(store, service, 'cli') : null;

  const registered: StateResult = {
    ok: !!manifest || !!token,
    manifest: manifest ? MANIFEST_REL : null,
    credential: !!token,
    store: store.label,
    detail: manifest ? `bound to project ${manifest.projectId}` : token ? 'signed in; this checkout is not connected to a project' : 'no connection manifest or credential',
  };
  const unknown = (why: string): StateResult => ({ ok: false, detail: `not checked: ${why}` });
  let reachable: StateResult = unknown('no service configured');
  let authorized: StateResult = unknown('not reachable');
  let verified: StateResult = unknown('not authorized');

  if (service) {
    try {
      await discover(d, service);
      reachable = { ok: true, detail: service };
    } catch (err) {
      reachable = { ok: false, detail: (err as Error).message };
    }
  }
  if (service && reachable.ok) {
    if (!token) authorized = { ok: false, detail: 'not signed in (run `agileflow cloud login`)' };
    else {
      const api = new CloudApi(d, store, service, 'cli');
      try {
        const ctx = (await api.call('GET', '/cli/v1/context')).data;
        authorized = { ok: true, workspace: ctx.workspace?.name ?? null, workspaceId: ctx.workspace?.id ?? null, user: ctx.user?.id ?? null, scopes: ctx.scopes ?? [], detail: `${ctx.workspace?.name} as ${ctx.user?.id}` };
        if (!manifest) verified = unknown('no project bound (run `agileflow cloud connect --project <id>`)');
        else {
          try {
            await api.tool('agileflow_work_list', { projectId: manifest.projectId, limit: 1 });
            verified = { ok: true, projectId: manifest.projectId, detail: `read work in ${manifest.projectId}` };
          } catch (err) {
            verified = { ok: false, projectId: manifest.projectId, detail: (err as Error).message };
          }
        }
      } catch (err) {
        authorized = { ok: false, detail: (err as Error).message };
      }
    }
  }
  const all = registered.ok && reachable.ok && authorized.ok && verified.ok;
  if (cli.out.jsonMode || options.json) {
    cli.out.json({ ok: all, schema: 1, command: 'cloud status', service, registered, reachable, authorized, operationVerified: verified });
    return all ? EXIT.OK : EXIT.ERROR;
  }
  const row = (label: string, s: StateResult) => cli.out.line(`  ${cli.out.paint(s.ok ? '[ok]' : '[x]', s.ok ? 'green' : 'red')} ${label.padEnd(20)} ${s.detail ?? ''}`);
  cli.out.heading(`AgileFlow connected mode${service ? `: ${service}` : ''}`);
  row('registered', registered);
  row('reachable', reachable);
  row('authorized', authorized);
  if (authorized.ok) cli.out.line(`       scopes: ${(authorized.scopes as string[]).join(' ')}`);
  row('operation verified', verified);
  return all ? EXIT.OK : EXIT.ERROR;
}

// ---------------------------------------------------------------------------
// connect / disconnect
// ---------------------------------------------------------------------------

async function isGitIgnored(root: string, rel: string): Promise<boolean | null> {
  return new Promise((resolve) =>
    execFile('git', ['check-ignore', '-q', rel], { cwd: root }, (err) => {
      if (!err) resolve(true);
      else resolve((err as { code?: number }).code === 1 ? false : null);
    }),
  );
}

export async function runCloudConnect(cli: Cli, options: CloudOptions): Promise<number> {
  if (!options.project) throw new UsageError('Pass the project to bind: agileflow cloud connect --project <id>', ['Project IDs are listed by `agileflow cloud status` and in the dashboard.']);
  const d = deps(cli);
  const { service, root } = await resolveService(cli, options.service);
  const store = await readStore(cli);
  const api = new CloudApi(d, store, service, 'cli');
  const discovery = await discover(d, service);
  const ctx = (await api.call('GET', '/cli/v1/context')).data;
  const project = (ctx.projects as Array<{ id: string; name: string }>).find((p) => p.id === options.project);
  if (!project) {
    throw new OperationError(`Project ${options.project} is not available to this sign-in.`, [
      ctx.projects.length ? `Available: ${(ctx.projects as Array<{ id: string; name: string }>).map((p) => `${p.name} (${p.id})`).join(', ')}` : 'No projects are available; ask a workspace admin for access.',
    ]);
  }
  const manifest: ConnectionManifest = {
    schemaVersion: 1,
    service,
    projectId: project.id,
    workspaceId: ctx.workspace.id,
    authority: 'connected',
    repoIdentity: await repoIdentity(root),
    checkout: { pathHash: await checkoutPathHash(root) },
    boundAt: new Date(d.now()).toISOString(),
    minimumCliVersion: discovery.minimumVersions?.cli ?? cliVersion(),
  };
  await writeManifest(root, manifest);
  let ignoredNote: string | null = null;
  const ignored = await isGitIgnored(root, MANIFEST_REL);
  if (ignored !== true) {
    const gi = path.join(root, '.gitignore');
    const text = await fs.promises.readFile(gi, 'utf8').catch(() => '');
    if (!text.split(/\r?\n/).some((l) => l.trim() === MANIFEST_REL || l.trim() === `/${MANIFEST_REL}`)) {
      await writeFileAtomic(gi, `${text}${text && !text.endsWith('\n') ? '\n' : ''}${MANIFEST_REL}\n`);
      ignoredNote = `Added ${MANIFEST_REL} to .gitignore (the binding is per checkout).`;
    }
  }
  if (cli.out.jsonMode) {
    cli.out.json({ ok: true, schema: 1, command: 'cloud connect', manifest: MANIFEST_REL, connection: manifest, project, gitignoreUpdated: !!ignoredNote });
    return EXIT.OK;
  }
  cli.out.line(`Connected this checkout to ${project.name} (${project.id}) in ${ctx.workspace.name}.`);
  cli.out.line(`Wrote ${MANIFEST_REL} (no credentials).`);
  if (ignoredNote) cli.out.line(ignoredNote);
  cli.out.line('Connected mode: the AgileFlow service is the source of truth for work. Use `agileflow cloud work ...`; local Work files are snapshots or import input.');
  cli.out.line('Older AgileFlow CLIs do not read this manifest; edits they make locally are only re-import input.');
  return EXIT.OK;
}

export async function runCloudDisconnect(cli: Cli): Promise<number> {
  const root = await checkoutRoot(cli);
  const m = await readManifest(root);
  if (m) await fs.promises.rm(manifestPath(root), { force: true });
  if (cli.out.jsonMode) {
    cli.out.json({ ok: true, schema: 1, command: 'cloud disconnect', removed: !!m, projectId: m?.projectId ?? null });
    return EXIT.OK;
  }
  cli.out.line(m ? `Removed ${MANIFEST_REL}. Cloud project ${m.projectId} and its data are untouched; sign-in credentials are kept (\`agileflow cloud logout\` removes them).` : 'This checkout is not connected.');
  return EXIT.OK;
}

// ---------------------------------------------------------------------------
// work
// ---------------------------------------------------------------------------

export interface CloudWorkOptions extends CloudOptions {
  type?: string;
  status?: string;
  epic?: string;
  search?: string;
  limit?: string;
  body?: string;
  priority?: string;
  horizon?: string;
  reason?: string;
  work?: string;
  kind?: string;
}

/**
 * A changed Git remote or a moved checkout must be re-verified before the
 * binding is reused: work could otherwise reach the wrong cloud project.
 */
async function verifyBinding(root: string, manifest: ConnectionManifest): Promise<void> {
  const [remote, pathHash] = await Promise.all([repoIdentity(root), checkoutPathHash(root)]);
  const problems: string[] = [];
  if ((manifest.repoIdentity ?? null) !== remote) problems.push(`the Git remote changed (bound: ${manifest.repoIdentity ?? 'none'}, now: ${remote ?? 'none'})`);
  if (manifest.checkout?.pathHash !== pathHash) problems.push('this checkout moved or is a different worktree than the one that was connected');
  if (problems.length) {
    throw new OperationError(`The connection binding no longer matches this checkout: ${problems.join('; ')}.`, [
      `Confirm the project and re-bind with: agileflow cloud connect --project ${manifest.projectId}`,
    ]);
  }
}

async function connectedProject(cli: Cli, options: CloudOptions): Promise<{ api: CloudApi; projectId: string; service: string }> {
  const { service, manifest, root } = await resolveService(cli, options.service);
  if (manifest) await verifyBinding(root, manifest);
  const projectId = options.project ?? manifest?.projectId;
  if (!projectId) throw new UsageError('No project: this checkout is not connected.', ['Run `agileflow cloud connect --project <id>`, or pass --project <id>.']);
  return { api: new CloudApi(deps(cli), await readStore(cli), service, 'cli'), projectId, service };
}

async function announceProject(cli: Cli, api: CloudApi, projectId: string): Promise<{ id: string; name: string }> {
  const ctx = (await api.call('GET', '/cli/v1/context')).data;
  const p = (ctx.projects as Array<{ id: string; name: string }>).find((x) => x.id === projectId);
  if (!p) throw new OperationError(`Project ${projectId} is not available to this sign-in (removed, or access changed).`);
  cli.out.note(`Project: ${p.name} (${p.id})`);
  return p;
}

const rid = () => `cli-${crypto.randomUUID()}`;

function printWarnings(cli: Cli, res: any): void {
  for (const w of res?.warnings ?? []) cli.out.warn(`${w.code}: ${w.message}`);
}

export async function runCloudWork(cli: Cli, action: string | undefined, args: string[], options: CloudWorkOptions): Promise<number> {
  const { api, projectId } = await connectedProject(cli, options);
  const json = cli.out.jsonMode || !!options.json;
  switch (action) {
    case 'list': {
      const limit = options.limit ? Number(options.limit) : 50;
      const items: any[] = [];
      let cursor: string | undefined;
      do {
        const res = await api.tool('agileflow_work_list', {
          projectId,
          ...(options.type ? { type: options.type.replace(/s$/, '') } : {}),
          ...(options.status ? { status: options.status } : {}),
          ...(options.epic ? { epic: options.epic } : {}),
          ...(options.search ? { search: options.search } : {}),
          limit: Math.min(200, Math.max(1, limit - items.length)),
          ...(cursor ? { cursor } : {}),
        });
        items.push(...(res.data.items ?? []));
        cursor = res.data.hasMore ? res.data.nextCursor : undefined;
      } while (cursor && items.length < limit);
      if (json) {
        cli.out.json({ ok: true, schema: 1, command: 'cloud work list', projectId, items });
        return EXIT.OK;
      }
      if (!items.length) cli.out.line('No work items.');
      for (const it of items) cli.out.line(`${String(it.id).padEnd(16)} ${String(it.status).padEnd(12)} ${it.title}`);
      return EXIT.OK;
    }
    case 'show': {
      const id = args[0];
      if (!id) throw new UsageError('Use: agileflow cloud work show <id>');
      let res = await api.tool('agileflow_work_get', { projectId, workId: id });
      const item = res.data;
      let body = item.content?.body ?? '';
      while (res.data.content && !res.data.content.complete) {
        res = await api.tool('agileflow_work_get', { projectId, workId: id, contentCursor: res.data.content.contentCursor });
        body += res.data.content.body ?? '';
      }
      const full = { ...item, content: { complete: true, body } };
      if (json) {
        cli.out.json({ ok: true, schema: 1, command: 'cloud work show', projectId, item: full });
        return EXIT.OK;
      }
      cli.out.heading(`${item.id}  ${item.title}`);
      cli.out.line(`type: ${item.type}  status: ${item.status}  version: ${item.version}${item.priority ? `  priority: ${item.priority}` : ''}${item.epic ? `  epic: ${item.epic}` : ''}`);
      cli.out.line();
      cli.out.line(body.trimEnd());
      return EXIT.OK;
    }
    case 'create': {
      const [kind, ...titleWords] = args;
      const title = titleWords.join(' ').trim();
      if (!kind || !['epic', 'story', 'decision'].includes(kind) || !title) throw new UsageError('Use: agileflow cloud work create <epic|story|decision> <title...>');
      const project = await announceProject(cli, api, projectId);
      const res = await api.tool('agileflow_work_create', {
        projectId,
        kind,
        title,
        ...(options.body ? { body: options.body } : {}),
        ...(options.status ? { status: options.status } : {}),
        ...(options.priority ? { priority: options.priority } : {}),
        ...(options.horizon ? { horizon: options.horizon } : {}),
        ...(options.epic ? { epic: options.epic } : {}),
        requestId: rid(),
      });
      printWarnings(cli, res);
      if (json) {
        cli.out.json({ ok: true, schema: 1, command: 'cloud work create', project, result: res });
        return EXIT.OK;
      }
      cli.out.line(`Created ${res.data.id ?? res.data.item?.id} in ${project.name}.`);
      return EXIT.OK;
    }
    case 'move': {
      const [id, target] = args;
      if (!id || !target) throw new UsageError('Use: agileflow cloud work move <id> <status>');
      const project = await announceProject(cli, api, projectId);
      const current = await api.tool('agileflow_work_get', { projectId, workId: id });
      const res = await api.tool('agileflow_work_transition', {
        projectId,
        workId: current.data.id ?? id,
        expectedVersion: current.data.version,
        targetStatus: target,
        ...(options.reason ? { reason: options.reason } : {}),
        requestId: rid(),
      });
      printWarnings(cli, res);
      if (json) {
        cli.out.json({ ok: true, schema: 1, command: 'cloud work move', project, result: res });
        return EXIT.OK;
      }
      cli.out.line(`${current.data.id ?? id}: ${current.data.status} -> ${target}`);
      return EXIT.OK;
    }
    case 'note': {
      const body = args.join(' ').trim();
      if (!body) throw new UsageError('Use: agileflow cloud work note <text...> [--work <id>] [--kind comment|progress|blocker|handoff]');
      const project = await announceProject(cli, api, projectId);
      const res = await api.tool('agileflow_note_add', {
        projectId,
        kind: options.kind ?? 'comment',
        body,
        ...(options.work ? { workId: options.work } : {}),
        requestId: rid(),
      });
      if (json) {
        cli.out.json({ ok: true, schema: 1, command: 'cloud work note', project, result: res });
        return EXIT.OK;
      }
      cli.out.line(`Added a ${options.kind ?? 'comment'} note in ${project.name}${options.work ? ` on ${options.work}` : ''}.`);
      return EXIT.OK;
    }
    default:
      throw new UsageError(`Unknown cloud work action "${action ?? ''}"`, ['Actions: list, show, create, move, note']);
  }
}

// ---------------------------------------------------------------------------
// import / export
// ---------------------------------------------------------------------------

const WORK_DIRS = ['00-product', '01-roadmap', '02-epics', '03-stories', '04-decisions'];

async function collectWorkFiles(dir: string, rel: string, out: Record<string, string>): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const childRel = `${rel}/${e.name}`;
    if (e.isDirectory()) await collectWorkFiles(path.join(dir, e.name), childRel, out);
    // Symlinks and non-Markdown files are never uploaded.
    else if (e.isFile() && e.name.endsWith('.md')) out[childRel] = await fs.promises.readFile(path.join(dir, e.name), 'utf8');
  }
}

export async function runCloudImport(cli: Cli, options: CloudOptions & { workRoot?: string }): Promise<number> {
  const { api, projectId } = await connectedProject(cli, options);
  const root = await checkoutRoot(cli);
  let workRoot = options.workRoot;
  if (!workRoot) {
    const cfg = await readProjectConfig(projectScope(root).configPath).catch(() => null);
    workRoot = cfg?.work?.root ?? 'docs/agile';
  }
  const abs = path.resolve(root, workRoot);
  const files: Record<string, string> = {};
  const readme = path.join(abs, 'README.md');
  if ((await fs.promises.lstat(readme).catch(() => null))?.isFile()) files['README.md'] = await fs.promises.readFile(readme, 'utf8');
  for (const d of WORK_DIRS) {
    const st = await fs.promises.lstat(path.join(abs, d)).catch(() => null);
    if (st?.isDirectory()) await collectWorkFiles(path.join(abs, d), d, files);
  }
  if (!Object.keys(files).length) throw new OperationError(`No Work files found under ${workRoot}.`, ['Pass --work-root <dir> if the workspace lives elsewhere.']);
  const project = await announceProject(cli, api, projectId);
  const res = await api.call('POST', `/cli/v1/projects/${encodeURIComponent(projectId)}/import/preview`, { files, operationKey: rid() });
  const { preview, reviewUrl, jobId } = res.data;
  if (cli.out.jsonMode || options.json) {
    cli.out.json({ ok: true, schema: 1, command: 'cloud import', project, files: Object.keys(files).length, jobId, reviewUrl, preview });
    return EXIT.OK;
  }
  const c = preview.counts;
  cli.out.line(`Uploaded ${Object.keys(files).length} file(s) from ${workRoot} for preview. Local files were not modified.`);
  cli.out.line(`Found: ${c.epics} epic(s), ${c.stories} story(ies), ${c.decisions} decision(s), ${c.documents} document(s).`);
  const changes = (preview.changes ?? []) as Array<{ kind?: string; action?: string }>;
  if (changes.length) {
    const byKind = new Map<string, number>();
    for (const ch of changes) byKind.set(ch.action ?? ch.kind ?? 'change', (byKind.get(ch.action ?? ch.kind ?? 'change') ?? 0) + 1);
    cli.out.line(`Changes: ${[...byKind].map(([k, n]) => `${n} ${k}`).join(', ')}`);
  }
  cli.out.line(`Issues: ${preview.errors ?? 0} error(s), ${preview.warnings ?? 0} warning(s)${preview.blocked ? ' (blocking: fix them and import again)' : ''}`);
  for (const i of (preview.issues ?? []).slice(0, 20)) cli.out.line(`  [${i.level}] ${i.path ? `${i.path}: ` : ''}${i.message}`);
  cli.out.line(`A workspace admin reviews and confirms the import in the dashboard:`);
  cli.out.line(`  ${reviewUrl}`);
  return EXIT.OK;
}

function safeRel(rel: string): string {
  assertSafeRelativePath(rel);
  if (rel.split(/[\\/]/).includes('..') || path.isAbsolute(rel)) throw new OperationError(`Refusing unsafe export path: ${rel}`);
  return rel;
}

export async function runCloudExport(cli: Cli, options: CloudOptions & { out?: string; complete?: boolean; force?: boolean }): Promise<number> {
  const { api, projectId } = await connectedProject(cli, options);
  const res = await api.call('POST', `/cli/v1/projects/${encodeURIComponent(projectId)}/export`, { complete: !!options.complete });
  const data = res.data;
  const outDir = path.resolve(cli.ctx.cwd, options.out ?? `agileflow-export-${projectId}`);
  const workRel = safeRel(String(data.root ?? 'docs/agile'));
  const writes: Array<[string, string]> = [];
  for (const [rel, content] of Object.entries(data.files as Record<string, string>)) writes.push([path.join(outDir, workRel, safeRel(rel)), content]);
  for (const [rel, value] of Object.entries((data.complete ?? {}) as Record<string, unknown>)) {
    if (!rel.startsWith('agileflow-connected/')) continue;
    writes.push([path.join(outDir, safeRel(rel)), JSON.stringify(value, null, 2) + '\n']);
  }
  writes.push([path.join(outDir, 'agileflow-connected', 'validation-report.json'), JSON.stringify({ projectId, exportedAt: new Date(deps(cli).now()).toISOString(), jobId: data.jobId, ...data.report }, null, 2) + '\n']);
  if (!(options as { force?: boolean }).force) {
    const existing = [];
    for (const [file] of writes) if (await fs.promises.lstat(file).catch(() => null)) existing.push(path.relative(cli.ctx.cwd, file));
    if (existing.length) throw new OperationError(`Refusing to overwrite ${existing.length} existing file(s) in ${outDir}, e.g. ${existing[0]}.`, ['Choose another --out directory, or pass --force to overwrite.']);
  }
  for (const [file, content] of writes) {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await writeFileAtomic(file, content);
  }
  const summary = { files: Object.keys(data.files).length, complete: Object.keys(data.complete ?? {}).length, errors: data.report?.errors ?? 0, warnings: data.report?.warnings ?? 0 };
  if (cli.out.jsonMode || options.json) {
    cli.out.json({ ok: true, schema: 1, command: 'cloud export', projectId, out: outDir, workRoot: workRel, ...summary });
    return EXIT.OK;
  }
  cli.out.line(`Exported ${summary.files} native Work file(s) to ${path.join(outDir, workRel)}`);
  if (options.complete) cli.out.line(`Complete export (notes, revisions, activity, runs, ...): ${path.join(outDir, 'agileflow-connected')}`);
  cli.out.line(`Validation report: ${path.join(outDir, 'agileflow-connected', 'validation-report.json')} (${summary.errors} error(s), ${summary.warnings} warning(s))`);
  return EXIT.OK;
}

// ---------------------------------------------------------------------------
// companion
// ---------------------------------------------------------------------------

export interface CompanionOptions extends CloudOptions {
  apply?: boolean;
  once?: boolean;
  interval?: string;
  name?: string;
}

async function companionContext(cli: Cli, options: CloudOptions) {
  const { service, manifest, root } = await resolveService(cli, options.service);
  if (!manifest) throw new UsageError('This checkout is not connected to a project.', ['Run `agileflow cloud connect --project <id>` first.']);
  const pathHash = await checkoutPathHash(root);
  return { service, manifest, root, pathHash, account: companionAccount(service, manifest.projectId, pathHash) };
}

export async function runCloudCompanion(cli: Cli, action: string | undefined, options: CompanionOptions): Promise<number> {
  switch (action) {
    case 'enroll':
      return companionEnroll(cli, options);
    case 'run':
      return companionRun(cli, options);
    case 'disconnect':
      return companionDisconnect(cli, options);
    default:
      throw new UsageError(`Unknown companion action "${action ?? ''}"`, ['Actions: enroll, run, disconnect']);
  }
}

async function companionEnroll(cli: Cli, options: CompanionOptions): Promise<number> {
  const d = deps(cli);
  const platform = `${cli.ctx.platform}-${d.arch}`;
  if (!(COMPANION_PLATFORMS as readonly string[]).includes(platform)) {
    throw new OperationError(`The local companion is not supported on ${platform} yet.`, [`Supported: ${COMPANION_PLATFORMS.join(', ')}. The dashboard, MCP, and connected CLI still work here.`]);
  }
  const { service, manifest, root, pathHash, account } = await companionContext(cli, options);
  const store = await storeFor(cli.ctx, d, { insecureFileStore: options.insecureFileStore, forWrite: true });
  const discovery = await discover(d, service);
  const grants = discovery.capabilitySource === 'grants';
  // In grants mode, apply access is granted to the companion connection in the dashboard, not via scopes.
  const scopes = grants ? (discovery.defaultScopes['local-control'] ?? ['user:org:read']) : [...DEFAULT_SCOPES['local-control'], ...(options.apply ? ['agileflow:local:apply'] : [])];
  if (grants && options.apply) cli.out.note(`After enrolling, grant "local:apply" to the companion connection in the dashboard: ${service}/#/connections`);
  const existing = await readToken(store, service, 'local-control');
  if (!existing || !scopes.every((s) => existing.scopes.includes(s))) {
    cli.out.note(`Sign in for local control (${scopes.join(' ')}).`);
    const rec = await login({ deps: d, store, service, discovery, resource: 'local-control', scopes, print: (l) => cli.out.note(l) });
    if (!scopes.every((s) => rec.scopes.includes(s))) {
      throw new OperationError(`The sign-in did not grant: ${scopes.filter((s) => !rec.scopes.includes(s)).join(', ')}.`, ['Enroll again and grant the requested permissions.']);
    }
  }
  announceStore(cli, store);
  const api = new CloudApi(d, store, service, 'local-control');
  const possession = crypto.randomBytes(32).toString('base64url');
  const possessionHash = crypto.createHash('sha256').update(possession).digest('hex');
  const repo = (await repoIdentity(root)) ?? '';
  const pid = encodeURIComponent(manifest.projectId);
  const start = (
    await api.call('POST', `/local-control/v1/projects/${pid}/enroll/start`, {
      name: options.name ?? `${path.basename(root)} on ${platform}`,
      platform,
      version: cliVersion(),
      capabilities: options.apply ? [...COMPANION_CAPABILITIES] : [],
      repoIdentity: repo,
      checkoutPathHash: pathHash,
      possessionHash,
    })
  ).data;
  cli.out.line('A workspace admin must approve this companion in the dashboard:');
  cli.out.line(`  ${service}/#/p/${pid}/controls`);
  cli.out.line(`Waiting for approval (expires ${start.expiresAt})...`);
  const deadline = d.now() + 10 * 60_000;
  for (;;) {
    const r = await api.raw('POST', `/local-control/v1/projects/${pid}/enroll/redeem`, { enrollmentId: start.enrollmentId, possessionSecret: possession });
    if (r.status < 400 && r.body?.ok) {
      const cred: CompanionCredential = {
        schemaVersion: 1,
        service,
        projectId: manifest.projectId,
        companionId: r.body.data.companionId,
        checkoutId: r.body.data.checkoutId,
        credential: r.body.data.credential,
        capabilities: r.body.data.capabilities ?? [],
        checkoutPathHash: pathHash,
        repoIdentity: repo,
        enrolledAt: new Date(d.now()).toISOString(),
      };
      await store.set(account, JSON.stringify(cred));
      if (cli.out.jsonMode || options.json) {
        cli.out.json({ ok: true, schema: 1, command: 'cloud companion enroll', companionId: cred.companionId, checkoutId: cred.checkoutId, capabilities: cred.capabilities, store: store.label });
        return EXIT.OK;
      }
      cli.out.line(`Enrolled companion ${cred.companionId} (${cred.capabilities.length ? cred.capabilities.join(', ') : 'observe only'}).`);
      cli.out.line(`Installation credential stored in: ${store.label}`);
      cli.out.line('Start it with: agileflow cloud companion run');
      return EXIT.OK;
    }
    if (r.body?.error?.code !== 'APPROVAL_REQUIRED') throw apiError(r, 'local-control', api.scopes);
    if (d.now() >= deadline) throw new OperationError('The enrollment request expired before it was approved.', ['Start again: agileflow cloud companion enroll']);
    await d.sleep(3000);
  }
}

async function companionRun(cli: Cli, options: CompanionOptions): Promise<number> {
  const d = deps(cli);
  const { service, manifest, root, account } = await companionContext(cli, options);
  const store = await readStore(cli);
  const raw = await store.get(account);
  if (!raw) throw new OperationError('This checkout has no companion enrollment.', ['Enroll it: agileflow cloud companion enroll --apply']);
  const cred = JSON.parse(raw) as CompanionCredential;
  const api = new CloudApi(d, store, service, 'local-control', { 'x-agileflow-companion': cred.credential });
  const pid = encodeURIComponent(manifest.projectId);
  const scope = projectScope(root);
  const interval = Math.max(5, Number(options.interval ?? 15)) * 1000;
  const reports: unknown[] = [];

  const once = async () => {
    // Reauthorize on every poll: a fresh (refreshed if needed) token and the installation credential.
    await accessToken(d, store, service, 'local-control');
    const inv = (await findProject(cli.ctx)) ? await inventory(await loadWorkspace(scope), cliVersion()) : {};
    let poll;
    try {
      poll = (await api.call('POST', `/local-control/v1/projects/${pid}/poll`, { version: cliVersion(), inventory: inv })).data;
    } catch (err) {
      if ((err as { code?: string }).code === 'FORBIDDEN') {
        throw new OperationError(`The service refused this companion: ${(err as Error).message}`, [
          'It may have been disconnected in the dashboard. Nothing was applied locally.',
          'To use it again: agileflow cloud companion disconnect, then agileflow cloud companion enroll --apply',
        ]);
      }
      throw err;
    }
    if (!poll.supported) cli.out.warn(`The service requires companion ${poll.minimumVersion} or later; upgrade the CLI. Operations stay pending.`);
    for (const op of poll.operations ?? []) {
      const currentPath = await checkoutPathHash(root);
      const currentRepo = (await repoIdentity(root)) ?? '';
      const bindingOk = op.binding?.checkoutPathHash === currentPath && op.binding?.repoIdentity === currentRepo;
      try {
        await api.call('POST', `/local-control/v1/projects/${pid}/operations/${encodeURIComponent(op.id)}/begin`, { planHash: op.planHash });
      } catch (err) {
        cli.out.warn(`Operation ${op.id} was not started: ${(err as Error).message}`);
        reports.push({ operationId: op.id, state: 'not-started', error: (err as Error).message });
        continue;
      }
      const steps = (op.plan?.steps ?? []) as PlanStep[];
      let results;
      let reloadRequired = false;
      let detail: string[] = [];
      if (!bindingOk) {
        results = steps.map((s) => ({ target: s.target, outcome: 'blocked' as const, detail: 'This checkout no longer matches the enrolled binding (moved or different repository). Re-enroll to continue.' }));
      } else {
        const services = await servicesFor(cli.ctx, scope);
        const applied = await mutate(cli, scope, () => applyPlan(services, scope, steps, cred.capabilities));
        results = applied.results;
        reloadRequired = applied.skillsChanged;
        detail = applied.syncErrors;
      }
      let state = receiptState(results);
      if (detail.length && state === 'applied') state = 'failed';
      const observation = (await findProject(cli.ctx)) ? await inventory(await loadWorkspace(scope), cliVersion()) : {};
      const receipt = (
        await api.call('POST', `/local-control/v1/projects/${pid}/operations/${encodeURIComponent(op.id)}/receipt`, {
          state,
          results: detail.length ? [...results, ...detail.map((m) => ({ target: 'sync', outcome: 'failed', detail: m }))] : results,
          reloadRequired,
          observation,
        })
      ).data;
      reports.push({ operationId: op.id, revision: op.revision, state: receipt.state, results, reloadRequired });
      cli.out.line(`Operation ${op.id} (revision ${op.revision}): ${receipt.state}`);
      for (const r of results) cli.out.line(`  ${r.outcome.padEnd(11)} ${r.target}${r.detail ? `: ${r.detail}` : ''}`);
      if (reloadRequired) cli.out.line('  Restart or reload your coding agent to pick up the skill changes.');
    }
    return poll;
  };

  if (options.once) {
    const poll = await once();
    if (cli.out.jsonMode || options.json) cli.out.json({ ok: true, schema: 1, command: 'cloud companion run', companionId: poll.companionId, operations: reports });
    else if (!reports.length) cli.out.line('No pending operations.');
    return EXIT.OK;
  }
  cli.out.line(`Companion running for project ${manifest.projectId} (polling every ${interval / 1000}s; Ctrl+C to stop).`);
  for (;;) {
    await once();
    await d.sleep(interval);
  }
}

async function companionDisconnect(cli: Cli, options: CompanionOptions): Promise<number> {
  const { service, manifest, account } = await companionContext(cli, options);
  const store = await readStore(cli);
  const raw = await store.get(account);
  const removed = await store.delete(account);
  const companionId = raw ? (JSON.parse(raw) as CompanionCredential).companionId : null;
  const where = `${service}/#/p/${encodeURIComponent(manifest.projectId)}/controls`;
  if (cli.out.jsonMode || options.json) {
    cli.out.json({ ok: true, schema: 1, command: 'cloud companion disconnect', removed, companionId, remoteRevocation: 'unconfirmed', dashboard: where });
    return EXIT.OK;
  }
  cli.out.line(removed ? `Removed the local enrollment credential${companionId ? ` for ${companionId}` : ''}.` : 'No local enrollment credential for this checkout.');
  cli.out.line(`Remote revocation: unconfirmed. Disconnect the companion in the dashboard as well: ${where}`);
  return EXIT.OK;
}
