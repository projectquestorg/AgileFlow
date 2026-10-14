import path from 'node:path';
import semver from 'semver';
import {
  applyAdoption,
  DEFAULT_SCOPE,
  isSameDir,
  loadWorkspace,
  pathExists,
  planAdoption,
  projectStateDir,
  type AdoptCandidate,
  type ProviderSkillDir,
  type ScopeTarget,
  type Services,
  type Workspace,
} from '@agileflow/core';
import type { RegistryClient } from '@agileflow/registry';
import type { Cli } from '../runtime';
import { EXIT, mutate, relSkillsDir, scopeFor, servicesFor, UsageError } from '../runtime';
import { mutationEnvelope } from '../ui/output';
import { table } from '../ui/tables';
import { printSyncReport, syncReportJson } from './shared';

export interface AdoptOptions {
  global?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

/**
 * Provider skill directories (`.claude/skills`, custom `skillsDir`s) other
 * than the canonical one. `linked` mirrors what `sync` does: a provider that
 * is disabled in config, or `auto` and not detected, gets no links, so its
 * copies are reported but never moved.
 */
async function providerSkillDirs(cli: Cli, services: Services, ws: Workspace): Promise<ProviderSkillDir[]> {
  const out: ProviderSkillDir[] = [];
  for (const adapter of services.adapters) {
    const pctx = { ctx: cli.ctx, scope: ws.scope, settings: ws.providerSettings[adapter.id] };
    let locations: string[];
    let linked: boolean;
    try {
      locations = (await adapter.inspect(pctx)).skillLocations;
      const enabled = pctx.settings?.enabled ?? 'auto';
      linked = enabled === 'auto' ? (await adapter.detect(pctx)).detected : enabled;
    } catch {
      continue;
    }
    for (const label of locations) {
      if (label.startsWith('(')) continue;
      const dir = label.startsWith('~/')
        ? path.join(cli.ctx.homeDir, label.slice(2))
        : path.isAbsolute(label)
          ? label
          : path.join(ws.scope.root, label);
      if (isSameDir(dir, ws.scope.skillsDir, cli.ctx.platform)) continue;
      if (out.some((d) => isSameDir(d.dir, dir, cli.ctx.platform))) continue;
      out.push({ provider: adapter.id, dir, label, linked });
    }
  }
  return out;
}

/** The registry package of the same id (official scope), newest versions first. */
function upstreamLookup(services: Services) {
  const registry = (services.fetcher as { registry?: RegistryClient }).registry;
  return async (id: string) => {
    if (!registry) return null;
    const name = `${DEFAULT_SCOPE}/${id}`;
    const doc = await registry.getSkill(name);
    if (!doc) return null;
    const versions = Object.keys(doc.versions)
      .filter((v) => semver.valid(v))
      .sort(semver.rcompare);
    return { source: name, versions };
  };
}

function statusText(c: AdoptCandidate): string {
  if (c.blocked) return `cannot adopt: ${c.blocked}`;
  if (c.match === 'exact') return `identical to ${c.source}@${c.version}`;
  if (c.match === 'modified') {
    return `${c.source}@${c.version} with local edits${c.similarity !== undefined ? ` (${Math.round(c.similarity * 100)}% of SKILL.md lines shared)` : ''}`;
  }
  if (!c.upstreamChecked) return 'not compared with the registry';
  return c.source ? `unknown (differs from every ${c.source} version)` : 'unknown (no registry package with this name)';
}

function actionText(c: AdoptCandidate, scope: ScopeTarget): string {
  if (c.blocked) return 'left untouched';
  const where = `${relSkillsDir(scope)}/${c.id}`;
  const parts: string[] = [];
  if (c.move) parts.push(`move to ${where} and link it back`);
  if (c.ownership === 'local') parts.push('record as locally owned (never overwritten)');
  else if (c.rewrite) parts.push(`record as managed ${c.version} (rewritten in AgileFlow's managed form, same content; backed up)`);
  else parts.push(`record as managed ${c.version}`);
  if (c.replaceCopies.length) parts.push(`replace identical ${c.replaceCopies.map((r) => r.label).join(', ')} with links`);
  return parts.join('; ');
}

export function candidateJson(c: AdoptCandidate, scope: ScopeTarget) {
  return {
    id: c.id,
    location: c.location,
    path: c.label,
    ...(c.provider ? { provider: c.provider } : {}),
    match: c.match,
    ...(c.source ? { source: c.source } : {}),
    ...(c.version ? { version: c.version } : {}),
    ...(c.similarity !== undefined ? { similarity: c.similarity } : {}),
    upstreamChecked: c.upstreamChecked,
    ownership: c.ownership,
    activation: c.activation,
    move: c.move,
    rewrite: c.rewrite,
    replaceCopies: c.replaceCopies.map((r) => r.label),
    otherCopies: c.otherCopies.map((r) => r.label),
    keptCopies: c.keptCopies.map((r) => r.label),
    ...(c.blocked ? { blocked: c.blocked } : {}),
    notes: c.notes,
    action: actionText(c, scope),
  };
}

function printPlan(cli: Cli, scope: ScopeTarget, candidates: AdoptCandidate[]): void {
  const { out } = cli;
  out.heading('Unmanaged skills found:');
  out.lines(
    table(
      ['SKILL', 'WHERE', 'STATUS'],
      candidates.map((c) => [c.id, c.label, statusText(c)]),
      '  ',
    ),
  );
  out.line();
  out.heading('Adopting would:');
  for (const c of candidates) {
    out.line(`  ${c.id}: ${actionText(c, scope)}`);
    for (const note of c.notes) out.line(`    note: ${note}`);
    for (const other of c.otherCopies) out.line(`    note: ${other.label} differs and is left as is (that provider keeps using it)`);
  }
  out.line();
}

/**
 * `agileflow add --adopt [ids...]`: bring skills that already exist in this
 * scope (unmanaged in .agents/skills, or only in a provider directory such as
 * .claude/skills) under AgileFlow. Previews first; nothing changes without
 * confirmation (interactive) or --yes. Byte-identical copies of a published
 * version become managed; everything else becomes locally owned, keeping
 * every local edit. Moved or rewritten directories are backed up first.
 */
export async function runAdopt(cli: Cli, ids: string[], options: AdoptOptions): Promise<number> {
  const { out, ctx } = cli;
  const scope = await scopeFor(ctx, options, true);
  const services = await servicesFor(ctx, scope);
  const plan = async () => {
    const ws = await loadWorkspace(scope);
    for (const id of ids) {
      if (ws.lock.resolved[id] || ws.specs[id]) throw new UsageError(`${id} is already managed by AgileFlow`, [`See it with \`agileflow list\`.`]);
    }
    const providerDirs = await providerSkillDirs(cli, services, ws);
    out.progress('Comparing unmanaged skills with the registry...');
    const result = await planAdoption(services, ws, { ids, providerDirs, upstream: upstreamLookup(services) });
    if (result.notFound.length) {
      throw new UsageError(`Not an unmanaged skill in ${relSkillsDir(scope)} or a provider skill directory: ${result.notFound.join(', ')}`, [
        'List what can be adopted: agileflow add --adopt --dry-run',
      ]);
    }
    return result.candidates;
  };

  const candidates = await plan();
  const adoptable = candidates.filter((c) => !c.blocked);
  const blocked = candidates.filter((c) => c.blocked).map((c) => ({ id: c.id, reason: c.blocked! }));
  const planJson = candidates.map((c) => candidateJson(c, scope));
  if (!candidates.length) {
    out.line(`No unmanaged skills found in ${relSkillsDir(scope)} or provider skill directories.`);
    if (options.json) out.json(mutationEnvelope('add', { dryRun: !!options.dryRun, extra: { adopt: true, scope: scope.kind, plan: [] } }));
    return EXIT.OK;
  }
  printPlan(cli, scope, candidates);

  const needsConsent = !cli.prompter.interactive && !options.yes;
  if (options.dryRun || needsConsent || !adoptable.length) {
    if (!adoptable.length) out.line('Nothing can be adopted automatically.');
    else if (options.dryRun) out.line('Dry run: nothing was changed.');
    else out.line('Preview only; nothing was changed. Rerun with --yes to adopt.');
    if (options.json) {
      out.json(
        mutationEnvelope('add', {
          dryRun: true,
          applied: [],
          skipped: [
            ...blocked,
            ...(needsConsent && !options.dryRun ? adoptable.map((c) => ({ id: c.id, reason: 'needs confirmation (--yes)' })) : []),
          ],
          extra: { adopt: true, scope: scope.kind, plan: planJson },
        }),
      );
    }
    return EXIT.OK;
  }

  if (cli.prompter.interactive && !options.yes) {
    const moves = adoptable.filter((c) => c.move || c.rewrite || c.replaceCopies.length).length;
    const question = `Adopt ${adoptable.length === 1 ? adoptable[0]!.id : `${adoptable.length} skills`}${moves ? ` (${moves} moved or rewritten, backed up first)` : ''}?`;
    if (!(await cli.prompter.confirm(question, true))) {
      out.line('Nothing changed.');
      return EXIT.OK;
    }
  }

  return mutate(cli, scope, async () => {
    const ws = await loadWorkspace(scope);
    const createdConfig = !(await pathExists(scope.configPath));
    // Backups live in this machine's cache (never in the repository, so they are never committed).
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(projectStateDir(ctx, scope), 'adopt-backups', stamp);
    const result = await applyAdoption(services, ws, adoptable, { backupDir });
    cli.record = { ...(cli.record ?? {}), changed: result.adopted.map((a) => a.id) };
    if (createdConfig && result.adopted.length) out.line(`Created ${scope.kind === 'project' ? 'agileflow.yaml' : scope.configPath}`);
    for (const a of result.adopted) {
      const how = a.ownership === 'managed' ? `managed ${a.source}@${a.version}` : 'locally owned';
      out.line(`Adopted ${a.id} (${how})${a.movedFrom ? `, moved from ${a.movedFrom}` : ''}`);
    }
    for (const f of result.failed) out.warn(`${f.id}: ${f.error}`);
    if (result.backupDir) out.line(`Backup of moved or rewritten directories: ${result.backupDir}`);
    if (result.sync) printSyncReport(cli, ws, { ...result.sync, materialized: [], rerendered: [] });
    const syncErrors = result.sync?.events.filter((e) => e.level === 'error') ?? [];
    if (options.json) {
      out.json(
        mutationEnvelope('add', {
          applied: result.adopted,
          skipped: blocked,
          failed: result.failed,
          events: result.sync?.events ?? [],
          extra: {
            adopt: true,
            scope: scope.kind,
            plan: planJson,
            backupDir: result.backupDir,
            sync: result.sync ? syncReportJson(result.sync) : null,
          },
        }),
      );
    }
    return result.failed.length || syncErrors.length ? EXIT.ERROR : EXIT.OK;
  });
}
