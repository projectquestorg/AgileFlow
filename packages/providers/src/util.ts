import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import YAML from 'yaml';
import {
  editFrontmatter,
  readFileText,
  replaceFile,
  SKILL_FILE,
  splitFrontmatter,
  type ProviderContext,
  type ProviderDetection,
  type TreeFile,
} from '@agileflow/core';

/** Find an executable on PATH without spawning anything. */
export async function findExecutable(
  name: string,
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
): Promise<string | null> {
  const dirs = (env.PATH ?? env.Path ?? '')
    .split(platform === 'win32' ? ';' : ':')
    // Windows PATH entries may be quoted ("C:\Program Files\x").
    .map((d) => (platform === 'win32' ? d.replace(/^"(.*)"$/, '$1') : d))
    .filter(Boolean);
  const exts = platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').filter(Boolean) : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext.toLowerCase());
      try {
        const stat = await fs.promises.stat(candidate);
        if (!stat.isFile()) continue;
        // On POSIX a file on PATH only counts when it is executable.
        if (platform !== 'win32') await fs.promises.access(candidate, fs.constants.X_OK);
        return candidate;
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
  /**
   * Absolute markers derived from the environment, e.g. `$CODEX_HOME` or
   * `$CLAUDE_CONFIG_DIR`. Checked before the home markers.
   */
  envMarkers?: (pctx: ProviderContext) => Array<{ path: string; label: string }>;
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
  let homeFound = false;
  for (const marker of spec.envMarkers?.(pctx) ?? []) {
    if (await exists(marker.path)) {
      evidence.push(`${marker.label} exists`);
      homeFound = true;
      break;
    }
  }
  for (const marker of homeFound ? [] : spec.homeMarkers) {
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

const VERSION_TIMEOUT_MS = 3000;

/**
 * `<exe> --version`, first non-empty line. Only used for verbose inspection.
 * Bounded: the child is killed after 3s and the promise settles then even if
 * the child (or a grandchild holding stdout) lingers. Never throws.
 * Windows `.cmd`/`.bat` shims (npm installs) need a shell to run.
 */
export function probeVersion(
  executable: string | undefined,
  platform: NodeJS.Platform = process.platform,
  timeoutMs = VERSION_TIMEOUT_MS,
): Promise<string | undefined> {
  if (!executable) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    const finish = (value: string | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const shim = platform === 'win32' && /\.(cmd|bat)$/i.test(executable);
    let child: ReturnType<typeof spawn>;
    try {
      child = shim
        ? spawn(`"${executable}" --version`, { shell: true, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
        : spawn(executable, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    } catch {
      resolve(undefined);
      return;
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(undefined);
    }, timeoutMs);
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      if (stdout.length < 4096) stdout += chunk;
    });
    child.on('error', () => finish(undefined));
    child.on('close', (code) => {
      const line = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean);
      finish(code === 0 && line ? line : undefined);
    });
  });
}

/** First `major.minor.patch` in a `--version` line (`codex-cli 0.128.0` -> `0.128.0`). */
export function parseVersion(line: string | undefined): string | undefined {
  return line ? /(\d+\.\d+\.\d+)/.exec(line)?.[1] : undefined;
}

/** Numeric comparison of `major.minor.patch` strings. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** `~/...` when `abs` is inside the home directory, else `abs`. */
export function tildify(abs: string, homeDir: string): string {
  const rel = path.relative(homeDir, abs);
  if (rel === '') return '~';
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) return `~/${rel.split(path.sep).join('/')}`;
  return abs;
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
  const { frontmatter } = splitFrontmatter(text);
  if (frontmatter === null) return undefined;
  const doc = YAML.parseDocument(frontmatter);
  const value = doc.getIn(keyPath);
  return YAML.isScalar(value) ? value.value : value;
}
