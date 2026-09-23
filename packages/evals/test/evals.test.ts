import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
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
  runEvals,
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
    expect(dirs.map((d) => path.basename(d))).toEqual([
      'babysitting-pr',
      'checking-blast-radius',
      'diagnosing-bugs',
      'filing-pr',
      'interviewing-requirements',
      'resolving-conflicts',
      'reviewing-changes',
      'simplifying-explanations',
      'verifying-changes',
    ]);
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
    expect(report.summary.scenarios).toBe(4);
    expect(report.summary.truePositive + report.summary.falseNegative).toBe(2);
    expect(report.results.every((r) => r.runs.length === 1)).toBe(true);
    expect(report.summary.precision).not.toBeNull();
  });
});
