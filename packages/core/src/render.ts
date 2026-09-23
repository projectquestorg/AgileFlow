import YAML from 'yaml';
import type { TreeFile } from './fs';
import type { Activation, QuestionPreference } from './config';
import type { ProviderAdapter } from './types';
import { joinFrontmatter, parseSidecar, SIDECAR_FILE, SKILL_FILE, splitFrontmatter } from './skill';

/** Package directory holding eval scenarios (not materialized into projects). */
export const EVALS_DIR = 'evals';

export const MANAGED_NOTICE_PREFIX = '<!-- Managed by AgileFlow.';

export function managedNotice(id: string): string {
  return `${MANAGED_NOTICE_PREFIX}\nRun \`agileflow fork ${id}\` before customizing this copy. -->`;
}

const QUESTION_PREFERENCE_LINES: Record<Exclude<QuestionPreference, 'provider-default'>, string> = {
  prefer:
    'Project question preference: when a decision would materially change the result, ask the user, using native structured questions if available.',
  minimize:
    'Project question preference: make reasonable assumptions and ask only when blocked or the request is materially ambiguous.',
};

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

/** Remove the managed notice (used when forking). */
export function stripManagedNotice(text: string): string {
  const start = text.indexOf(MANAGED_NOTICE_PREFIX);
  if (start === -1) return text;
  const end = text.indexOf('-->', start);
  if (end === -1) return text;
  let after = end + 3;
  // Swallow the blank line that followed the notice.
  const rest = text.slice(after);
  const m = /^(\r?\n){1,2}/.exec(rest);
  if (m) after += m[0].length;
  return text.slice(0, start) + text.slice(after);
}

export interface RenderOptions {
  id: string;
  /** Managed skills get the "Managed by AgileFlow" notice. */
  managed: boolean;
  activation: Activation;
  questionPreference: QuestionPreference;
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

function packageUserInteraction(files: TreeFile[]): 'none' | 'optional' | 'required' {
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
  if (
    options.questionPreference !== 'provider-default' &&
    packageUserInteraction(files) !== 'none'
  ) {
    inserts.push(QUESTION_PREFERENCE_LINES[options.questionPreference]);
  }
  if (inserts.length) text = insertAfterFrontmatter(text, inserts.join('\n\n'));
  files = replaceFile(files, SKILL_FILE, text);

  if (options.activation === 'manual') {
    for (const adapter of options.adapters) {
      if (adapter.applyManualActivation) files = adapter.applyManualActivation(files, options.id);
    }
  }
  return files;
}
