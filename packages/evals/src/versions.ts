import path from 'node:path';
import { hashTree, parseSidecar, pathExists, readTextIfExists, readTree, SIDECAR_FILE } from '@agileflow/core';
import { runProcess } from './providers';

/**
 * Exact identities recorded in eval reports, so two reports can be compared
 * (or a result reproduced): what was evaluated, in which repository, by which
 * provider CLI.
 */

export interface SkillInfo {
  skill: string;
  /** `package.version` from agileflow.skill.yaml (null without a sidecar). */
  version: string | null;
  /** Hash of the skill as installed (every file except `evals/`). */
  contentHash: string;
  /** Hash of its `evals/` directory (null when it has none). */
  evalsHash: string | null;
}

export interface FixtureInfo {
  /** Fixture name (path under the fixtures directory). */
  id: string;
  /** Hash of the fixture repository content. */
  hash: string;
}

export async function describeSkill(dir: string): Promise<SkillInfo> {
  const files = await readTree(dir);
  const evals = files.filter((f) => f.path.startsWith('evals/'));
  let version: string | null = null;
  const sidecar = await readTextIfExists(path.join(dir, SIDECAR_FILE));
  if (sidecar !== null) {
    try {
      version = parseSidecar(sidecar).package.version ?? null;
    } catch {
      version = null;
    }
  }
  return {
    skill: path.basename(dir),
    version,
    contentHash: hashTree(files.filter((f) => !f.path.startsWith('evals/'))),
    evalsHash: evals.length ? hashTree(evals) : null,
  };
}

/** null when the fixture does not exist. */
export async function describeFixture(fixturesDir: string, id: string): Promise<FixtureInfo | null> {
  const dir = path.join(fixturesDir, id);
  if (!(await pathExists(dir))) return null;
  return { id, hash: hashTree(await readTree(dir)) };
}

/** First line of `<command> --version`, or null when it cannot be run. */
export async function commandVersion(command: string, env: Record<string, string | undefined>, cwd = process.cwd()): Promise<string | null> {
  const res = await runProcess(command, ['--version'], { cwd, env, timeoutMs: 15000 });
  if (res.code !== 0 || res.timedOut) return null;
  return res.stdout.trim().split('\n')[0]?.trim() || null;
}
