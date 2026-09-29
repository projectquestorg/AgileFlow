/**
 * `agileflow eval` result trust, end to end with a fake `claude` on PATH that
 * plays both the provider under test (stream-json) and the judge (json).
 * No real provider CLI runs.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { createSandbox, REPO, type Sandbox } from '../helpers';

let sb: Sandbox | undefined;
afterEach(() => {
  sb?.cleanup();
  sb = undefined;
});

interface FakeMode {
  /**
   * `ok`: loads the skill from the sandbox and finishes; `hang`: touches
   * `started` and never finishes; `stubborn`: like hang, but ignores SIGTERM
   * and appends to `log` on every start.
   */
  driver: 'ok' | 'hang' | 'stubborn';
  log?: string;
  judge: 'pass' | 'invalid-key' | 'bad-json';
  started?: string;
}

/** Install the fake `claude` into `bin`, configured by `claude-mode.json` next to it. */
function installFakeClaude(bin: string, mode: FakeMode): void {
  fs.writeFileSync(path.join(bin, 'claude-mode.json'), JSON.stringify(mode));
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const mode = JSON.parse(fs.readFileSync(path.join(__dirname, 'claude-mode.json'), 'utf8'));
const args = process.argv.slice(2);
const out = (e) => process.stdout.write(JSON.stringify(e) + '\\n');
if (args[0] === '--version') { console.log('9.9.9 (Claude Code)'); process.exit(0); }
if (args.includes('stream-json')) {
  if (mode.driver === 'hang') { fs.writeFileSync(mode.started, 'x'); setInterval(() => {}, 1000); return; }
  if (mode.driver === 'stubborn') { process.on('SIGTERM', () => {}); fs.appendFileSync(mode.log, 'run\\n'); fs.writeFileSync(mode.started, 'x'); setInterval(() => {}, 1000); return; }
  const cwd = process.cwd();
  const skills = fs.readdirSync(path.join(cwd, '.agents', 'skills'));
  const id = skills[0];
  out({ type: 'system', subtype: 'init', model: 'fake-model', skills, slash_commands: skills });
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: id } }] } });
  out({ type: 'user', message: { content: [{ type: 'tool_result', content: 'Launching skill: ' + id }] } });
  out({ type: 'user', message: { content: [{ type: 'text', text: 'Base directory for this skill: ' + path.join(cwd, '.claude', 'skills', id) + '\\n\\n# skill' }] } });
  out({ type: 'result', subtype: 'success', result: 'done' });
  process.exit(0);
}
if (mode.judge === 'invalid-key') { process.stdout.write(JSON.stringify({ type: 'result', is_error: true, result: 'Invalid API key · Please run /login' })); process.exit(1); }
if (mode.judge === 'bad-json') { process.stdout.write(JSON.stringify({ type: 'result', result: 'Grades: {items: [oops' })); process.exit(0); }
const prompt = args[args.indexOf('-p') + 1];
const n = prompt.split('Rubric (grade each criterion independently):')[1].split('\\n').filter((l) => /^\\d+\\. /.test(l)).length;
process.stdout.write(JSON.stringify({ type: 'result', result: JSON.stringify({ items: Array.from({ length: n }, () => ({ pass: true, reason: 'ok' })) }) }));
`,
    { mode: 0o755 },
  );
}

/** A local skill that passes the lint, with fixtures; `extra` is appended to the positive scenario. */
function writeSkill(root: string, extra = ''): { skill: string; fixtures: string } {
  const skill = path.join(root, 'skills', 'demo-skill');
  fs.mkdirSync(path.join(skill, 'evals'), { recursive: true });
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: demo-skill\ndescription: Runs the demo. Use when the user asks to run the demo.\n---\n\n# Demo\n\nRun the demo.\n\n## Done when\n\n- the demo ran\n');
  fs.writeFileSync(path.join(skill, 'agileflow.skill.yaml'), 'schema: 1\npackage:\n  name: "@acme/demo-skill"\n  version: 1.0.0\n');
  const scenario = (name: string, prompt: string, activate: boolean, more = '') =>
    fs.writeFileSync(path.join(skill, 'evals', `${name}.yaml`), `name: ${name}\nskill: demo-skill\nprompt: ${prompt}\nassert:\n  shouldActivate: ${activate}\n${more}`);
  scenario('positive', 'run the demo', true, `rubric:\n  - output: 'done'\n  - explains what it did\n${extra}`);
  scenario('second', 'please run the demo again', true, "rubric:\n  - output: 'done'\n");
  scenario('negative', 'what time is it?', false);
  const fixtures = path.join(root, 'fixtures');
  fs.mkdirSync(path.join(fixtures, 'clean-node'), { recursive: true });
  fs.writeFileSync(path.join(fixtures, 'clean-node', 'README.md'), '# fixture\n');
  return { skill, fixtures };
}

async function evalRun(s: Sandbox, args: string[]) {
  const out = path.join(s.root, 'report.json');
  const res = await s.af(['eval', ...args, '--provider', 'claude', '--scenario', 'positive', '--out', out], {
    env: { PATH: `${s.bin}${path.delimiter}${process.env.PATH}`, HOME: s.home },
  });
  return { ...res, report: fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null };
}

describe('eval result trust (fake claude)', () => {
  for (const judge of ['invalid-key', 'bad-json'] as const) {
    it(`a broken judge (${judge}) keeps the evidence, reports a judge infrastructure error, and exits 1`, async () => {
      sb = await createSandbox({ git: false });
      const { skill, fixtures } = writeSkill(sb.root);
      installFakeClaude(sb.bin, { driver: 'ok', judge });
      const res = await evalRun(sb, [skill, '--mode', 'full', '--fixtures', fixtures]);
      expect(res.code, res.stderr).toBe(1);
      const report = res.report;
      expect(report).toMatchObject({ schemaVersion: 2, complete: true, ok: false, preflight: [] });
      expect(report.lint[0].passed).toBe(true);
      const r = report.reports[0];
      expect(r.summary).toMatchObject({ passed: 0, inconclusive: 1, notRun: 2, errorKinds: { judge: 1 } });
      expect(r.environment).toMatchObject({ providerVersion: '9.9.9 (Claude Code)', model: { observed: ['fake-model'] }, auth: { mode: 'none' } });
      const scenario = r.results.find((x: { scenario: string }) => x.scenario === 'positive');
      expect(scenario.status).toBe('inconclusive');
      const run = scenario.runs[0];
      expect(run).toMatchObject({ status: 'error', error: { kind: 'judge' }, activated: true, activationObserved: true, provenance: { source: 'sandbox' } });
      expect(run.judgeReply).toContain(judge === 'invalid-key' ? 'Invalid API key' : '{items: [oops');
      expect(run.rubric.items).toEqual([expect.objectContaining({ source: 'rule', pass: true })]);
      expect(fs.readFileSync(run.transcriptFile, 'utf8')).toContain('Base directory for this skill');
      expect(res.stdout).toContain('[inc] demo-skill/positive');
      expect(res.stdout).toContain('error (judge)');
      expect(res.stdout).toContain('judge reply:');
    });
  }

  it('the same run with a working judge passes (exit 0), so the failures above come from the judge', async () => {
    sb = await createSandbox({ git: false });
    const { skill, fixtures } = writeSkill(sb.root);
    installFakeClaude(sb.bin, { driver: 'ok', judge: 'pass' });
    const res = await evalRun(sb, [skill, '--mode', 'full', '--fixtures', fixtures]);
    expect(res.code, res.stdout + res.stderr).toBe(0);
    expect(res.report.reports[0].summary).toMatchObject({ passed: 1, taskCompletion: { met: 1, runs: 1 } });
    expect(res.stdout).toContain('task completion 1/1');
  });

  it('--judge none with judge criteria is inconclusive and exits 1', async () => {
    sb = await createSandbox({ git: false });
    const { skill, fixtures } = writeSkill(sb.root);
    installFakeClaude(sb.bin, { driver: 'ok', judge: 'pass' });
    const res = await evalRun(sb, [skill, '--mode', 'full', '--judge', 'none', '--fixtures', fixtures]);
    expect(res.code).toBe(1);
    expect(res.report.reports[0].summary).toMatchObject({ passed: 0, inconclusive: 1, errorKinds: { ungraded: 1 }, truePositive: 1 });
    expect(res.stdout).toContain('inconclusive (ungraded)');
  });

  it('preflight stops before any provider run: untrusted setup scripts, missing fixtures, unknown scenarios', async () => {
    sb = await createSandbox({ git: false });
    const { skill, fixtures } = writeSkill(sb.root, 'fixture: no-such-fixture\nsetup: echo hi\n');
    const started = path.join(sb.root, 'provider-started');
    installFakeClaude(sb.bin, { driver: 'hang', judge: 'pass', started });
    const out = path.join(sb.root, 'report.json');
    const res = await sb.af(['eval', skill, '--provider', 'claude', '--fixtures', fixtures, '--scenario', 'positive', '--scenario', 'typo', '--out', out], {
      env: { PATH: `${sb.bin}${path.delimiter}${process.env.PATH}`, HOME: sb.home },
    });
    expect(res.code).toBe(1);
    expect(fs.existsSync(started)).toBe(false);
    expect(res.stderr).toContain('no provider run was started');
    const report = JSON.parse(fs.readFileSync(out, 'utf8'));
    const text = report.preflight.map((i: { subject: string; message: string }) => `${i.subject}: ${i.message}`).join('\n');
    expect(text).toContain('fixture "no-such-fixture" not found');
    expect(text).toContain('--allow-setup');
    expect(text).toContain('no scenario named "typo"');
    expect(report.reports[0].results.map((r: { scenario: string; status: string; notRun: string }) => [r.scenario, r.status, r.notRun])).toEqual([
      ['negative', 'not-run', 'filtered'],
      ['positive', 'not-run', 'preflight'],
      ['second', 'not-run', 'filtered'],
    ]);
  });

  it('SIGTERM mid-run disposes isolated HOMEs and sandboxes and leaves a partial report', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-evalsig-'));
    try {
      const bin = path.join(root, 'bin');
      const home = path.join(root, 'home');
      const tmp = path.join(root, 'tmp');
      for (const d of [bin, home, tmp]) fs.mkdirSync(d, { recursive: true });
      // A login file to copy, so the isolated HOME holds a credential copy that must not survive.
      fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
      fs.writeFileSync(path.join(home, '.claude', '.credentials.json'), '{"token":"t"}');
      const { skill, fixtures } = writeSkill(root);
      const started = path.join(root, 'provider-started');
      installFakeClaude(bin, { driver: 'hang', judge: 'pass', started });
      const out = path.join(root, 'report.json');
      const child = spawn(
        path.join(REPO, 'node_modules', '.bin', 'tsx'),
        [path.join(REPO, 'apps', 'cli', 'src', 'index.ts'), 'eval', skill, '--provider', 'claude', '--fixtures', fixtures, '--scenario', 'positive', '--out', out],
        {
          cwd: root,
          env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, HOME: home, TMPDIR: tmp, AGILEFLOW_NO_UPDATE_NOTIFIER: '1' },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let stderr = '';
      child.stderr.on('data', (d) => (stderr += d));
      const exited = new Promise<number | null>((resolve) => child.on('close', (code) => resolve(code)));
      const deadline = Date.now() + 60000;
      while (!fs.existsSync(started) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
      expect(fs.existsSync(started), stderr).toBe(true);
      expect(fs.readdirSync(tmp).some((d) => d.startsWith('agileflow-eval-'))).toBe(true);
      child.kill('SIGTERM');
      expect(await exited).toBe(143);
      expect(stderr).toContain('terminated (SIGTERM)');
      const report = JSON.parse(fs.readFileSync(out, 'utf8'));
      expect(report).toMatchObject({ complete: false, ok: false, interrupted: 'terminated (SIGTERM)' });
      expect(fs.readdirSync(tmp).filter((d) => d.startsWith('agileflow-eval'))).toEqual([]);
      expect(fs.readFileSync(path.join(home, '.claude', '.credentials.json'), 'utf8')).toBe('{"token":"t"}');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 90000);

  /** Start the source CLI on a skill with three scenarios and a stubborn fake provider. */
  function startStubborn() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-evalsig2-'));
    const bin = path.join(root, 'bin');
    const home = path.join(root, 'home');
    const tmp = path.join(root, 'tmp');
    for (const d of [bin, home, tmp]) fs.mkdirSync(d, { recursive: true });
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', '.credentials.json'), '{"token":"t"}');
    const { skill, fixtures } = writeSkill(root);
    const started = path.join(root, 'provider-started');
    const log = path.join(root, 'provider-runs.log');
    installFakeClaude(bin, { driver: 'stubborn', judge: 'pass', started, log });
    const child = spawn(
      path.join(REPO, 'node_modules', '.bin', 'tsx'),
      [path.join(REPO, 'apps', 'cli', 'src', 'index.ts'), 'eval', skill, '--provider', 'claude', '--fixtures', fixtures, '--out', path.join(root, 'report.json')],
      {
        cwd: root,
        env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, HOME: home, TMPDIR: tmp, AGILEFLOW_NO_UPDATE_NOTIFIER: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    const exited = new Promise<number | null>((resolve) => child.on('close', (code) => resolve(code)));
    const waitStarted = async () => {
      const deadline = Date.now() + 60000;
      while (!fs.existsSync(started) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
      expect(fs.existsSync(started), stderr).toBe(true);
    };
    const leftovers = () => fs.readdirSync(tmp).filter((d) => d.startsWith('agileflow-eval'));
    return { root, home, child, exited, waitStarted, leftovers, log, stderr: () => stderr };
  }

  it('one SIGTERM stops the run loop: no new run starts while the eval shuts down', async () => {
    const t = startStubborn();
    try {
      await t.waitStarted();
      t.child.kill('SIGTERM');
      expect(await t.exited).toBe(143);
      expect(fs.readFileSync(t.log, 'utf8').trim().split('\n')).toEqual(['run']);
      expect(t.leftovers()).toEqual([]);
    } finally {
      fs.rmSync(t.root, { recursive: true, force: true });
    }
  }, 90000);

  it('a second signal during shutdown exits at once but still deletes the login copies', async () => {
    const t = startStubborn();
    try {
      await t.waitStarted();
      t.child.kill('SIGTERM');
      // The stubborn provider ignores SIGTERM, so the orderly shutdown is still waiting for it.
      await new Promise((r) => setTimeout(r, 400));
      t.child.kill('SIGTERM');
      expect(await t.exited).toBe(143);
      expect(t.leftovers()).toEqual([]);
      expect(fs.readFileSync(path.join(t.home, '.claude', '.credentials.json'), 'utf8')).toBe('{"token":"t"}');
    } finally {
      fs.rmSync(t.root, { recursive: true, force: true });
    }
  }, 90000);
});
