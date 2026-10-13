import {
  classifyTarget,
  loadWorkspace,
  setConfigValue,
  setSkillSpecs,
  syncWorkspace,
  updateWorkspace,
  type ScopeTarget,
  type Services,
  type Workspace,
} from '@agileflow/core';

/** Platforms the first companion release supports (others are shown as unsupported). */
export const COMPANION_PLATFORMS = ['darwin-arm64', 'darwin-x64', 'linux-x64'] as const;
/** Typed operations this companion knows how to apply. Anything else is reported unsupported. */
export const COMPANION_CAPABILITIES = ['skills.enable', 'skills.activation', 'skills.update', 'providers.mode', 'questions.preference'] as const;

const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const SKILL_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PREFERENCES = ['provider-default', 'prefer', 'minimize'];

export interface PlanStep {
  capability: string;
  target: string;
  value: unknown;
}

export type StepOutcome = 'applied' | 'unchanged' | 'blocked' | 'unsupported' | 'failed';

export interface StepResult {
  target: string;
  outcome: StepOutcome;
  detail?: string;
}

export interface CompanionCredential {
  schemaVersion: 1;
  service: string;
  projectId: string;
  companionId: string;
  checkoutId: string;
  credential: string;
  capabilities: string[];
  checkoutPathHash: string;
  repoIdentity: string;
  enrolledAt: string;
}

export const companionAccount = (service: string, projectId: string, pathHash: string) => `companion:${service}:${projectId}:${pathHash}`;

const providerMode = (v: unknown): 'on' | 'off' | 'auto' => (v === true ? 'on' : v === false ? 'off' : 'auto');

/** Observed settings through a typed allowlist: never raw config, paths, or environment values. */
export async function inventory(ws: Workspace, cliVersion: string): Promise<Record<string, unknown>> {
  const skills: Record<string, unknown> = {};
  for (const [id, spec] of Object.entries(ws.specs)) {
    if (!SKILL_ID.test(id)) continue;
    const entry = ws.lock.resolved[id];
    const target = entry ? await classifyTarget(ws.scope, id, entry) : null;
    skills[id] = {
      enabled: spec.enabled !== false,
      activation: spec.activation ?? entry?.activation ?? 'auto',
      modified: target ? target.ownership === 'modified' || target.ownership === 'local' : false,
      ...(entry?.version ? { version: String(entry.version) } : {}),
    };
  }
  const providers: Record<string, string> = {};
  for (const [id, s] of Object.entries(ws.providerSettings)) if (s?.enabled !== undefined) providers[id] = providerMode(s.enabled);
  return { skills, providers, questions: ws.questionPreference, cliVersion };
}

/**
 * Apply one approved plan to a project with the native config primitives
 * (validated, atomic YAML edits), then the same materialization `agileflow
 * sync` runs. The caller holds the project scope lock. Skills whose files
 * are modified or locally owned are blocked, never overwritten.
 */
export async function applyPlan(
  services: Services,
  scope: ScopeTarget,
  steps: PlanStep[],
  allowed: string[],
): Promise<{ results: StepResult[]; skillsChanged: boolean; syncErrors: string[] }> {
  const ws = await loadWorkspace(scope);
  const results: StepResult[] = [];
  let skillsChanged = false;
  let changed = false;
  const known = new Set(services.adapters.map((a) => a.id as string));

  for (const step of steps) {
    const r = (outcome: StepOutcome, detail?: string) => results.push({ target: step.target, outcome, ...(detail ? { detail } : {}) });
    try {
      if (!(COMPANION_CAPABILITIES as readonly string[]).includes(step.capability)) {
        r('unsupported', `This companion does not support "${step.capability}".`);
        continue;
      }
      if (!allowed.includes(step.capability)) {
        r('unsupported', `Not enrolled for ${step.capability}.`);
        continue;
      }
      if (step.capability === 'skills.enable' || step.capability === 'skills.activation') {
        const m = /^skills\.([a-z0-9-]+)\.(enabled|activation)$/.exec(step.target);
        const field = step.capability === 'skills.enable' ? 'enabled' : 'activation';
        if (!m || m[2] !== field || !SKILL_ID.test(m[1]!)) {
          r('failed', 'Malformed target.');
          continue;
        }
        const id = m[1]!;
        const spec = ws.specs[id];
        if (!spec) {
          r('blocked', `${id} is not installed in this project; install it locally first.`);
          continue;
        }
        const entry = ws.lock.resolved[id];
        if (field === 'enabled' && typeof step.value !== 'boolean') {
          r('failed', 'enabled must be true or false.');
          continue;
        }
        if (field === 'activation' && step.value !== 'auto' && step.value !== 'manual') {
          r('failed', 'activation must be auto or manual.');
          continue;
        }
        const current = field === 'enabled' ? spec.enabled !== false : (spec.activation ?? entry?.activation ?? 'auto');
        if (current === step.value) {
          r('unchanged');
          continue;
        }
        const owner = entry ? (await classifyTarget(scope, id, entry)).ownership : 'absent';
        if (owner === 'modified' || owner === 'local' || owner === 'unmanaged') {
          r('blocked', owner === 'local' ? `${id} is locally owned (forked or local); AgileFlow does not rewrite it.` : `${id} has local modifications; they were kept. Review them with \`agileflow diff ${id}\`.`);
          continue;
        }
        const next = { ...spec };
        if (field === 'enabled') {
          if (step.value === false) next.enabled = false;
          else delete next.enabled;
        } else next.activation = step.value as 'auto' | 'manual';
        await setSkillSpecs(scope, { [id]: next });
        ws.specs[id] = next;
        skillsChanged = changed = true;
        r('applied');
        continue;
      }
      if (step.capability === 'skills.update') {
        const m = /^skills\.([a-z0-9-]+)\.version$/.exec(step.target);
        if (!m || !SKILL_ID.test(m[1]!) || typeof step.value !== 'string' || !EXACT_VERSION.test(step.value)) {
          r('failed', 'Malformed target or version.');
          continue;
        }
        const id = m[1]!;
        const spec = ws.specs[id];
        if (!spec) {
          r('blocked', `${id} is not installed in this project; install it locally first.`);
          continue;
        }
        // A project approval covers official packages only; third-party sources need a local review.
        if (!spec.source.startsWith('@agileflow/')) {
          r('blocked', `${id} comes from ${spec.source}; third-party updates are reviewed locally with \`agileflow update ${id}\`.`);
          continue;
        }
        const entry = ws.lock.resolved[id];
        if (entry && String(entry.version) === step.value && spec.version === step.value) {
          r('unchanged');
          continue;
        }
        const owner = entry ? (await classifyTarget(scope, id, entry)).ownership : 'absent';
        if (owner === 'modified' || owner === 'local' || owner === 'unmanaged') {
          r('blocked', `${id} has local modifications or is locally owned; it was not replaced. Review with \`agileflow diff ${id}\`.`);
          continue;
        }
        const previous = { ...spec };
        await setSkillSpecs(scope, { [id]: { ...spec, version: step.value } });
        const report = await updateWorkspace(services, await loadWorkspace(scope), { ids: [id] });
        const skipped = report.skipped.find((x) => x.id === id);
        const locked = (await loadWorkspace(scope)).lock.resolved[id];
        if (skipped || !locked || String(locked.version) !== step.value) {
          // Restore the previous range so the project is not left pinned to a version it does not have.
          await setSkillSpecs(scope, { [id]: previous });
          r(skipped ? 'blocked' : 'failed', skipped ? `${id}: ${skipped.reason}` : `${id} did not resolve to ${step.value}${report.events.length ? `: ${report.events.map((e) => e.message).join('; ').slice(0, 300)}` : '.'}`);
          continue;
        }
        ws.specs[id] = { ...spec, version: step.value };
        skillsChanged = true;
        r('applied');
        continue;
      }
      if (step.capability === 'providers.mode') {
        const m = /^providers\.([a-z][a-z0-9-]{0,31})\.enabled$/.exec(step.target);
        if (!m) {
          r('failed', 'Malformed target.');
          continue;
        }
        const id = m[1]!;
        if (!known.has(id)) {
          r('unsupported', `Provider "${id}" is not known to this CLI.`);
          continue;
        }
        const map: Record<string, boolean | 'auto'> = { on: true, off: false, auto: 'auto' };
        if (!Object.hasOwn(map, String(step.value))) {
          r('failed', 'Provider mode must be on, off, or auto.');
          continue;
        }
        const want = map[String(step.value)]!;
        if ((ws.providerSettings[id]?.enabled ?? 'auto') === want) {
          r('unchanged');
          continue;
        }
        await setConfigValue(scope, ['providers', id, 'enabled'], want);
        ws.providerSettings[id] = { ...(ws.providerSettings[id] ?? {}), enabled: want };
        skillsChanged = changed = true;
        r('applied');
        continue;
      }
      // questions.preference
      if (step.target !== 'interaction.questionPreference' || !PREFERENCES.includes(String(step.value))) {
        r('failed', `Question preference must be one of: ${PREFERENCES.join(', ')}.`);
        continue;
      }
      if (ws.questionPreference === step.value) {
        r('unchanged');
        continue;
      }
      await setConfigValue(scope, ['interaction', 'questionPreference'], step.value);
      ws.questionPreference = step.value as never;
      skillsChanged = changed = true;
      r('applied');
    } catch (err) {
      r('failed', (err as Error).message.slice(0, 300));
    }
  }

  const syncErrors: string[] = [];
  if (changed) {
    const fresh = await loadWorkspace(scope);
    if (fresh.lockExists) {
      const report = await syncWorkspace(services, fresh, { mismatch: 'report' });
      for (const e of report.events) if (e.level === 'error') syncErrors.push(`${e.skill ? `${e.skill}: ` : ''}${e.message}`);
    }
  }
  return { results, skillsChanged, syncErrors };
}

/** Overall receipt state from per-target results. */
export function receiptState(results: StepResult[]): 'applied' | 'blocked' | 'unsupported' | 'failed' {
  if (results.some((r) => r.outcome === 'failed')) return 'failed';
  if (results.some((r) => r.outcome === 'blocked')) return 'blocked';
  if (results.some((r) => r.outcome === 'unsupported')) return 'unsupported';
  return 'applied';
}
