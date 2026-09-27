import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  claudeArgs,
  claudeDriver,
  codexDriver,
  geminiDriver,
  lintSkill,
  listCatalog,
  opencodeDriver,
  parseClaudeStream,
  parseCodexStream,
  parseGeminiStream,
  parseJudgeOutput,
  parseOpenCodeStream,
  collectChanges,
  summarizeTranscript,
  compareQuestionPreferences,
  expectedAsk,
  parseInteractionJudgeOutput,
  runEvals,
  summarizeInteraction,
  usedStructuredQuestion,
  type EvalReport,
  type InteractionAssessment,
  type Judge,
  type RunResult,
  type EvalDriver,
  type Transcript,
} from '@agileflow/evals';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const tmp: string[] = [];
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const lines = (...events: unknown[]) => events.map((e) => JSON.stringify(e)).join('\n');
const base = (over: Partial<Transcript>): Transcript => ({
  provider: 'x',
  raw: '',
  toolCalls: [],
  userMessages: [],
  finalText: '',
  visibleSkills: null,
  exitCode: 0,
  durationMs: 1,
  ...over,
});

describe('official catalog release gate', () => {
  it('every official skill passes: 3+ evals, a negative trigger, completion, small body, portable frontmatter', async () => {
    const dirs = await listCatalog(path.join(REPO, 'skills'));
    // The catalog grows; these must stay in it.
    expect(dirs.map((d) => path.basename(d))).toEqual(expect.arrayContaining([
      'babysitting-pr',
      'checking-blast-radius',
      'creating-epics',
      'diagnosing-bugs',
      'filing-pr',
      'interviewing-requirements',
      'resolving-conflicts',
      'recording-decisions',
      'reviewing-changes',
      'reviewing-story',
      'simplifying-explanations',
      'verifying-changes',
      'working-story',
      'writing-stories',
    ]));
    for (const dir of dirs) {
      const result = await lintSkill(dir, { official: true });
      expect(result.issues.filter((i) => i.level === 'error'), result.skill).toEqual([]);
      expect(result.scenarios).toBeGreaterThanOrEqual(3);
      expect(result.negatives).toBeGreaterThanOrEqual(1);
      expect(result.lines).toBeLessThanOrEqual(200);
    }
  });

  it('flags skills that miss the gate', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-lint-'));
    tmp.push(dir);
    const skill = path.join(dir, 'weak');
    fs.mkdirSync(path.join(skill, 'evals'), { recursive: true });
    fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: weak\ndescription: Helps with GitHub.\nversion: 2\n---\nDo stuff.\n');
    fs.writeFileSync(path.join(skill, 'evals', 'one.yaml'), 'name: one\nskill: weak\nprompt: hi\nassert:\n  shouldActivate: true\n');
    const result = await lintSkill(skill, { official: true });
    const messages = result.issues.map((i) => i.message).join('\n');
    expect(result.passed).toBe(false);
    expect(messages).toContain('say when to activate');
    expect(messages).toContain('Done when');
    expect(messages).toContain('at least 3 eval scenarios');
    expect(messages).toContain('negative-trigger');
    expect(messages).toContain('found: version');
    expect(messages).toContain('agileflow.skill.yaml is missing');
  });
});

describe('transcript parsing', () => {
  it('Claude: visible skills from init, Skill tool calls, and explicit expansion', () => {
    const t = parseClaudeStream(
      lines(
        { type: 'system', subtype: 'init', skills: ['diagnosing-bugs', 'filing-pr'] },
        { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'diagnosing-bugs' } }] } },
        { type: 'result', result: 'done' },
      ),
    );
    expect(t.visibleSkills).toEqual(['diagnosing-bugs', 'filing-pr']);
    expect(claudeDriver.activated(base(t), 'diagnosing-bugs')).toBe(true);
    expect(claudeDriver.activated(base(t), 'filing-pr')).toBe(false);
    const explicit = parseClaudeStream(lines({ type: 'user', message: { content: '<command-name>/interviewing-requirements</command-name>' } }));
    expect(claudeDriver.activated(base(explicit), 'interviewing-requirements')).toBe(true);
    const slash = parseClaudeStream(lines({ type: 'system', subtype: 'init', skills: ['x'], slash_commands: ['simplifying-explanations'] }));
    expect(claudeDriver.activated(base({ ...slash, explicitSkill: 'simplifying-explanations' }), 'simplifying-explanations')).toBe(true);
    expect(claudeDriver.activated(base({ ...slash, explicitSkill: 'other' }), 'other')).toBe(false);
    const outOfTurns = { ...slash, explicitSkill: 'simplifying-explanations', exitCode: 1 };
    expect(claudeDriver.activated(base({ ...outOfTurns, resultSubtype: 'error_max_turns' }), 'simplifying-explanations')).toBe(true);
    expect(claudeDriver.activated(base(outOfTurns), 'simplifying-explanations')).toBe(false);
  });

  it('Claude: full runs pre-approve scenario stand-ins and local git writes; activation stays read-only', () => {
    const input = { cwd: '/x', prompt: 'p', skillId: 's', invocation: 'implicit' as const, timeoutMs: 1, env: {} };
    const full = claudeArgs({ ...input, mode: 'full', sandboxCommands: ['gh'] });
    expect(full).toContain('Bash(gh:*)');
    expect(full).toContain('Bash(git add:*)');
    expect(full).toContain('Bash(npm install:*)');
    const activation = claudeArgs({ ...input, mode: 'activation', sandboxCommands: ['gh'] });
    expect(activation).not.toContain('Bash(gh:*)');
    expect(activation).toEqual(expect.arrayContaining(['--disallowedTools', 'Edit', 'Write']));
    expect(claudeArgs({ ...input, mode: 'full', invocation: 'explicit' })[1]).toBe('/s p');
  });

  it('Codex: reading SKILL.md counts as activation', () => {
    const t = parseCodexStream(
      lines(
        { type: 'item.completed', item: { type: 'command_execution', command: "bash -lc 'cat .agents/skills/filing-pr/SKILL.md'" } },
        { type: 'item.completed', item: { type: 'agent_message', text: 'ok' } },
      ),
    );
    expect(codexDriver.activated(base(t), 'filing-pr')).toBe(true);
    expect(codexDriver.activated(base(t), 'babysitting-pr')).toBe(false);
    expect(t.finalText).toBe('ok');
  });

  it('Gemini and OpenCode skill tools', () => {
    const g = parseGeminiStream(lines({ type: 'tool_use', tool_name: 'activate_skill', parameters: { name: 'filing-pr' } }));
    expect(geminiDriver.activated(base(g), 'filing-pr')).toBe(true);
    const o = parseOpenCodeStream(lines({ type: 'tool_use', part: { type: 'tool', tool: 'skill', state: { input: { name: 'filing-pr' } } } }));
    expect(opencodeDriver.activated(base(o), 'filing-pr')).toBe(true);
  });

  it('parses judge output', () => {
    const items = parseJudgeOutput('Sure: {"items":[{"criterion":"a","pass":true,"reason":"r"},{"criterion":"b","pass":false,"reason":"no"}]}', ['a', 'b']);
    expect(items.map((i) => i.pass)).toEqual([true, false]);
    expect(() => parseJudgeOutput('no json', ['a'])).toThrow();
  });
});

describe('runner', () => {
  it('installs the catalog into a sandbox and scores activation precision/recall', async () => {
    const seen: string[] = [];
    const fake: EvalDriver = {
      id: 'fake',
      displayName: 'Fake',
      executable: 'true',
      available: async () => true,
      explicitPrompt: (id, p) => `/${id} ${p}`,
      async run(input) {
        seen.push(fs.readdirSync(path.join(input.cwd, '.agents/skills')).join(','));
        // Pretend the model activates diagnosing-bugs for anything mentioning "fix".
        const hit = /fix|broken|failing|500/i.test(input.prompt);
        return base({ toolCalls: hit ? [{ name: 'Skill', input: JSON.stringify({ skill: input.skillId }) }] : [] });
      },
      activated: (t, id) => t.toolCalls.some((c) => c.input.includes(`"${id}"`)),
    };
    const dir = path.join(REPO, 'skills', 'diagnosing-bugs');
    const report = await runEvals({
      skillDirs: [dir],
      catalogDirs: [dir, path.join(REPO, 'skills', 'filing-pr')],
      driver: fake,
      fixturesDir: path.join(REPO, 'fixtures'),
      env: process.env,
    });
    expect(seen[0]).toBe('diagnosing-bugs,filing-pr');
    const scenarioFiles = fs.readdirSync(path.join(dir, 'evals')).filter((f) => f.endsWith('.yaml'));
    expect(report.summary.scenarios).toBe(scenarioFiles.length);
    // Precision/recall count implicit trigger scenarios; the explicit one is a load check.
    expect(report.summary.truePositive + report.summary.falseNegative).toBe(2);
    expect(report.skills[0]!.explicit.runs).toBe(1);
    expect(report.results.every((r) => r.runs.length === 1)).toBe(true);
    expect(report.summary.precision).not.toBeNull();
  });
});

describe('question preference in evals', () => {
  it('detects whether the agent asked the user', async () => {
    const { askedUser } = await import('@agileflow/evals');
    expect(askedUser(base({ toolCalls: [{ name: 'AskUserQuestion', input: '{}' }] }))).toBe(true);
    expect(askedUser(base({ finalText: 'I found the cause.\n\nShould I key the limiter by email, or by email and IP?' }))).toBe(true);
    expect(askedUser(base({ finalText: 'Fixed: the limiter now keys by email and IP. Tests pass.' }))).toBe(false);
    expect(askedUser(base({ finalText: 'Why did it fail? The key was the IP.\n\nFixed and verified.' }))).toBe(false);
    expect(askedUser(base({ finalText: 'Options:\n1. key by email\n2. key by email and IP\n\nWhich direction do you want? I would lean toward 2.' }))).toBe(true);
    expect(askedUser(base({ finalText: 'I need your approval to run the tests. Should I proceed?' }))).toBe(false);
  });

  it('installs the configured preference into every sandbox', async () => {
    const seen: Record<string, string> = {};
    const fake: EvalDriver = {
      id: 'fake',
      displayName: 'Fake',
      executable: 'true',
      available: async () => true,
      explicitPrompt: (id, p) => `/${id} ${p}`,
      async run(input) {
        const text = fs.readFileSync(path.join(input.cwd, '.agents/skills/diagnosing-bugs/SKILL.md'), 'utf8');
        return base({ finalText: /Question preference for this project: when multiple reasonable choices/.test(text) ? 'Which approach should I take?' : 'Done.' });
      },
      activated: () => true,
    };
    const dir = path.join(REPO, 'skills', 'diagnosing-bugs');
    for (const pref of ['provider-default', 'prefer', 'minimize'] as const) {
      const report = await runEvals({
        skillDirs: [dir],
        driver: fake,
        fixturesDir: path.join(REPO, 'fixtures'),
        env: process.env,
        questionPreference: pref,
        filter: (s) => s.name === 'shared-office-rate-limit',
      });
      seen[pref] = `${report.questionPreference}:${report.results[0]!.askedRate}`;
    }
    expect(seen).toEqual({ 'provider-default': 'provider-default:0', prefer: 'prefer:1', minimize: 'minimize:0' });
  });
});

describe('interaction evals (decision boundary, not question count)', () => {
  const assessment = (over: Partial<InteractionAssessment>): InteractionAssessment => ({
    askedUser: false,
    questionWasMaterial: null,
    questionWasRepositoryAnswerable: null,
    proceededWithAssumption: false,
    assumptionWasReasonable: null,
    taskSucceeded: null,
    reason: '',
    ...over,
  });
  const run = (asked: boolean, interaction: InteractionAssessment | null = null): RunResult => ({
    status: 'ok',
    error: null,
    activated: true,
    otherActivations: [],
    askedUser: asked,
    askedSource: interaction ? 'judge' : 'heuristic',
    usedStructuredQuestion: false,
    interaction,
    transcript: base({}),
    rubric: null,
    violations: [],
    fileChanges: null,
    foreignSkills: [],
    passed: true,
    sandbox: null,
  });

  it('derives the expected asking behavior from the ambiguity class', () => {
    for (const pref of ['provider-default', 'prefer', 'minimize'] as const) {
      expect(expectedAsk('repository-answerable', pref)).toBe('no-ask');
      expect(expectedAsk('choice', pref)).toBeNull();
    }
    expect(expectedAsk('missing-information', 'prefer')).toBe('ask-or-defer');
    expect(expectedAsk('missing-information', 'minimize')).toBe('ask-or-defer'); // minimize is not reckless
    expect(expectedAsk('missing-information', 'provider-default')).toBeNull();
  });

  it('counts unwarranted questions and unreasonable assumptions against a run set', () => {
    // Asking about something the repository answers fails even though a question was asked.
    const answerable = summarizeInteraction(
      'repository-answerable',
      'prefer',
      [run(false, assessment({ taskSucceeded: true })), run(true, assessment({ questionWasMaterial: true, questionWasRepositoryAnswerable: true }))],
      0.5,
    );
    expect(answerable).toMatchObject({ asked: 1, unwarranted: 1, completed: 1, succeeded: 1, pass: false });

    // Missing information: every run must ask under minimize; guessing is a failure.
    const guessed = summarizeInteraction(
      'missing-information',
      'minimize',
      [run(true, assessment({ questionWasMaterial: true, questionWasRepositoryAnswerable: false })), run(false, assessment({ proceededWithAssumption: true, assumptionWasReasonable: false, taskSucceeded: false }))],
      1,
    );
    expect(guessed).toMatchObject({ expectation: 'ask-or-defer', asked: 1, unwarranted: 0, proceededWithAssumption: 1, unreasonableAssumptions: 1, pass: false });

    const good = summarizeInteraction(
      'choice',
      'minimize',
      [run(false, assessment({ proceededWithAssumption: true, assumptionWasReasonable: true, taskSucceeded: true }))],
      1,
    );
    expect(good).toMatchObject({ expectation: null, pass: true, succeeded: 1 });

    // provider-default is the unshaped baseline: measured, never a failure.
    const baseline = summarizeInteraction('missing-information', 'provider-default', [run(false, assessment({ proceededWithAssumption: true, assumptionWasReasonable: false }))], 1);
    expect(baseline).toMatchObject({ unreasonableAssumptions: 1, pass: true });

    // Leaving the missing fact explicitly undecided (judged a success) is not a guess.
    const deferred = summarizeInteraction('missing-information', 'minimize', [run(false, assessment({ taskSucceeded: true }))], 1);
    expect(deferred).toMatchObject({ asked: 0, pass: true });
  });

  it('checks the ordering of choice scenarios across preferences', () => {
    const report = (pref: 'provider-default' | 'prefer' | 'minimize', askedRate: number): EvalReport =>
      ({
        provider: 'fake',
        mode: 'full',
        questionPreference: pref,
        results: [{ skill: 's', scenario: 'c', askedRate, interaction: { ambiguity: 'choice' } }],
      }) as unknown as EvalReport;
    const [ok] = compareQuestionPreferences([report('prefer', 0.5), report('provider-default', 0.25), report('minimize', 0)]);
    expect(ok).toMatchObject({ ordered: true, askedRate: { prefer: 0.5, 'provider-default': 0.25, minimize: 0 } });
    const [bad] = compareQuestionPreferences([report('prefer', 0), report('provider-default', 0.25), report('minimize', 0.5)]);
    expect(bad!.ordered).toBe(false);
    const [partial] = compareQuestionPreferences([report('prefer', 1)]);
    expect(partial!.ordered).toBeNull();
  });

  it('parses the interaction judge and detects structured questions', () => {
    const a = parseInteractionJudgeOutput(
      'ok {"askedUser":true,"questionWasMaterial":true,"questionWasRepositoryAnswerable":false,"proceededWithAssumption":false,"assumptionWasReasonable":null,"taskSucceeded":null,"reason":"asked about the period"}',
    );
    expect(a).toMatchObject({ askedUser: true, questionWasMaterial: true, questionWasRepositoryAnswerable: false, taskSucceeded: null });
    expect(() => parseInteractionJudgeOutput('nope')).toThrow();
    expect(usedStructuredQuestion(base({ toolCalls: [{ name: 'request_user_input', input: '{}' }] }))).toBe(true);
    expect(usedStructuredQuestion(base({ finalText: 'Which one?' }))).toBe(false);
  });

  it('the synthetic interaction skill passes lint and runs end to end with a judge', async () => {
    const dir = path.join(REPO, 'fixtures', 'skills', 'interaction-test');
    expect((await lintSkill(dir)).passed).toBe(true);
    const fake: EvalDriver = {
      id: 'fake',
      displayName: 'Fake',
      executable: 'true',
      available: async () => true,
      explicitPrompt: (id, p) => `/${id} ${p}`,
      async run(input) {
        // The fixture repository is in the sandbox with the overlay rendered into the skill.
        expect(fs.existsSync(path.join(input.cwd, 'src/uploads/retry.js'))).toBe(true);
        const skill = fs.readFileSync(path.join(input.cwd, '.agents/skills/interaction-test/SKILL.md'), 'utf8');
        expect(skill).toContain('State consequential assumptions');
        return base({ finalText: /retention/.test(input.prompt) ? 'How long is the retention period?' : 'Done; tests pass.' });
      },
      activated: () => true,
    };
    const judge: Judge = {
      id: 'fake-judge',
      grade: async () => ({ judge: 'fake', items: [], score: 1, ungraded: [] }),
      assessInteraction: async (prompt) =>
        /retention/.test(prompt)
          ? assessment({ askedUser: true, questionWasMaterial: true, questionWasRepositoryAnswerable: false })
          : assessment({ taskSucceeded: true }),
    };
    const report = await runEvals({
      skillDirs: [dir],
      driver: fake,
      judge,
      mode: 'full',
      fixturesDir: path.join(REPO, 'fixtures'),
      env: process.env,
      questionPreference: 'minimize',
      filter: (s) => s.assert.shouldActivate,
    });
    const byName = Object.fromEntries(report.results.map((r) => [r.scenario, r.interaction]));
    expect(byName['missing-retention-period']).toMatchObject({ expectation: 'ask-or-defer', asked: 1, pass: true });
    expect(byName['repository-answerable-upload-retry']).toMatchObject({ expectation: 'no-ask', asked: 0, succeeded: 1, pass: true });
    expect(byName['choice-shared-office-login']).toMatchObject({ expectation: null, judged: 1 });
    expect(report.summary.failed).toBe(0);
  });
});

describe('judge evidence', () => {
  it('collects the final state of what a run changed, including new files', async () => {
    const { execFileSync } = await import('node:child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-changes-'));
    tmp.push(dir);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir });
    git('init', '-q');
    fs.writeFileSync(path.join(dir, 'a.md'), 'one\n');
    git('add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base');
    expect(await collectChanges(dir)).toBe('(no changes)');
    fs.writeFileSync(path.join(dir, 'a.md'), 'two\n');
    fs.mkdirSync(path.join(dir, 'docs'));
    fs.writeFileSync(path.join(dir, 'docs', 'new.md'), '## Non-goals\n\n- SSO\n');
    const changes = await collectChanges(dir);
    expect(changes).toContain(' M a.md');
    expect(changes).toContain('+two');
    expect(changes).toContain('--- new file: docs/new.md\n## Non-goals\n\n- SSO');
    expect(summarizeTranscript(base({ changes }))).toContain('Files changed in the repository (final state):');
  });
});
