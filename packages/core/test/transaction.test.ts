import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import {
  commitAdd,
  commitSkillWrites,
  createContext,
  detachWorkspace,
  forkSkill,
  hashTree,
  inspectSkill,
  journalPath,
  loadWorkspace,
  pendingSkillWrites,
  planUpdate,
  prepareAdd,
  projectScope,
  readLockfile,
  recoverInterruptedWrites,
  removeSkills,
  removeSkillSpecs,
  scopeLockPath,
  setSkillSpecs,
  snapshotSkill,
  updateWorkspace,
  withScopeLock,
  type FetchedPackage,
  type OperationEvent,
  type ScopeTarget,
  type Services,
  type TransactionHooks,
  type TreeFile,
  type Workspace,
} from '@agileflow/core';
import { createSandbox, SKILLS_DIR, type Sandbox } from '../../../apps/cli/test/helpers';
import { servicesFor } from '../../../apps/cli/src/runtime';

const tmp: string[] = [];
function tmpdir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'af-tx-'));
  tmp.push(d);
  return d;
}
let sb: Sandbox | undefined;
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  sb?.cleanup();
  sb = undefined;
});

const file = (p: string, content: string): TreeFile => ({ path: p, content: Buffer.from(content), executable: false });

function skillFiles(id: string, version: string): TreeFile[] {
  return [
    file('SKILL.md', `---\nname: ${id}\ndescription: ${id} workflow. Use when testing ${id}.\n---\n\n${id} instructions ${version}.\n`),
    file('references/notes.md', `${id} notes ${version}\n`),
  ];
}

/** An in-memory registry: `publish` makes a version the latest one. */
function fakeRegistry() {
  const latest: Record<string, string> = {};
  const pkgOf = (id: string, version: string): FetchedPackage => {
    const files = skillFiles(id, version);
    return { source: `@agileflow/${id}`, version, files, integrity: hashTree(files) };
  };
  const fetcher = {
    resolve: async (id: string) => {
      if (!latest[id]) throw new Error(`no such skill ${id}`);
      return pkgOf(id, latest[id]!);
    },
    fetchLocked: async (id: string, entry: { version: string }) => pkgOf(id, entry.version),
    getPack: async () => null,
    hasSkill: async () => true,
    discover: async () => [],
    listSkills: async () => [],
  } as unknown as Services['fetcher'];
  return { fetcher, publish: (id: string, version: string) => (latest[id] = version) };
}

const addRequests = (ids: string[]) => ids.map((id) => ({ id, spec: { source: `@agileflow/${id}` } }));

async function project(installed: string[]) {
  const root = tmpdir();
  const cache = tmpdir();
  const ctx = createContext({ cwd: root, homeDir: tmpdir(), cacheDir: cache, configDir: path.join(cache, 'config'), env: {} });
  fs.writeFileSync(path.join(root, 'agileflow.yaml'), 'version: 1\nskills: {}\n');
  const reg = fakeRegistry();
  const services: Services = { ctx, fetcher: reg.fetcher, adapters: [] };
  const scope = projectScope(root);
  for (const id of ['alpha', 'beta', 'gamma']) reg.publish(id, '1.0.0');
  if (installed.length) {
    const ws = await loadWorkspace(scope);
    await commitAdd(services, ws, await prepareAdd(services, ws, addRequests(installed)));
  }
  // Content that belongs to the user and must never change.
  fs.writeFileSync(path.join(root, 'README.md'), 'mine\n');
  fs.mkdirSync(path.join(scope.skillsDir, 'hand-written', 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(scope.skillsDir, 'hand-written', 'SKILL.md'), '---\nname: hand-written\ndescription: Mine. Use always.\n---\n');
  fs.writeFileSync(path.join(scope.skillsDir, 'hand-written', 'scripts', 'run.sh'), '#!/bin/sh\necho mine\n', { mode: 0o755 });
  fs.writeFileSync(path.join(scope.skillsDir, 'notes.txt'), 'loose file\n');
  return { root, ctx, services, scope, reg };
}

/**
 * Hash of every path under `root` except AgileFlow's own files: config, lock,
 * and the managed skill directories. Staging or backup litter left behind
 * shows up here too.
 */
function userFingerprint(root: string, managed: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const skip = new Set(['agileflow.yaml', 'agileflow.lock', ...managed.map((id) => `.agents/skills/${id}`)]);
  const walk = (abs: string, rel: string) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (skip.has(childRel)) continue;
      const childAbs = path.join(abs, entry.name);
      if (entry.isDirectory()) {
        out[`${childRel}/`] = 'dir';
        walk(childAbs, childRel);
      } else {
        const stat = fs.lstatSync(childAbs);
        out[childRel] = `${(stat.mode & 0o777).toString(8)}:${crypto.createHash('sha256').update(fs.readFileSync(childAbs)).digest('hex')}`;
      }
    }
  };
  walk(root, '');
  return out;
}

const readSkill = (scope: ScopeTarget, id: string) => fs.readFileSync(path.join(scope.skillsDir, id, 'SKILL.md'), 'utf8');

/** Hooks that freeze the operation at `point` forever, like a process killed there. */
function crashAt(point: string): { hooks: TransactionHooks; reached: Promise<void> } {
  let signal!: () => void;
  const reached = new Promise<void>((resolve) => (signal = resolve));
  return {
    reached,
    hooks: {
      boundary(p, id) {
        if ((id ? `${p}:${id}` : p) !== point) return;
        signal();
        return new Promise<void>(() => undefined);
      },
    },
  };
}

async function runUntilCrash(point: string, op: (hooks: TransactionHooks) => Promise<unknown>): Promise<void> {
  const crash = crashAt(point);
  const finished = op(crash.hooks).then(() => {
    throw new Error(`the operation finished without reaching ${point}`);
  });
  await Promise.race([crash.reached, finished]);
}

/** Every lock entry is clean, or pending in the journal: nothing is falsely modified or missing. */
async function assertNoFalseStatus(services: Services, scope: ScopeTarget): Promise<void> {
  const pending = new Set((await pendingSkillWrites(services, scope)) ?? []);
  const lock = (await readLockfile(scope.lockPath))!;
  for (const [id, entry] of Object.entries(lock.resolved)) {
    const status = (await inspectSkill(scope, id, entry)).status;
    if (status !== 'clean') expect(pending, `${id} is ${status} but not reported as interrupted`).toContain(id);
  }
}

async function assertAllClean(scope: ScopeTarget, ids: string[]): Promise<void> {
  const lock = (await readLockfile(scope.lockPath))!;
  expect(Object.keys(lock.resolved).sort()).toEqual([...ids].sort());
  const config = YAML.parse(fs.readFileSync(scope.configPath, 'utf8'));
  expect(Object.keys(config.skills ?? {}).sort()).toEqual([...ids].sort());
  for (const [id, entry] of Object.entries(lock.resolved)) expect((await inspectSkill(scope, id, entry)).status, id).toBe('clean');
}

interface Scenario {
  name: string;
  installed: string[];
  /** Skills managed at any point (excluded from the user fingerprint). */
  managed: string[];
  prepare(env: Awaited<ReturnType<typeof project>>): Promise<void>;
  /** Start (or rerun) the operation on a fresh workspace. */
  run(services: Services, ws: Workspace): Promise<unknown>;
  final: string[];
  boundaries: string[];
}

const scenarios: Scenario[] = [
  {
    name: 'update (two new versions and one removal)',
    installed: ['alpha', 'beta', 'gamma'],
    managed: ['alpha', 'beta', 'gamma'],
    async prepare({ reg, scope }) {
      reg.publish('alpha', '1.1.0');
      reg.publish('beta', '1.1.0');
      await removeSkillSpecs(scope, ['gamma']);
    },
    run: (services, ws) => updateWorkspace(services, ws),
    final: ['alpha', 'beta'],
    boundaries: [
      'journal',
      'staging:alpha',
      'staging:beta',
      'staged',
      'moved-aside:alpha',
      'moved-in:alpha',
      'swapped:alpha',
      'moved-aside:beta',
      'moved-in:beta',
      'swapped:beta',
      'moved-aside:gamma',
      'swapped:gamma',
      'config',
      'lock',
      'committed',
      'cleaned',
    ],
  },
  {
    name: 'add (two new skills)',
    installed: ['alpha'],
    managed: ['alpha', 'beta', 'gamma'],
    async prepare() {},
    async run(services, ws) {
      const ids = ['beta', 'gamma'].filter((id) => !ws.specs[id]);
      return ids.length ? commitAdd(services, ws, await prepareAdd(services, ws, addRequests(ids))) : null;
    },
    final: ['alpha', 'beta', 'gamma'],
    boundaries: ['journal', 'staging:beta', 'staging:gamma', 'staged', 'moved-in:beta', 'swapped:beta', 'moved-in:gamma', 'swapped:gamma', 'config', 'lock', 'committed', 'cleaned'],
  },
  {
    name: 'remove (two skills)',
    installed: ['alpha', 'beta', 'gamma'],
    managed: ['alpha', 'beta', 'gamma'],
    async prepare() {},
    async run(services, ws) {
      const ids = ['alpha', 'beta'].filter((id) => ws.specs[id] || ws.lock.resolved[id]);
      return ids.length ? removeSkills(services, ws, ids) : null;
    },
    final: ['gamma'],
    boundaries: ['journal', 'staged', 'moved-aside:alpha', 'swapped:alpha', 'moved-aside:beta', 'swapped:beta', 'config', 'lock', 'committed', 'cleaned'],
  },
];

describe('crash at every write boundary', () => {
  for (const scenario of scenarios) {
    it(`${scenario.name}: passes the boundaries in order`, async () => {
      const env = await project(scenario.installed);
      await scenario.prepare(env);
      const seen: string[] = [];
      await scenario.run({ ...env.services, hooks: { boundary: (p, id) => void seen.push(id ? `${p}:${id}` : p) } }, await loadWorkspace(env.scope));
      expect(seen).toEqual(scenario.boundaries);
      await assertAllClean(env.scope, scenario.final);
    });

    for (const point of scenario.boundaries) {
      it(`${scenario.name}: crash at ${point}, recover, rerun`, async () => {
        const env = await project(scenario.installed);
        await scenario.prepare(env);
        const { services, scope, root } = env;
        const before = userFingerprint(root, scenario.managed);

        const ws = await loadWorkspace(scope);
        await runUntilCrash(point, (hooks) => scenario.run({ ...services, hooks }, ws));
        // Before recovery (what `list` and `check` see).
        await assertNoFalseStatus(services, scope);

        const events = await recoverInterruptedWrites(services, scope);
        expect(fs.existsSync(journalPath(services, scope))).toBe(false);
        expect(await pendingSkillWrites(services, scope)).toBeNull();
        const messages = events.map((e) => e.message).join('\n');
        if (['journal', 'staged'].includes(point) || point.startsWith('staging:')) {
          expect(messages).toMatch(/did not get to/);
          expect(messages).not.toMatch(/completed/);
        }
        if (['lock', 'committed', 'cleaned'].includes(point)) expect(messages).not.toMatch(/did not get to/);
        // After recovery: every locked skill matches its lock entry, user files untouched, no litter.
        const lock = (await readLockfile(scope.lockPath))!;
        for (const [id, entry] of Object.entries(lock.resolved)) {
          expect((await inspectSkill(scope, id, entry)).status, `${id} after recovery`).toBe('clean');
        }
        expect(userFingerprint(root, scenario.managed)).toEqual(before);

        // Rerunning the command finishes the job without manual cleanup.
        const rerun = await scenario.run(services, await loadWorkspace(scope));
        const rerunEvents = ((rerun as { events?: OperationEvent[] } | null)?.events ?? []).filter((e) => e.level === 'error');
        expect(rerunEvents).toEqual([]);
        await assertAllClean(scope, scenario.final);
        expect(userFingerprint(root, scenario.managed)).toEqual(before);
        expect(fs.existsSync(journalPath(services, scope))).toBe(false);
      });
    }
  }
});

describe('recheck before replacing', () => {
  it('keeps an edit made between planning and applying byte for byte and leaves its lock entry alone', async () => {
    const { services, scope, reg } = await project(['alpha', 'beta', 'gamma']);
    for (const id of ['alpha', 'beta', 'gamma']) reg.publish(id, '1.1.0');
    const lockBefore = (await readLockfile(scope.lockPath))!.resolved.beta;
    const edited = `${readSkill(scope, 'beta')}\nMy edit, made while the update was downloading.\r\n`;
    const report = await updateWorkspace(
      {
        ...services,
        hooks: { boundary: (p) => void (p === 'staged' && fs.writeFileSync(path.join(scope.skillsDir, 'beta', 'SKILL.md'), edited)) },
      },
      await loadWorkspace(scope),
    );
    expect(readSkill(scope, 'beta')).toBe(edited);
    const lock = (await readLockfile(scope.lockPath))!;
    expect(lock.resolved.beta).toEqual(lockBefore);
    expect(lock.resolved.alpha!.version).toBe('1.1.0');
    expect(lock.resolved.gamma!.version).toBe('1.1.0');
    expect(report.events).toContainEqual({
      level: 'error',
      skill: 'beta',
      message: 'changed since AgileFlow planned this update; nothing was replaced',
    });
    expect(report.skipped).toContainEqual({ id: 'beta', reason: 'changed during update' });
    expect(report.applied.map((i) => i.id)).toEqual(['alpha', 'gamma']);
  });

  it('keeps an edit made while the user was answering the update prompt', async () => {
    const { services, scope, reg } = await project(['alpha']);
    reg.publish('alpha', '1.1.0');
    const edited = `${readSkill(scope, 'alpha')}team rule\n`;
    const report = await updateWorkspace(services, await loadWorkspace(scope), {
      confirm: async () => {
        fs.writeFileSync(path.join(scope.skillsDir, 'alpha', 'SKILL.md'), edited);
        return true;
      },
    });
    expect(readSkill(scope, 'alpha')).toBe(edited);
    expect((await readLockfile(scope.lockPath))!.resolved.alpha!.version).toBe('1.0.0');
    expect(report.applied).toEqual([]);
  });

  it('refuses a stale expectation passed straight to commitSkillWrites', async () => {
    const { services, scope } = await project(['alpha']);
    const stale = await snapshotSkill(scope, 'alpha');
    fs.appendFileSync(path.join(scope.skillsDir, 'alpha', 'references', 'notes.md'), 'edit\n');
    const before = userFingerprint(scope.skillsDir, []);
    const ws = await loadWorkspace(scope);
    const result = await commitSkillWrites(services, ws, [{ id: 'alpha', files: null, next: null, spec: 'remove', expect: stale }]);
    expect(result).toMatchObject({ done: [], skipped: ['alpha'] });
    expect(userFingerprint(scope.skillsDir, [])).toEqual(before);
    expect((await readLockfile(scope.lockPath))!.resolved.alpha).toBeDefined();
    expect(fs.existsSync(journalPath(services, scope))).toBe(false);
  });
});

describe('one ownership check', () => {
  it('never makes a hand-written directory replaceable because its name was added to agileflow.yaml', async () => {
    const { services, scope } = await project([]);
    const dir = path.join(scope.skillsDir, 'alpha');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: alpha\ndescription: Mine.\n---\n');
    await setSkillSpecs(scope, { alpha: { source: '@agileflow/alpha' } });
    const before = userFingerprint(scope.skillsDir, []);

    const plan = await planUpdate(services, await loadWorkspace(scope));
    expect(plan.items).toEqual([]);
    expect(plan.events[0]!.message).toMatch(/\.agents\/skills\/alpha already exists and is not managed by AgileFlow/);
    await expect(prepareAdd(services, await loadWorkspace(scope), addRequests(['alpha']))).rejects.toThrow(/already/);

    // The apply step applies the same rule when a caller passes no expectation.
    const pkg = await services.fetcher.resolve('alpha', { source: '@agileflow/alpha' }, scope.root);
    const result = await commitSkillWrites(services, await loadWorkspace(scope), [
      { id: 'alpha', files: pkg.files, next: { source: pkg.source, version: pkg.version, integrity: pkg.integrity, path: '.agents/skills/alpha', activation: 'auto', ownership: 'managed' } },
    ]);
    expect(result.skipped).toEqual(['alpha']);
    expect(userFingerprint(scope.skillsDir, [])).toEqual(before);
  });

  it('does not treat a file where a skill directory belongs as missing', async () => {
    const { services, scope } = await project(['alpha']);
    fs.rmSync(path.join(scope.skillsDir, 'alpha'), { recursive: true });
    fs.writeFileSync(path.join(scope.skillsDir, 'alpha'), 'not a directory\n');
    const entry = (await readLockfile(scope.lockPath))!.resolved.alpha!;
    expect((await inspectSkill(scope, 'alpha', entry)).status).toBe('modified');
    const ws = await loadWorkspace(scope);
    const pkg = await services.fetcher.fetchLocked('alpha', entry, scope.root);
    expect((await commitSkillWrites(services, ws, [{ id: 'alpha', files: pkg.files, next: entry }])).skipped).toEqual(['alpha']);
    expect(fs.readFileSync(path.join(scope.skillsDir, 'alpha'), 'utf8')).toBe('not a directory\n');
  });
});

describe('failures without a crash', () => {
  it('changes nothing when staging fails (disk full, permissions, bad package)', async () => {
    const { services, scope, root } = await project(['alpha']);
    const before = userFingerprint(root, []);
    const ws = await loadWorkspace(scope);
    const good = skillFiles('beta', '1.0.0');
    await expect(
      commitSkillWrites(services, ws, [
        { id: 'beta', files: good, next: null },
        { id: 'gamma', files: [file('../escape.md', 'x')], next: null },
      ]),
    ).rejects.toThrow(/Unsafe path/);
    expect(userFingerprint(root, [])).toEqual(before);
    expect(fs.existsSync(journalPath(services, scope))).toBe(false);
  });

  it('records the skills written before an apply failure and restores the one being swapped', async () => {
    const { services, scope, reg, root } = await project(['alpha', 'beta', 'gamma']);
    for (const id of ['alpha', 'beta', 'gamma']) reg.publish(id, '1.1.0');
    const betaBefore = readSkill(scope, 'beta');
    const before = userFingerprint(root, ['alpha', 'beta', 'gamma']);
    const failing: TransactionHooks = {
      boundary(p, id) {
        if (p === 'moved-aside' && id === 'beta') throw Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' });
      },
    };
    const report = await updateWorkspace({ ...services, hooks: failing }, await loadWorkspace(scope));
    expect(report.events.map((e) => e.message)).toContain('update stopped: EBUSY: resource busy');
    expect(report.applied.map((i) => i.id)).toEqual(['alpha']);
    expect(report.skipped.map((s) => s.id).sort()).toEqual(['beta', 'gamma']);
    const lock = (await readLockfile(scope.lockPath))!;
    expect([lock.resolved.alpha!.version, lock.resolved.beta!.version, lock.resolved.gamma!.version]).toEqual(['1.1.0', '1.0.0', '1.0.0']);
    expect(readSkill(scope, 'beta')).toBe(betaBefore);
    await assertAllClean(scope, ['alpha', 'beta', 'gamma']);
    expect(userFingerprint(root, ['alpha', 'beta', 'gamma'])).toEqual(before);
    expect(fs.existsSync(journalPath(services, scope))).toBe(false);
  });
});

describe('recovery reporting', () => {
  it('names what completed and what was not applied, with the command to rerun', async () => {
    const env = await project(['alpha', 'beta', 'gamma']);
    for (const id of ['alpha', 'beta', 'gamma']) env.reg.publish(id, '1.1.0');
    const ws = await loadWorkspace(env.scope);
    await withScopeLock(env.ctx, env.scope, () => runUntilCrash('swapped:alpha', (hooks) => updateWorkspace({ ...env.services, hooks }, ws)), {
      command: 'agileflow update',
    });
    const events = await recoverInterruptedWrites(env.services, env.scope);
    expect(events.map((e) => e.message)).toEqual([
      'completed an interrupted operation (alpha)',
      'an interrupted operation did not get to beta and gamma; rerun `agileflow update` to apply them',
    ]);
  });

  it('restores the previous copy of a skill caught between the two renames', async () => {
    const env = await project(['alpha', 'beta']);
    env.reg.publish('alpha', '1.1.0');
    env.reg.publish('beta', '1.1.0');
    const alphaBefore = readSkill(env.scope, 'alpha');
    const ws = await loadWorkspace(env.scope);
    await runUntilCrash('moved-aside:alpha', (hooks) => updateWorkspace({ ...env.services, hooks }, ws));
    expect(fs.existsSync(path.join(env.scope.skillsDir, 'alpha'))).toBe(false);
    const events = await recoverInterruptedWrites(env.services, env.scope);
    expect(events.map((e) => e.message).join('\n')).toContain('restored the previous copy of alpha');
    expect(readSkill(env.scope, 'alpha')).toBe(alphaBefore);
  });
});

describe('bypasses go through the journal', () => {
  it('fork restores a missing skill and strips the managed notice in one journaled write', async () => {
    const { services, scope } = await project(['alpha']);
    fs.rmSync(path.join(scope.skillsDir, 'alpha'), { recursive: true });
    const seen: string[] = [];
    await forkSkill({ ...services, hooks: { boundary: (p, id) => void seen.push(id ? `${p}:${id}` : p) } }, await loadWorkspace(scope), 'alpha');
    expect(seen).toContain('moved-in:alpha');
    expect(readSkill(scope, 'alpha')).not.toMatch(/agileflow fork/);
    expect((await readLockfile(scope.lockPath))!.resolved.alpha!.ownership).toBe('local');
  });

  it('detach deletes clean skills through the journal and keeps one edited after the check', async () => {
    const { services, scope } = await project(['alpha', 'beta']);
    const edited = `${readSkill(scope, 'beta')}edit\n`;
    const report = await detachWorkspace(
      {
        ...services,
        hooks: { boundary: (p) => void (p === 'staged' && fs.writeFileSync(path.join(scope.skillsDir, 'beta', 'SKILL.md'), edited)) },
      },
      await loadWorkspace(scope),
      { keepSkills: false },
    );
    expect(report.removedSkills).toEqual(['alpha']);
    expect(report.keptModified).toEqual(['beta']);
    expect(readSkill(scope, 'beta')).toBe(edited);
    expect(fs.existsSync(path.join(scope.skillsDir, 'alpha'))).toBe(false);
  });
});

describe('scope lock takeover', () => {
  it('lets exactly one waiter take over a stale lock', async () => {
    const { ctx, scope } = await project([]);
    const file = scopeLockPath(ctx, scope);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // A dead process on this host (pid far above any real one).
    fs.writeFileSync(file, JSON.stringify({ pid: 2 ** 22 + 12345, host: os.hostname(), command: 'agileflow sync', at: '2020-01-01T00:00:00Z' }));
    let holders = 0;
    let most = 0;
    const op = () =>
      withScopeLock(ctx, scope, async () => {
        most = Math.max(most, ++holders);
        await new Promise((resolve) => setTimeout(resolve, 30));
        holders--;
      });
    await Promise.all([op(), op(), op()]);
    expect(most).toBe(1);
    expect(fs.readdirSync(path.dirname(file)).filter((n) => n.startsWith('lock'))).toEqual([]);
  });
});

describe('provider links', () => {
  it('never mirrors over a directory that appeared after a link attempt failed', async () => {
    const { applyChanges } = await import('@agileflow/core');
    const root = tmpdir();
    const canonical = path.join(root, '.agents', 'skills', 'alpha');
    fs.mkdirSync(canonical, { recursive: true });
    fs.writeFileSync(path.join(canonical, 'SKILL.md'), 'skill\n');
    const entry = path.join(root, '.claude', 'skills', 'alpha');
    const results = await applyChanges([{ kind: 'link', provider: 'claude', skillId: 'alpha', path: entry, target: canonical }], {
      root,
      env: {},
      platform: 'linux',
      deps: {
        async symlink() {
          // The user creates their own skill directory while AgileFlow is linking.
          fs.mkdirSync(entry, { recursive: true });
          fs.writeFileSync(path.join(entry, 'SKILL.md'), 'mine\n');
          throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
        },
      },
    });
    expect(results[0]!.outcome).toBe('failed');
    expect(fs.readFileSync(path.join(entry, 'SKILL.md'), 'utf8')).toBe('mine\n');
  });
});

describe('read-only commands during an interrupted operation (CLI)', () => {
  it('list and check say "interrupted" instead of modified, and the next update completes the work', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    const ids = ['diagnosing-bugs', 'filing-pr', 'verifying-changes'];
    expect((await sb.af(['init', '--skills', ids.join(','), '--yes'])).code).toBe(0);
    for (const id of ids) {
      const version = YAML.parse(fs.readFileSync(path.join(SKILLS_DIR, id, 'agileflow.skill.yaml'), 'utf8')).package.version as string;
      await sb.publish(id, `${version.split('.')[0]}.99.0`, (t) => `${t}\nNew in this release.\n`);
    }
    const before = userFingerprint(sb.project, ids);

    const ctx = createContext({ cwd: sb.project, homeDir: sb.home, cacheDir: sb.cache, configDir: path.join(sb.home, '.config', 'agileflow'), env: sb.env });
    const scope = projectScope(sb.project);
    const services = await servicesFor(ctx, scope);
    const ws = await loadWorkspace(scope);
    // As `agileflow update` runs it: under the scope lock, which names the command in the journal.
    await withScopeLock(ctx, scope, () => runUntilCrash(`swapped:${ids[0]}`, (hooks) => updateWorkspace({ ...services, hooks }, ws, { approveExternal: true })), {
      command: 'agileflow update',
    });

    const list = await sb.af(['list']);
    expect(list.stderr).toContain('interrupted operation pending recovery');
    for (const id of ids) expect(list.stdout).toMatch(new RegExp(`${id} .* interrupted`));
    expect(list.stdout).not.toMatch(/modified|missing/);
    const check = await sb.af(['check']);
    expect(check.stdout).toContain('interrupted operation pending recovery');
    expect(check.stdout).not.toMatch(/with local modifications|missing from/);

    const update = await sb.af(['update', '--yes']);
    expect(update.code).toBe(0);
    expect(update.stderr).toContain(`completed an interrupted operation (${ids[0]})`);
    expect(update.stderr).toContain(`did not get to ${ids[1]} and ${ids[2]}; rerun \`agileflow update\``);
    const after = await sb.af(['list']);
    expect(after.stderr).not.toContain('interrupted');
    expect(after.stdout.match(/ clean/g)?.length).toBe(3);
    expect(after.stdout).toContain('.99.0');
    expect((await sb.af(['check'])).code).toBe(0);
    expect(userFingerprint(sb.project, ids)).toEqual(before);
  });
});

describe('audit regressions', () => {
  it('keeps a previous copy it could not restore, even after its process died', async () => {
    const { services, scope } = await project(['alpha']);
    // The user's edits in the installed copy; an explicit reset replaces them.
    fs.writeFileSync(path.join(scope.skillsDir, 'alpha', 'MY-NOTES.md'), 'precious\n');
    const ws = await loadWorkspace(scope);
    const next = { ...ws.lock.resolved.alpha! };
    const writes = [{ id: 'alpha', files: skillFiles('alpha', '2.0.0'), next, expect: await snapshotSkill(scope, 'alpha') }];
    await runUntilCrash('moved-in:alpha', (hooks) => commitSkillWrites({ ...services, hooks }, ws, writes));
    // The crashed process is gone: rename its litter to a pid that is not running.
    const file = journalPath(services, scope);
    const journal = JSON.parse(fs.readFileSync(file, 'utf8'));
    const item = journal.items[0];
    const deadName = item.backup.replace(/-\d+-([0-9a-f]{8})$/, '-999999-$1');
    fs.renameSync(path.join(scope.skillsDir, item.backup), path.join(scope.skillsDir, deadName));
    item.backup = deadName;
    fs.writeFileSync(file, JSON.stringify(journal));
    // Meanwhile something else was written at the skill path.
    fs.writeFileSync(path.join(scope.skillsDir, 'alpha', 'SKILL.md'), 'edited after the crash\n');

    const events = await recoverInterruptedWrites(services, scope);
    const kept = /left the previous copy at (\S+),/.exec(events.map((e) => e.message).join('\n'))?.[1];
    expect(kept).toBeDefined();
    expect(fs.readFileSync(path.join(kept!, 'MY-NOTES.md'), 'utf8')).toBe('precious\n');
    // A later command's sweep leaves it alone.
    await recoverInterruptedWrites(services, scope);
    expect(fs.existsSync(path.join(kept!, 'MY-NOTES.md'))).toBe(true);
    expect(readSkill(scope, 'alpha')).toBe('edited after the crash\n');
  });

  it('reports only the skills a failed sync batch really wrote', async () => {
    const { services, scope } = await project(['alpha', 'beta']);
    fs.rmSync(path.join(scope.skillsDir, 'alpha'), { recursive: true });
    fs.rmSync(path.join(scope.skillsDir, 'beta'), { recursive: true });
    const failing = {
      ...services,
      hooks: {
        boundary(point: string, id?: string) {
          if (point === 'staging' && id === 'beta') throw Object.assign(new Error('ENOSPC: no space left'), { code: 'ENOSPC' });
        },
      },
    };
    const { syncWorkspace } = await import('@agileflow/core');
    const report = await syncWorkspace(failing, await loadWorkspace(scope));
    expect(report.materialized).toEqual([]);
    expect(report.events.some((e) => e.level === 'error' && /sync stopped: ENOSPC/.test(e.message))).toBe(true);
  });

  it('never gives the scope lock to two holders when waiters race to break a stale lock', async () => {
    const { ctx, scope } = await project([]);
    const file = scopeLockPath(ctx, scope);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ pid: 999999, host: os.hostname(), command: 'dead', at: 'then' }));
    let inside = 0;
    let most = 0;
    const holder = () =>
      withScopeLock(ctx, scope, async () => {
        inside++;
        most = Math.max(most, inside);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inside--;
      });
    await Promise.all(Array.from({ length: 8 }, holder));
    expect(most).toBe(1);
    expect(fs.existsSync(`${file}.break`)).toBe(false);
  });
});
