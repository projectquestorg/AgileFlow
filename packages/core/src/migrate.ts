import fs from 'node:fs';
import path from 'node:path';
import toml from '@iarna/toml';
import YAML from 'yaml';
import { isNotFound, pathExists, pruneEmptyDirs, readTextIfExists, toPosix, writeFileAtomic } from './fs';
import { sha256Hex } from './hash';
import { parseSkillMarkdown } from './skill';

/**
 * v4 -> v5 migration.
 *
 * Ownership must be proven before anything is removed:
 * - hook entries: command contains a known v4/v3 AgileFlow marker;
 * - `.agileflow/` files: listed in v4's own file index with an unchanged hash,
 *   or one of v4's generated runtime files;
 * - provider skill mirrors: exact v4 catalog ids whose SKILL.md names match;
 * - AGENTS.md / CLAUDE.md: only the text between v4's managed-block markers.
 * Everything else is reported and left in place. Docs are never deleted.
 */

/** Skill ids shipped by the v4 catalog (plugins/*\/skills). */
export const V4_SKILL_IDS = [
  'agileflow-accessibility',
  'agileflow-adr',
  'agileflow-ads',
  'agileflow-audit',
  'agileflow-babysit-mentor',
  'agileflow-council',
  'agileflow-database',
  'agileflow-debug',
  'agileflow-delivery',
  'agileflow-docs',
  'agileflow-engineering',
  'agileflow-epic-planner',
  'agileflow-ideation',
  'agileflow-migration',
  'agileflow-performance',
  'agileflow-planning',
  'agileflow-pr-reviewer',
  'agileflow-refactor',
  'agileflow-research',
  'agileflow-retention',
  'agileflow-seo',
  'agileflow-status-updater',
  'agileflow-story-writer',
  'agileflow-test-writer',
] as const;

/** v5 skills that cover behavior people used from v4 skills. */
export const V4_SKILL_SUGGESTIONS: Record<string, string[]> = {
  'agileflow-debug': ['diagnosing-bugs'],
  'agileflow-pr-reviewer': ['reviewing-changes'],
  'agileflow-audit': ['reviewing-changes'],
  'agileflow-delivery': ['filing-pr', 'babysitting-pr'],
  'agileflow-refactor': ['checking-blast-radius'],
  'agileflow-migration': ['checking-blast-radius'],
  'agileflow-test-writer': ['verifying-changes'],
  'agileflow-babysit-mentor': ['interviewing-requirements', 'verifying-changes', 'filing-pr', 'babysitting-pr'],
};

/** v4 plugin ids -> v5 skills. */
export const V4_PLUGIN_SUGGESTIONS: Record<string, string[]> = {
  debugging: ['diagnosing-bugs'],
  reviews: ['reviewing-changes'],
  audit: ['reviewing-changes'],
  delivery: ['filing-pr', 'babysitting-pr'],
  refactoring: ['checking-blast-radius'],
  migration: ['checking-blast-radius'],
  testing: ['verifying-changes'],
};

export const V4_DOCS_DIRS = [
  'docs/00-meta',
  'docs/01-brainstorming',
  'docs/02-practices',
  'docs/03-decisions',
  'docs/04-architecture',
  'docs/05-epics',
  'docs/06-stories',
  'docs/07-testing',
  'docs/08-project',
  'docs/09-agents',
  'docs/10-research',
];

/** Provider skill directories v4 mirrored into. */
export const V4_MIRROR_DIRS = [
  '.claude/skills',
  '.cursor/skills',
  '.windsurf/skills',
  '.codex/skills',
  '.antigravity/skills',
];

/** Substrings that identify AgileFlow-installed hook commands (v4, then v3). */
export const HOOK_MARKERS = ['agileflow hook', '.agileflow/scripts/', '.agileflow\\scripts\\'];

const BEGIN_MARKER = '<!-- BEGIN AGILEFLOW MANAGED BLOCK -->';
const END_MARKER = '<!-- END AGILEFLOW MANAGED BLOCK -->';

/** Files v4 generated at runtime inside `.agileflow/` (safe to remove). */
const V4_RUNTIME_FILES = ['_cfg/files.json', '_cfg/manifest.yaml', '_cfg/install.lock', 'hook-manifest.yaml'];
const V4_RUNTIME_DIRS = ['logs'];

export type MigrationAction =
  | { kind: 'edit-settings'; file: string; removedHooks: number; removedStatusLine: boolean; description: string }
  | { kind: 'edit-codex'; file: string; removedHooks: number; description: string }
  | { kind: 'strip-block'; file: string; deleteFile: boolean; description: string }
  | { kind: 'remove'; path: string; description: string };

export interface MigrationNote {
  level: 'info' | 'warn';
  message: string;
  detail?: string[];
}

export interface DocsReportEntry {
  dir: string;
  files: number;
  untouchedSeed: boolean;
}

export interface MigrationPlan {
  root: string;
  detected: boolean;
  findings: string[];
  actions: MigrationAction[];
  notes: MigrationNote[];
  docs: DocsReportEntry[];
  suggestedSkills: string[];
  /** Existing v5 config means install is skipped. */
  hasV5Config: boolean;
}

function markerHit(command: unknown): boolean {
  return typeof command === 'string' && HOOK_MARKERS.some((m) => command.includes(m));
}

interface HookFilterResult {
  hooks: Record<string, unknown[]> | undefined;
  removed: number;
}

/** Remove AgileFlow hook commands from a Claude/Codex style `hooks` object. */
export function filterHooks(hooks: unknown): HookFilterResult {
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) return { hooks: undefined, removed: 0 };
  let removed = 0;
  const next: Record<string, unknown[]> = {};
  for (const [event, entries] of Object.entries(hooks as Record<string, unknown>)) {
    if (!Array.isArray(entries)) {
      next[event] = entries as unknown[];
      continue;
    }
    const kept: unknown[] = [];
    for (const entry of entries) {
      const e = entry as { hooks?: unknown[]; command?: unknown };
      if (e && typeof e === 'object' && Array.isArray(e.hooks)) {
        const inner = e.hooks.filter((h) => {
          const hit = markerHit((h as { command?: unknown })?.command);
          if (hit) removed++;
          return !hit;
        });
        if (inner.length) kept.push({ ...e, hooks: inner });
      } else if (e && typeof e === 'object' && markerHit(e.command)) {
        removed++;
      } else {
        kept.push(entry);
      }
    }
    if (kept.length) next[event] = kept;
  }
  return { hooks: Object.keys(next).length ? next : undefined, removed };
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  const text = await readTextIfExists(file);
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(abs: string, rel: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(abs, { withFileTypes: true });
    } catch (err) {
      if (isNotFound(err)) return;
      throw err;
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(abs, entry.name), childRel);
      else out.push(childRel);
    }
  }
  await walk(dir, '');
  return out.sort();
}

async function planSettings(file: string, label: string, actions: MigrationAction[], findings: string[]): Promise<void> {
  const settings = await readJson(file);
  if (!settings) return;
  const { removed } = filterHooks(settings.hooks);
  const statusLine = settings.statusLine as { command?: unknown } | undefined;
  const removeStatusLine = markerHit(statusLine?.command);
  if (!removed && !removeStatusLine) return;
  findings.push(`${label} AgileFlow hook entries`);
  actions.push({
    kind: 'edit-settings',
    file,
    removedHooks: removed,
    removedStatusLine: removeStatusLine,
    description: `remove ${removed} AgileFlow hook command${removed === 1 ? '' : 's'}${removeStatusLine ? ' and the AgileFlow status line' : ''} from ${label}`,
  });
}

/** Inspect a project for v4 residue. Read-only. */
export async function planMigration(
  root: string,
  homeDir: string,
  options: { includeHome?: boolean } = {},
): Promise<MigrationPlan> {
  const plan: MigrationPlan = {
    root,
    detected: false,
    findings: [],
    actions: [],
    notes: [],
    docs: [],
    suggestedSkills: [],
    hasV5Config: await pathExists(path.join(root, 'agileflow.yaml')),
  };
  const suggestions = new Set<string>();

  // agileflow.config.json (v4 unified config)
  const v4ConfigPath = path.join(root, 'agileflow.config.json');
  const v4Config = await readJson(v4ConfigPath);
  if (v4Config) {
    plan.findings.push('agileflow.config.json');
    const plugins = v4Config.plugins as Record<string, { enabled?: boolean }> | undefined;
    for (const [id, p] of Object.entries(plugins ?? {})) {
      if (p?.enabled === false) continue;
      for (const s of V4_PLUGIN_SUGGESTIONS[id] ?? []) suggestions.add(s);
    }
    plan.actions.push({
      kind: 'remove',
      path: v4ConfigPath,
      description: 'remove agileflow.config.json (replaced by agileflow.yaml; backed up first)',
    });
  }

  // .agileflow runtime directory
  const runtimeDir = path.join(root, '.agileflow');
  if (await pathExists(runtimeDir)) {
    plan.findings.push('.agileflow/ runtime directory');
    const index = await readJson(path.join(runtimeDir, '_cfg', 'files.json'));
    const indexed = (index?.files ?? {}) as Record<string, { sha256?: string }>;
    const files = await listFilesRecursive(runtimeDir);
    const kept: string[] = [];
    let removable = 0;
    for (const rel of files) {
      const abs = path.join(runtimeDir, ...rel.split('/'));
      const generated =
        V4_RUNTIME_FILES.includes(rel) || V4_RUNTIME_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`));
      let untouched = false;
      const record = indexed[rel];
      if (record?.sha256) {
        const content = await fs.promises.readFile(abs);
        untouched = sha256Hex(content) === record.sha256;
      }
      if (generated || untouched) {
        plan.actions.push({ kind: 'remove', path: abs, description: `remove .agileflow/${rel}` });
        removable++;
      } else {
        kept.push(`.agileflow/${rel}`);
      }
    }
    if (kept.length) {
      plan.notes.push({
        level: 'info',
        message: `${kept.length} file${kept.length === 1 ? '' : 's'} in .agileflow/ could not be proven AgileFlow-generated and unchanged; they will be left in place`,
        detail: kept.slice(0, 20).concat(kept.length > 20 ? [`... and ${kept.length - 20} more`] : []),
      });
    }
    if (kept.some((k) => k.startsWith('.agileflow/skills/_learnings'))) {
      plan.notes.push({
        level: 'info',
        message: 'v4 skill learnings were kept in .agileflow/skills/_learnings. v5 has no learnings system.',
      });
    }
    if (!removable && !kept.length) {
      plan.actions.push({ kind: 'remove', path: runtimeDir, description: 'remove empty .agileflow/' });
    }
  }

  // Hooks
  await planSettings(path.join(root, '.claude', 'settings.json'), '.claude/settings.json', plan.actions, plan.findings);
  await planSettings(path.join(root, '.claude', 'settings.local.json'), '.claude/settings.local.json', plan.actions, plan.findings);
  // Personal settings are only considered by `migrate` itself, so a v4 hook in
  // ~/.claude/settings.json does not make every fresh project look like v4.
  if (options.includeHome && path.resolve(homeDir) !== path.resolve(root)) {
    await planSettings(path.join(homeDir, '.claude', 'settings.json'), '~/.claude/settings.json', plan.actions, plan.findings);
  }

  // Codex project config
  const codexPath = path.join(root, '.codex', 'config.toml');
  const codexText = await readTextIfExists(codexPath);
  if (codexText !== null) {
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = toml.parse(codexText) as Record<string, unknown>;
    } catch {
      plan.notes.push({ level: 'warn', message: '.codex/config.toml could not be parsed; left unchanged' });
    }
    if (parsed) {
      const { removed } = filterHooks(parsed.hooks);
      if (removed) {
        plan.findings.push('.codex/config.toml AgileFlow hook entries');
        plan.actions.push({
          kind: 'edit-codex',
          file: codexPath,
          removedHooks: removed,
          description: `remove ${removed} AgileFlow hook command${removed === 1 ? '' : 's'} from .codex/config.toml`,
        });
      }
      const legacy: string[] = [];
      if (parsed.approval_policy === 'never') legacy.push('approval_policy = "never"');
      if (parsed.sandbox_mode === 'danger-full-access') legacy.push('sandbox_mode = "danger-full-access"');
      if (legacy.length) {
        plan.notes.push({
          level: 'warn',
          message: 'Legacy AgileFlow Codex configuration detected:',
          detail: [
            ...legacy.map((l) => `  ${l}`),
            'AgileFlow v4 may have written these values. v5 does not manage them.',
            'Because the previous user values are unknown, they have not been changed.',
            'Review your Codex configuration manually (.codex/config.toml).',
          ],
        });
      }
      const features = parsed.features as Record<string, unknown> | undefined;
      const flags = ['hooks', 'codex_hooks', 'collaboration_modes'].filter((f) => features?.[f] === true);
      if (flags.length && removed) {
        plan.notes.push({
          level: 'info',
          message: `.codex/config.toml [features] ${flags.join(', ')} left unchanged (their previous values are unknown)`,
        });
      }
    }
  }

  // Generated agent/command directories
  for (const rel of ['.claude/agents/agileflow', '.claude/commands/agileflow']) {
    const abs = path.join(root, ...rel.split('/'));
    if (await pathExists(abs)) {
      plan.findings.push(rel);
      plan.actions.push({
        kind: 'remove',
        path: abs,
        description: `remove ${rel} (v4-generated; legacy agent prompts are not installed in v5)`,
      });
    }
  }

  // Provider skill mirrors
  for (const dirRel of V4_MIRROR_DIRS) {
    const dirAbs = path.join(root, ...dirRel.split('/'));
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dirAbs, { withFileTypes: true });
    } catch {
      continue;
    }
    const unknown: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if ((V4_SKILL_IDS as readonly string[]).includes(entry.name)) {
        const text = await readTextIfExists(path.join(dirAbs, entry.name, 'SKILL.md'));
        let name: string | null = null;
        try {
          name = text ? parseSkillMarkdown(text).name : null;
        } catch {
          name = null;
        }
        if (name === entry.name) {
          const mirrorAbs = path.join(dirAbs, entry.name);
          const learned = await recordedLearnings(mirrorAbs);
          if (learned.length) {
            // v4 stored user corrections inside the mirror; keep them in place.
            for (const rel of await listFilesRecursive(mirrorAbs)) {
              if (rel.startsWith('_learnings/')) continue;
              plan.actions.push({
                kind: 'remove',
                path: path.join(mirrorAbs, ...rel.split('/')),
                description: `remove ${dirRel}/${entry.name}/${rel}`,
              });
            }
            plan.notes.push({
              level: 'info',
              message: `${dirRel}/${entry.name}/_learnings contains recorded learnings; it was kept (v5 has no learnings system)`,
              detail: learned,
            });
          } else {
            plan.actions.push({
              kind: 'remove',
              path: mirrorAbs,
              description: `remove v4 skill mirror ${dirRel}/${entry.name}`,
            });
          }
          for (const s of V4_SKILL_SUGGESTIONS[entry.name] ?? []) suggestions.add(s);
          continue;
        }
      }
      if (entry.name.startsWith('agileflow-')) unknown.push(`${dirRel}/${entry.name}`);
    }
    if (plan.actions.some((a) => a.kind === 'remove' && a.path.startsWith(dirAbs + path.sep))) {
      plan.findings.push(`${dirRel} v4 skill mirrors`);
    }
    if (unknown.length) {
      plan.notes.push({
        level: 'info',
        message: 'Skill directories with an agileflow- prefix that are not part of the v4 catalog were left in place:',
        detail: unknown,
      });
    }
  }

  // Managed instruction blocks
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const file = path.join(root, name);
    const text = await readTextIfExists(file);
    if (text === null) continue;
    const begin = text.indexOf(BEGIN_MARKER);
    const end = begin === -1 ? -1 : text.indexOf(END_MARKER, begin);
    if (begin === -1 || end === -1) continue;
    const remaining = (text.slice(0, begin) + text.slice(end + END_MARKER.length)).trim();
    plan.findings.push(`${name} AgileFlow managed block`);
    plan.actions.push({
      kind: 'strip-block',
      file,
      deleteFile: remaining === '',
      description: remaining === ''
        ? `remove ${name} (it only contained the AgileFlow managed block)`
        : `remove the AgileFlow managed block from ${name} (your content is kept)`,
    });
  }

  // Docs are reported, never deleted.
  for (const rel of V4_DOCS_DIRS) {
    const abs = path.join(root, ...rel.split('/'));
    if (!(await pathExists(abs))) continue;
    const files = await listFilesRecursive(abs);
    plan.docs.push({ dir: rel, files: files.length, untouchedSeed: await isUntouchedSeed(rel, abs, files) });
  }
  if (plan.docs.length) {
    plan.findings.push('legacy docs structure');
    plan.notes.push({
      level: 'info',
      message: 'Legacy AgileFlow docs structure detected. AgileFlow v5 does not use these directories.',
      detail: ['They will be left unchanged.', 'Run `agileflow migrate v4 --report-docs` for a cleanup report.'],
    });
  }

  if (plan.findings.some((f) => f.includes('agent') || f.includes('mirrors'))) {
    plan.notes.push({
      level: 'info',
      message: 'Legacy agent prompt files will not be installed in v5.',
      detail: ['Relevant workflow behavior may now exist as targeted skills.'],
    });
  }

  plan.detected = plan.findings.length > 0;
  plan.suggestedSkills = [...suggestions].sort();
  return plan;
}

/** `_learnings/*.yaml` files in a v4 mirror that contain entries (user data, not the empty seed). */
async function recordedLearnings(mirrorDir: string): Promise<string[]> {
  const out: string[] = [];
  for (const rel of await listFilesRecursive(path.join(mirrorDir, '_learnings'))) {
    const text = (await readTextIfExists(path.join(mirrorDir, '_learnings', ...rel.split('/')))) ?? '';
    let empty = false;
    try {
      const parsed = YAML.parse(text) as { entries?: unknown } | null;
      empty = !!parsed && Array.isArray(parsed.entries) && parsed.entries.length === 0;
    } catch {
      empty = false;
    }
    if (!empty) out.push(`_learnings/${rel}`);
  }
  return out;
}

async function isUntouchedSeed(rel: string, abs: string, files: string[]): Promise<boolean> {
  if (files.length === 0) return true;
  if (rel === 'docs/09-agents' && files.length === 1 && files[0] === 'status.json') {
    const status = await readJson(path.join(abs, 'status.json'));
    const empty = (v: unknown) => !v || (typeof v === 'object' && Object.keys(v as object).length === 0);
    return !!status && empty(status.epics) && empty(status.stories);
  }
  if (rel === 'docs/00-meta' && files.length === 1 && files[0] === 'agileflow-metadata.json') return true;
  return false;
}

export interface MigrationResult {
  backupDir: string | null;
  applied: MigrationAction[];
  failed: Array<{ action: MigrationAction; error: string }>;
}

async function backupPath(abs: string, root: string, backupDir: string): Promise<void> {
  const rel = path.relative(root, abs);
  const dest = rel.startsWith('..') || path.isAbsolute(rel)
    ? path.join(backupDir, '_outside-project', path.basename(abs))
    : path.join(backupDir, rel);
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  await fs.promises.cp(abs, dest, { recursive: true, force: true, errorOnExist: false, verbatimSymlinks: true });
}

/** Apply a migration plan. Everything touched is copied into a backup first when requested. */
export async function applyMigration(
  plan: MigrationPlan,
  options: { backup: boolean; now?: Date },
): Promise<MigrationResult> {
  const stamp = (options.now ?? new Date()).toISOString().replace(/[:.]/g, '-');
  const backupDir = options.backup ? path.join(plan.root, `.agileflow-v4-backup-${stamp}`) : null;
  const result: MigrationResult = { backupDir, applied: [], failed: [] };
  const runtimeDir = path.join(plan.root, '.agileflow');

  for (const action of plan.actions) {
    try {
      const target = action.kind === 'remove' ? action.path : action.file;
      if (backupDir && (await pathExists(target))) await backupPath(target, plan.root, backupDir);
      if (action.kind === 'remove') {
        await fs.promises.rm(action.path, { recursive: true, force: true });
        // Drop directories left empty by the removal, but never the top-level
        // folder itself (e.g. keep `.claude/` even if its v4 content is gone).
        const rel = path.relative(plan.root, action.path);
        if (!rel.startsWith('..') && rel.includes(path.sep)) {
          const top = rel.split(path.sep)[0]!;
          const stopAt = top === '.agileflow' ? plan.root : path.join(plan.root, top);
          await pruneEmptyDirs(path.dirname(action.path), stopAt);
        }
      } else if (action.kind === 'edit-settings') {
        const settings = (await readJson(action.file)) ?? {};
        const { hooks } = filterHooks(settings.hooks);
        if (hooks) settings.hooks = hooks;
        else delete settings.hooks;
        if (action.removedStatusLine) delete settings.statusLine;
        await writeFileAtomic(action.file, JSON.stringify(settings, null, 2) + '\n');
      } else if (action.kind === 'edit-codex') {
        const parsed = toml.parse(await fs.promises.readFile(action.file, 'utf8')) as Record<string, unknown>;
        const { hooks } = filterHooks(parsed.hooks);
        if (hooks) parsed.hooks = hooks as never;
        else delete parsed.hooks;
        await writeFileAtomic(action.file, toml.stringify(parsed as toml.JsonMap));
      } else if (action.kind === 'strip-block') {
        const text = await fs.promises.readFile(action.file, 'utf8');
        const begin = text.indexOf(BEGIN_MARKER);
        const end = text.indexOf(END_MARKER, begin);
        if (begin !== -1 && end !== -1) {
          if (action.deleteFile) {
            await fs.promises.unlink(action.file);
          } else {
            const before = text.slice(0, begin).replace(/\s+$/, '');
            const after = text.slice(end + END_MARKER.length).replace(/^\s+/, '');
            await writeFileAtomic(action.file, [before, after].filter(Boolean).join('\n\n') + '\n');
          }
        }
      }
      result.applied.push(action);
    } catch (err) {
      result.failed.push({ action, error: (err as Error).message });
    }
  }
  // Drop .agileflow/ when everything in it was AgileFlow's.
  try {
    const left = await fs.promises.readdir(runtimeDir);
    if (left.length === 0) await fs.promises.rmdir(runtimeDir);
  } catch {
    // absent or not empty
  }
  return result;
}

export function formatDocsReport(plan: MigrationPlan): string[] {
  if (!plan.docs.length) return ['No legacy AgileFlow docs directories found.'];
  const lines = ['Legacy AgileFlow docs directories (never deleted automatically):'];
  for (const d of plan.docs) {
    const state = d.untouchedSeed
      ? 'empty or unchanged v4 seed; safe to delete manually'
      : `${d.files} file${d.files === 1 ? '' : 's'}; review before deleting`;
    lines.push(`  ${toPosix(d.dir).padEnd(24)} ${state}`);
  }
  return lines;
}
