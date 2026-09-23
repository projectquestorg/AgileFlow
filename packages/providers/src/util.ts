import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import YAML from 'yaml';
import {
  editFrontmatter,
  readFileText,
  replaceFile,
  SKILL_FILE,
  type ProviderContext,
  type ProviderDetection,
  type TreeFile,
} from '@agileflow/core';

const execFileAsync = promisify(execFile);

/** Find an executable on PATH without spawning anything. */
export async function findExecutable(
  name: string,
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
): Promise<string | null> {
  const dirs = (env.PATH ?? env.Path ?? '').split(platform === 'win32' ? ';' : ':').filter(Boolean);
  const exts = platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext.toLowerCase());
      try {
        const stat = await fs.promises.stat(candidate);
        if (stat.isFile()) return candidate;
      } catch {
        // keep looking
      }
    }
  }
  return null;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

export interface DetectionSpec {
  executables: string[];
  /** Paths relative to the home directory. */
  homeMarkers: string[];
  /** Paths relative to the project root (project scope only). */
  projectMarkers: string[];
}

export async function detectBySpec(pctx: ProviderContext, spec: DetectionSpec): Promise<ProviderDetection> {
  const evidence: string[] = [];
  let executable: string | undefined;
  for (const exe of spec.executables) {
    const found = await findExecutable(exe, pctx.ctx.env, pctx.ctx.platform);
    if (found) {
      evidence.push(`\`${exe}\` on PATH`);
      executable = found;
      break;
    }
  }
  for (const marker of spec.homeMarkers) {
    if (await exists(path.join(pctx.ctx.homeDir, marker))) {
      evidence.push(`~/${marker} exists`);
      break;
    }
  }
  if (pctx.scope.kind === 'project') {
    for (const marker of spec.projectMarkers) {
      if (await exists(path.join(pctx.scope.root, marker))) {
        evidence.push(`${marker} in project`);
        break;
      }
    }
  }
  return { detected: evidence.length > 0, evidence, ...(executable ? { executable } : {}) };
}

/** `<exe> --version`, first line, 3s timeout. Only used for verbose diagnostics. */
export async function probeVersion(executable: string | undefined): Promise<string | undefined> {
  if (!executable) return undefined;
  try {
    const { stdout } = await execFileAsync(executable, ['--version'], { timeout: 3000 });
    return stdout.trim().split('\n')[0];
  } catch {
    return undefined;
  }
}

/** Set a frontmatter key in SKILL.md (e.g. `disable-model-invocation: true`). */
export function setSkillFrontmatter(files: TreeFile[], keyPath: string[], value: unknown): TreeFile[] {
  const text = readFileText(files, SKILL_FILE);
  if (text === null) return files;
  const next = editFrontmatter(text, (doc) => {
    if (keyPath.length > 1 && !YAML.isMap(doc.getIn(keyPath.slice(0, -1), true))) {
      doc.setIn(keyPath.slice(0, -1), doc.createNode({}));
    }
    doc.setIn(keyPath, value);
  });
  return next === text ? files : replaceFile(files, SKILL_FILE, next);
}

export function getSkillFrontmatter(text: string, keyPath: string[]): unknown {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text.replace(/^﻿/, ''));
  if (!match) return undefined;
  const doc = YAML.parseDocument(match[1] ?? '');
  const value = doc.getIn(keyPath);
  return YAML.isScalar(value) ? value.value : value;
}
