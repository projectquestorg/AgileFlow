import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import { buildRegistry } from '@agileflow/registry';
import { copyTree } from '@agileflow/core';
import { run } from '../src/index';
import type { Prompter } from '../src/ui/prompts';

export const REPO = fileURLToPath(new URL('../../../', import.meta.url));
export const SKILLS_DIR = path.join(REPO, 'skills');
export const PACKS_DIR = path.join(REPO, 'packs');
export const FIXTURES_DIR = path.join(REPO, 'fixtures');

export interface Sandbox {
  root: string;
  project: string;
  home: string;
  cache: string;
  bin: string;
  registry: string;
  /** Mutable copy of the official catalog used to publish new versions. */
  catalog: string;
  env: Record<string, string | undefined>;
  af(args: string[], options?: { cwd?: string; prompter?: Prompter; env?: Record<string, string | undefined> }): Promise<{
    code: number;
    stdout: string;
    stderr: string;
  }>;
  /** Pretend a provider CLI is installed (on PATH). */
  installProvider(name: string): void;
  /** Edit a catalog skill, bump its version, and republish the registry. */
  publish(skill: string, version: string, edit: (text: string) => string): Promise<void>;
  cleanup(): void;
}

function capture() {
  let data = '';
  return {
    writer: { write: (chunk: string) => ((data += chunk), true), isTTY: false },
    get text() {
      return data;
    },
  };
}

export async function createSandbox(options: { fixture?: string; git?: boolean } = {}): Promise<Sandbox> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-test-'));
  const project = path.join(root, 'project');
  const home = path.join(root, 'home');
  const cache = path.join(root, 'cache');
  const bin = path.join(root, 'bin');
  const registry = path.join(root, 'registry');
  const catalog = path.join(root, 'catalog');
  for (const d of [project, home, cache, bin]) fs.mkdirSync(d, { recursive: true });
  if (options.fixture) await copyTree(path.join(FIXTURES_DIR, options.fixture), project);
  if (options.git !== false) execFileSync('git', ['init', '-q'], { cwd: project });
  await copyTree(SKILLS_DIR, catalog);
  const result = await buildRegistry({ skillsDir: catalog, packsDir: PACKS_DIR, outDir: registry });
  if (result.errors.length) throw new Error(result.errors.join('\n'));

  const env: Record<string, string | undefined> = {
    PATH: bin,
    AGILEFLOW_REGISTRY: registry,
    AGILEFLOW_NO_UPDATE_NOTIFIER: '1',
  };

  const sandbox: Sandbox = {
    root,
    project,
    home,
    cache,
    bin,
    registry,
    catalog,
    env,
    async af(args, opts = {}) {
      const out = capture();
      const err = capture();
      const code = await run(['node', 'agileflow', ...args], {
        cwd: opts.cwd ?? project,
        homeDir: home,
        cacheDir: cache,
        configDir: path.join(home, '.config', 'agileflow'),
        env: { ...env, ...opts.env },
        platform: process.platform,
        stdout: out.writer,
        stderr: err.writer,
        prompter: opts.prompter,
      });
      return { code, stdout: out.text, stderr: err.text };
    },
    installProvider(name) {
      const exe = path.join(bin, name);
      fs.writeFileSync(exe, '#!/bin/sh\nexit 0\n');
      fs.chmodSync(exe, 0o755);
    },
    async publish(skill, version, edit) {
      const dir = path.join(catalog, skill);
      const skillMd = path.join(dir, 'SKILL.md');
      fs.writeFileSync(skillMd, edit(fs.readFileSync(skillMd, 'utf8')));
      const sidecarPath = path.join(dir, 'agileflow.skill.yaml');
      const sidecar = YAML.parse(fs.readFileSync(sidecarPath, 'utf8'));
      sidecar.package.version = version;
      fs.writeFileSync(sidecarPath, YAML.stringify(sidecar));
      const res = await buildRegistry({ skillsDir: catalog, packsDir: PACKS_DIR, outDir: registry });
      if (res.errors.length) throw new Error(res.errors.join('\n'));
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
  return sandbox;
}

export function read(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

export function exists(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

export function isSymlink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Sorted relative paths of everything under `dir` (symlinks shown as `path -> target`). */
export function tree(dir: string, options: { skip?: (rel: string) => boolean } = {}): string[] {
  const out: string[] = [];
  function walk(abs: string, rel: string) {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (options.skip?.(childRel)) continue;
      const childAbs = path.join(abs, entry.name);
      if (entry.isSymbolicLink()) out.push(`${childRel} -> ${fs.readlinkSync(childAbs)}`);
      else if (entry.isDirectory()) {
        out.push(`${childRel}/`);
        walk(childAbs, childRel);
      } else out.push(childRel);
    }
  }
  walk(dir, '');
  return out;
}

export function snapshotFiles(dir: string, rels: string[]): Record<string, string | null> {
  return Object.fromEntries(rels.map((r) => [r, exists(path.join(dir, r)) ? read(path.join(dir, r)) : null]));
}
