import fs from 'node:fs';
import path from 'node:path';
import { ARTIFACT_TYPES, DIRS, README_FILE } from './constants';
import { parse, validate } from './frontmatter';
import { artifactDir, relToProject } from './paths';
import type { Artifact, ArtifactType, Decision, Epic, Story, WorkIssue, WorkPaths } from './types';

export interface WorkScan {
  paths: WorkPaths;
  /** The workspace root directory exists. */
  exists: boolean;
  epics: Epic[];
  stories: Story[];
  decisions: Decision[];
  /** Files and directories the scanner saw but did not load, and unreadable artifacts. */
  issues: WorkIssue[];
}

async function readDir(dir: string): Promise<fs.Dirent[] | null> {
  try {
    return await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Entries allowed directly under the workspace root. */
const ROOT_ALLOWED = new Set<string>([README_FILE, ...Object.values(DIRS)]);

/**
 * Scan the known artifact folders (02-epics, 03-stories, 04-decisions) only,
 * parse frontmatter, and return typed artifacts. Nothing else in the
 * repository is searched; files that do not belong are reported, not loaded.
 */
export async function scanWorkspace(paths: WorkPaths): Promise<WorkScan> {
  const scan: WorkScan = { paths, exists: false, epics: [], stories: [], decisions: [], issues: [] };
  const rootEntries = await readDir(paths.abs);
  if (!rootEntries) return scan;
  scan.exists = true;

  for (const entry of rootEntries) {
    if (entry.name.startsWith('.') || ROOT_ALLOWED.has(entry.name)) continue;
    scan.issues.push({
      level: 'warn',
      message: `${entry.name}${entry.isDirectory() ? '/' : ''} is not part of the Work workspace`,
      detail: [
        'Only README.md, 00-product/, 01-roadmap/, 02-epics/, 03-stories/, and 04-decisions/ belong here.',
        'Scratch notes, plans, reports, and state files belong outside the committed workspace.',
      ],
      path: relToProject(paths, path.join(paths.abs, entry.name)),
      code: 'misplaced',
    });
  }

  for (const type of ARTIFACT_TYPES) {
    const dir = artifactDir(paths, type);
    const entries = await readDir(dir);
    if (!entries) continue;
    const files: Array<{ abs: string; rel: string }> = [];
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      const rel = relToProject(paths, abs);
      if (entry.isDirectory()) {
        scan.issues.push({
          level: 'warn',
          message: `${rel}/ is a subfolder; ${DIRS[type]} holds one file per ${type} and no subfolders`,
          detail: ['Files in subfolders are not read. Status, priority, and epic belong in frontmatter, not folders.'],
          path: rel,
          code: 'misplaced',
        });
        continue;
      }
      if (!entry.name.endsWith('.md')) {
        scan.issues.push({ level: 'warn', message: `${rel} is not a Markdown ${type} and is ignored`, path: rel, code: 'misplaced' });
        continue;
      }
      files.push({ abs, rel });
    }
    // Read with bounded concurrency; results are merged in file-name order so output stays deterministic.
    const results = await mapLimit(files, READ_CONCURRENCY, (f) => readArtifact(f.abs, f.rel, type));
    for (const { artifact, issues } of results) {
      scan.issues.push(...issues);
      if (!artifact) continue;
      if (artifact.type === 'epic') scan.epics.push(artifact);
      else if (artifact.type === 'story') scan.stories.push(artifact);
      else scan.decisions.push(artifact);
    }
  }
  return scan;
}

const READ_CONCURRENCY = 32;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function readArtifact(abs: string, rel: string, type: ArtifactType): Promise<{ artifact: Artifact | null; issues: WorkIssue[] }> {
  const issues: WorkIssue[] = [];
  let text: string;
  try {
    text = await fs.promises.readFile(abs, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? (err as Error).message;
    issues.push({ level: 'error', message: `${rel}: cannot be read (${code})`, path: rel, code: 'invalid' });
    return { artifact: null, issues };
  }
  const doc = parse(text);
  if (!doc.data) {
    issues.push({
      level: 'error',
      message: `${rel}: ${doc.error ? `invalid frontmatter (${doc.error})` : 'missing YAML frontmatter'}`,
      path: rel,
      code: 'invalid',
    });
    return { artifact: null, issues };
  }
  const problems = validate(doc.data, type);
  for (const p of problems) {
    issues.push({ level: p.level, message: `${rel}: ${p.message}`, path: rel, code: p.level === 'error' ? 'invalid' : 'metadata' });
  }
  if (problems.some((p) => p.level === 'error')) return { artifact: null, issues };
  const artifact = { ...(doc.data as object), path: rel, body: doc.body } as Artifact;
  if (doc.titleComment) {
    issues.push({
      level: 'warn',
      message: `${rel}: the title was cut at "${doc.titleComment.slice(0, 40)}" because YAML reads " #" as a comment`,
      detail: [`Quote the title if the # belongs to it: title: ${JSON.stringify(`${artifact.title} ${doc.titleComment}`)}`],
      path: rel,
      code: 'metadata',
    });
  }
  const expectedPrefix = `${artifact.id}`;
  const base = path.basename(rel, '.md');
  if (base !== expectedPrefix && !base.startsWith(`${expectedPrefix}-`)) {
    issues.push({
      level: 'warn',
      message: `${rel}: file name does not start with its id ${artifact.id}`,
      detail: ['The frontmatter id is authoritative; name files <ID>-<slug>.md so people can find them.'],
      path: rel,
      code: 'metadata',
    });
  }
  return { artifact, issues };
}

/** All artifacts in one list. */
export function allArtifacts(scan: WorkScan): Artifact[] {
  return [...scan.epics, ...scan.stories, ...scan.decisions];
}
