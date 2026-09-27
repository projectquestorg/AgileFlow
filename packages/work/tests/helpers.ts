import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';
import { resolveWorkPaths, scanWorkspace, type WorkPaths } from '@agileflow/work';

export const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

const temp: string[] = [];
afterEach(() => {
  for (const d of temp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A throwaway project, optionally seeded from a fixture under tests/fixtures. */
export function project(fixture?: string): { root: string; paths: WorkPaths } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-work-'));
  temp.push(root);
  if (fixture) fs.cpSync(path.join(FIXTURES, fixture), root, { recursive: true });
  return { root, paths: resolveWorkPaths(root, 'docs/agile') };
}

/** Write a file relative to the workspace root. */
export function put(paths: WorkPaths, rel: string, content: string): string {
  const abs = path.join(paths.abs, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}

/** A story document with the given frontmatter fields and body. */
export function story(fields: Record<string, unknown>, body = '# Story\n'): string {
  const fm = { schema: 1, type: 'story', status: 'backlog', title: 'A story', ...fields };
  return `---\n${Object.entries(fm)
    .map(([k, v]) => (Array.isArray(v) ? `${k}:${v.length ? v.map((x) => `\n  - ${x}`).join('') : ' []'}` : `${k}: ${v}`))
    .join('\n')}\n---\n\n${body}`;
}

export function epic(fields: Record<string, unknown>, body = '# Epic\n'): string {
  return story({ type: 'epic', status: 'active', title: 'An epic', ...fields }, body);
}

export function decision(fields: Record<string, unknown>, body = '# Decision\n'): string {
  return story({ type: 'decision', status: 'accepted', title: 'A decision', ...fields }, body);
}

export const scan = (paths: WorkPaths) => scanWorkspace(paths);
