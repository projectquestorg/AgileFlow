import type { TreeFile } from './fs';
import { EVALS_DIR, managedNotice } from './render';
import { scanSkill, type RiskFinding } from './scan';
import { parseSidecar, parseSkillMarkdown, SIDECAR_FILE, SKILL_FILE, type Sidecar } from './skill';

/**
 * What changes about the trust a user places in a skill when it is installed
 * or updated: where it comes from, what it tells the agent, what it can run,
 * what it pre-approves, what it needs, and when the agent may pick it up on
 * its own. A version number alone answers none of these.
 */
export type TrustAspect =
  | 'source'
  | 'description'
  | 'activation'
  | 'instructions'
  | 'files'
  | 'scripts'
  | 'allowed-tools'
  | 'network'
  | 'commands'
  | 'frontmatter';

export interface TrustChange {
  aspect: TrustAspect;
  summary: string;
}

export interface TrustReview {
  /** What the comparison started from: the locked package, the installed copy, or nothing (new skill). */
  baseline: 'package' | 'installed' | 'none';
  changes: TrustChange[];
  /** Scanner findings in the incoming content that the baseline did not have. */
  newRisks: RiskFinding[];
}

export interface TrustSide {
  source: string;
  files: TreeFile[];
}

interface Facts {
  description: string | null;
  activation: string;
  allowedTools: string[];
  network: string;
  commands: string[];
  instructions: string[];
  scripts: Map<string, string>;
  other: Map<string, string>;
  /** Frontmatter fields not covered above (hooks, model, context, ...), canonical JSON per key. */
  extra: Map<string, string>;
}

/** Frontmatter keys compared by dedicated aspects, or rewritten by rendering. */
const KNOWN_KEYS = new Set(['name', 'description', 'allowed-tools', 'disable-model-invocation']);

/**
 * SKILL.md without AgileFlow's own notice. Only the exact notice rendering
 * writes is removed: a package that ships a look-alike comment keeps it, so
 * text hidden inside it is compared and scanned like any other content.
 */
function withoutNotice(text: string): string {
  const name = parseSkillMarkdown(text).name;
  if (!name) return text;
  const notice = managedNotice(name);
  const i = text.indexOf(notice);
  if (i === -1) return text;
  return text.slice(0, i) + text.slice(i + notice.length).replace(/^\r?\n(?:\r?\n)?/, '');
}

function facts(files: TreeFile[]): Facts {
  let sidecar: Sidecar | null = null;
  const sidecarFile = files.find((f) => f.path === SIDECAR_FILE);
  if (sidecarFile) {
    try {
      sidecar = parseSidecar(sidecarFile.content.toString('utf8'));
    } catch {
      sidecar = null;
    }
  }
  const skillFile = files.find((f) => f.path === SKILL_FILE);
  const skill = skillFile ? parseSkillMarkdown(withoutNotice(skillFile.content.toString('utf8'))) : null;
  const fm = skill?.frontmatter ?? {};
  const tools = fm['allowed-tools'];
  const allowedTools = (Array.isArray(tools) ? tools.map(String) : typeof tools === 'string' ? tools.split(/[\s,]+/) : [])
    .map((t) => t.trim())
    .filter(Boolean)
    .sort();
  const manualFlag = fm['disable-model-invocation'] === true;
  const scripts = new Map<string, string>();
  const other = new Map<string, string>();
  for (const f of files) {
    if (f.path === SKILL_FILE || f.path === SIDECAR_FILE || f.path.startsWith(`${EVALS_DIR}/`)) continue;
    const key = `${f.executable ? 'x' : '-'}${f.content.toString('base64')}`;
    if (f.executable || f.path.startsWith('scripts/')) scripts.set(f.path, key);
    else other.set(f.path, key);
  }
  const extra = new Map<string, string>();
  for (const [key, value] of Object.entries(fm)) if (!KNOWN_KEYS.has(key)) extra.set(key, JSON.stringify(value));
  return {
    extra,
    description: skill?.description ?? null,
    activation: manualFlag ? 'manual' : (sidecar?.activation?.mode ?? 'auto'),
    allowedTools,
    network: sidecar?.requirements?.network ?? 'none',
    commands: [...(sidecar?.requirements?.commands ?? [])].sort(),
    instructions: (skill?.body ?? '').replace(/\r\n/g, '\n').split('\n'),
    scripts,
    other,
  };
}

function fileChanges(before: Map<string, string>, after: Map<string, string>): string[] {
  const out: string[] = [];
  for (const [p, key] of after) {
    if (!before.has(p)) out.push(`+${p}`);
    else if (before.get(p) !== key) out.push(`~${p}`);
  }
  for (const p of before.keys()) if (!after.has(p)) out.push(`-${p}`);
  return out.sort((a, b) => (a.slice(1) < b.slice(1) ? -1 : 1));
}

function listDelta(before: string[], after: string[]): string {
  const added = after.filter((t) => !before.includes(t)).map((t) => `+${t}`);
  const removed = before.filter((t) => !after.includes(t)).map((t) => `-${t}`);
  return [...added, ...removed].join(' ');
}

/** Lines added and removed between two texts (multiset comparison; no alignment needed for a summary). */
function lineDelta(before: string[], after: string[]): { added: number; removed: number } {
  const counts = new Map<string, number>();
  for (const line of before) counts.set(line, (counts.get(line) ?? 0) + 1);
  let added = 0;
  for (const line of after) {
    const n = counts.get(line) ?? 0;
    if (n > 0) counts.set(line, n - 1);
    else added++;
  }
  let removed = 0;
  for (const n of counts.values()) removed += n;
  return { added, removed };
}

function riskKey(r: RiskFinding): string {
  return `${r.rule}\0${r.file}\0${r.excerpt ?? r.message}`;
}

/**
 * Compare what a user trusted before (`before`, null for a new skill) with
 * what they are asked to trust now. Only the facts that matter for trust are
 * reported; cosmetic differences stay in the full diff.
 */
export function reviewTrust(before: TrustSide | null, after: TrustSide, baseline: TrustReview['baseline'] = before ? 'package' : 'none'): TrustReview {
  const next = facts(after.files);
  const changes: TrustChange[] = [];
  const nextRisks = scanSkill(after.files);

  if (!before) {
    changes.push({ aspect: 'source', summary: `from ${after.source}` });
    changes.push({ aspect: 'activation', summary: next.activation === 'auto' ? 'the agent may use it on its own (auto)' : 'only when invoked (manual)' });
    if (next.scripts.size) changes.push({ aspect: 'scripts', summary: [...next.scripts.keys()].sort().join(', ') });
    if (next.allowedTools.length) changes.push({ aspect: 'allowed-tools', summary: `pre-approves ${next.allowedTools.join(', ')}` });
    if (next.network !== 'none') changes.push({ aspect: 'network', summary: `network ${next.network}` });
    if (next.commands.length) changes.push({ aspect: 'commands', summary: `needs ${next.commands.join(', ')}` });
    if (next.extra.size) changes.push({ aspect: 'frontmatter', summary: describeKeys([...next.extra.keys()].map((k) => `+${k}`)) });
    return { baseline: 'none', changes, newRisks: nextRisks };
  }

  const prev = facts(before.files);
  if (before.source !== after.source) changes.push({ aspect: 'source', summary: `${before.source} -> ${after.source}` });
  if (prev.description !== next.description) changes.push({ aspect: 'description', summary: 'description changed (affects when the agent picks the skill)' });
  if (prev.activation !== next.activation) changes.push({ aspect: 'activation', summary: `${prev.activation} -> ${next.activation}` });
  const body = lineDelta(prev.instructions, next.instructions);
  if (body.added || body.removed) changes.push({ aspect: 'instructions', summary: `${SKILL_FILE}: +${body.added} -${body.removed} lines` });
  const other = fileChanges(prev.other, next.other);
  if (other.length) changes.push({ aspect: 'files', summary: other.join(' ') });
  const scripts = fileChanges(prev.scripts, next.scripts);
  if (scripts.length) changes.push({ aspect: 'scripts', summary: scripts.join(' ') });
  const tools = listDelta(prev.allowedTools, next.allowedTools);
  if (tools) changes.push({ aspect: 'allowed-tools', summary: tools });
  if (prev.network !== next.network) changes.push({ aspect: 'network', summary: `${prev.network} -> ${next.network}` });
  const commands = listDelta(prev.commands, next.commands);
  if (commands) changes.push({ aspect: 'commands', summary: commands });
  const keys: string[] = [];
  for (const [k, v] of next.extra) {
    if (!prev.extra.has(k)) keys.push(`+${k}`);
    else if (prev.extra.get(k) !== v) keys.push(`~${k}`);
  }
  for (const k of prev.extra.keys()) if (!next.extra.has(k)) keys.push(`-${k}`);
  if (keys.length) changes.push({ aspect: 'frontmatter', summary: describeKeys(keys.sort((a, b) => (a.slice(1) < b.slice(1) ? -1 : 1))) });

  const known = new Set(scanSkill(before.files).map(riskKey));
  return { baseline, changes, newRisks: nextRisks.filter((r) => !known.has(riskKey(r))) };
}

/** `hooks` run commands outside the agent's own approval flow, so they are called out. */
function describeKeys(keys: string[]): string {
  const text = keys.join(' ');
  return keys.some((k) => k.slice(1) === 'hooks' && k[0] !== '-') ? `${text} (hooks run commands automatically)` : text;
}

/** One line per change, for plans and prompts. */
export function describeTrust(review: TrustReview): string[] {
  return review.changes.map((c) => `${c.aspect}: ${c.summary}`);
}
