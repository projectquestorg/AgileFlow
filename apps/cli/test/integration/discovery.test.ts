import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { createSandbox, read, type Sandbox } from '../helpers';
import { scriptedPrompter } from '../../src/ui/prompts';
import { evalEvidence } from '../../src/commands/info';
import { mutationEnvelope } from '../../src/ui/output';

let sb: Sandbox;
afterEach(() => sb?.cleanup());

const ENVELOPE_KEYS = ['schema', 'ok', 'command', 'dryRun', 'applied', 'skipped', 'failed', 'repaired', 'warnings', 'events'];

function expectEnvelope(doc: Record<string, unknown>, command: string) {
  for (const key of ENVELOPE_KEYS) expect(doc, `${command}: ${key}`).toHaveProperty(key);
  expect(doc.schema).toBe(1);
  expect(doc.command).toBe(command);
}

describe('search and info details', () => {
  it('search shows activation, requirements, and pack membership (text and JSON)', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    const json = JSON.parse((await sb.af(['search', 'pull request', '--source', 'official', '--json'])).stdout);
    const filing = json.results.find((r: { name: string }) => r.name === 'filing-pr');
    expect(filing).toMatchObject({ activation: 'auto', packs: ['github'], requirements: { commands: expect.arrayContaining(['gh']) } });
    const text = await sb.af(['search', 'bugs', '--source', 'official']);
    expect(text.stdout).toMatch(/NAME\s+SOURCE\s+USE\s+DESCRIPTION/);
    expect(text.stdout).toMatch(/diagnosing-bugs\s+official \S+\s+auto; pack core/);
  });

  it('info shows capabilities, eval scenarios, and says when no eval results are published', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    const text = await sb.af(['info', 'diagnosing-bugs']);
    expect(text.stdout).toMatch(/Behavior:\s+may edit files/);
    expect(text.stdout).toMatch(/Evals:\s+\d+ scenarios \(\d+ should activate, \d+ should not\)/);
    expect(text.stdout).toContain('Eval runs:   no published eval results');
    const json = JSON.parse((await sb.af(['info', 'diagnosing-bugs', '--json'])).stdout);
    expect(json.capabilities).toMatchObject({ modifiesFiles: expect.any(String) });
    expect(json.evalScenarios.total).toBeGreaterThanOrEqual(3);
    // The registry publishes the scenario count; run results only once a release records them.
    expect(json.evalEvidence).toEqual({ scenarios: json.evalScenarios.total });
  });

  it('reads published eval evidence tolerantly', () => {
    expect(evalEvidence({ evals: { scenarios: 8, lastRun: { passRate: 0.9, runs: 3, date: '2026-09-01', provider: 'claude' } } })).toEqual({
      scenarios: 8,
      lastRun: { passRate: 0.9, runs: 3, date: '2026-09-01', provider: 'claude' },
    });
    expect(evalEvidence({ evals: { scenarios: 4, lastRun: { passRate: 7 } } })).toEqual({ scenarios: 4 });
    expect(evalEvidence({ evals: 'yes' })).toBeNull();
    expect(evalEvidence(undefined)).toBeNull();
  });
});

describe('outdated', () => {
  it('shows current, wanted, and latest versions, including majors outside the range', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--skills', 'diagnosing-bugs,filing-pr']);
    const lock = YAML.parse(read(path.join(sb.project, 'agileflow.lock')));
    const current = lock.resolved['diagnosing-bugs'].version as string;
    const [major, minor] = current.split('.').map(Number);
    const patch = `${major}.${minor! + 1}.0`;
    const next = `${major! + 1}.0.0`;
    await sb.publish('diagnosing-bugs', patch, (t) => `${t}\nPatch note.\n`);
    await sb.publish('diagnosing-bugs', next, (t) => `${t}\nMajor note.\n`);

    const json = JSON.parse((await sb.af(['outdated', '--json'])).stdout);
    expect(json).toMatchObject({ schema: 1, ok: true, command: 'outdated', verified: true });
    const row = json.skills.find((s: { id: string }) => s.id === 'diagnosing-bugs');
    expect(row).toMatchObject({ current, wanted: patch, latest: next, updateAvailable: true, outsideRange: true, newMajor: true, thirdParty: false, verified: true });
    const clean = json.skills.find((s: { id: string }) => s.id === 'filing-pr');
    expect(clean).toMatchObject({ updateAvailable: false, outsideRange: false });

    const text = await sb.af(['outdated']);
    expect(text.stdout).toMatch(/SKILL\s+CURRENT\s+WANTED\s+LATEST\s+SOURCE\s+NOTE/);
    expect(text.stdout).toContain(`update available; new major ${next} outside range`);
    expect(text.stdout).toContain(`set version: ^${next}`);
    // Read-only: nothing changed.
    expect(YAML.parse(read(path.join(sb.project, 'agileflow.lock')))).toEqual(lock);
  });

  it('does not call a newer patch outside a pinned range a new major', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--skills', 'filing-pr']);
    const current = YAML.parse(read(path.join(sb.project, 'agileflow.lock'))).resolved['filing-pr'].version as string;
    const config = path.join(sb.project, 'agileflow.yaml');
    const doc = YAML.parse(read(config));
    doc.skills['filing-pr'].version = current;
    fs.writeFileSync(config, YAML.stringify(doc));
    const [major, minor, patch] = current.split('.').map(Number);
    const next = `${major}.${minor}.${patch! + 1}`;
    await sb.publish('filing-pr', next, (t) => `${t}\nPatch.\n`);
    const row = JSON.parse((await sb.af(['outdated', '--json'])).stdout).skills[0];
    expect(row).toMatchObject({ current, wanted: current, latest: next, updateAvailable: false, outsideRange: true, newMajor: false });
    const text = await sb.af(['outdated']);
    expect(text.stdout).not.toContain('major');
    expect(text.stdout).toContain(`${next} is outside range ${current}`);
    expect(text.stdout).toContain(`set version: ^${next}`);
  });

  it('says versions are not verified when the registry is unreachable', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--skills', 'diagnosing-bugs']);
    const res = await sb.af(['outdated', '--json'], { env: { AGILEFLOW_REGISTRY: path.join(sb.root, 'missing-registry') } });
    const json = JSON.parse(res.stdout);
    expect(json.verified).toBe(false);
    expect(json.skills[0]).toMatchObject({ id: 'diagnosing-bugs', verified: false, wanted: null });
    expect(json.skills[0].note).toContain('not verified');
  });
});

describe('create scaffold', () => {
  it('adds references/, a blocked-path eval, fixture/neighbor hints, and a consistent sidecar; the lint passes', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    const res = await sb.af([
      'create',
      'releasing-packages',
      '--description',
      'Prepares and publishes a release. Use when the user asks to cut, tag, or publish a new version.',
      '--trigger',
      'Cut a 2.3.0 release and publish it.',
      '--not-trigger',
      'What does semantic versioning mean?',
      '--json',
    ]);
    expect(res.code, res.stderr).toBe(0);
    const dir = path.join(sb.project, 'skills/releasing-packages');
    expect(fs.existsSync(path.join(dir, 'references/details.md'))).toBe(true);
    const skillMd = read(path.join(dir, 'SKILL.md'));
    expect(skillMd).toContain('references/details.md');
    expect(skillMd).toContain('# TODO: end the description with "Not for');
    const blocked = YAML.parse(read(path.join(dir, 'evals/blocked-path.yaml')));
    expect(blocked).toMatchObject({ name: 'blocked-path', skill: 'releasing-packages', assert: { shouldActivate: true } });
    expect(blocked.rubric.join(' ')).toContain('stops at the blocker');
    expect(read(path.join(dir, 'evals/should-activate-1.yaml'))).toContain('# fixture:');
    expect(read(path.join(dir, 'evals/should-not-activate-1.yaml'))).toContain('# neighbor:');
    const sidecar = YAML.parse(read(path.join(dir, 'agileflow.skill.yaml')));
    expect(sidecar.capabilities.userInteraction).toBe('optional');
    expect(skillMd).toMatch(/ask the user before choosing/);
    const lint = await sb.af(['eval', '--lint', dir, '--json']);
    expect(lint.code, lint.stdout).toBe(0);

    // With a "Not for" clause there is no TODO.
    const other = await sb.af([
      'create',
      'tagging-releases',
      '--description',
      'Tags a release. Use when the user asks to tag a version. Not for publishing packages.',
      '--trigger',
      'Tag v1.2.0',
      '--not-trigger',
      'Publish the package to npm',
    ]);
    expect(other.code).toBe(0);
    expect(read(path.join(sb.project, 'skills/tagging-releases/SKILL.md'))).not.toContain('TODO');
  });
});

describe('versioned JSON envelope', () => {
  it('mutationEnvelope derives failed and warnings from events and keeps legacy keys', () => {
    const env = mutationEnvelope('sync', {
      applied: ['a'],
      events: [
        { level: 'error', skill: 'b', message: 'boom' },
        { level: 'warn', message: 'careful' },
      ],
      extra: { materialized: ['a'], ok: 'ignored' },
    });
    expect(env).toMatchObject({ schema: 1, ok: false, command: 'sync', dryRun: false, applied: ['a'], materialized: ['a'] });
    expect(env.failed).toEqual([{ id: 'b', error: 'boom' }]);
    expect(env.warnings).toEqual(['careful']);
  });

  it('add, sync, update, configure, remove, and migrate share one envelope, never prompt, and keep stderr free of text errors', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--skills', '']);
    // An interactive prompter that fails on any question proves JSON mode never asks.
    const noPrompts = { prompter: scriptedPrompter([]) };

    const dry = JSON.parse((await sb.af(['add', 'filing-pr', '--dry-run', '--json'], noPrompts)).stdout);
    expectEnvelope(dry, 'add');
    expect(dry.dryRun).toBe(true);
    expect(dry.plan[0].id).toBe('filing-pr');

    const add = JSON.parse((await sb.af(['add', 'filing-pr', '--json'], noPrompts)).stdout);
    expectEnvelope(add, 'add');
    expect(add.applied.map((a: { id: string }) => a.id)).toEqual(['filing-pr']);
    expect(add.installed[0].id).toBe('filing-pr');

    const again = JSON.parse((await sb.af(['add', 'filing-pr', '--json'], noPrompts)).stdout);
    expect(again.skipped).toEqual([{ id: 'filing-pr', reason: 'already installed' }]);

    fs.rmSync(path.join(sb.project, '.agents/skills/filing-pr'), { recursive: true });
    const sync = JSON.parse((await sb.af(['sync', '--json'], noPrompts)).stdout);
    expectEnvelope(sync, 'sync');
    expect(sync.applied).toEqual(['filing-pr']);
    expect(sync.materialized).toEqual(['filing-pr']);

    const update = JSON.parse((await sb.af(['update', '--dry-run', '--json'], noPrompts)).stdout);
    expectEnvelope(update, 'update');
    expect(update).toHaveProperty('upToDate');

    const configure = JSON.parse((await sb.af(['configure', 'skill', 'filing-pr', '--activation', 'manual', '--json'], noPrompts)).stdout);
    expectEnvelope(configure, 'configure');
    expect(configure.applied[0]).toMatchObject({ topic: 'skill', skill: 'filing-pr', activation: 'manual' });

    const remove = await sb.af(['remove', 'filing-pr', '--json'], noPrompts);
    const removed = JSON.parse(remove.stdout);
    expectEnvelope(removed, 'remove');
    expect(removed).toMatchObject({ ok: true, applied: ['filing-pr'], removed: ['filing-pr'] });

    const migrate = JSON.parse((await sb.af(['migrate', 'v4', '--dry-run', '--json'], noPrompts)).stdout);
    expectEnvelope(migrate, 'migrate');
    expect(migrate).toMatchObject({ dryRun: true, plan: { detected: false } });

    const bad = await sb.af(['remove', 'nope', '--json'], noPrompts);
    expect(bad.code).toBe(1);
    expect(JSON.parse(bad.stdout)).toMatchObject({ ok: false, error: { code: 'usage' } });
    expect(bad.stderr).toBe('');
    const unknownOption = await sb.af(['sync', '--bogus', '--json']);
    expect(unknownOption.code).toBe(1);
    expect(JSON.parse(unknownOption.stdout)).toMatchObject({ ok: false, error: { code: 'usage' } });
    expect(unknownOption.stderr).toBe('');
  });

  it('migrate --json previews a v4 project and refuses to apply without --yes', async () => {
    sb = await createSandbox({ fixture: 'v4-project' });
    const preview = await sb.af(['migrate', 'v4', '--preview', '--json']);
    expect(preview.code).toBe(0);
    const json = JSON.parse(preview.stdout);
    expectEnvelope(json, 'migrate');
    expect(json.dryRun).toBe(true);
    expect(json.plan.detected).toBe(true);
    expect(json.applied.length).toBeGreaterThan(0);
    const refused = await sb.af(['migrate', 'v4', '--json']);
    expect(refused.code).toBe(1);
    expect(JSON.parse(refused.stdout)).toMatchObject({ ok: false, error: { message: 'Refusing to change files without confirmation' } });
    const applied = await sb.af(['migrate', 'v4', '--yes', '--skills', '', '--json']);
    const result = JSON.parse(applied.stdout);
    expectEnvelope(result, 'migrate');
    expect(result.dryRun).toBe(false);
    expect(result.applied.length).toBeGreaterThan(0);
  });
});
