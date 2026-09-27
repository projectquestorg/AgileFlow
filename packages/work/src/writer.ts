import fs from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from '@agileflow/core';
import { ARTIFACT_TYPES, DIRS, README_FILE } from './constants';
import { parse, patch, serialize } from './frontmatter';
import { createId, resolvePartialId } from './ids';
import { reviewTransition, isValidStatus, statusesFor } from './lifecycle';
import { artifactDir, artifactFileName, productFile, readmeFile, relToProject, roadmapFile, WorkError } from './paths';
import { allArtifacts, scanWorkspace, type WorkScan } from './scanner';
import { artifactBody, PRODUCT_TEMPLATE, README_TEMPLATE, ROADMAP_TEMPLATE } from './templates';
import type { Artifact, ArtifactType, Horizon, Priority, WorkPaths } from './types';
import { HorizonSchema, PrioritySchema } from './types';

async function exists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Workspace setup
// ---------------------------------------------------------------------------

export interface WorkspaceInspection {
  /** Something already exists at the workspace root. */
  exists: boolean;
  /** Existing content can be adopted as-is (only missing starter files would be added). */
  compatible: boolean;
  /** Why it cannot be adopted. */
  conflicts: string[];
  /** Starter files that `initWorkspace` would create. */
  missing: string[];
  /** Artifacts already present. */
  counts: { epics: number; stories: number; decisions: number };
}

/**
 * Look at an existing workspace root before touching it. Never changes
 * anything. Compatible means: only the five categories and README.md at the
 * root, no subfolders or non-Markdown files in the artifact folders, and every
 * artifact parses and validates (metadata warnings are allowed).
 */
export async function inspectWorkspace(paths: WorkPaths): Promise<WorkspaceInspection> {
  const missing = [readmeFile(paths), productFile(paths), roadmapFile(paths)]
    .filter((f) => !fs.existsSync(f))
    .map((f) => relToProject(paths, f));
  const result: WorkspaceInspection = {
    exists: false,
    compatible: true,
    conflicts: [],
    missing,
    counts: { epics: 0, stories: 0, decisions: 0 },
  };
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(paths.abs);
  } catch {
    return result;
  }
  result.exists = true;
  if (!stat.isDirectory()) {
    result.compatible = false;
    result.conflicts.push(`${paths.root} exists but is not a directory`);
    return result;
  }
  for (const dir of [DIRS.product, DIRS.roadmap, ...ARTIFACT_TYPES.map((t) => DIRS[t])]) {
    const p = path.join(paths.abs, dir);
    if ((await exists(p)) && !(await fs.promises.stat(p)).isDirectory()) {
      result.conflicts.push(`${paths.root}/${dir} exists but is not a directory`);
    }
  }
  const readme = readmeFile(paths);
  if ((await exists(readme)) && (await fs.promises.stat(readme)).isDirectory()) {
    result.conflicts.push(`${paths.root}/${README_FILE} is a directory`);
  }
  if (!result.conflicts.length) {
    const scan = await scanWorkspace(paths);
    // Metadata warnings (unknown fields, file names) do not block adoption; `check` reports them.
    for (const issue of scan.issues) if (issue.level === 'error' || issue.code === 'misplaced') result.conflicts.push(issue.message);
    result.counts = { epics: scan.epics.length, stories: scan.stories.length, decisions: scan.decisions.length };
  }
  result.compatible = result.conflicts.length === 0;
  return result;
}

export interface InitResult {
  created: string[];
  kept: string[];
}

/**
 * Create README.md, 00-product/product.md, and 01-roadmap/roadmap.md when
 * missing. Existing files are never overwritten. 02-04 are created by their
 * first artifact, so no empty folders or .gitkeep files are committed.
 */
export async function initWorkspace(paths: WorkPaths): Promise<InitResult> {
  const result: InitResult = { created: [], kept: [] };
  const files: Array<[string, string]> = [
    [readmeFile(paths), README_TEMPLATE],
    [productFile(paths), PRODUCT_TEMPLATE],
    [roadmapFile(paths), ROADMAP_TEMPLATE],
  ];
  for (const [file, content] of files) {
    const rel = relToProject(paths, file);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    try {
      await fs.promises.writeFile(file, content, { flag: 'wx' });
      result.created.push(rel);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      result.kept.push(rel);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// New artifacts
// ---------------------------------------------------------------------------

export interface NewArtifactInput {
  type: ArtifactType;
  title: string;
  status?: string;
  priority?: string;
  /** Epics only. */
  horizon?: string;
  /** Stories only: full or partial epic ID. */
  epic?: string;
  /** Stories only: full or partial story IDs. */
  dependsOn?: string[];
  /** Decisions only: full or partial IDs of related work. */
  related?: string[];
}

export interface CreatedArtifact {
  id: string;
  type: ArtifactType;
  /** Relative to the project root. */
  path: string;
  title: string;
  status: string;
}

const article = (type: ArtifactType) => (type === 'epic' ? 'an' : 'a');

const DEFAULT_STATUS: Record<ArtifactType, string> = { epic: 'proposed', story: 'backlog', decision: 'proposed' };

/** Create one artifact file with a fresh collision-resistant ID. References are resolved and must exist. */
export async function createArtifact(scan: WorkScan, input: NewArtifactInput): Promise<CreatedArtifact> {
  const { type } = input;
  const title = input.title.trim();
  if (!title) throw new WorkError('A title is required', [`agileflow work new ${type} --title "..."`]);
  if (/[\r\n]/.test(title)) throw new WorkError('The title must be a single line');
  const status = input.status ?? DEFAULT_STATUS[type];
  if (!isValidStatus(type, status)) {
    throw new WorkError(`"${status}" is not ${article(type)} ${type} status`, [`Valid: ${statusesFor(type).join(', ')}`]);
  }
  const ids = allArtifacts(scan).map((a) => a.id);
  const data: Record<string, unknown> = { schema: 1, type, id: createId(type, ids), title, status };

  if (input.priority !== undefined) {
    if (type === 'decision') throw new WorkError('--priority applies to epics and stories only');
    data.priority = parseOption(PrioritySchema.options, input.priority, 'priority') as Priority;
  }
  if (input.horizon !== undefined) {
    if (type !== 'epic') throw new WorkError('--horizon applies to epics only');
    data.horizon = parseOption(HorizonSchema.options, input.horizon, 'horizon') as Horizon;
  }
  if (input.epic !== undefined) {
    if (type !== 'story') throw new WorkError('--epic applies to stories only');
    data.epic = resolvePartialId(input.epic, scan.epics.map((e) => e.id), 'epic');
  }
  if (input.dependsOn !== undefined) {
    if (type !== 'story') throw new WorkError('--depends-on applies to stories only');
    data.depends_on = [...new Set(input.dependsOn.map((d) => resolvePartialId(d, scan.stories.map((s) => s.id), 'story')))];
  } else if (type === 'story') {
    data.depends_on = [];
  }
  if (input.related !== undefined) {
    if (type !== 'decision') throw new WorkError('--related applies to decisions only');
    data.related = [...new Set(input.related.map((r) => resolvePartialId(r, ids)))];
  }

  const dir = artifactDir(scan.paths, type);
  await fs.promises.mkdir(dir, { recursive: true });
  const abs = path.join(dir, artifactFileName(data.id as string, title));
  // `wx`: never overwrite, even if another agent created the same name a moment ago.
  await fs.promises.writeFile(abs, serialize(data, artifactBody(type, title)), { flag: 'wx' });
  return { id: data.id as string, type, path: relToProject(scan.paths, abs), title, status };
}

function parseOption<T extends string>(options: readonly T[], value: string, what: string): T {
  const v = value.trim().toLowerCase();
  if (!(options as readonly string[]).includes(v)) throw new WorkError(`"${value}" is not a valid ${what}`, [`Valid: ${options.join(', ')}`]);
  return v as T;
}

// ---------------------------------------------------------------------------
// Status changes
// ---------------------------------------------------------------------------

export interface StatusChange {
  id: string;
  type: ArtifactType;
  path: string;
  from: string;
  to: string;
  changed: boolean;
  warnings: string[];
}

/**
 * Set an artifact's status by patching only the `status` line. Off-path
 * transitions are applied with warnings; blockers (closing an epic with
 * unfinished stories) refuse unless `force`.
 */
export async function setStatus(
  scan: WorkScan,
  artifact: Artifact,
  to: string,
  options: { force?: boolean } = {},
): Promise<StatusChange> {
  const target = to.trim().toLowerCase();
  if (!isValidStatus(artifact.type, target)) {
    throw new WorkError(`"${to}" is not ${article(artifact.type)} ${artifact.type} status`, [`Valid: ${statusesFor(artifact.type).join(', ')}`]);
  }
  const change: StatusChange = {
    id: artifact.id,
    type: artifact.type,
    path: artifact.path,
    from: artifact.status,
    to: target,
    changed: artifact.status !== target,
    warnings: [],
  };
  if (!change.changed) return change;
  const review = reviewTransition(scan, artifact, target);
  if (review.blockers.length && !options.force) {
    throw new WorkError(review.blockers.join('\n'), ['Use --force to set it anyway.']);
  }
  change.warnings = [...review.blockers, ...review.warnings];
  const abs = path.join(scan.paths.projectRoot, ...artifact.path.split('/'));
  const text = await fs.promises.readFile(abs, 'utf8');
  // The review above used the scanned state; refuse if the file changed since.
  const onDisk = parse(text).data;
  if (onDisk?.id !== artifact.id || onDisk?.status !== artifact.status) {
    throw new WorkError(`${artifact.path} changed on disk while this command was running`, ['Nothing was written. Run the command again.']);
  }
  let next: string;
  try {
    next = patch(text, { status: target });
  } catch (err) {
    throw new WorkError(`Cannot change the status of ${artifact.id} safely: ${(err as Error).message}`, [
      `Nothing was written. Edit the status line in ${artifact.path} by hand, or rewrite its frontmatter as plain \`key: value\` lines.`,
    ]);
  }
  await writeFileAtomic(abs, next);
  return change;
}
