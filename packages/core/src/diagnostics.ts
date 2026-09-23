import fs from 'node:fs';
import path from 'node:path';
import { ConfigError } from './config';
import type { Context } from './context';
import { readTextIfExists } from './fs';
import { compareConfigToLock, resolvedSkills, syncWorkspace, type SyncReport } from './installer';
import { inspectSkill, listSkillDirs, listUnmanagedSkills } from './ownership';
import { globalScope, skillDir, type ScopeTarget } from './scope';
import { parseSkillMarkdown, SKILL_FILE, validateSkillMarkdown } from './skill';
import type { Diagnostic } from './types';
import { loadWorkspace, type Services, type Workspace } from './workspace';

export interface CheckSection {
  title: string;
  diagnostics: Diagnostic[];
}

export interface CheckReport {
  scope: ScopeTarget;
  sections: CheckSection[];
  healthy: boolean;
  fixed: SyncReport | null;
}

const ok = (message: string, detail?: string[]): Diagnostic => ({ level: 'ok', message, detail });
const warn = (message: string, detail?: string[]): Diagnostic => ({ level: 'warn', message, detail });
const error = (message: string, detail?: string[]): Diagnostic => ({ level: 'error', message, detail });
const info = (message: string, detail?: string[], verboseOnly = false): Diagnostic => ({
  level: 'info',
  message,
  detail,
  verboseOnly,
});

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** `agileflow check` for one scope. With `fix`, repairs only AgileFlow-owned artifacts. */
export async function checkScope(
  services: Services,
  scope: ScopeTarget,
  options: { fix?: boolean; verbose?: boolean } = {},
): Promise<CheckReport> {
  const configName = path.basename(scope.configPath);
  const lockName = path.basename(scope.lockPath);
  const configuration: CheckSection = { title: 'Configuration', diagnostics: [] };
  const sections: CheckSection[] = [configuration];
  let ws: Workspace;
  try {
    ws = await loadWorkspace(scope);
  } catch (err) {
    const message = err instanceof ConfigError ? err.message : (err as Error).message;
    configuration.diagnostics.push(error(message));
    return { scope, sections, healthy: false, fixed: null };
  }
  if (!ws.configExists) {
    configuration.diagnostics.push(
      error(`${configName} not found`, [
        scope.kind === 'project' ? 'Run `agileflow init` to set up this project.' : 'No personal skills configured.',
      ]),
    );
    return { scope, sections, healthy: false, fixed: null };
  }
  configuration.diagnostics.push(ok(`${configName} valid`));
  configuration.diagnostics.push(
    ws.lockExists ? ok(`${lockName} valid`) : error(`${lockName} missing`, ['Run `agileflow update` to create it.']),
  );
  const mismatches = compareConfigToLock(services, ws);
  configuration.diagnostics.push(
    mismatches.length
      ? error(
          'lockfile does not match config',
          [...mismatches.map((m) => `${m.id}: ${m.problem}`), 'Run `agileflow update` to reconcile.'],
        )
      : ok('lockfile matches config'),
  );
  configuration.diagnostics.push(info(`config: ${scope.configPath}`, [`lock: ${scope.lockPath}`], true));

  let fixed: SyncReport | null = null;
  if (options.fix && !mismatches.length) {
    fixed = await syncWorkspace(services, ws, { missingOnly: true });
    ws = await loadWorkspace(scope);
  }

  sections.push(await checkSkills(services, ws));
  sections.push(await checkProviders(services, ws, options.verbose ?? false));
  const optional = await checkOptionalFeatures(services, ws);
  if (optional.diagnostics.length) sections.push(optional);

  const healthy = sections.every((s) => s.diagnostics.every((d) => d.level !== 'error'));
  return { scope, sections, healthy, fixed };
}

async function checkSkills(services: Services, ws: Workspace): Promise<CheckSection> {
  const section: CheckSection = { title: 'Skills', diagnostics: [] };
  const entries = Object.entries(ws.lock.resolved);
  const managed = entries.filter(([, e]) => e.ownership === 'managed' && e.enabled !== false);
  const local = entries.filter(([, e]) => e.ownership === 'local');
  const disabled = entries.filter(([, e]) => e.enabled === false);

  const missing: string[] = [];
  const modified: string[] = [];
  for (const [id, entry] of entries) {
    const state = await inspectSkill(ws.scope, id, entry);
    if (state.status === 'missing') missing.push(id);
    if (state.status === 'modified') modified.push(id);
  }
  const present = managed.length - missing.filter((id) => ws.lock.resolved[id]?.ownership === 'managed').length;
  section.diagnostics.push(
    missing.length
      ? error(`${plural(missing.length, 'skill')} missing from ${ws.scope.kind === 'project' ? '.agents/skills' : '~/.agents/skills'}`, [
          ...missing.map((id) => `${id} (${ws.lock.resolved[id]!.path})`),
          'Run `agileflow sync` (or `agileflow check --fix`) to restore them.',
        ])
      : ok(`${plural(present, 'managed skill')} present${local.length ? `, ${local.length} locally owned` : ''}${disabled.length ? `, ${disabled.length} disabled` : ''}`),
  );

  // Package integrity: verify the cached package for each locked version when available.
  const integrityProblems: string[] = [];
  const unverifiable: string[] = [];
  for (const [id, entry] of managed) {
    try {
      const pkg = await services.fetcher.fetchLocked(id, entry, ws.scope.root);
      if (pkg.integrity !== entry.integrity) {
        integrityProblems.push(`${id}: package integrity ${pkg.integrity} != locked ${entry.integrity}`);
      }
    } catch (err) {
      const message = (err as Error).message;
      if (/integrity/i.test(message)) integrityProblems.push(`${id}: ${message}`);
      else unverifiable.push(`${id}: ${message}`);
    }
  }
  if (integrityProblems.length) section.diagnostics.push(error('integrity check failed', integrityProblems));
  else if (managed.length && !unverifiable.length) section.diagnostics.push(ok('integrity verified'));
  if (unverifiable.length) {
    section.diagnostics.push(warn('could not verify package integrity (offline or source unavailable)', unverifiable));
  }

  // SKILL.md validity and duplicates across the canonical directory.
  const dirs = await listSkillDirs(ws.scope);
  const descriptionIssues: string[] = [];
  const unmanagedIssues: string[] = [];
  const names = new Map<string, string[]>();
  for (const dir of dirs) {
    const text = await readTextIfExists(path.join(skillDir(ws.scope, dir), SKILL_FILE));
    if (text === null) continue;
    const issues = validateSkillMarkdown(text, dir).filter((i) => i.level === 'error');
    const target = ws.lock.resolved[dir] ? descriptionIssues : unmanagedIssues;
    target.push(...issues.map((i) => `${dir}: ${i.message}`));
    try {
      const name = parseSkillMarkdown(text).name ?? dir;
      names.set(name, [...(names.get(name) ?? []), dir]);
    } catch {
      // reported above
    }
  }
  section.diagnostics.push(descriptionIssues.length ? error('invalid SKILL.md', descriptionIssues) : ok('descriptions valid'));
  if (unmanagedIssues.length) {
    section.diagnostics.push(warn('unmanaged skills with invalid SKILL.md (left untouched)', unmanagedIssues));
  }
  const dupes = [...names.entries()].filter(([, list]) => list.length > 1);
  section.diagnostics.push(
    dupes.length
      ? error('duplicate skill names', dupes.map(([n, list]) => `${n}: ${list.join(', ')}`))
      : ok('no duplicate names'),
  );

  section.diagnostics.push(
    modified.length
      ? warn(
          `${plural(modified.length, 'managed skill')} with local modifications`,
          [
            ...modified.map((id) => `${id}: agileflow diff ${id}`),
            'Updates will not overwrite them. Keep your changes permanently with `agileflow fork <skill>`.',
          ],
        )
      : ok('no unexpected local modifications'),
  );

  if (entries.length) {
    section.diagnostics.push(
      info(
        'lock hashes',
        entries.map(
          ([id, e]) => `${id} ${e.version} ${e.ownership}${e.integrity ? ` integrity=${e.integrity}` : ''}${e.baseHash ? ` base=${e.baseHash}` : ''}`,
        ),
        true,
      ),
    );
  }

  const unmanaged = await listUnmanagedSkills(ws.scope, Object.keys(ws.lock.resolved));
  if (unmanaged.length) {
    section.diagnostics.push(info(`${plural(unmanaged.length, 'unmanaged skill')} left untouched`, unmanaged));
  }

  // Project overrides of personal skills (informational, not an error).
  if (ws.scope.kind === 'project') {
    const personal = await listSkillDirs(globalScope(services.ctx)).catch(() => [] as string[]);
    const overrides = dirs.filter((d) => personal.includes(d));
    for (const id of overrides) {
      section.diagnostics.push(info(`${id} has a project override of your global skill`));
    }
  }
  return section;
}

async function checkProviders(services: Services, ws: Workspace, verbose: boolean): Promise<CheckSection> {
  const section: CheckSection = { title: 'Providers', diagnostics: [] };
  const skills = await resolvedSkills(ws);
  for (const adapter of services.adapters) {
    const pctx = { ctx: services.ctx, scope: ws.scope, settings: ws.providerSettings[adapter.id], verbose };
    const enabled = pctx.settings?.enabled ?? 'auto';
    if (enabled === false) {
      section.diagnostics.push(info(`${adapter.displayName}: disabled in config`));
      continue;
    }
    const detection = await adapter.detect(pctx);
    if (!detection.detected && enabled === 'auto') {
      section.diagnostics.push(info(`${adapter.displayName}: not detected`, undefined, true));
      continue;
    }
    section.diagnostics.push(...(await adapter.validate(pctx, skills)));
    const caps = await adapter.inspect(pctx);
    const verboseDetail = [
      `support: ${adapter.support}`,
      `detected via: ${detection.evidence.join(', ') || 'config'}`,
      `skill locations: ${caps.skillLocations.join(', ')}`,
      `manual invocation: ${caps.manualInvocation}`,
      ...(caps.version ? [`version: ${caps.version}`] : []),
      ...(detection.executable ? [`executable: ${detection.executable}`] : []),
    ];
    section.diagnostics.push(info(`${adapter.displayName} details`, verboseDetail, true));
  }
  const host = await detectT3Host(services.ctx);
  if (host) {
    section.diagnostics.push(
      info('T3 Code detected: it runs the providers above, which read the same skills', [
        'No T3-specific setup is needed. T3\'s own skill picker may not list every provider-visible skill;',
        'the underlying provider can still use them.',
      ]),
    );
  }
  if (!section.diagnostics.some((d) => !d.verboseOnly)) {
    section.diagnostics.push(info('no supported providers detected; skills are still in the standard .agents/skills location'));
  }
  return section;
}

async function checkOptionalFeatures(services: Services, ws: Workspace): Promise<CheckSection> {
  const section: CheckSection = { title: 'Optional features', diagnostics: [] };
  for (const adapter of services.adapters) {
    const pctx = { ctx: services.ctx, scope: ws.scope, settings: ws.providerSettings[adapter.id] };
    if ((pctx.settings?.enabled ?? 'auto') === false) continue;
    const detection = await adapter.detect(pctx);
    if (!detection.detected) continue;
    const caps = await adapter.inspect(pctx);
    for (const feature of caps.optionalFeatures ?? []) {
      if (feature.enabled) {
        section.diagnostics.push(ok(`${adapter.displayName} ${feature.label} enabled`));
      } else {
        section.diagnostics.push({
          level: 'info',
          message: `${adapter.displayName} ${feature.label} ${feature.enabled === null ? 'unknown' : 'disabled'}`,
          detail: ['This is optional. Enable with `agileflow configure`.'],
        });
      }
    }
  }
  return section;
}

/** T3 Code is a host over provider CLIs, not a provider. Detected only to explain behavior. */
export async function detectT3Host(ctx: Context): Promise<boolean> {
  if (Object.keys(ctx.env).some((k) => k.startsWith('T3CODE_') || k.startsWith('T3_CODE_'))) return true;
  try {
    await fs.promises.access(path.join(ctx.homeDir, '.t3'));
    return true;
  } catch {
    return false;
  }
}
