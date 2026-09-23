import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { REPO } from '../helpers';

const CLI = path.join(REPO, 'apps', 'cli');
const BIN = path.join(CLI, 'bin', 'agileflow.js');

describe('built CLI', () => {
  beforeAll(() => {
    execFileSync(process.execPath, [path.join(CLI, 'scripts', 'build.mjs')], { cwd: CLI, stdio: 'ignore' });
  });

  it('runs init/list/check from the bundled bin in a clean repository', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-e2e-'));
    const project = path.join(root, 'project');
    fs.mkdirSync(project);
    execFileSync('git', ['init', '-q'], { cwd: project });
    const env = {
      PATH: process.env.PATH,
      HOME: path.join(root, 'home'),
      AGILEFLOW_HOME: path.join(root, 'home'),
      AGILEFLOW_CACHE_DIR: path.join(root, 'cache'),
      AGILEFLOW_CONFIG_DIR: path.join(root, 'config'),
      AGILEFLOW_REGISTRY: path.join(REPO, 'registry'),
      AGILEFLOW_NO_UPDATE_NOTIFIER: '1',
      CI: '1',
    };
    const run = (...args: string[]) => spawnSync(process.execPath, [BIN, ...args], { cwd: project, env, encoding: 'utf8' });
    const init = run('init', '--yes');
    expect(init.status, init.stderr).toBe(0);
    expect(fs.existsSync(path.join(project, '.agents/skills/diagnosing-bugs/SKILL.md'))).toBe(true);
    expect(run('list').stdout).toContain('diagnosing-bugs');
    expect(run('check').status).toBe(0);
    expect(run('--version').stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    const unknown = run('plugins', 'list');
    expect(unknown.status).toBe(1);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
