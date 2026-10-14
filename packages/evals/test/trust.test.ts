import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildJsonReport,
  claudeArgs,
  claudeDriver,
  claudeJudge,
  createIsolatedEnv,
  loadedSkillPaths,
  preflight,
  processError,
  runEvals,
  runProcess,
  skillSource,
  type EvalDriver,
  type EvalReport,
  type Judge,
  type Transcript,
} from '@agileflow/evals';

const tmp: string[] = [];
function tmpdir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'af-evaltrust-'));
  tmp.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const transcript = (over: Partial<Transcript> = {}): Transcript => ({
  provider: 'claude',
  raw: '{"type":"result","result":"done"}\n',
  toolCalls: [],
  userMessages: [],
  finalText: 'done',
  visibleSkills: null,
  exitCode: 0,
  durationMs: 1,
  ...over,
});

/** A skill whose positive scenario has one rule check and one judge criterion. */
function skill(root: string, extra = ''): string {
  const dir = path.join(root, 'skills', 'demo-skill');
  fs.mkdirSync(path.join(dir, 'evals'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: demo-skill\ndescription: Demo. Use when testing evals.\n---\n\n## Done when\n\n- done\n');
  fs.writeFileSync(path.join(dir, 'agileflow.skill.yaml'), 'schema: 1\npackage:\n  name: "@acme/demo-skill"\n  version: 1.2.3\n');
  fs.writeFileSync(
    path.join(dir, 'evals', 'positive.yaml'),
    `name: positive\nskill: demo-skill\nprompt: do the demo\nassert:\n  shouldActivate: true\nrubric:\n  - output: 'done'\n  - explains what it did\n${extra}`,
  );
  return dir;
}

function fixtures(root: string): string {
  const dir = path.join(root, 'fixtures');
  fs.mkdirSync(path.join(dir, 'clean-node'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'clean-node', 'README.md'), '# fixture\n');
  return dir;
}

/** Claude-shaped runs: a Skill call plus Claude's note naming the directory it loaded the skill from. */
function claudeLike(skillDir: (cwd: string, id: string) => string, over: Partial<Transcript> = {}): EvalDriver {
  return {
    ...claudeDriver,
    async available() {
      return true;
    },
    async run(input) {
      return transcript({
        toolCalls: [{ name: 'Skill', input: JSON.stringify({ skill: input.skillId }) }],
        userMessages: [`Base directory for this skill: ${skillDir(input.cwd, input.skillId)}\n\n# Demo`],
        ...over,
      });
    },
  };
}
const inSandbox = claudeLike((cwd, id) => path.join(cwd, '.claude', 'skills', id));

/** A fake `claude` judge: exits 1 with "Invalid API key", answers with broken JSON, or passes every criterion. */
function fakeJudgeCommand(root: string, mode: 'invalid-key' | 'bad-json' | 'pass'): string {
  const file = path.join(root, 'fake-claude-judge');
  fs.writeFileSync(
    file,
    `#!${process.execPath}
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('9.9.9 (Claude Code)'); process.exit(0); }
const mode = ${JSON.stringify(mode)};
if (mode === 'invalid-key') {
  process.stdout.write(JSON.stringify({ type: 'result', is_error: true, result: 'Invalid API key · Please run /login' }));
  process.exit(1);
}
if (mode === 'bad-json') {
  process.stdout.write(JSON.stringify({ type: 'result', result: 'Here are the grades: {items: [oops' }));
  process.exit(0);
}
const prompt = args[args.indexOf('-p') + 1];
const n = prompt.split('Rubric (grade each criterion independently):')[1].split('\\n').filter((l) => /^\\d+\\. /.test(l)).length;
process.stdout.write(JSON.stringify({ type: 'result', result: JSON.stringify({ items: Array.from({ length: n }, () => ({ pass: true, reason: 'ok' })) }) }));
`,
    { mode: 0o755 },
  );
  return file;
}

function base(root: string) {
  return { skillDirs: [skill(root)], fixturesDir: fixtures(root), env: { ...process.env, HOME: root }, realHome: root, mode: 'full' as const };
}

describe('provider processes', () => {
  it('a process that closes stdin early (EPIPE) is a run result, not a crash', async () => {
    const res = await runProcess('sh', ['-c', 'exec 0<&-; sleep 0.2; exit 1'], { cwd: os.tmpdir(), env: process.env, timeoutMs: 10000, stdin: 'x'.repeat(4 << 20) });
    expect(res.stdinError).toBe('EPIPE');
    expect(processError(res, 10000, { stdin: 'x' })).toMatch(/closed its input before reading it \(EPIPE\)/);
    const missing = await runProcess(path.join(os.tmpdir(), 'no-such-provider-cli'), [], { cwd: os.tmpdir(), env: process.env, timeoutMs: 10000, stdin: 'x'.repeat(1 << 20) });
    expect(missing.code).toBeNull();
    expect(processError(missing, 10000)).toMatch(/could not run/);
  });

  it('an EPIPE provider is a provider error and the report is still produced', async () => {
    const root = tmpdir();
    const epipe: EvalDriver = {
      ...inSandbox,
      async run(input) {
        const stdin = 'x'.repeat(4 << 20);
        const res = await runProcess('sh', ['-c', 'exec 0<&-; sleep 0.2; exit 0'], { cwd: input.cwd, env: input.env, timeoutMs: 10000, stdin });
        return transcript({ raw: res.stdout, exitCode: res.code, ...(processError(res, 10000, { stdin }) ? { error: processError(res, 10000, { stdin }) } : {}) });
      },
    };
    const report = await runEvals({ ...base(root), driver: epipe, judge: null, isolate: false });
    const run = report.results[0]!.runs[0]!;
    expect(report.results[0]!.status).toBe('inconclusive');
    expect(run.error).toMatchObject({ kind: 'provider' });
    expect(run.error!.message).toContain('EPIPE');
    expect(report.summary.errorKinds).toEqual({ provider: 1 });
  });

  it('isolated Claude runs skip user-scope settings', () => {
    const input = { cwd: '/x', prompt: 'p', skillId: 's', invocation: 'implicit' as const, mode: 'full' as const, timeoutMs: 1, env: {} };
    expect(claudeArgs({ ...input, isolated: true }).join(' ')).toContain('--setting-sources project,local');
    expect(claudeArgs(input)).not.toContain('--setting-sources');
  });
});

describe('judge failures keep their evidence', () => {
  for (const mode of ['invalid-key', 'bad-json'] as const) {
    it(`judge ${mode}: an infrastructure error of kind judge, with activation, rule checks, judge reply, and transcript`, async () => {
      const root = tmpdir();
      const judge = claudeJudge({ env: { ...process.env, HOME: root }, command: fakeJudgeCommand(root, mode), isolate: false });
      const transcriptDir = path.join(root, 'transcripts');
      const report = await runEvals({ ...base(root), driver: inSandbox, judge, isolate: false, transcriptDir });
      const scenario = report.results[0]!;
      const run = scenario.runs[0]!;
      expect(scenario.status).toBe('inconclusive');
      expect(run.error!.kind).toBe('judge');
      // Evidence observed before the judge failed is still there.
      expect(run.activated).toBe(true);
      expect(run.activationObserved).toBe(true);
      expect(run.provenance.source).toBe('sandbox');
      expect(run.rubric!.items).toEqual([expect.objectContaining({ source: 'rule', pass: true })]);
      expect(run.rubric!.ungraded).toEqual(['explains what it did']);
      expect(run.judgeReply).toContain(mode === 'invalid-key' ? 'Invalid API key' : '{items: [oops');
      expect(fs.readFileSync(run.transcriptFile!, 'utf8')).toContain('"result":"done"');
      expect(report.summary).toMatchObject({ passed: 0, inconclusive: 1, errorKinds: { judge: 1 }, truePositive: 1 });
      expect(report.summary.taskCompletion.runs).toBe(0);
      const json = buildJsonReport({ lint: [], reports: [report], exitCode: 1 });
      expect(json.reports[0]!.results[0]!.runs[0]).toMatchObject({ judgeReply: expect.any(String), transcriptFile: run.transcriptFile, rawTranscript: expect.stringContaining('done') });
    });
  }

  it('a working judge completes the task metric; ungraded criteria (no judge) are inconclusive, never passed', async () => {
    const root = tmpdir();
    const judge = claudeJudge({ env: { ...process.env, HOME: root }, command: fakeJudgeCommand(root, 'pass'), isolate: false });
    const graded = await runEvals({ ...base(root), driver: inSandbox, judge, isolate: false });
    expect(graded.results[0]!.status).toBe('passed');
    expect(graded.summary.taskCompletion).toMatchObject({ met: 1, runs: 1, rate: 1 });
    expect(graded.environment.judge).toMatchObject({ id: 'claude', version: '9.9.9 (Claude Code)', auth: { mode: 'inherited' } });

    const ungraded = await runEvals({ ...base(tmpdir()), driver: inSandbox, judge: null, isolate: false });
    const run = ungraded.results[0]!.runs[0]!;
    expect(ungraded.results[0]!.status).toBe('inconclusive');
    expect(run.error).toMatchObject({ kind: 'ungraded' });
    expect(run.rubric!.ungraded).toEqual(['explains what it did']);
    // Activation was observed and still counts.
    expect(ungraded.summary).toMatchObject({ truePositive: 1, errorKinds: { ungraded: 1 } });
  });

  it('a failing criterion is a failed task, reported apart from activation', async () => {
    const root = tmpdir();
    const failing: Judge = {
      id: 'strict',
      grade: async (_p, rubric) => ({ judge: 'strict', items: rubric.map((c) => ({ criterion: c, pass: false, reason: 'no', source: 'judge' as const })), score: 0, ungraded: [] }),
    };
    const report = await runEvals({ ...base(root), driver: inSandbox, judge: failing, isolate: false, rubricThreshold: 1 });
    expect(report.results[0]!.status).toBe('failed');
    expect(report.summary).toMatchObject({ truePositive: 1, recall: 1, taskCompletion: { met: 0, runs: 1, rate: 0 } });
  });
});

describe('skill provenance', () => {
  it('reads where the skill was loaded from and whether that is the sandbox', async () => {
    const t = transcript({
      toolCalls: [
        { name: 'shell', input: "bash -lc 'cat .agents/skills/demo-skill/SKILL.md'" },
        { name: 'Read', input: JSON.stringify({ file_path: '~/.codex/skills/demo-skill/SKILL.md' }) },
      ],
    });
    expect(loadedSkillPaths(t, 'demo-skill')).toEqual(['.agents/skills/demo-skill/SKILL.md', '~/.codex/skills/demo-skill/SKILL.md']);
    const sandbox = tmpdir();
    expect(await skillSource(['.agents/skills/demo-skill/SKILL.md'], sandbox)).toBe('sandbox');
    expect(await skillSource(['~/.codex/skills/demo-skill/SKILL.md'], sandbox)).toBe('outside');
    expect(await skillSource([path.join(sandbox, '..', 'elsewhere', 'SKILL.md')], sandbox)).toBe('outside');
    expect(await skillSource([], sandbox)).toBe('unverified');
  });

  it('a same-named personal skill loaded from outside the sandbox is an isolation error, not a pass', async () => {
    const root = tmpdir();
    const home = tmpdir();
    fs.mkdirSync(path.join(home, '.claude', 'skills', 'demo-skill'), { recursive: true });
    const personal = claudeLike((_cwd, id) => path.join(home, '.claude', 'skills', id));
    const report = await runEvals({ ...base(root), mode: 'activation', driver: personal, env: { ...process.env, HOME: home }, realHome: home });
    const run = report.results[0]!.runs[0]!;
    expect(report.results[0]!.status).toBe('inconclusive');
    expect(run.error!.kind).toBe('isolation');
    expect(run.error!.message).toContain('outside the sandbox');
    expect(run.provenance).toMatchObject({ source: 'outside', loadedFrom: [path.join(home, '.claude', 'skills', 'demo-skill', 'SKILL.md')] });
    // Contaminated activation is not counted as a true positive.
    expect(report.summary.truePositive + report.summary.falseNegative).toBe(0);
    expect(report.summary.provenance.outside).toBe(1);
  });

  it('flags a same-named personal skill the provider lists next to the sandbox copy, and records unchecked visibility', async () => {
    const root = tmpdir();
    const home = tmpdir();
    fs.mkdirSync(path.join(home, '.claude', 'skills', 'demo-skill'), { recursive: true });
    const env = { ...process.env, HOME: home };
    const twice = claudeLike((cwd, id) => path.join(cwd, '.claude', 'skills', id), { visibleSkills: ['demo-skill', 'demo-skill'] });
    const leaked = await runEvals({ ...base(root), mode: 'activation', driver: twice, env, realHome: home });
    expect(leaked.results[0]!.runs[0]!.error).toMatchObject({ kind: 'isolation' });
    expect(leaked.results[0]!.runs[0]!.foreignSkills).toEqual(['demo-skill']);

    const once = claudeLike((cwd, id) => path.join(cwd, '.claude', 'skills', id), { visibleSkills: ['demo-skill'] });
    const clean = await runEvals({ ...base(tmpdir()), mode: 'activation', driver: once, env, realHome: home });
    expect(clean.results[0]!.status).toBe('passed');
    expect(clean.results[0]!.runs[0]!.provenance).toMatchObject({ source: 'sandbox', visibilityChecked: true });

    const silent = await runEvals({ ...base(tmpdir()), mode: 'activation', driver: { ...inSandbox, run: async () => transcript({ toolCalls: [{ name: 'Skill', input: '{"skill":"demo-skill"}' }] }) }, env, realHome: home });
    expect(silent.results[0]!.runs[0]!.provenance).toMatchObject({ source: 'unverified', visibilityChecked: false });
    expect(silent.summary.provenance).toMatchObject({ unverified: 1, visibilityUnchecked: 1 });
  });
});

describe('controlled environments', () => {
  it('setup and bin scripts get no credentials and a HOME without logins', async () => {
    const root = tmpdir();
    const home = tmpdir();
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', '.credentials.json'), '{"token":"login-secret"}');
    const seen: string[] = [];
    const driver: EvalDriver = {
      ...inSandbox,
      async run(input) {
        const { execFileSync } = await import('node:child_process');
        seen.push(execFileSync('probe', [], { env: input.env as NodeJS.ProcessEnv, cwd: input.cwd }).toString());
        return inSandbox.run(input);
      },
    };
    const report = await runEvals({
      ...base(root),
      skillDirs: [skill(root, `setup: sh -c 'env; cat "$HOME/.claude/.credentials.json" 2>/dev/null; true' > setup-env.txt\nbin:\n  probe: 'env; cat "$HOME/.claude/.credentials.json" 2>/dev/null; true'\n`)],
      mode: 'activation',
      driver,
      env: { ...process.env, HOME: home, ANTHROPIC_API_KEY: 'sk-ant-secret', GITHUB_TOKEN: 'ghp-secret' },
      realHome: home,
      keep: true,
    });
    const sandbox = report.results[0]!.runs[0]!.sandbox!;
    tmp.push(path.dirname(sandbox));
    for (const text of [fs.readFileSync(path.join(sandbox, 'setup-env.txt'), 'utf8'), seen[0]!]) {
      expect(text).not.toContain('sk-ant-secret');
      expect(text).not.toContain('ghp-secret');
      expect(text).not.toContain('login-secret');
      expect(text).toMatch(/HOME=.*script-home/);
    }
    expect(report.environment.auth).toMatchObject({ provider: 'claude', mode: 'env', envVars: ['ANTHROPIC_API_KEY'] });
  });

  it('login copies do not exist while setup scripts and run checks execute, and are not next to the sandbox', async () => {
    const root = tmpdir();
    const home = tmpdir();
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', '.credentials.json'), '{"token":"login-secret"}');
    const probe = `sh -c 'ls -a ..; cat ../home/.claude/.credentials.json; grep -rs login-secret .. ; true'`;
    const seenDuringRun: string[] = [];
    const driver: EvalDriver = {
      ...inSandbox,
      async run(input) {
        // The provider itself gets its login, in a HOME that is not a sibling of the sandbox.
        seenDuringRun.push(fs.readFileSync(path.join(input.env.HOME!, '.claude', '.credentials.json'), 'utf8'));
        expect(path.dirname(input.env.HOME!)).not.toBe(path.dirname(input.cwd));
        return inSandbox.run(input);
      },
    };
    const report = await runEvals({
      ...base(root),
      skillDirs: [skill(root, `setup: ${probe} > setup-probe.txt 2>&1\n`)],
      driver,
      judge: { id: 'ok', grade: async (_p, rubric) => ({ judge: 'ok', items: rubric.map((c) => ({ criterion: c, pass: true, reason: '', source: 'judge' as const })), score: 1, ungraded: [] }) },
      env: { ...process.env, HOME: home },
      realHome: home,
      keep: true,
    });
    // A run check that fails if it can find the login anywhere near the sandbox.
    const run = report.results[0]!.runs[0]!;
    const sandbox = run.sandbox!;
    tmp.push(path.dirname(sandbox));
    expect(seenDuringRun).toEqual(['{"token":"login-secret"}']);
    const probed = fs.readFileSync(path.join(sandbox, 'setup-probe.txt'), 'utf8');
    expect(probed).not.toContain('login-secret');
    expect(probed.split('\n')).not.toContain('home');
    const leak = await runProcess('sh', ['-c', probe], { cwd: sandbox, env: process.env, timeoutMs: 10000 });
    expect(leak.stdout).not.toContain('login-secret');
  });

  it('a run check cannot read the login either', async () => {
    const root = tmpdir();
    const home = tmpdir();
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', '.credentials.json'), '{"token":"login-secret"}');
    const dir = path.join(root, 'skills', 'demo-skill');
    skill(root);
    fs.writeFileSync(
      path.join(dir, 'evals', 'positive.yaml'),
      "name: positive\nskill: demo-skill\nprompt: do the demo\nassert:\n  shouldActivate: true\nrubric:\n  - run: '! grep -rqs login-secret .. && ! grep -rqs login-secret \"$HOME\"'\n",
    );
    const report = await runEvals({ ...base(root), skillDirs: [dir], driver: inSandbox, judge: null, env: { ...process.env, HOME: home }, realHome: home });
    expect(report.results[0]!.runs[0]!.rubric!.items[0]).toMatchObject({ pass: true });
  });

  it('passes only the provider credential it needs, and records the auth mode by name', async () => {
    const realHome = tmpdir();
    fs.mkdirSync(path.join(realHome, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(realHome, '.claude', '.credentials.json'), '{"token":"t"}');
    fs.writeFileSync(path.join(realHome, '.claude.json'), JSON.stringify({ oauthAccount: { id: 1 }, hasCompletedOnboarding: true }));
    const env = { HOME: realHome, PATH: process.env.PATH, ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: 'o', GITHUB_TOKEN: 'g', MY_SECRET: 's' };
    const withKey = await createIsolatedEnv({ env, providers: ['claude'], realHome });
    try {
      expect(withKey.auth).toEqual([{ provider: 'claude', mode: 'env', envVars: ['ANTHROPIC_API_KEY'], files: ['.claude.json'] }]);
      expect(fs.existsSync(path.join(withKey.home, '.claude', '.credentials.json'))).toBe(false);
      expect(JSON.parse(fs.readFileSync(path.join(withKey.home, '.claude.json'), 'utf8'))).toEqual({ hasCompletedOnboarding: true });
      expect(withKey.env).toMatchObject({ ANTHROPIC_API_KEY: 'k', PATH: process.env.PATH });
      for (const key of ['OPENAI_API_KEY', 'GITHUB_TOKEN', 'MY_SECRET']) expect(withKey.env[key]).toBeUndefined();
    } finally {
      await withKey.dispose();
    }
    const login = await createIsolatedEnv({ env: { HOME: realHome, PATH: process.env.PATH }, providers: ['claude'], realHome });
    try {
      expect(login.auth[0]).toMatchObject({ mode: 'login', envVars: [] });
      expect(fs.existsSync(path.join(login.home, '.claude', '.credentials.json'))).toBe(true);
    } finally {
      await login.dispose();
    }
  });
});

describe('preflight and report provenance', () => {
  it('lists every problem before any provider run', async () => {
    const root = tmpdir();
    const dir = skill(root, "fixture: missing-repo\nsetup: echo hi\n");
    fs.writeFileSync(path.join(dir, 'evals', 'broken.yaml'), 'name: broken\nskill: demo-skill\n');
    const issues = await preflight({ skillDirs: [dir], fixturesDir: fixtures(root), scenarioNames: ['positive', 'nope'], setupAllowed: () => false });
    const text = issues.map((i) => `${i.subject}: ${i.message}`).join('\n');
    expect(text).toContain('invalid scenario');
    expect(text).toContain('fixture "missing-repo" not found');
    expect(text).toContain('--allow-setup');
    expect(text).toContain('no scenario named "nope"');
    expect(await preflight({ skillDirs: [skill(tmpdir())], fixturesDir: fixtures(root) })).toEqual([]);
  });

  it('records versions, hashes, and the not-run scenarios, and reports each finished scenario', async () => {
    const root = tmpdir();
    const dir = skill(root);
    fs.writeFileSync(path.join(dir, 'evals', 'other.yaml'), 'name: other\nskill: demo-skill\nprompt: unrelated\nassert:\n  shouldActivate: false\n');
    const partials: EvalReport[] = [];
    const report = await runEvals({
      ...base(root),
      skillDirs: [dir],
      mode: 'activation',
      driver: inSandbox,
      isolate: false,
      model: 'some-model',
      filter: (s) => s.name === 'positive',
      onScenario: (p) => void partials.push(p),
    });
    expect(partials).toHaveLength(1);
    expect(report.results.map((r) => [r.scenario, r.status, r.notRun])).toEqual([
      ['other', 'not-run', 'filtered'],
      ['positive', 'passed', null],
    ]);
    expect(report.summary).toMatchObject({ scenarios: 2, passed: 1, notRun: 1 });
    expect(report.skills[0]).toMatchObject({ version: '1.2.3', contentHash: expect.stringMatching(/^sha256-/), evalsHash: expect.stringMatching(/^sha256-/) });
    expect(report.results[1]!.fixture).toMatchObject({ id: 'clean-node', hash: expect.stringMatching(/^sha256-/) });
    expect(report.environment.model.requested).toBe('some-model');
    expect(report.environment.auth).toMatchObject({ mode: 'inherited' });
    expect(buildJsonReport({ lint: [], reports: [report], exitCode: 0, complete: false })).toMatchObject({ schemaVersion: 2, ok: false, complete: false });
  });
});
