import path from 'node:path';
import { DIRS, DEFAULT_WORK_ROOT, PRODUCT_FILE, README_FILE, ROADMAP_FILE } from './constants';
import type { ArtifactType, WorkPaths } from './types';

export class WorkError extends Error {
  constructor(
    message: string,
    readonly hints: string[] = [],
  ) {
    super(message);
    this.name = 'WorkError';
  }
}

const toPosix = (p: string) => p.split(path.sep).join('/');

/**
 * Validate the configured root and resolve it against the project root.
 * The root must be a relative path inside the project (e.g. `docs/agile`, `planning`).
 */
export function resolveWorkPaths(projectRoot: string, root: string = DEFAULT_WORK_ROOT): WorkPaths {
  const cleaned = toPosix(root.trim()).replace(/\/+$/, '');
  if (!cleaned || cleaned === '.' || path.isAbsolute(cleaned) || /^[A-Za-z]:/.test(cleaned)) {
    throw new WorkError(`Work root "${root}" must be a relative directory inside the project (e.g. docs/agile)`);
  }
  const normalized = path.posix.normalize(cleaned);
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new WorkError(`Work root "${root}" must stay inside the project`);
  }
  return { projectRoot, root: normalized, abs: path.join(projectRoot, ...normalized.split('/')) };
}

export function artifactDir(paths: WorkPaths, type: ArtifactType): string {
  return path.join(paths.abs, DIRS[type]);
}

export function productFile(paths: WorkPaths): string {
  return path.join(paths.abs, DIRS.product, PRODUCT_FILE);
}

export function roadmapFile(paths: WorkPaths): string {
  return path.join(paths.abs, DIRS.roadmap, ROADMAP_FILE);
}

export function readmeFile(paths: WorkPaths): string {
  return path.join(paths.abs, README_FILE);
}

/** Path relative to the project root with POSIX separators, for output and artifact records. */
export function relToProject(paths: WorkPaths, abs: string): string {
  return toPosix(path.relative(paths.projectRoot, abs));
}

/** Human slug from a title: lowercase words joined by hyphens, at most ~48 characters. */
export function slugify(title: string): string {
  const words = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let slug = '';
  for (const w of words) {
    const next = slug ? `${slug}-${w}` : w;
    if (next.length > 48) break;
    slug = next;
  }
  return slug || (words[0] ?? '').slice(0, 48);
}

/** `<ID>-<initial-slug>.md`. The ID is authoritative; the slug is for humans and never renamed. */
export function artifactFileName(id: string, title: string): string {
  const slug = slugify(title);
  return slug ? `${id}-${slug}.md` : `${id}.md`;
}
