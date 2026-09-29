/**
 * `agileflow eval --compare` and `--pack`, end to end with a fake `claude` on
 * PATH whose behavior depends on which skills are installed in the sandbox,
 * and a throwaway registry holding the "released" versions. No real provider
 * CLI runs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildRegistry } from '@agileflow/registry';
import { createSandbox, type Sandbox } from '../helpers';

let sb: Sandbox | undefined;
afterEach(() => {
  sb?.cleanup();
  sb = undefined;
});

/**
 * Fake `claude`. As the provider: activates the installed skill named in the
 * prompt (`gamma`, once installed, takes every beta request), finishes the
 * task only when the skill is installed and its SKILL.md does not say BROKEN,
 * and reports token usage. As the judge: passes everything, or fails like an
 * invalid API key (`judge-mode` file).
 */
function installFakeClaude(bin: string, judge: 'pass' | 'invalid-key' = 'pass'): void {
  fs.writeFileSync(path.join(bin, 'judge-mode'), judge);
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const out = (e) => process.stdout.write(JSON.stringify(e) + '\\n');
if (args[0] === '--version') { console.log('9.9.9 (Claude Code)'); process.exit(0); }
const prompt = args[args.indexOf('-p') + 1];
if (args.includes('stream-json')) {
  const cwd = process.cwd();
  const dir = path.join(cwd, '.agents', 'skills');
  const installed = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const named = ['demo', 'alpha', 'beta'].find((s) => prompt.includes(s));
  const pick = named === 'beta' && installed.includes('gamma') ? 'gamma' : named && installed.includes(named) ? named : null;
  out({ type: 'system', subtype: 'init', model: 'fake-model', skills: installed, slash_commands: installed });
  let done = false;
  if (pick) {
    out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: pick } }] } });
    out({ type: 'user', message: { content: [{ type: 'text', text: 'Base directory for this skill: ' + path.join(cwd, '.claude', 'skills', pick) + '\\n\\n# skill' }] } });
    done = !fs.readFileSync(path.join(dir, pick, 'SKILL.md'), 'utf8').includes('BROKEN');
  }
  out({ type: 'result', subtype: 'success', result: done ? 'done' : 'not finished', usage: { input_tokens: pick ? 900 : 400, output_tokens: 100 }, total_cost_usd: pick ? 0.02 : 0.01 });
  process.exit(0);
}
if (fs.readFileSync(path.join(__dirname, 'judge-mode'), 'utf8') === 'invalid-key') {
  process.stdout.write(JSON.stringify({ type: 'result', is_error: true, result: 'Invalid API key' }));
  process.exit(1);
}
const n = prompt.split('Rubric (grade each criterion independently):')[1].split('\\n').filter((l) => /^\\d+\\. /.test(l)).length;
process.stdout.write(JSON.stringify({ type: 'result', result: JSON.stringify({ items: Array.from({ length: n }, () => ({ pass: true, reason: 'ok' })) }) }));
`,
    { mode: 0o755 },
  );
}

function writeSkill(dir: string, pkg: string, version: string, body: string, evals: Record<string, string>): string {
  const id = path.basename(dir);
  fs.mkdirSync(path.join(dir, 'evals'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${id}\ndescription: Handles ${id} requests. Use when the user asks for ${id} work.\n---\n\n# ${id}\n\n${body}\n\n## Done when\n\n- done\n`);
  fs.writeFileSync(path.join(dir, 'agileflow.skill.yaml'), `schema: 1\npackage:\n  name: "${pkg}"\n  version: ${version}\n`);
  for (const [name, text] of Object.entries(evals)) fs.writeFileSync(path.join(dir, 'evals', `${name}.yaml`), `name: ${name}\nskill: ${id}\n${text}`);
  return dir;
}

const demoEvals = (judged = false) => ({
  task: `prompt: please do the demo\nassert:\n  shouldActivate: true\nrubric:\n  - output: '^done$'\n${judged ? '  - explains what it did\n' : ''}`,
  hidden: "prompt: do the demo for the release\nheldOut: true\nassert:\n  shouldActivate: true\nrubric:\n  - output: '^done$'\n",
  unrelated: 'prompt: what time is it?\nassert:\n  shouldActivate: false\n',
});

/** A registry with demo 1.0.0 and the pack demo-pack (alpha, beta), fixtures, and the fake claude. */
async function setup(judge: 'pass' | 'invalid-key' = 'pass') {
  const s = await createSandbox({ git: false });
  const published = path.join(s.root, 'published');
  writeSkill(path.join(published, 'demo'), '@agileflow/demo', '1.0.0', 'Do the demo.', demoEvals());
  writeSkill(path.join(published, 'alpha'), '@agileflow/alpha', '1.0.0', 'Alpha work.', {
    'alpha-task': 'prompt: an alpha request\nassert:\n  shouldActivate: true\n',
    'beta-belongs-elsewhere': 'prompt: a beta request\nneighbor: beta\nassert:\n  shouldActivate: false\n',
  });
  writeSkill(path.join(published, 'beta'), '@agileflow/beta', '1.0.0', 'Beta work.', {
    'beta-task': 'prompt: a beta request please\nassert:\n  shouldActivate: true\n',
    'beta-hidden': 'prompt: another beta request\nheldOut: true\nassert:\n  shouldActivate: true\n',
  });
  const packs = path.join(s.root, 'packs');
  fs.mkdirSync(packs);
  fs.writeFileSync(path.join(packs, 'demo-pack.yaml'), 'name: demo-pack\nversion: 1\nskills:\n  - "@agileflow/alpha@^1"\n  - "@agileflow/beta@^1"\n');
  const registry = path.join(s.root, 'test-registry');
  const built = await buildRegistry({ skillsDir: published, packsDir: packs, outDir: registry });
  expect(built.errors).toEqual([]);
  const fixtures = path.join(s.root, 'fixtures', 'clean-node');
  fs.mkdirSync(fixtures, { recursive: true });
  fs.writeFileSync(path.join(fixtures, 'README.md'), '# fixture\n');
  installFakeClaude(s.bin, judge);
  const env = { PATH: `${s.bin}${path.delimiter}${process.env.PATH}`, HOME: s.home, AGILEFLOW_REGISTRY: registry };
  const out = path.join(s.root, 'report.json');
  const af = async (args: string[]) => {
    const res = await s.af(['eval', ...args, '--provider', 'claude', '--fixtures', path.dirname(fixtures), '--out', out], { env });
    return { ...res, report: fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null };
  };
  return { s, af, candidates: path.join(s.root, 'candidates') };
}

describe('eval --compare (fake claude)', () => {
  it('compares a candidate against the released version and no skill: deltas, overhead, versions, held-out apart', async () => {
    const t = await setup();
    sb = t.s;
    const candidate = writeSkill(path.join(t.candidates, 'demo'), '@acme/demo', '1.1.0', 'Do the demo, carefully.', demoEvals());
    const res = await t.af([candidate, '--compare', '--mode', 'full', '--runs', '3', '--seed', '42']);
    expect(res.code, res.stdout + res.stderr).toBe(0);
    const c = res.report.comparisons[0];
    expect(c).toMatchObject({ kind: 'skill', skill: 'demo', provider: 'claude', seed: 42, runs: 3, verdict: 'improves', passed: true });
    expect(c.arms.map((a: { id: string; skill: { version: string } | null }) => [a.id, a.skill?.version ?? null])).toEqual([
      ['baseline', null],
      ['released', '1.0.0'],
      ['candidate', '1.1.0'],
    ]);
    const vsBaseline = c.summary.authoring.find((p: { reference: string }) => p.reference === 'baseline');
    expect(vsBaseline).toMatchObject({ verdict: 'improves', completion: { delta: 1 }, tokens: { delta: 500 } });
    expect(vsBaseline.costUsd.delta).toBeCloseTo(0.01);
    expect(c.summary.authoring.find((p: { reference: string }) => p.reference === 'released')).toMatchObject({ verdict: 'no-difference' });
    expect(c.summary.heldOut.map((p: { scenarios: number }) => p.scenarios)).toEqual([1, 1]);
    expect(c.reports.released.environment.providerVersion).toBe('9.9.9 (Claude Code)');
    expect(res.stdout).toContain('Compare demo (claude, full, 3 run(s) per arm, seed 42)');
    expect(res.stdout).toContain('candidate vs baseline (authoring scenarios): improves');
    expect(res.stdout).toContain('gate passed');
  });

  it('a candidate that fails a scenario the released version passes fails the gate', async () => {
    const t = await setup();
    sb = t.s;
    const candidate = writeSkill(path.join(t.candidates, 'demo'), '@acme/demo', '1.1.0', 'BROKEN demo.', demoEvals());
    const res = await t.af([candidate, '--compare', 'released,candidate', '--mode', 'full', '--runs', '2']);
    expect(res.code).toBe(1);
    const c = res.report.comparisons[0];
    expect(c).toMatchObject({ verdict: 'regresses', passed: false });
    const task = c.scenarios.find((x: { scenario: string }) => x.scenario === 'task');
    expect(task.pairs[0].reasons).toContain('fails a scenario the released version passes');
    expect(res.stdout).toContain('REGRESSES');
  });

  it('a broken judge cannot produce a green gate: the comparison is inconclusive', async () => {
    const t = await setup('invalid-key');
    sb = t.s;
    const candidate = writeSkill(path.join(t.candidates, 'demo'), '@acme/demo', '1.1.0', 'Do the demo.', demoEvals(true));
    const res = await t.af([candidate, '--compare', '--mode', 'full']);
    expect(res.code).toBe(1);
    const c = res.report.comparisons[0];
    expect(c).toMatchObject({ verdict: 'inconclusive', passed: false });
    const pair = c.scenarios.find((x: { scenario: string }) => x.scenario === 'task').pairs[0];
    expect(pair.reasons.join()).toContain('(judge)');
    expect(c.reports.candidate.summary.errorKinds.judge).toBeGreaterThan(0);
  });

  it('a released version that cannot be loaded fails the preflight before any run', async () => {
    const t = await setup();
    sb = t.s;
    const candidate = writeSkill(path.join(t.candidates, 'demo'), '@acme/demo', '1.1.0', 'Do the demo.', demoEvals());
    const res = await t.af([candidate, '--compare', '--released', '9.9.9']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('no provider run was started');
    expect(res.report.preflight[0].subject).toBe('demo (released)');
    expect(res.report.comparisons).toEqual([]);
  });

  it('rejects comparisons without a candidate and a baseline without full mode', async () => {
    const t = await setup();
    sb = t.s;
    expect((await t.af(['--compare'])).stderr).toContain('--compare needs the candidate skill');
    const candidate = writeSkill(path.join(t.candidates, 'demo'), '@acme/demo', '1.1.0', 'Do it.', demoEvals());
    const res = await t.af([candidate, '--compare', 'baseline,candidate']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('add --mode full');
  });
});

describe('eval --pack (fake claude)', () => {
  it('installs the pack together and reports which skill activated for which request', async () => {
    const t = await setup();
    sb = t.s;
    const res = await t.af(['--pack', 'demo-pack', '--runs', '2']);
    expect(res.code, res.stdout + res.stderr).toBe(0);
    const act = res.report.packActivation[0];
    expect(act).toMatchObject({ pack: '@agileflow/demo-pack', provider: 'claude' });
    expect(act.authoring.matrix).toEqual([
      { expected: 'alpha', runs: 2, activated: { alpha: 2, beta: 0, '(none)': 0 } },
      { expected: 'beta', runs: 4, activated: { alpha: 0, beta: 4, '(none)': 0 } },
    ]);
    expect(act.heldOut.matrix).toEqual([{ expected: 'beta', runs: 2, activated: { alpha: 0, beta: 2, '(none)': 0 } }]);
    expect(res.stdout).toContain('EXPECTED \\ ACTIVATED');
  });

  it('--compare with a new copy of a pack member runs that copy in the with arm, on its own scenarios in both arms', async () => {
    const t = await setup();
    sb = t.s;
    const alpha = writeSkill(path.join(t.candidates, 'alpha'), '@acme/alpha', '2.0.0', 'Alpha work, revised.', {
      'alpha-task': 'prompt: an alpha request\nassert:\n  shouldActivate: true\n',
      'not-alpha': 'prompt: what time is it?\nassert:\n  shouldActivate: false\n',
      'not-alpha-either': 'prompt: tell me a joke\nassert:\n  shouldActivate: false\n',
    });
    const res = await t.af([alpha, '--pack', 'demo-pack', '--compare']);
    expect(res.code, res.stdout + res.stderr).toBe(0);
    const c = res.report.comparisons[0];
    expect(c).toMatchObject({ kind: 'pack', added: [], replaced: ['alpha'], verdict: 'no-difference' });
    const version = (arm: string) => c.reports[arm].skills.find((s: { skill: string }) => s.skill === 'alpha').version;
    expect([version('without'), version('with')]).toEqual(['1.0.0', '2.0.0']);
    const scenarios = (arm: string) => c.reports[arm].results.filter((r: { skill: string }) => r.skill === 'alpha').map((r: { scenario: string }) => r.scenario).sort();
    expect(scenarios('without')).toEqual(['alpha-task', 'not-alpha', 'not-alpha-either']);
    expect(scenarios('with')).toEqual(scenarios('without'));
  });

  it('--compare flags an existing skill whose activation a new skill materially worsens', async () => {
    const t = await setup();
    sb = t.s;
    const gamma = writeSkill(path.join(t.candidates, 'gamma'), '@acme/gamma', '0.1.0', 'Gamma work.', {
      'gamma-task': 'prompt: a gamma request\nassert:\n  shouldActivate: true\n',
      'not-gamma': 'prompt: what time is it?\nassert:\n  shouldActivate: false\n',
      'not-gamma-either': 'prompt: tell me a joke\nassert:\n  shouldActivate: false\n',
    });
    const res = await t.af([gamma, '--pack', 'demo-pack', '--compare', '--runs', '3']);
    expect(res.code).toBe(1);
    const c = res.report.comparisons[0];
    expect(c).toMatchObject({ kind: 'pack', added: ['gamma'], verdict: 'regresses', passed: false });
    expect(c.skills.find((s: { skill: string; set: string }) => s.skill === 'beta' && s.set === 'authoring')).toMatchObject({
      verdict: 'regresses',
      recall: { without: 1, with: 0 },
    });
    expect(c.skills.find((s: { skill: string; set: string }) => s.skill === 'beta' && s.set === 'held-out')).toMatchObject({ verdict: 'regresses' });
    expect(res.stdout).toContain('recall drops beyond the 95% interval');
  });
});
