import YAML from 'yaml';
import type { TreeFile } from './fs';
import type { Activation, InteractionPreference } from './config';
import type { ProviderAdapter } from './types';
import { joinFrontmatter, parseSidecar, SIDECAR_FILE, SKILL_FILE, splitFrontmatter } from './skill';

/** Package directory holding eval scenarios (not materialized into projects). */
export const EVALS_DIR = 'evals';

export const MANAGED_NOTICE_PREFIX = '<!-- Managed by AgileFlow.';

export function managedNotice(id: string): string {
  return `${MANAGED_NOTICE_PREFIX}\nRun \`agileflow fork ${id}\` before customizing this copy. -->`;
}

export type UserInteraction = 'none' | 'optional' | 'required';

/**
 * Interaction overlays: small behavioral text AgileFlow renders into the body
 * of a skill for the project's `interaction.questionPreference`. The source
 * skill never contains it; the rendered copy does, so the provider sees it
 * only while that skill is active (no global prompt, no runtime, no hook).
 *
 * The skill's declared `capabilities.userInteraction` is its contract and
 * wins over the preference:
 * - `none`: the skill completes without asking substantive questions, so no
 *   overlay is rendered (harness permission prompts are not questions).
 * - `optional`: the skill can meet real decisions; the overlay sets how
 *   readily to ask about them.
 * - `required`: asking is the point of the skill; `minimize` trims needless
 *   questions but never turns the workflow off.
 *
 * `provider-default` renders nothing: AgileFlow defers to the harness and model.
 */
export const INTERACTION_OVERLAYS: Record<
  Exclude<UserInteraction, 'none'>,
  Record<Exclude<InteractionPreference, 'provider-default'>, string>
> = {
  optional: {
    prefer:
      "Question preference for this project: when multiple reasonable choices would materially change the result, ask the user before choosing. First resolve anything you can from the repository and available tools. Prefer the provider's structured question tool when available; otherwise ask briefly in plain text.",
    minimize:
      'Question preference for this project: make reasonable assumptions and continue. Ask only when blocked or when an unresolved ambiguity could materially change the result. State consequential assumptions in the final summary.',
  },
  required: {
    prefer:
      "Question preference for this project: when multiple reasonable choices would materially change the result, ask the user before choosing. First resolve anything you can from the repository and available tools. Prefer the provider's structured question tool when available; otherwise ask briefly in plain text.",
    minimize:
      'Question preference for this project: ask the questions this workflow requires, but skip unnecessary ones and resolve repository facts yourself instead of asking.',
  },
};

/** The overlay for a skill's interaction contract and the project preference, or null for none. */
export function interactionOverlay(userInteraction: UserInteraction, preference: InteractionPreference): string | null {
  if (userInteraction === 'none' || preference === 'provider-default') return null;
  return INTERACTION_OVERLAYS[userInteraction][preference];
}

/** Edit SKILL.md frontmatter in place, preserving key order and comments. */
export function editFrontmatter(
  text: string,
  mutate: (doc: YAML.Document) => void,
): string {
  const { frontmatter, body, eol } = splitFrontmatter(text);
  const doc = YAML.parseDocument(frontmatter ?? '');
  if (!doc.contents || !YAML.isMap(doc.contents)) doc.contents = doc.createNode({}) as never;
  mutate(doc);
  const fm = doc.toString({ lineWidth: 0 }).replace(/\n$/, '');
  return joinFrontmatter(eol === '\r\n' ? fm.replace(/\n/g, '\r\n') : fm, body, eol);
}

export function replaceFile(files: TreeFile[], filePath: string, content: string | Buffer): TreeFile[] {
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  const existing = files.find((f) => f.path === filePath);
  if (existing) {
    return files.map((f) => (f.path === filePath ? { ...f, content: buf } : f));
  }
  return [...files, { path: filePath, content: buf, executable: false }].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
}

export function readFileText(files: TreeFile[], filePath: string): string | null {
  const file = files.find((f) => f.path === filePath);
  return file ? file.content.toString('utf8') : null;
}

/** Insert text directly after the frontmatter block. */
function insertAfterFrontmatter(text: string, insertion: string): string {
  const { frontmatter, body, eol } = splitFrontmatter(text);
  const block = insertion.replace(/\n/g, eol);
  if (frontmatter === null) return `${block}${eol}${eol}${text}`;
  const fmText = frontmatter.endsWith(eol) ? frontmatter.slice(0, -eol.length) : frontmatter;
  const trimmedBody = body.replace(/^(\r?\n)+/, '');
  return `---${eol}${fmText}${eol}---${eol}${eol}${block}${eol}${eol}${trimmedBody}`;
}

/**
 * Remove the managed notice (used when forking and detaching). Only the
 * notice AgileFlow inserted directly after the frontmatter is removed; a
 * body that quotes the notice text elsewhere is left alone.
 */
export function stripManagedNotice(text: string): string {
  const { frontmatter } = splitFrontmatter(text);
  const normalized = text.replace(/^\uFEFF/, '');
  const fmEnd = frontmatter === null ? 0 : (/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(normalized)?.[0].length ?? 0);
  const offset = text.length - normalized.length + fmEnd;
  const rest = text.slice(offset);
  const lead = /^(?:\r?\n)*/.exec(rest)![0];
  if (!rest.startsWith(MANAGED_NOTICE_PREFIX, lead.length)) return text;
  const end = rest.indexOf('-->', lead.length);
  if (end === -1) return text;
  let after = end + 3;
  // Swallow the blank line that followed the notice.
  const m = /^(\r?\n){1,2}/.exec(rest.slice(after));
  if (m) after += m[0].length;
  return text.slice(0, offset) + lead + rest.slice(after);
}

export interface RenderOptions {
  id: string;
  /** Managed skills get the "Managed by AgileFlow" notice. */
  managed: boolean;
  activation: Activation;
  /** Project `interaction.questionPreference`; selects the interaction overlay. */
  interactionPreference: InteractionPreference;
  adapters: ProviderAdapter[];
}

/** Read the package's declared default activation (sidecar), defaulting to auto. */
export function packageActivation(files: TreeFile[]): Activation {
  const text = readFileText(files, SIDECAR_FILE);
  if (!text) return 'auto';
  try {
    return parseSidecar(text).activation?.mode ?? 'auto';
  } catch {
    return 'auto';
  }
}

export function packageUserInteraction(files: TreeFile[]): UserInteraction {
  const text = readFileText(files, SIDECAR_FILE);
  if (!text) return 'none';
  try {
    return parseSidecar(text).capabilities?.userInteraction ?? 'none';
  } catch {
    return 'none';
  }
}

/**
 * Deterministically transform package files into the tree AgileFlow writes
 * to `.agents/skills/<id>`. The same inputs always produce the same bytes,
 * which is what lets `sync` and dirty detection compare hashes.
 */
export function renderSkill(packageFiles: TreeFile[], options: RenderOptions): TreeFile[] {
  // Eval scenarios ship with the package but are not installed: they are for
  // `agileflow eval`, and an agent must not stumble on test prompts in a repo.
  let files = packageFiles.filter((f) => !f.path.startsWith(`${EVALS_DIR}/`)).map((f) => ({ ...f }));
  const skillText = readFileText(files, SKILL_FILE);
  if (skillText === null) throw new Error(`Skill package for "${options.id}" has no ${SKILL_FILE}`);

  let text = skillText;
  // The directory name is the skill id, so the frontmatter name must match.
  const { frontmatter } = splitFrontmatter(text);
  const currentName = frontmatter ? (YAML.parse(frontmatter) as Record<string, unknown> | null)?.name : null;
  if (currentName !== options.id) {
    text = editFrontmatter(text, (doc) => doc.set('name', options.id));
  }

  const inserts: string[] = [];
  if (options.managed) inserts.push(managedNotice(options.id));
  const overlay = interactionOverlay(packageUserInteraction(files), options.interactionPreference);
  if (overlay) inserts.push(overlay);
  if (inserts.length) text = insertAfterFrontmatter(text, inserts.join('\n\n'));
  files = replaceFile(files, SKILL_FILE, text);

  if (options.activation === 'manual') {
    for (const adapter of options.adapters) {
      if (adapter.applyManualActivation) files = adapter.applyManualActivation(files, options.id);
    }
  }
  return files;
}
