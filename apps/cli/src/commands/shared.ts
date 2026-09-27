import path from 'node:path';
import {
  commitAdd,
  OperationError,
  packMembers,
  parseAddTarget,
  pathExists,
  prepareAdd,
  riskCounts,
  skillIdFromPackageName,
  specForPrepared,
  toPosix,
  type Activation,
  type AddRequest,
  type ExposureReport,
  type PreparedSkill,
  type RiskFinding,
  type Services,
  type SyncReport,
  type Workspace,
} from '@agileflow/core';
import type { Cli } from '../runtime';
import { printEvents, relSkillsDir, UsageError } from '../runtime';

function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

export interface AddTargetOptions {
  skill?: string[];
  /** Git branch, tag, or commit for git sources (`add --ref`). */
  ref?: string;
}

/**
 * Turn `add` arguments into install requests: registry skills, packs,
 * GitHub repositories (`owner/repo[/skill][@ref]`, as listed by skills.sh),
 * git sources, and local paths (multi-skill sources prompt or use --skill).
 */
export async function resolveAddTargets(
  cli: Cli,
  services: Services,
  ws: Workspace,
  args: string[],
  options: AddTargetOptions = {},
): Promise<AddRequest[]> {
  const requests: AddRequest[] = [];
  const seen = new Set<string>();
  const push = (req: AddRequest) => {
    if (seen.has(req.id)) return;
    seen.add(req.id);
    requests.push(req);
  };
  for (const arg of args) {
    const localPathExists = await pathExists(path.resolve(cli.ctx.cwd, arg));
    let target;
    try {
      target = parseAddTarget(arg, { localPathExists });
    } catch (err) {
      throw new UsageError((err as Error).message, [
        'Examples: diagnosing-bugs, @agileflow/github, owner/repo, owner/repo/skill, git+https://host/repo.git#path, ./skills/mine',
      ]);
    }
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
          `Search the catalog: agileflow search ${arg}`,
          'Third-party skills from GitHub: agileflow add owner/repo',
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

    // git or path source: find the skill(s) it contains.
    const gitRef = options.ref ?? target.gitRef ?? undefined;
    if (gitRef && target.ref.kind !== 'git') throw new UsageError(`--ref only applies to git sources (${arg})`);
    let found;
    try {
      found = await services.fetcher.discover(target.source, ws.scope.root, gitRef);
    } catch (err) {
      const hints = target.ref.kind === 'git' && !arg.startsWith('git+') && !localPathExists
        ? [`No local directory ./${arg} exists either.`]
        : [];
      throw new OperationError(`Could not read ${arg}: ${(err as Error).message}`, hints);
    }
    if (!found.length) throw new UsageError(`No SKILL.md found at ${arg}`);
    let chosen = found;
    const wanted = [...(options.skill ?? []), ...(target.skill ? [target.skill] : [])];
    if (wanted.length) {
      chosen = found.filter((f) => wanted.includes(f.id));
      if (!chosen.length) {
        throw new UsageError(`None of ${wanted.join(', ')} found at ${arg}`, [
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
      push({ id: skill.id, spec: { source, ...(gitRef ? { ref: gitRef } : {}) } });
    }
  }
  return requests;
}

export function riskLine(r: RiskFinding): string {
  return `[${r.severity}] ${r.file}${r.line ? `:${r.line}` : ''} ${r.message}${r.excerpt ? `: ${r.excerpt}` : ''}`;
}

/** Print the scan findings worth a reviewer's attention (medium and high; low only as a count). */
export function printRisks(cli: Cli, risks: RiskFinding[]): void {
  const counts = riskCounts(risks);
  const notable = risks.filter((r) => r.severity !== 'low');
  if (!notable.length && !counts.low) return;
  cli.out.line(`Review findings: ${counts.high} high, ${counts.medium} medium, ${counts.low} low`);
  for (const r of notable.slice(0, 12)) cli.out.line(`  ${riskLine(r)}`);
  if (notable.length > 12) cli.out.line(`  ... ${notable.length - 12} more (agileflow info <source> --json lists all)`);
}

/** Trust information shown before installing (sections "agileflow add" and "Third-party skill install warnings"). */
export function describePrepared(cli: Cli, item: PreparedSkill): void {
  const { out } = cli;
  const s = item.summary;
  if (item.external) out.heading('Installing external skill:');
  out.line(`Skill: ${item.id}`);
  out.line(`Source: ${item.spec.source}${item.spec.ref ? ` (ref ${item.spec.ref})` : ''}`);
  out.line(`Version: ${item.pkg.version}${item.pkg.resolved ? ` (${item.pkg.resolved.slice(0, 12)})` : ''}`);
  out.line(`Integrity: ${item.pkg.integrity}`);
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
  printRisks(cli, item.risks);
  if (item.external) out.line('Review source before installing untrusted skills.');
  if (item.local) out.line('Registered as a locally owned skill (AgileFlow will never overwrite it).');
  out.line();
}

export function preparedJson(item: PreparedSkill) {
  return {
    id: item.id,
    source: item.spec.source,
    ...(item.spec.ref ? { ref: item.spec.ref } : {}),
    version: item.pkg.version,
    ...(item.pkg.resolved ? { resolved: item.pkg.resolved } : {}),
    integrity: item.pkg.integrity,
    activation: item.activation,
    external: item.external,
    local: item.local,
    spec: specForPrepared(item),
    files: {
      references: item.summary.references,
      scripts: item.summary.scripts,
      other: item.summary.otherFiles,
    },
    risks: item.risks,
  };
}

export function exposureJson(report: ExposureReport) {
  return {
    providers: report.providers,
    changes: report.results.map((r) => ({
      kind: r.change.kind,
      provider: r.change.provider,
      ...('skillId' in r.change && r.change.skillId ? { skill: r.change.skillId } : {}),
      ...('path' in r.change ? { path: r.change.path } : {}),
      ...(r.change.kind === 'warn' ? { message: r.change.message } : {}),
      outcome: r.outcome,
      ...(r.linkType ? { linkType: r.linkType } : {}),
      ...(r.message ? { error: r.message } : {}),
    })),
  };
}

export function syncReportJson(report: SyncReport) {
  return {
    materialized: report.materialized,
    rerendered: report.rerendered,
    removed: report.removed,
    disabled: report.disabled,
    kept: report.kept,
    events: report.events,
    exposure: exposureJson(report.exposure),
  };
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
  printEvents(cli, report.events);
  printExposure(cli, report.exposure);
}

export interface InstallResult {
  prepared: PreparedSkill[];
  report: SyncReport | null;
  /** Nothing was written: the user declined, or this was a dry run. */
  declined: boolean;
}

/**
 * Prepare, show trust info, confirm, and install.
 *
 * Confirmation policy: interactive runs always ask. Non-interactive runs
 * install official skills, but third-party content (git repositories,
 * third-party registries, local paths outside the project) needs an explicit
 * `--yes`: nothing someone else wrote reaches an agent without consent.
 */
export async function installRequests(
  cli: Cli,
  services: Services,
  ws: Workspace,
  requests: AddRequest[],
  options: { activation?: Activation; yes?: boolean; quiet?: boolean; dryRun?: boolean },
): Promise<InstallResult> {
  if (!requests.length) return { prepared: [], report: null, declined: false };
  for (const req of requests) {
    if (ws.specs[req.id]) throw new OperationError(`${req.id} is already installed`, [`Use \`agileflow update ${req.id}\`.`]);
  }
  cli.out.progress(`Fetching ${requests.length} skill(s)...`);
  const prepared = await prepareAdd(services, ws, requests, { activation: options.activation });
  if (!options.quiet) for (const item of prepared) describePrepared(cli, item);
  if (options.dryRun) return { prepared, report: null, declined: true };
  const external = prepared.filter((p) => p.external);
  const risky = prepared.some((p) => p.risks.some((r) => r.severity === 'high'));
  if (cli.prompter.interactive && !options.yes) {
    const where = ws.scope.kind === 'project' ? 'this project' : 'your personal skills';
    const ok = await cli.prompter.confirm(
      prepared.length === 1 ? `Install ${prepared[0]!.id} to ${where}?` : `Install ${prepared.length} skills to ${where}?`,
      !risky,
    );
    if (!ok) return { prepared, report: null, declined: true };
  } else if (external.length && !options.yes) {
    throw new OperationError(`Refusing to install third-party content without confirmation: ${external.map((p) => p.id).join(', ')}`, [
      'Review it first (agileflow add <source> --dry-run), then rerun with --yes.',
    ]);
  }
  const report = await commitAdd(services, ws, prepared);
  cli.record = {
    ...(cli.record ?? {}),
    changed: [...(cli.record?.changed ?? []), ...prepared.map((p) => p.id)],
    approved: [
      ...(cli.record?.approved ?? []),
      ...external.map((p) => `${p.id}@${p.pkg.version} from ${p.spec.source}${p.pkg.resolved ? ` (${p.pkg.resolved})` : ''}`),
    ],
  };
  const local = prepared.filter((p) => p.local);
  const installed = prepared.filter((p) => !p.local);
  if (installed.length) {
    cli.out.line(
      `Installed ${installed.map((p) => `${p.id}@${p.pkg.version}`).join(', ')} into ${relSkillsDir(ws.scope)}`,
    );
  }
  if (local.length) cli.out.line(`Registered locally owned: ${local.map((p) => p.id).join(', ')}`);
  report.materialized = report.materialized.filter((id) => !prepared.some((p) => p.id === id));
  printSyncReport(cli, ws, report);
  return { prepared, report, declined: false };
}
