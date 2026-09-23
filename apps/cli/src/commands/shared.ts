import path from 'node:path';
import {
  commitAdd,
  isSelfSource,
  OperationError,
  packMembers,
  parseAddTarget,
  prepareAdd,
  skillIdFromPackageName,
  toPosix,
  type Activation,
  type AddRequest,
  type ExposureReport,
  type PreparedSkill,
  type Services,
  type SyncReport,
  type Workspace,
} from '@agileflow/core';
import type { Cli } from '../runtime';
import { relSkillsDir, UsageError } from '../runtime';

function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

/**
 * Turn `add` arguments into install requests: registry skills, packs,
 * git sources, and local paths (multi-skill sources prompt or use --skill).
 */
export async function resolveAddTargets(
  cli: Cli,
  services: Services,
  ws: Workspace,
  args: string[],
  options: { skill?: string[] } = {},
): Promise<AddRequest[]> {
  const requests: AddRequest[] = [];
  const seen = new Set<string>();
  const push = (req: AddRequest) => {
    if (seen.has(req.id)) return;
    seen.add(req.id);
    requests.push(req);
  };
  for (const arg of args) {
    const target = parseAddTarget(arg);
    if (target.ref.kind === 'registry') {
      const name = target.ref.name;
      if (await services.fetcher.hasSkill(name)) {
        const id = skillIdFromPackageName(name);
        push({ id, spec: { source: name, ...(target.range ? { version: target.range } : {}) } });
        continue;
      }
      const pack = await services.fetcher.getPack(name);
      if (!pack) {
        throw new UsageError(`No skill or pack named ${arg} in the registry`, [
          'See available skills with `agileflow add` (interactive) or the AgileFlow catalog.',
        ]);
      }
      const members = packMembers(pack);
      const already = members.filter((m) => ws.specs[m.id]).map((m) => m.id);
      if (already.length) cli.out.line(`Pack ${pack.name}: already installed: ${already.join(', ')}`);
      for (const m of members) {
        if (ws.specs[m.id]) continue;
        push({ id: m.id, spec: { source: m.source, ...(m.range ? { version: m.range } : {}) } });
      }
      continue;
    }

    // git+ or path source: find the skill(s) it contains.
    const found = await services.fetcher.discover(target.source, ws.scope.root);
    if (!found.length) throw new UsageError(`No SKILL.md found at ${arg}`);
    let chosen = found;
    if (options.skill?.length) {
      chosen = found.filter((f) => options.skill!.includes(f.id));
      if (!chosen.length) {
        throw new UsageError(`None of ${options.skill.join(', ')} found at ${arg}`, [
          `Available: ${found.map((f) => f.id).join(', ')}`,
        ]);
      }
    } else if (found.length > 1) {
      if (!cli.prompter.interactive) {
        throw new UsageError(`${arg} contains ${found.length} skills; choose with --skill <name>`, [
          `Available: ${found.map((f) => f.id).join(', ')}`,
        ]);
      }
      const ids = await cli.prompter.multiselect(
        `${arg} contains several skills. Which should be added?`,
        found.map((f) => ({ value: f.id, label: f.id, hint: f.subpath })),
        [],
        true,
      );
      chosen = found.filter((f) => ids.includes(f.id));
    }
    for (const skill of chosen) {
      let source = target.source;
      if (skill.subpath) {
        if (target.ref.kind === 'git') {
          const base = target.ref.subpath ? `${target.ref.subpath}/${skill.subpath}` : skill.subpath;
          source = `git+${target.ref.url}#${base}`;
        } else {
          source = toPosix(path.join(target.source, skill.subpath));
          if (!source.startsWith('.') && !source.startsWith('/') && !/^[a-zA-Z]:/.test(source)) source = `./${source}`;
        }
      }
      push({ id: skill.id, spec: { source } });
    }
  }
  return requests;
}

/** Trust information shown before installing (sections "agileflow add" and "Third-party skill install warnings"). */
export function describePrepared(cli: Cli, item: PreparedSkill): void {
  const { out } = cli;
  const s = item.summary;
  if (item.external) out.heading('Installing external skill:');
  out.line(`Skill: ${item.id}`);
  out.line(`Source: ${item.spec.source}`);
  out.line(`Version: ${item.pkg.version}${item.pkg.resolved ? ` (${item.pkg.resolved.slice(0, 12)})` : ''}`);
  out.line(`Activation: ${item.activation}`);
  out.line('Contains:');
  out.line('  SKILL.md');
  out.line(`  ${plural(s.references.length, 'reference file')}`);
  out.line(`  ${plural(s.scripts.length, 'executable script')}`);
  if (s.otherFiles.length) out.line(`  ${plural(s.otherFiles.length, 'other file')}`);
  if (s.scripts.length) {
    out.line('Scripts:');
    for (const script of s.scripts) out.line(`  ${script}`);
  }
  const req = s.sidecar?.requirements;
  const needs = [
    ...(req?.commands ?? []).map((c) => `${c} on PATH`),
    ...(req?.network === 'required' ? ['network access'] : req?.network === 'optional' ? ['network access (optional)'] : []),
  ];
  if (needs.length) {
    out.line('Requires:');
    for (const n of needs) out.line(`  ${n}`);
  }
  if (item.external) out.line('Review source before installing untrusted skills.');
  if (item.local) out.line('Registered as a locally owned skill (AgileFlow will never overwrite it).');
  out.line();
}

export function printExposure(cli: Cli, report: ExposureReport): void {
  const byProvider = new Map<string, { created: number; types: Set<string>; removed: number }>();
  for (const r of report.results) {
    if (r.change.kind === 'warn') {
      cli.out.warn(r.change.message);
      continue;
    }
    if (r.outcome === 'failed') {
      cli.out.warn(`${r.change.provider}: could not update ${r.change.path}: ${r.message}`);
      continue;
    }
    const entry = byProvider.get(r.change.provider) ?? { created: 0, types: new Set<string>(), removed: 0 };
    if (r.change.kind === 'remove') entry.removed++;
    else {
      entry.created++;
      if (r.linkType) entry.types.add(r.linkType);
    }
    byProvider.set(r.change.provider, entry);
  }
  for (const [provider, e] of byProvider) {
    const name = report.providers.find((p) => p.id === provider)?.displayName ?? provider;
    if (e.created) {
      cli.out.line(`${name}: ${plural(e.created, 'compatibility link')} created (${[...e.types].join(', ')})`);
    }
    if (e.removed) cli.out.line(`${name}: ${plural(e.removed, 'compatibility link')} removed`);
  }
}

export function printSyncReport(cli: Cli, ws: Workspace, report: SyncReport): void {
  const dir = relSkillsDir(ws.scope);
  if (report.materialized.length) cli.out.line(`Installed into ${dir}: ${report.materialized.join(', ')}`);
  if (report.rerendered.length) cli.out.line(`Refreshed: ${report.rerendered.join(', ')}`);
  if (report.disabled.length) cli.out.line(`Disabled (removed from ${dir}): ${report.disabled.join(', ')}`);
  if (report.removed.length) cli.out.line(`Removed stale skills: ${report.removed.join(', ')}`);
  for (const k of report.kept) cli.out.warn(`${k.id}: ${k.reason}`);
  for (const e of report.events) {
    if (e.level === 'error') cli.out.error(`${e.skill ? `${e.skill}: ` : ''}${e.message}`);
    else cli.out.warn(`${e.skill ? `${e.skill}: ` : ''}${e.message}`);
  }
  printExposure(cli, report.exposure);
}

/** Prepare, show trust info, confirm, and install. Returns null when the user declines. */
export async function installRequests(
  cli: Cli,
  services: Services,
  ws: Workspace,
  requests: AddRequest[],
  options: { activation?: Activation; yes?: boolean; quiet?: boolean },
): Promise<SyncReport | null> {
  if (!requests.length) return null;
  for (const req of requests) {
    if (ws.specs[req.id]) throw new OperationError(`${req.id} is already installed`, [`Use \`agileflow update ${req.id}\`.`]);
  }
  const prepared = await prepareAdd(services, ws, requests, { activation: options.activation });
  if (!options.quiet) for (const item of prepared) describePrepared(cli, item);
  const needsConfirm = cli.prompter.interactive && !options.yes;
  if (needsConfirm) {
    const where = ws.scope.kind === 'project' ? 'this project' : 'your personal skills';
    const ok = await cli.prompter.confirm(
      prepared.length === 1 ? `Install ${prepared[0]!.id} to ${where}?` : `Install ${prepared.length} skills to ${where}?`,
      true,
    );
    if (!ok) return null;
  }
  const report = await commitAdd(services, ws, prepared);
  const local = prepared.filter((p) => p.local || isSelfSource(ws.scope, p.id, p.spec, services.ctx.homeDir));
  const installed = prepared.filter((p) => !local.includes(p));
  if (installed.length) {
    cli.out.line(
      `Installed ${installed.map((p) => `${p.id}@${p.pkg.version}`).join(', ')} into ${relSkillsDir(ws.scope)}`,
    );
  }
  if (local.length) cli.out.line(`Registered locally owned: ${local.map((p) => p.id).join(', ')}`);
  report.materialized = report.materialized.filter((id) => !prepared.some((p) => p.id === id));
  printSyncReport(cli, ws, report);
  return report;
}
