import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import YAML from 'yaml';
import { z } from 'zod';
import { parse } from './frontmatter';
import { gitHead } from './git';
import { WorkError } from './work-error';
import { acceptanceCriteria } from './queries';
import type { WorkScan } from './scanner';
import { contentHash, hasControlCharacters, oneLine } from './text';
import type { Story } from './types';
import { readUnchanged, writeIfUnchanged } from './writer';

/**
 * Acceptance-criteria evidence, stored in the story itself (Markdown stays the
 * source of truth). One fenced YAML block under an `## Evidence` heading:
 *
 *     ## Evidence
 *
 *     ```yaml agileflow-evidence
 *     - criterion: An owner can rename a workspace
 *       kind: test
 *       ref: test/workspace.test.ts:42
 *       note: covers the empty-name case
 *       commit: 3bb3348b1f0c...
 *       files:
 *         test/workspace.test.ts: sha256:9f86d081884c7d65
 *         src/workspace.ts: sha256:1b4f0e9851971998
 *       recorded: 2026-09-29T12:00:00.000Z
 *     ```
 *
 * `criterion` is the criterion text as written when the evidence was
 * recorded; `files` are content hashes (SHA-256, first 16 hex digits) of the
 * files the evidence depends on. A criterion is `verified` when it has
 * evidence and every hashed file is unchanged, `stale` when a hashed file
 * changed or disappeared since, and `not-verified` without evidence. A
 * checked box alone never counts as verified.
 */

export const EVIDENCE_KINDS = ['test', 'inspection', 'pr', 'manual'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export type EvidenceStatus = 'verified' | 'stale' | 'not-verified';

/** Info string of the fenced block (`yaml` first, so it renders highlighted). */
export const EVIDENCE_FENCE = 'yaml agileflow-evidence';
const FENCE_OPEN_RE = /^(\s*)(```|~~~)\s*(?:yaml\s+)?agileflow-evidence\s*$/;

const SingleLine = z
  .string()
  .trim()
  .min(1, 'must not be empty')
  .refine((s) => !hasControlCharacters(s), 'must be a single line without control characters');

export const EvidenceRecordSchema = z
  .object({
    criterion: SingleLine,
    kind: z.enum(EVIDENCE_KINDS),
    ref: SingleLine,
    note: SingleLine.optional(),
    commit: z.string().regex(/^[0-9a-f]{7,64}$/, 'must be a git commit SHA').optional(),
    files: z.record(z.string(), z.string().regex(/^sha256:[0-9a-f]{16}$/, 'must look like sha256:<16 hex digits>')).optional(),
    recorded: z.string().optional(),
  })
  .strict();

export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

interface EvidenceBlock {
  /** Line indexes (in the body split on \n) of the opening and closing fence. */
  open: number;
  close: number;
  records: EvidenceRecord[];
}

export interface ParsedEvidence {
  block: EvidenceBlock | null;
  /** Problems with the block (it does not parse, a record is invalid, there is more than one block). */
  problems: string[];
}

const normalize = (text: string) => oneLine(text).toLowerCase().replace(/[.\s]+$/, '');

/** Find and parse the evidence block of a story body. Never throws. */
export function parseEvidence(body: string): ParsedEvidence {
  const lines = body.split('\n');
  const problems: string[] = [];
  let block: EvidenceBlock | null = null;
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/\r$/, '');
    if (fence) {
      if (line.trim() === fence) fence = null;
      continue;
    }
    const open = FENCE_OPEN_RE.exec(line);
    if (open) {
      let close = i + 1;
      while (close < lines.length && lines[close]!.replace(/\r$/, '').trim() !== open[2]) close++;
      if (block) {
        problems.push('more than one agileflow-evidence block; only the first is read');
      } else if (close >= lines.length) {
        problems.push('the agileflow-evidence block has no closing fence');
        return { block: null, problems };
      } else {
        block = { open: i, close, records: [] };
        const source = lines.slice(i + 1, close).map((l) => l.replace(/\r$/, '')).join('\n');
        let value: unknown;
        try {
          const doc = YAML.parseDocument(source);
          if (doc.errors.length) throw new Error(doc.errors[0]!.message.split('\n')[0]);
          value = doc.toJS() ?? [];
        } catch (err) {
          problems.push(`the agileflow-evidence block does not parse (${(err as Error).message.split('\n')[0]})`);
          return { block: null, problems };
        }
        if (!Array.isArray(value)) {
          problems.push('the agileflow-evidence block must be a YAML list of records');
          return { block: null, problems };
        }
        value.forEach((item, n) => {
          const result = EvidenceRecordSchema.safeParse(item);
          if (result.success) block!.records.push(result.data);
          else {
            const issue = result.error.issues[0]!;
            problems.push(`evidence record ${n + 1}: ${issue.path.length ? `${issue.path.join('.')}: ` : ''}${issue.message}`);
          }
        });
      }
      i = close;
      continue;
    }
    const plain = /^\s*(```|~~~)/.exec(line);
    if (plain) fence = plain[1]!;
  }
  return { block, problems };
}

export interface EvaluatedRecord extends EvidenceRecord {
  /** A hashed file changed or disappeared since the evidence was recorded. */
  stale: boolean;
  /** The files that changed or disappeared. */
  changed: string[];
}

export interface CriterionEvidence {
  /** 1-based position in the Acceptance Criteria section. */
  index: number;
  text: string;
  checked: boolean;
  status: EvidenceStatus;
  records: EvaluatedRecord[];
}

export interface StoryEvidence {
  criteria: CriterionEvidence[];
  /** Evidence whose criterion text no longer matches any criterion (it was edited or removed). */
  orphans: EvaluatedRecord[];
  problems: string[];
  counts: Record<EvidenceStatus, number>;
}

/** Resolve a project-relative path, refusing anything outside the project (lexically). */
function insideProject(projectRoot: string, rel: string): string | null {
  const abs = path.resolve(projectRoot, rel);
  const back = path.relative(projectRoot, abs);
  if (!back || back.startsWith('..') || path.isAbsolute(back)) return null;
  return abs;
}

/** `p` (relative to `from`, or absolute) as a POSIX path relative to the project root; null outside it. */
function projectRelative(projectRoot: string, from: string, p: string): string | null {
  const rel = path.relative(projectRoot, path.resolve(from, p.trim()));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

/**
 * Content hash of a project file, or null when it is missing, not a regular
 * file, or (after following symlinks) outside the project.
 */
async function hashFile(projectRoot: string, rel: string): Promise<string | null> {
  const abs = insideProject(projectRoot, rel);
  if (!abs) return null;
  try {
    const [real, realRoot] = await Promise.all([fs.promises.realpath(abs), fs.promises.realpath(projectRoot)]);
    const back = path.relative(realRoot, real);
    if (!back || back.startsWith('..') || path.isAbsolute(back)) return null;
    const stat = await fs.promises.stat(real);
    if (!stat.isFile()) return null;
    return contentHash(await fs.promises.readFile(real));
  } catch {
    return null;
  }
}

/**
 * Per-criterion evidence status for a story: reads the hashed files to find
 * stale evidence. Read-only.
 */
export async function evaluateEvidence(projectRoot: string, body: string): Promise<StoryEvidence> {
  const { block, problems } = parseEvidence(body);
  const hashes = new Map<string, string | null>();
  const evaluate = async (record: EvidenceRecord): Promise<EvaluatedRecord> => {
    const changed: string[] = [];
    for (const [file, expected] of Object.entries(record.files ?? {})) {
      if (!hashes.has(file)) hashes.set(file, await hashFile(projectRoot, file));
      if (hashes.get(file) !== expected) changed.push(file);
    }
    return { ...record, stale: changed.length > 0, changed };
  };
  const records = await Promise.all((block?.records ?? []).map(evaluate));
  const used = new Set<EvaluatedRecord>();
  const criteria: CriterionEvidence[] = acceptanceCriteria(body).items.map((c, i) => {
    const mine = records.filter((r) => normalize(r.criterion) === normalize(c.text));
    for (const r of mine) used.add(r);
    const status: EvidenceStatus = !mine.length ? 'not-verified' : mine.some((r) => r.stale) ? 'stale' : 'verified';
    return { index: i + 1, text: c.text, checked: c.checked, status, records: mine };
  });
  const counts: Record<EvidenceStatus, number> = { verified: 0, stale: 0, 'not-verified': 0 };
  for (const c of criteria) counts[c.status]++;
  return { criteria, orphans: records.filter((r) => !used.has(r)), problems, counts };
}

/**
 * Problems `agileflow check` reports without reading other files: a block
 * that does not parse, invalid records, and evidence for criteria that no
 * longer exist.
 */
export function evidenceProblems(body: string): string[] {
  const { block, problems } = parseEvidence(body);
  if (!block) return problems;
  const texts = new Set(acceptanceCriteria(body).items.map((c) => normalize(c.text)));
  const orphans = block.records.filter((r) => !texts.has(normalize(r.criterion)));
  if (orphans.length) {
    problems.push(
      `${orphans.length} evidence record${orphans.length === 1 ? ' is' : 's are'} for a criterion that no longer exists (edited or removed): ` +
        orphans
          .slice(0, 3)
          .map((r) => `"${oneLine(r.criterion).slice(0, 60)}"`)
          .join(', ') +
        (orphans.length > 3 ? ', ...' : ''),
    );
  }
  return problems;
}

/** A criterion by 1-based number, exact text, or a unique part of its text. */
export function resolveCriterion(story: Story, criterion: string): { index: number; text: string } {
  const items = acceptanceCriteria(story.body).items;
  if (!items.length) {
    throw new WorkError(`${story.id} has no acceptance criteria`, ['Add `- [ ] ...` items under `## Acceptance Criteria` first.']);
  }
  const list = items.map((c, i) => `${i + 1}. ${oneLine(c.text)}`);
  const wanted = criterion.trim();
  if (/^\d+$/.test(wanted)) {
    const n = Number(wanted);
    if (n >= 1 && n <= items.length) return { index: n, text: items[n - 1]!.text };
    throw new WorkError(`${story.id} has ${items.length} acceptance criteri${items.length === 1 ? 'on' : 'a'}; there is no criterion ${n}`, list);
  }
  const exact = items.findIndex((c) => normalize(c.text) === normalize(wanted));
  if (exact !== -1) return { index: exact + 1, text: items[exact]!.text };
  const partial = items.map((c, i) => [c, i] as const).filter(([c]) => normalize(c.text).includes(normalize(wanted)));
  if (partial.length === 1) return { index: partial[0]![1] + 1, text: partial[0]![0].text };
  throw new WorkError(
    partial.length ? `"${oneLine(wanted)}" matches ${partial.length} criteria of ${story.id}` : `No acceptance criterion of ${story.id} matches "${oneLine(wanted)}"`,
    [...list, 'Pass the criterion number (e.g. --criterion 2) or more of its text.'],
  );
}

export interface EvidenceInput {
  criterion: string;
  kind: string;
  ref: string;
  note?: string;
  /** Extra files the evidence depends on (hashed to detect staleness), relative to `cwd`. */
  files?: string[];
  /** Directory relative paths are resolved against (the command's working directory); default the project root. */
  cwd?: string;
  /** For tests. */
  now?: Date;
}

export interface RecordedEvidence {
  id: string;
  path: string;
  criterion: { index: number; text: string };
  record: EvidenceRecord;
  /** An earlier record with the same criterion, kind, and ref was replaced. */
  replaced: boolean;
}

/** The file part of a ref such as `test/a.test.ts:42`, `test/a.test.ts::renames`, or `src/x.ts#L10`. */
function refFile(ref: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref)) return null;
  const m = /^([^\s:#]+)/.exec(ref.trim());
  return m ? m[1]! : null;
}

/**
 * Record evidence for one acceptance criterion by editing only the story's
 * evidence block (created under `## Evidence` when missing). The frontmatter
 * and the rest of the body are unchanged; the write is atomic and refused if
 * the story changed since it was read. Evidence with the same criterion,
 * kind, and ref is replaced (refreshed), anything else is added.
 */
export async function recordEvidence(scan: WorkScan, story: Story, input: EvidenceInput): Promise<RecordedEvidence> {
  const { projectRoot } = scan.paths;
  const kind = input.kind.trim().toLowerCase();
  if (!(EVIDENCE_KINDS as readonly string[]).includes(kind)) {
    throw new WorkError(`"${input.kind}" is not an evidence kind`, [`Valid: ${EVIDENCE_KINDS.join(', ')}`]);
  }
  for (const [what, value] of [['--ref', input.ref], ['--note', input.note]] as const) {
    if (value !== undefined && (!value.trim() || hasControlCharacters(value))) {
      throw new WorkError(`${what} must be a non-empty single line without control characters`);
    }
  }
  const criterion = resolveCriterion(story, input.criterion);
  const ref = input.ref.trim();

  // Hash the files the evidence depends on: the ref's file (when it is one) and
  // any --file. Paths are resolved against the directory the command runs in
  // (like any CLI path) and stored relative to the project root in POSIX form,
  // so a record means the same file in every clone.
  const base = input.cwd ? path.resolve(input.cwd) : projectRoot;
  const files: Record<string, string> = {};
  const auto = kind === 'test' || kind === 'inspection' ? refFile(ref) : null;
  if (auto) {
    // The ref's file: relative to the current directory, else to the project root.
    for (const from of [base, projectRoot]) {
      const rel = projectRelative(projectRoot, from, auto);
      const hash = rel ? await hashFile(projectRoot, rel) : null;
      if (rel && hash) {
        files[rel] = hash;
        break;
      }
    }
  }
  for (const file of input.files ?? []) {
    const rel = projectRelative(projectRoot, base, file);
    if (!rel) throw new WorkError(`--file ${file} is outside the project`);
    const hash = await hashFile(projectRoot, rel);
    if (!hash) {
      throw new WorkError(`--file ${file} is not a readable file in the project`, [
        `Resolved to ${rel} (paths are relative to the current directory; symlinks must stay inside the project).`,
      ]);
    }
    files[rel] = hash;
  }
  const commit = await gitHead(projectRoot);
  const record: EvidenceRecord = {
    criterion: oneLine(criterion.text),
    kind: kind as EvidenceKind,
    ref,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(commit ? { commit } : {}),
    ...(Object.keys(files).length ? { files } : {}),
    recorded: (input.now ?? new Date()).toISOString(),
  };

  const { abs, text, revision } = await readUnchanged(scan, story.path);
  const doc = parse(text);
  if (!doc.data) throw new WorkError(`${story.path} no longer has valid frontmatter`, ['Nothing was written.']);
  const parsed = parseEvidence(doc.body);
  if (parsed.problems.length) {
    throw new WorkError(`Cannot record evidence in ${story.path}: ${parsed.problems[0]}`, ['Nothing was written. Fix the agileflow-evidence block by hand, then run the command again.']);
  }
  const records = [...(parsed.block?.records ?? [])];
  const same = records.findIndex((r) => normalize(r.criterion) === normalize(record.criterion) && r.kind === record.kind && r.ref === record.ref);
  if (same !== -1) records[same] = record;
  else records.push(record);

  const eol = doc.body.includes('\r\n') ? '\r\n' : '\n';
  const cr = eol === '\r\n' ? '\r' : '';
  const yaml = YAML.stringify(records, { lineWidth: 0 }).trimEnd().split('\n');
  const lines = doc.body.split('\n');
  const heading = lines.findIndex((l) => /^#{1,6}\s+evidence\s*#*\s*$/i.test(l.replace(/\r$/, '')));
  if (parsed.block) {
    lines.splice(parsed.block.open + 1, parsed.block.close - parsed.block.open - 1, ...yaml.map((l) => l + cr));
  } else if (heading !== -1) {
    const after = lines[heading + 1];
    const block = ['', '```' + EVIDENCE_FENCE, ...yaml, '```', ...(after !== undefined && after.trim() ? [''] : [])];
    lines.splice(heading + 1, 0, ...block.map((l) => l + cr));
  }
  let nextBody = lines.join('\n');
  if (!parsed.block && heading === -1) {
    const base = doc.body.replace(/\s+$/, '');
    nextBody = `${base}${base ? eol + eol : ''}## Evidence${eol}${eol}${['```' + EVIDENCE_FENCE, ...yaml, '```'].join(eol)}${eol}`;
  }
  const head = text.slice(0, text.length - doc.body.length);
  const next = head + nextBody;
  // Safety: the frontmatter must be exactly what it was, and the block must read back.
  const check = parse(next);
  if (!check.data || !isDeepStrictEqual(check.data, doc.data)) {
    throw new WorkError(`Cannot record evidence in ${story.path} safely: the frontmatter would change`, ['Nothing was written.']);
  }
  const reread = parseEvidence(check.body);
  if (reread.problems.length || !isDeepStrictEqual(reread.block?.records, records)) {
    throw new WorkError(`Cannot record evidence in ${story.path} safely: the evidence block would not read back`, ['Nothing was written.']);
  }
  await writeIfUnchanged(abs, story.path, revision.hash, next);
  return { id: story.id, path: story.path, criterion, record, replaced: same !== -1 };
}
