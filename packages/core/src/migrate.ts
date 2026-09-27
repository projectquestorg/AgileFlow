import fs from 'node:fs';
import path from 'node:path';
import toml from '@iarna/toml';
import YAML from 'yaml';
import { OperationError } from './errors';
import { isNotFound, pruneEmptyDirs, readTextIfExists, toPosix, writeFileAtomic } from './fs';
import { sha256Hex } from './hash';
import { editTomlLines } from './migrate-toml';
import { parseSkillMarkdown } from './skill';

/**
 * v4 -> v5 migration.
 *
 * Two locations are planned the same way: a project (`<root>`) and the
 * user's home directory, where v4's `--scope global` install put everything
 * (`~/.agileflow`, `~/.claude/...`, `~/.codex/config.toml`, ...).
 *
 * Ownership must be proven before anything is removed:
 * - hook entries: command contains a known v4/v3 AgileFlow marker;
 * - `.agileflow/` files: listed in v4's own file index with an unchanged hash,
 *   or one of v4's generated runtime files. Index entries are only honored for
 *   real files inside the runtime directory; symlinks are never followed;
 * - provider skill mirrors: exact v4 catalog ids whose files hash-match v4's
 *   file index. Mirrors that only match by name are "unverified" and need
 *   explicit consent;
 * - AGENTS.md / CLAUDE.md: only the text between v4's managed-block markers;
 * - Codex `approval_policy`/`sandbox_mode`: only when v4's hooks are in the
 *   same file (v4 always wrote all three together) and the user consents.
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
const V4_INDEX = '_cfg/files.json';

/** Values v4's Codex writer always set together with its hooks. */
const V4_CODEX_PERMISSIONS: Record<string, string> = {
  approval_policy: 'never',
  sandbox_mode: 'danger-full-access',
};

/** v4 appended this section to the babysit skill when mirroring it. */
const BABYSIT_ID = 'agileflow-babysit-mentor';
const BABYSIT_APPENDIX = '\n\n## IDE-specific guidance\n';

export type MigrationLocation = 'project' | 'user';

/**
 * Changes that are planned but only applied with explicit consent:
 * - `unverified-mirrors`: v4 catalog skill mirrors that cannot be verified
 *   against v4's file index;
 * - `codex-permissions`: removing `approval_policy`/`sandbox_mode` that v4 wrote.
 */
export type MigrationConsent = 'unverified-mirrors' | 'codex-permissions';

export type MigrationAction = (
  | { kind: 'edit-settings'; file: string; removedHooks: number; removedStatusLine: boolean }
  | { kind: 'edit-codex'; file: string; removedHooks: number; resetKeys: string[] }
  | { kind: 'strip-block'; file: string; deleteFile: boolean }
  | { kind: 'remove'; path: string }
) & {
  description: string;
  consent?: MigrationConsent;
  /** Summary shown once for a set of related actions (e.g. one mirror removed file by file). */
  group?: string;
};

export interface MigrationNote {
  /** `error`: v4 behavior stays active until the user fixes something by hand. */
  level: 'info' | 'warn' | 'error';
  message: string;
  detail?: string[];
}

export interface DocsReportEntry {
  dir: string;
  files: number;
  untouchedSeed: boolean;
}

export interface MigrationPlan {
  /** Project root, or the home directory for the `user` location. */
  root: string;
  location: MigrationLocation;
  /** Prefix for paths shown to the user: '' (project) or '~/' (user). */
  label: string;
  runtimeDir: string;
  detected: boolean;
  findings: string[];
  actions: MigrationAction[];
  notes: MigrationNote[];
  docs: DocsReportEntry[];
  suggestedSkills: string[];
  /** Existing v5 config means install is skipped. */
  hasV5Config: boolean;
}

export interface PlanMigrationOptions {
  /** `user` plans the home directory (`root` should be the home directory). Default `project`. */
  location?: MigrationLocation;
  /** Environment used to find the user's Codex home (`CODEX_HOME`). */
  env?: Record<string, string | undefined>;
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

type JsonRead =
  | { state: 'missing' }
  | { state: 'invalid'; text: string }
  | { state: 'ok'; text: string; value: Record<string, unknown> };

async function readJsonFile(file: string): Promise<JsonRead> {
  const text = await readTextIfExists(file).catch(() => null);
  if (text === null) return { state: 'missing' };
  try {
    const parsed = JSON.parse(text.replace(/^﻿/, ''));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { state: 'ok', text, value: parsed };
  } catch {
    // fall through
  }
  return { state: 'invalid', text };
}

async function lstatOrNull(p: string): Promise<fs.Stats | null> {
  try {
    return await fs.promises.lstat(p);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function realpathOrSelf(p: string): Promise<string> {
  try {
    return await fs.promises.realpath(p);
  } catch {
    return path.resolve(p);
  }
}

interface WalkResult {
  files: string[];
  symlinks: string[];
}

/** Regular files under `dir` (POSIX-relative). Symlinks are listed separately and never followed. */
async function walk(dir: string): Promise<WalkResult> {
  const out: WalkResult = { files: [], symlinks: [] };
  async function visit(abs: string, rel: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(abs, { withFileTypes: true });
    } catch (err) {
      if (isNotFound(err)) return;
      throw err;
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) out.symlinks.push(childRel);
      else if (entry.isDirectory()) await visit(path.join(abs, entry.name), childRel);
      else if (entry.isFile()) out.files.push(childRel);
    }
  }
  await visit(dir, '');
  out.files.sort();
  out.symlinks.sort();
  return out;
}

/** v4 file-index keys are POSIX paths relative to `.agileflow/`; anything else is ignored. */
function isSafeIndexKey(key: string): boolean {
  if (!key || key.length > 1024 || key.includes('\0') || key.includes('\\')) return false;
  if (key.startsWith('/') || /^[A-Za-z]:/.test(key)) return false;
  return key.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

/**
 * Read v4's file index. The index may be supplied by anyone who can write the
 * repository, so it is only used as "this exact content was generated by v4",
 * never as a list of paths to delete.
 */
async function loadIndex(runtimeDir: string): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  const file = path.join(runtimeDir, ...V4_INDEX.split('/'));
  const st = await lstatOrNull(file);
  if (!st?.isFile()) return index;
  const read = await readJsonFile(file);
  if (read.state !== 'ok') return index;
  const files = read.value.files;
  if (!files || typeof files !== 'object' || Array.isArray(files)) return index;
  for (const [key, record] of Object.entries(files as Record<string, unknown>)) {
    if (!isSafeIndexKey(key)) continue;
    const sha = (record as { sha256?: unknown } | null)?.sha256;
    if (typeof sha === 'string' && /^[0-9a-f]{64}$/i.test(sha)) index.set(key, sha.toLowerCase());
  }
  return index;
}

/** Hashes recorded for each v4 plugin skill file: skill id -> relative path -> hashes. */
function skillHashes(index: Map<string, string>): Map<string, Map<string, Set<string>>> {
  const out = new Map<string, Map<string, Set<string>>>();
  for (const [key, sha] of index) {
    const m = /^plugins\/[^/]+\/skills\/([^/]+)\/(.+)$/.exec(key);
    if (!m) continue;
    const byRel = out.get(m[1]!) ?? new Map<string, Set<string>>();
    const set = byRel.get(m[2]!) ?? new Set<string>();
    set.add(sha);
    byRel.set(m[2]!, set);
    out.set(m[1]!, byRel);
  }
  return out;
}

interface Loc {
  kind: MigrationLocation;
  base: string;
  label: string;
  runtimeDir: string;
  v4Configs: string[];
  settings: string[];
  codex: string[];
}

function locationFor(root: string, options: PlanMigrationOptions): Loc {
  const base = path.resolve(root);
  if (options.location === 'user') {
    const codexHome = options.env?.CODEX_HOME ? path.resolve(options.env.CODEX_HOME) : null;
    const codex = [path.join(base, '.codex', 'config.toml')];
    if (codexHome && path.join(codexHome, 'config.toml') !== codex[0]) codex.push(path.join(codexHome, 'config.toml'));
    return {
      kind: 'user',
      base,
      label: '~/',
      runtimeDir: path.join(base, '.agileflow'),
      v4Configs: [path.join(base, '.agileflow', 'agileflow.config.json'), path.join(base, 'agileflow.config.json')],
      settings: [path.join(base, '.claude', 'settings.json')],
      codex,
    };
  }
  return {
    kind: 'project',
    base,
    label: '',
    runtimeDir: path.join(base, '.agileflow'),
    v4Configs: [path.join(base, 'agileflow.config.json')],
    settings: [path.join(base, '.claude', 'settings.json'), path.join(base, '.claude', 'settings.local.json')],
    codex: [path.join(base, '.codex', 'config.toml')],
  };
}

function show(loc: Loc, abs: string): string {
  return isInside(abs, loc.base) ? `${loc.label}${toPosix(path.relative(loc.base, abs))}` : abs;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Inside a project, never touch anything whose real location is outside the
 * project (a committed symlink could point anywhere). In the home directory,
 * provider folders are often symlinked into a dotfiles repo, so only the
 * entry itself must not be a symlink.
 */
async function contained(loc: Loc, abs: string): Promise<boolean> {
  if (loc.kind === 'user') return true;
  return isInside(await realpathOrSelf(abs), await realpathOrSelf(loc.base));
}

/** Inspect a project (or, with `location: 'user'`, the home directory) for v4 residue. Read-only. */
export async function planMigration(
  root: string,
  _homeDir: string,
  options: PlanMigrationOptions = {},
): Promise<MigrationPlan> {
  const loc = locationFor(root, options);
  const plan: MigrationPlan = {
    root: loc.base,
    location: loc.kind,
    label: loc.label,
    runtimeDir: loc.runtimeDir,
    detected: false,
    findings: [],
    actions: [],
    notes: [],
    docs: [],
    suggestedSkills: [],
    hasV5Config: loc.kind === 'project' && (await lstatOrNull(path.join(loc.base, 'agileflow.yaml'))) !== null,
  };
  const suggestions = new Set<string>();
  const handled = new Set<string>();

  // agileflow.config.json (v4 unified config)
  for (const file of loc.v4Configs) {
    const st = await lstatOrNull(file);
    if (!st) continue;
    handled.add(file);
    const read = st.isFile() ? await readJsonFile(file) : null;
    if (read?.state !== 'ok') {
      plan.findings.push(show(loc, file));
      plan.notes.push({ level: 'info', message: `${show(loc, file)} is not a readable v4 config file; it was left in place` });
      continue;
    }
    plan.findings.push(show(loc, file));
    const plugins = read.value.plugins as Record<string, { enabled?: boolean }> | undefined;
    if (plugins && typeof plugins === 'object') {
      for (const [id, p] of Object.entries(plugins)) {
        if (p?.enabled === false) continue;
        for (const s of V4_PLUGIN_SUGGESTIONS[id] ?? []) suggestions.add(s);
      }
    }
    plan.actions.push({
      kind: 'remove',
      path: file,
      description: `remove ${show(loc, file)} (replaced by agileflow.yaml; backed up first)`,
    });
  }

  // .agileflow runtime directory
  const index = await planRuntimeDir(loc, plan, handled);

  // Hooks in Claude settings
  for (const file of loc.settings) await planSettings(loc, plan, file);

  // Codex config
  for (const file of loc.codex) await planCodex(loc, plan, file);

  // Generated agent/command directories
  for (const rel of ['.claude/agents/agileflow', '.claude/commands/agileflow']) {
    const abs = path.join(loc.base, ...rel.split('/'));
    const st = await lstatOrNull(abs);
    if (!st) continue;
    plan.findings.push(show(loc, abs));
    if (!st.isDirectory() || !(await contained(loc, abs))) {
      plan.notes.push({ level: 'info', message: `${show(loc, abs)} is a link or file, not v4's directory; it was left in place` });
      continue;
    }
    plan.actions.push({
      kind: 'remove',
      path: abs,
      description: `remove ${show(loc, abs)} (v4-generated; legacy agent prompts are not installed in v5)`,
    });
  }

  // Provider skill mirrors
  await planMirrors(loc, plan, index, suggestions);

  // Managed instruction blocks
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const file = path.join(loc.base, name);
    const text = await readTextIfExists(file).catch(() => null);
    if (text === null) continue;
    const begin = text.indexOf(BEGIN_MARKER);
    const end = begin === -1 ? -1 : text.indexOf(END_MARKER, begin);
    if (begin === -1 || end === -1) continue;
    plan.findings.push(`${show(loc, file)} AgileFlow managed block`);
    if (!(await contained(loc, file))) {
      plan.notes.push({ level: 'info', message: `${show(loc, file)} links outside the project; its managed block was left in place` });
      continue;
    }
    const remaining = (text.slice(0, begin) + text.slice(end + END_MARKER.length)).trim();
    plan.actions.push({
      kind: 'strip-block',
      file,
      deleteFile: remaining === '',
      description: remaining === ''
        ? `remove ${show(loc, file)} (it only contained the AgileFlow managed block)`
        : `remove the AgileFlow managed block from ${show(loc, file)} (your content is kept)`,
    });
  }

  // Docs are reported, never deleted.
  for (const rel of V4_DOCS_DIRS) {
    const abs = path.join(loc.base, ...rel.split('/'));
    const st = await lstatOrNull(abs);
    if (!st?.isDirectory()) continue;
    const { files } = await walk(abs);
    plan.docs.push({ dir: rel, files: files.length, untouchedSeed: await isUntouchedSeed(rel, abs, files) });
  }
  if (plan.docs.length) {
    plan.findings.push(loc.kind === 'user' ? 'legacy docs structure (~/docs)' : 'legacy docs structure');
    plan.notes.push({
      level: 'info',
      message: `Legacy AgileFlow docs structure detected${loc.kind === 'user' ? ' in your home directory' : ''}. AgileFlow v5 does not use these directories.`,
      detail: [
        'They will be left unchanged.',
        `Run \`agileflow migrate v4${loc.kind === 'user' ? ' --global' : ''} --report-docs\` for a cleanup report.`,
      ],
    });
  }

  if (plan.findings.some((f) => f.includes('agents/agileflow') || f.includes('commands/agileflow') || f.includes('mirrors'))) {
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

async function planRuntimeDir(loc: Loc, plan: MigrationPlan, handled: Set<string>): Promise<Map<string, string>> {
  const runtimeDir = loc.runtimeDir;
  const shown = show(loc, runtimeDir);
  const st = await lstatOrNull(runtimeDir);
  if (!st) return new Map();
  plan.findings.push(`${shown}/ runtime directory`);
  if (!st.isDirectory() || !(await contained(loc, runtimeDir))) {
    plan.notes.push({
      level: 'warn',
      message: `${shown} is a symbolic link or not a directory; it was not followed or changed. Remove it yourself if it is AgileFlow's.`,
    });
    return new Map();
  }
  const index = await loadIndex(runtimeDir);
  const { files, symlinks } = await walk(runtimeDir);
  const kept: string[] = [];
  let removable = 0;
  for (const rel of files) {
    const abs = path.join(runtimeDir, ...rel.split('/'));
    if (handled.has(abs)) continue;
    const generated =
      V4_RUNTIME_FILES.includes(rel) || V4_RUNTIME_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`));
    let untouched = false;
    const recorded = index.get(rel);
    if (recorded) untouched = sha256Hex(await fs.promises.readFile(abs)) === recorded;
    if (generated || untouched) {
      plan.actions.push({ kind: 'remove', path: abs, description: `remove ${shown}/${rel}` });
      removable++;
    } else {
      kept.push(`${shown}/${rel}`);
    }
  }
  for (const rel of symlinks) kept.push(`${shown}/${rel} (symbolic link, not followed)`);
  if (kept.length) {
    plan.notes.push({
      level: 'info',
      message: `${plural(kept.length, 'file')} in ${shown}/ could not be proven AgileFlow-generated and unchanged; they will be left in place`,
      detail: kept.slice(0, 20).concat(kept.length > 20 ? [`... and ${kept.length - 20} more`] : []),
    });
  }
  if (kept.some((k) => k.startsWith(`${shown}/skills/_learnings`))) {
    plan.notes.push({
      level: 'info',
      message: `v4 skill learnings were kept in ${shown}/skills/_learnings. v5 has no learnings system.`,
    });
  }
  if (!removable && !kept.length && !files.some((f) => handled.has(path.join(runtimeDir, ...f.split('/'))))) {
    plan.actions.push({ kind: 'remove', path: runtimeDir, description: `remove empty ${shown}/` });
  }
  return index;
}

function manualHookHelp(file: string): string[] {
  return [
    `Open ${file} and delete every hook entry whose command contains "agileflow hook" or ".agileflow/scripts/"`,
    '(and a statusLine that runs a script from .agileflow/scripts/), then re-run `agileflow migrate v4`.',
  ];
}

async function planSettings(loc: Loc, plan: MigrationPlan, file: string): Promise<void> {
  const read = await readJsonFile(file);
  if (read.state === 'missing') return;
  const label = show(loc, file);
  if (read.state === 'invalid') {
    // Comments or a syntax error: the file cannot be edited safely. Hooks that
    // stay registered keep running, so this is an error, not a silent skip.
    if (!HOOK_MARKERS.some((m) => read.text.includes(m))) return;
    plan.findings.push(`${label} AgileFlow hook entries`);
    plan.notes.push({
      level: 'error',
      message: `${label} is not valid JSON (comments or a syntax error), so its AgileFlow v4 hooks cannot be removed automatically`,
      detail: manualHookHelp(file),
    });
    return;
  }
  const { removed } = filterHooks(read.value.hooks);
  const statusLine = read.value.statusLine as { command?: unknown } | undefined;
  const removeStatusLine = markerHit(statusLine?.command);
  if (!removed && !removeStatusLine) return;
  plan.findings.push(`${label} AgileFlow hook entries`);
  if (!(await contained(loc, file))) {
    plan.notes.push({ level: 'error', message: `${label} links outside the project; it was not changed`, detail: manualHookHelp(file) });
    return;
  }
  plan.actions.push({
    kind: 'edit-settings',
    file,
    removedHooks: removed,
    removedStatusLine: removeStatusLine,
    description: `remove ${plural(removed, 'AgileFlow hook command')}${removeStatusLine ? ' and the AgileFlow status line' : ''} from ${label}`,
  });
}

function expectedCodex(removeHooks: boolean, keys: string[]) {
  return (parsed: Record<string, unknown>): Record<string, unknown> => {
    const next = { ...parsed };
    if (removeHooks) {
      const { hooks } = filterHooks(next.hooks);
      if (hooks) next.hooks = hooks;
      else delete next.hooks;
    }
    for (const key of keys) delete next[key];
    return next;
  };
}

/** Keys whose current value is exactly what v4 wrote. */
function v4PermissionKeys(parsed: Record<string, unknown>): string[] {
  return Object.keys(V4_CODEX_PERMISSIONS).filter((k) => parsed[k] === V4_CODEX_PERMISSIONS[k]);
}

async function planCodex(loc: Loc, plan: MigrationPlan, file: string): Promise<void> {
  const text = await readTextIfExists(file).catch(() => null);
  if (text === null) return;
  const label = show(loc, file);
  let parsed: Record<string, unknown>;
  try {
    parsed = toml.parse(text) as Record<string, unknown>;
  } catch {
    if (HOOK_MARKERS.some((m) => text.includes(m))) {
      plan.findings.push(`${label} AgileFlow hook entries`);
      plan.notes.push({
        level: 'error',
        message: `${label} could not be parsed, so its AgileFlow v4 hooks cannot be removed automatically`,
        detail: manualHookHelp(file),
      });
    } else {
      plan.notes.push({ level: 'warn', message: `${label} could not be parsed; left unchanged` });
    }
    return;
  }
  const inside = await contained(loc, file);
  const { removed } = filterHooks(parsed.hooks);
  if (removed) {
    plan.findings.push(`${label} AgileFlow hook entries`);
    let editable = inside;
    if (editable) {
      try {
        editTomlLines(text, { removeHookCommand: markerHit }, expectedCodex(true, []));
      } catch {
        editable = false;
      }
    }
    if (editable) {
      plan.actions.push({
        kind: 'edit-codex',
        file,
        removedHooks: removed,
        resetKeys: [],
        description: `remove ${plural(removed, 'AgileFlow hook command')} from ${label} (comments and formatting are kept)`,
      });
    } else {
      plan.notes.push({
        level: 'error',
        message: `${label} ${inside ? 'uses a layout that cannot be edited without rewriting the file' : 'links outside the project'}; its AgileFlow v4 hooks were not removed`,
        detail: manualHookHelp(file),
      });
    }
  }

  const risky = v4PermissionKeys(parsed);
  if (risky.length) {
    // v4's Codex writer set both values unconditionally whenever it wrote its
    // hooks, so hooks in the same file are the evidence that v4 set them.
    let resettable = removed > 0 && inside;
    if (resettable) {
      try {
        editTomlLines(text, { removeHookCommand: markerHit, removeRootKeys: risky }, expectedCodex(true, risky));
      } catch {
        resettable = false;
      }
    }
    const lines = risky.map((k) => `  ${k} = "${V4_CODEX_PERMISSIONS[k]}"`);
    plan.findings.push(`${label} Codex runs without approval prompts or sandbox`);
    plan.notes.push({
      level: 'warn',
      message: `SECURITY: ${label} lets Codex run every command without asking and without a sandbox`,
      detail: [
        ...lines,
        'With these values Codex can change or delete any file and reach the network without asking first.',
        ...(resettable
          ? [
              'AgileFlow v4 wrote these values together with its hooks (still in this file); v5 does not need them.',
              'Migration removes these lines when you confirm, so Codex uses its default approval and sandbox behavior.',
              `To keep full access, decline; or add the lines back to ${label} later (the backup keeps a copy).`,
            ]
          : [
              removed > 0
                ? 'They could not be removed automatically, so they were not changed.'
                : 'Nothing shows that AgileFlow set these values (no v4 hooks in this file), so they were not changed.',
              `To make Codex ask before running commands, edit ${label}: delete these lines, or set`,
              '  approval_policy = "on-request" and sandbox_mode = "workspace-write".',
            ]),
      ],
    });
    if (resettable) {
      plan.actions.push({
        kind: 'edit-codex',
        file,
        removedHooks: 0,
        resetKeys: risky,
        consent: 'codex-permissions',
        description: `remove ${risky.map((k) => `${k} = "${V4_CODEX_PERMISSIONS[k]}"`).join(' and ')} from ${label} (Codex falls back to its defaults)`,
      });
    }
  }

  const features = parsed.features as Record<string, unknown> | undefined;
  const flags = ['hooks', 'codex_hooks', 'collaboration_modes'].filter((f) => features?.[f] === true);
  if (flags.length && removed) {
    plan.notes.push({
      level: 'info',
      message: `${label} [features] ${flags.join(', ')} left unchanged (their previous values are unknown)`,
    });
  }
}

type MirrorProof = 'verified' | 'unverified' | 'foreign';

async function proveMirror(
  dirAbs: string,
  id: string,
  hashes: Map<string, Map<string, Set<string>>>,
): Promise<MirrorProof> {
  const text = await readTextIfExists(path.join(dirAbs, 'SKILL.md')).catch(() => null);
  let name: string | null = null;
  try {
    name = text ? parseSkillMarkdown(text).name : null;
  } catch {
    name = null;
  }
  if (name !== id) return 'foreign';
  const recorded = hashes.get(id);
  if (!recorded) return 'unverified';
  const { files, symlinks } = await walk(dirAbs);
  if (symlinks.some((rel) => !rel.startsWith('_learnings/'))) return 'unverified';
  for (const rel of files) {
    if (rel.startsWith('_learnings/')) continue;
    const content = await fs.promises.readFile(path.join(dirAbs, ...rel.split('/')));
    const allowed = recorded.get(rel);
    if (allowed?.has(sha256Hex(content))) continue;
    if (rel === 'SKILL.md' && id === BABYSIT_ID && allowed && renderedFrom(content.toString('utf8'), allowed)) continue;
    return 'unverified';
  }
  return 'verified';
}

/**
 * v4 mirrored the babysit skill as `source.trimEnd() + "\n\n## IDE-specific guidance\n..."`.
 * The mirror is v4's when the part before that appendix is an indexed source.
 */
function renderedFrom(text: string, allowed: Set<string>): boolean {
  const at = text.lastIndexOf(BABYSIT_APPENDIX);
  if (at === -1) return false;
  const base = text.slice(0, at);
  return ['\n', '', '\r\n', '\n\n'].some((suffix) => allowed.has(sha256Hex(base + suffix)));
}

async function planMirrors(
  loc: Loc,
  plan: MigrationPlan,
  index: Map<string, string>,
  suggestions: Set<string>,
): Promise<void> {
  const hashes = skillHashes(index);
  const unverified: string[] = [];
  for (const dirRel of V4_MIRROR_DIRS) {
    const dirAbs = path.join(loc.base, ...dirRel.split('/'));
    const shownDir = show(loc, dirAbs);
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dirAbs, { withFileTypes: true });
    } catch {
      continue;
    }
    const unknown: string[] = [];
    let found = false;
    for (const entry of entries) {
      if (!(V4_SKILL_IDS as readonly string[]).includes(entry.name)) {
        if (entry.name.startsWith('agileflow-') && entry.isDirectory()) unknown.push(`${shownDir}/${entry.name}`);
        continue;
      }
      const mirrorAbs = path.join(dirAbs, entry.name);
      if (!entry.isDirectory() || !(await contained(loc, mirrorAbs))) {
        unknown.push(`${shownDir}/${entry.name} (link or file, not followed)`);
        continue;
      }
      const proof = await proveMirror(mirrorAbs, entry.name, hashes);
      if (proof === 'foreign') {
        unknown.push(`${shownDir}/${entry.name}`);
        continue;
      }
      found = true;
      const consent: MigrationConsent | undefined = proof === 'verified' ? undefined : 'unverified-mirrors';
      const what = proof === 'verified' ? 'v4 skill mirror' : 'unverified v4 skill mirror';
      if (proof === 'unverified') unverified.push(`${shownDir}/${entry.name}`);
      const learned = await recordedLearnings(mirrorAbs);
      if (learned.length) {
        // v4 stored user corrections inside the mirror; keep them in place.
        const { files } = await walk(mirrorAbs);
        for (const rel of files) {
          if (rel.startsWith('_learnings/')) continue;
          plan.actions.push({
            kind: 'remove',
            path: path.join(mirrorAbs, ...rel.split('/')),
            description: `remove ${shownDir}/${entry.name}/${rel}`,
            group: `remove ${what} ${shownDir}/${entry.name} (its _learnings/ is kept)`,
            ...(consent ? { consent } : {}),
          });
        }
        plan.notes.push({
          level: 'info',
          message: `${shownDir}/${entry.name}/_learnings contains recorded learnings; it is kept (v5 has no learnings system)`,
          detail: learned,
        });
      } else {
        plan.actions.push({
          kind: 'remove',
          path: mirrorAbs,
          description: `remove ${what} ${shownDir}/${entry.name}`,
          ...(consent ? { consent } : {}),
        });
      }
      for (const s of V4_SKILL_SUGGESTIONS[entry.name] ?? []) suggestions.add(s);
    }
    if (found) plan.findings.push(`${shownDir} v4 skill mirrors`);
    if (unknown.length) {
      plan.notes.push({
        level: 'info',
        message: 'Skill directories with an agileflow- prefix that are not provably v4 copies were left in place:',
        detail: unknown,
      });
    }
  }
  if (unverified.length) {
    plan.notes.push({
      level: 'warn',
      message: `${plural(unverified.length, 'v4 skill mirror')} match a v4 catalog skill by name but could not be verified against v4's file index (missing, or changed since install)`,
      detail: [
        ...unverified,
        'They are removed only with your confirmation or `--include-unverified`; otherwise they stay.',
      ],
    });
  }
}

/** `_learnings/*.yaml` files in a v4 mirror that contain entries (user data, not the empty seed). */
async function recordedLearnings(mirrorDir: string): Promise<string[]> {
  const out: string[] = [];
  const { files } = await walk(path.join(mirrorDir, '_learnings'));
  for (const rel of files) {
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
    const read = await readJsonFile(path.join(abs, 'status.json'));
    const status = read.state === 'ok' ? read.value : null;
    const empty = (v: unknown) => !v || (typeof v === 'object' && Object.keys(v as object).length === 0);
    return !!status && empty(status.epics) && empty(status.stories);
  }
  if (rel === 'docs/00-meta' && files.length === 1 && files[0] === 'agileflow-metadata.json') return true;
  return false;
}

/** Notes that mean v4 behavior is still active and needs manual work. */
export function migrationErrors(plan: MigrationPlan): MigrationNote[] {
  return plan.notes.filter((n) => n.level === 'error');
}

export interface MigrationResult {
  /** Set only when a backup was actually written. */
  backupDir: string | null;
  applied: MigrationAction[];
  failed: Array<{ action: MigrationAction; error: string }>;
  /** Actions that needed consent that was not given. */
  skipped: MigrationAction[];
}

export interface ApplyMigrationOptions {
  backup: boolean;
  now?: Date;
  /** Consent-gated actions to include. */
  consent?: MigrationConsent[];
}

function targetOf(action: MigrationAction): string {
  return action.kind === 'remove' ? action.path : action.file;
}

/**
 * Apply order. An interruption at any point leaves a state that
 * `migrate v4` plans again from scratch and finishes:
 *   0. (before this) every target is copied into the backup directory;
 *   1. hook entries in Claude settings and Codex config, so old hooks stop
 *      running before the files they call disappear;
 *   2. Codex permission values (consent only);
 *   3. managed blocks in AGENTS.md / CLAUDE.md;
 *   4. skill mirrors and agent/command directories (their proof needs v4's
 *      file index, which is still present);
 *   5. v4 config files;
 *   6. `.agileflow/` files, and v4's file index last, so a re-run can still
 *      prove whatever was not removed yet.
 */
function phase(action: MigrationAction, plan: MigrationPlan): number {
  switch (action.kind) {
    case 'edit-settings':
      return 1;
    case 'edit-codex':
      return action.removedHooks ? 1 : 2;
    case 'strip-block':
      return 3;
    case 'remove': {
      const runtime = path.resolve(plan.runtimeDir);
      const target = path.resolve(action.path);
      if (target === runtime) return 8;
      if (target === path.join(runtime, ...V4_INDEX.split('/'))) return 7;
      if (path.basename(target) === 'agileflow.config.json') return 5;
      return isInside(target, runtime) ? 6 : 4;
    }
  }
}

async function createBackupDir(root: string, stamp: string): Promise<string> {
  for (let n = 0; ; n++) {
    const dir = path.join(root, `.agileflow-v4-backup-${stamp}${n ? `-${n + 1}` : ''}`);
    try {
      await fs.promises.mkdir(dir);
      return dir;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
}

async function backupPath(abs: string, root: string, backupDir: string): Promise<void> {
  const rel = path.relative(root, abs);
  const dest = rel.startsWith('..') || path.isAbsolute(rel)
    ? path.join(backupDir, '_outside', path.resolve(abs).replace(/^[A-Za-z]:/, '').replace(/^[\\/]+/, ''))
    : path.join(backupDir, rel);
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  const st = await fs.promises.lstat(abs);
  if (st.isSymbolicLink()) {
    // Edits write through links; keep the content they point at.
    await fs.promises.copyFile(await fs.promises.realpath(abs), dest);
    return;
  }
  await fs.promises.cp(abs, dest, { recursive: true, force: true, errorOnExist: false, verbatimSymlinks: true });
}

/** Write through a symlink (dotfiles setups) and keep the file's permissions. */
async function rewrite(file: string, content: string): Promise<void> {
  const real = await fs.promises.realpath(file);
  const { mode } = await fs.promises.stat(real);
  await writeFileAtomic(real, content);
  await fs.promises.chmod(real, mode & 0o7777);
}

function detectIndent(text: string): string | number {
  const m = /^[{[][^\S\n]*\r?\n([ \t]+)\S/.exec(text);
  return m ? (m[1]!.startsWith('\t') ? '\t' : m[1]!.length) : 2;
}

async function applyAction(action: MigrationAction, plan: MigrationPlan): Promise<void> {
  switch (action.kind) {
    case 'remove': {
      await fs.promises.rm(action.path, { recursive: true, force: true });
      // Drop directories left empty by the removal, but never the top-level
      // folder itself (e.g. keep `.claude/` even if its v4 content is gone).
      const rel = path.relative(plan.root, action.path);
      if (!rel.startsWith('..') && !path.isAbsolute(rel) && rel.includes(path.sep)) {
        const top = rel.split(path.sep)[0]!;
        const stopAt = top === '.agileflow' ? plan.root : path.join(plan.root, top);
        await pruneEmptyDirs(path.dirname(action.path), stopAt);
      }
      return;
    }
    case 'edit-settings': {
      const read = await readJsonFile(action.file);
      if (read.state !== 'ok') throw new Error('not valid JSON; remove the AgileFlow hook entries by hand');
      const settings = read.value;
      const { hooks } = filterHooks(settings.hooks);
      if (hooks) settings.hooks = hooks;
      else delete settings.hooks;
      if (action.removedStatusLine && markerHit((settings.statusLine as { command?: unknown } | undefined)?.command)) {
        delete settings.statusLine;
      }
      const eol = read.text.includes('\r\n') ? '\r\n' : '\n';
      const json = JSON.stringify(settings, null, detectIndent(read.text)).replace(/\n/g, eol);
      await rewrite(action.file, json + eol);
      return;
    }
    case 'edit-codex': {
      const text = await fs.promises.readFile(action.file, 'utf8');
      const parsed = toml.parse(text) as Record<string, unknown>;
      // Re-check at apply time: only values that are still exactly v4's.
      const keys = action.resetKeys.filter((k) => parsed[k] === V4_CODEX_PERMISSIONS[k]);
      const removeHooks = action.removedHooks > 0;
      const edit = editTomlLines(
        text,
        { removeHookCommand: removeHooks ? markerHit : undefined, removeRootKeys: keys },
        expectedCodex(removeHooks, keys),
      );
      if (edit.text !== text) await rewrite(action.file, edit.text);
      return;
    }
    case 'strip-block': {
      const text = await fs.promises.readFile(action.file, 'utf8');
      const begin = text.indexOf(BEGIN_MARKER);
      const end = text.indexOf(END_MARKER, begin);
      if (begin === -1 || end === -1) return;
      const link = (await fs.promises.lstat(action.file)).isSymbolicLink();
      if (action.deleteFile && !link) {
        await fs.promises.unlink(action.file);
        return;
      }
      const before = text.slice(0, begin).replace(/\s+$/, '');
      const after = text.slice(end + END_MARKER.length).replace(/^\s+/, '');
      await rewrite(action.file, [before, after].filter(Boolean).join('\n\n') + (before || after ? '\n' : ''));
      return;
    }
  }
}

/**
 * Apply a migration plan: back up every target first (when requested), then
 * change files in the order documented at `phase`.
 */
export async function applyMigration(plan: MigrationPlan, options: ApplyMigrationOptions): Promise<MigrationResult> {
  const consent = new Set(options.consent ?? []);
  const selected = plan.actions.filter((a) => !a.consent || consent.has(a.consent));
  const result: MigrationResult = {
    backupDir: null,
    applied: [],
    failed: [],
    skipped: plan.actions.filter((a) => !selected.includes(a)),
  };
  const ordered = selected
    .map((action, i) => ({ action, i, p: phase(action, plan) }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.action);

  // Phase 0: the backup is complete before the first change. If copying
  // fails, nothing has been changed and the partial backup is removed.
  if (options.backup) {
    const targets: string[] = [];
    for (const action of ordered) {
      const target = targetOf(action);
      if (targets.includes(target) || !(await lstatOrNull(target))) continue;
      if (targets.some((t) => isInside(target, t))) continue;
      targets.push(target);
    }
    if (targets.length) {
      const stamp = (options.now ?? new Date()).toISOString().replace(/[:.]/g, '-');
      let backupDir: string | null = null;
      try {
        backupDir = await createBackupDir(plan.root, stamp);
        for (const target of targets) await backupPath(target, plan.root, backupDir);
      } catch (err) {
        if (backupDir) await fs.promises.rm(backupDir, { recursive: true, force: true }).catch(() => undefined);
        throw new OperationError(`Could not create the migration backup, so nothing was changed: ${(err as Error).message}`, [
          'Fix the problem (disk space, permissions) and re-run, or pass --no-backup.',
        ]);
      }
      result.backupDir = backupDir;
    }
  }

  for (const action of ordered) {
    try {
      await applyAction(action, plan);
      result.applied.push(action);
    } catch (err) {
      result.failed.push({ action, error: (err as Error).message });
    }
  }
  // Drop .agileflow/ when everything in it was AgileFlow's.
  try {
    const left = await fs.promises.readdir(plan.runtimeDir);
    if (left.length === 0) await fs.promises.rmdir(plan.runtimeDir);
  } catch {
    // absent or not empty
  }
  return result;
}

export function formatDocsReport(plan: MigrationPlan): string[] {
  const where = plan.location === 'user' ? ' in your home directory' : '';
  if (!plan.docs.length) return [`No legacy AgileFlow docs directories found${where}.`];
  const lines = [`Legacy AgileFlow docs directories${where} (never deleted automatically):`];
  for (const d of plan.docs) {
    const state = d.untouchedSeed
      ? 'empty or unchanged v4 seed; safe to delete manually'
      : `${d.files} file${d.files === 1 ? '' : 's'}; review before deleting`;
    lines.push(`  ${`${plan.label}${toPosix(d.dir)}`.padEnd(24)} ${state}`);
  }
  return lines;
}
