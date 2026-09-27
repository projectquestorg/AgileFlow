import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  compareProviders,
  createIsolatedEnv,
  personalSkillNames,
  runEvals,
  type EvalDriver,
  type EvalReport,
  type Judge,
  type Transcript,
} from '@agileflow/evals';

const tmp: string[] = [];
function tmpdir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'af-evalrob-'));
  tmp.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const transcript = (over: Partial<Transcript> = {}): Transcript => ({
  provider: 'fake',
  raw: '',
  toolCalls: [],
  userMessages: [],
  finalText: 'done',
  visibleSkills: null,
  exitCode: 0,
  durationMs: 1,
  ...over,
});

/** A skill with one positive (rubric) scenario and the given extra scenario fields. */
function skill(root: string, extra: Record<string, string> = {}): string {
  const dir = path.join(root, 'skills', 'demo-skill');
  fs.mkdirSync(path.join(dir, 'evals'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: demo-skill\ndescription: Demo. Use when testing evals.\n---\n\n## Done when\n\n- done\n');
  fs.writeFileSync(
    path.join(dir, 'evals', 'positive.yaml'),
    `name: positive\nskill: demo-skill\nprompt: do the demo\ninvocation: implicit\nassert:\n  shouldActivate: true\nrubric:\n  - does the demo\n${extra.positive ?? ''}`,
  );
  return dir;
}

function fixtures(root: string): string {
  const dir = path.join(root, 'fixtures');
  fs.mkdirSync(path.join(dir, 'clean-node'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'clean-node', 'README.md'), '# fixture\n');
  return dir;
}

const activates: EvalDriver = {
  id: 'fake',
  displayName: 'Fake',
  executable: 'true',
  available: async () => true,
  explicitPrompt: (id, p) => `/${id} ${p}`,
  async run(input) {
    return transcript({ toolCalls: [{ name: 'Skill', input: JSON.stringify({ skill: input.skillId }) }] });
  },
  activated: (t, id) => t.toolCalls.some((c) => c.input.includes(`"${id}"`)),
};

describe('eval robustness', () => {
  it('a judge failure is an error, never a pass', async () => {
    const root = tmpdir();
    const broken: Judge = {
      id: 'broken',
      async grade() {
        throw new Error('judge process exited 1');
      },
    };
    const report = await runEvals({
      skillDirs: [skill(root)],
      driver: activates,
      judge: broken,
      mode: 'full',
      fixturesDir: fixtures(root),
      env: process.env,
      isolate: false,
    });
    expect(report.results[0]!.status).toBe('error');
    expect(report.results[0]!.errors[0]).toContain('judge failed: judge process exited 1');
    expect(report.summary.passed).toBe(0);
  });

  it('a provider crash or timeout is an error, not a true negative', async () => {
    const root = tmpdir();
    const crashing: EvalDriver = {
      ...activates,
      async run() {
        throw new Error('provider timed out after 300s');
      },
    };
    const report = await runEvals({ skillDirs: [skill(root)], driver: crashing, fixturesDir: fixtures(root), env: process.env, isolate: false });
    expect(report.results[0]!.status).toBe('error');
    expect(report.summary.truePositive + report.summary.falseNegative).toBe(0);
  });

  it('a missing fixture fails that scenario instead of silently using another repository', async () => {
    const root = tmpdir();
    const report = await runEvals({
      skillDirs: [skill(root, { positive: 'fixture: does-not-exist\n' })],
      driver: activates,
      fixturesDir: fixtures(root),
      env: process.env,
      isolate: false,
    });
    expect(report.results[0]!.status).toBe('error');
    expect(report.results[0]!.errors.join('\n')).toContain('does-not-exist');
  });

  it('setup scripts of untrusted skills do not run without permission', async () => {
    const root = tmpdir();
    const marker = path.join(root, 'SETUP_RAN');
    const report = await runEvals({
      skillDirs: [skill(root, { positive: `setup: touch ${marker}\n` })],
      driver: activates,
      fixturesDir: fixtures(root),
      env: process.env,
      isolate: false,
      setupAllowed: () => false,
    });
    expect(fs.existsSync(marker)).toBe(false);
    expect(report.results[0]!.status).toBe('error');
    expect(report.results[0]!.errors.join('\n')).toContain('--allow-setup');
  });
});

describe('eval isolation', () => {
  it('builds a throwaway HOME with only provider login files, filtered, and writes refreshed tokens back', async () => {
    const realHome = tmpdir();
    fs.mkdirSync(path.join(realHome, '.claude', 'skills', 'personal-skill'), { recursive: true });
    fs.writeFileSync(path.join(realHome, '.claude', 'skills', 'personal-skill', 'SKILL.md'), '---\nname: personal-skill\ndescription: x\n---\n');
    fs.writeFileSync(path.join(realHome, '.claude', '.credentials.json'), '{"token":"old"}');
    // With CLAUDE_CONFIG_DIR, Claude keeps .claude.json inside that directory.
    fs.writeFileSync(path.join(realHome, '.claude', '.claude.json'), JSON.stringify({ oauthAccount: { id: 1 }, projects: { secret: true }, mcpServers: { x: {} } }));
    fs.mkdirSync(path.join(realHome, '.codex'), { recursive: true });
    fs.writeFileSync(path.join(realHome, '.codex', 'config.toml'), 'approval_policy = "never"\n');

    const iso = await createIsolatedEnv({ env: { HOME: realHome, PATH: process.env.PATH, CLAUDE_CONFIG_DIR: path.join(realHome, '.claude') }, providers: ['claude', 'codex'], realHome });
    try {
      expect(iso.env.HOME).toBe(iso.home);
      expect(iso.env.CLAUDE_CONFIG_DIR).toBeUndefined();
      expect(fs.existsSync(path.join(iso.home, '.claude', 'skills'))).toBe(false);
      expect(fs.existsSync(path.join(iso.home, '.codex', 'config.toml'))).toBe(false);
      expect(JSON.parse(fs.readFileSync(path.join(iso.home, '.claude.json'), 'utf8'))).toEqual({ oauthAccount: { id: 1 } });
      expect(iso.credentials.map((c) => c.file).sort()).toEqual(['.claude.json', '.claude/.credentials.json']);
      if (process.platform !== 'win32') expect(fs.statSync(path.join(iso.home, '.claude', '.credentials.json')).mode & 0o777).toBe(0o600);
      // The provider refreshed its token during the run.
      fs.writeFileSync(path.join(iso.home, '.claude', '.credentials.json'), '{"token":"new"}');
    } finally {
      await iso.dispose();
    }
    expect(fs.readFileSync(path.join(realHome, '.claude', '.credentials.json'), 'utf8')).toBe('{"token":"new"}');
    expect(fs.existsSync(iso.home)).toBe(false);
    expect([...(await personalSkillNames(realHome, { HOME: realHome }))]).toContain('personal-skill');
  });
});

describe('cross-provider reports', () => {
  it('compares the same scenarios side by side', () => {
    const report = (provider: string, status: 'passed' | 'failed'): EvalReport =>
      ({
        provider,
        questionPreference: null,
        summary: { precision: 1, recall: status === 'passed' ? 1 : 0, f1: null, passed: status === 'passed' ? 1 : 0, failed: status === 'failed' ? 1 : 0, errored: 0 },
        results: [{ skill: 'demo', scenario: 'positive', kind: 'standard', status, passRate: { rate: status === 'passed' ? 1 : 0, ci95: null } }],
      }) as unknown as EvalReport;
    expect(compareProviders([report('claude', 'passed')])).toBeNull();
    const cmp = compareProviders([report('claude', 'passed'), report('codex', 'failed')])!;
    expect(cmp.columns).toEqual(['claude', 'codex']);
    expect(cmp.scenarios[0]!.results).toMatchObject({ claude: { status: 'passed' }, codex: { status: 'failed' } });
    expect(cmp.summary.codex!.recall).toBe(0);
  });
});

describe('scenario stand-in commands', () => {
  it('puts scenario bin/ commands first on PATH for setup and the agent, outside the repository', async () => {
    const root = tmpdir();
    const seen: Array<{ path: string; inRepo: boolean }> = [];
    const driver: EvalDriver = {
      ...activates,
      async run(input) {
        const { execFileSync } = await import('node:child_process');
        const out = execFileSync('gh', ['pr', 'view'], { env: input.env as NodeJS.ProcessEnv }).toString();
        seen.push({ path: out.trim(), inRepo: fs.readdirSync(input.cwd).includes('bin') });
        return transcript({ toolCalls: [{ name: 'Skill', input: JSON.stringify({ skill: input.skillId }) }] });
      },
    };
    const report = await runEvals({
      skillDirs: [skill(root, { positive: 'setup: gh pr view > from-setup.txt\nbin:\n  gh: echo "fake gh $*"\n' })],
      driver,
      fixturesDir: fixtures(root),
      env: process.env,
      isolate: false,
      keep: true,
    });
    expect(seen).toEqual([{ path: 'fake gh pr view', inRepo: false }]);
    const sandbox = report.results[0]!.runs[0]!.sandbox!;
    expect(fs.readFileSync(path.join(sandbox, 'from-setup.txt'), 'utf8').trim()).toBe('fake gh pr view');
    fs.rmSync(path.dirname(sandbox), { recursive: true, force: true });
  });

  it('refuses stand-in commands for untrusted skills without --allow-setup', async () => {
    const root = tmpdir();
    const report = await runEvals({
      skillDirs: [skill(root, { positive: 'bin:\n  gh: echo hi\n' })],
      driver: activates,
      fixturesDir: fixtures(root),
      env: process.env,
      isolate: false,
      setupAllowed: () => false,
    });
    expect(report.results[0]!.errors.join('\n')).toContain('bin/ commands not installed');
  });
});
