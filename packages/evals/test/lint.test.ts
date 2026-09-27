import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  catalogSkills,
  descriptionSimilarity,
  discoverSkillDirs,
  lintAllowedTools,
  lintSkill,
  listCatalog,
  neighborSkills,
  splitAllowedTools,
} from '@agileflow/evals';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const tmp: string[] = [];
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-lint-'));
  tmp.push(dir);
  return dir;
}

function writeSkill(root: string, id: string, description: string, evals: Record<string, string> = {}, extraFrontmatter = ''): string {
  const dir = path.join(root, id);
  fs.mkdirSync(path.join(dir, 'evals'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${id}\ndescription: ${description}\n${extraFrontmatter}---\n\n# ${id}\n\nSteps.\n\n## Done when\n\nDone.\n`,
  );
  for (const [name, body] of Object.entries(evals)) fs.writeFileSync(path.join(dir, 'evals', `${name}.yaml`), `name: ${name}\nskill: ${id}\n${body}`);
  return dir;
}

const positive = 'prompt: do it\nassert:\n  shouldActivate: true\nrubric:\n  - does it\n';
const negative = (neighbor?: string) => `prompt: other\nassert:\n  shouldActivate: false\n${neighbor ? `neighbor: ${neighbor}\n` : ''}`;

describe('lint for skills outside the official catalog', () => {
  it('lints a third-party skill without agileflow.skill.yaml or evals: warnings, no crash, passes', async () => {
    const root = tempDir();
    const dir = path.join(root, 'my-skill');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: my-skill\ndescription: Formats changelogs.\nallowed-tools: Read Bash(git log:*)\n---\nFormat it.\n');
    const result = await lintSkill(dir);
    expect(result.passed).toBe(true);
    const warnings = result.issues.filter((i) => i.level === 'warning').map((i) => i.message).join('\n');
    expect(warnings).toContain('agileflow.skill.yaml is missing');
    expect(warnings).toContain('needs at least 3 eval scenarios');
    expect(warnings).toContain('Done when');
    expect(warnings).toContain('say when to activate');
    expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('the same gaps are errors for official skills', async () => {
    const root = tempDir();
    const dir = writeSkill(root, 'weak', 'Formats changelogs for releases in this repository.');
    const result = await lintSkill(dir, { official: true });
    expect(result.passed).toBe(false);
    expect(result.issues.filter((i) => i.level === 'error').map((i) => i.message)).toEqual(
      expect.arrayContaining(['agileflow.skill.yaml is missing', 'needs at least 3 eval scenarios in evals/ (has 0)']),
    );
  });

  it('still reports broken scenario files and a missing SKILL.md as errors', async () => {
    const root = tempDir();
    const dir = writeSkill(root, 'broken', 'Use when testing lint.', { bad: 'prompt: [unclosed\n' });
    expect((await lintSkill(dir)).passed).toBe(false);
    const empty = path.join(root, 'empty');
    fs.mkdirSync(empty);
    const res = await lintSkill(empty);
    expect(res.issues.map((i) => i.message)).toContain('SKILL.md is missing');
  });

  it('discovers skills in common repository layouts', async () => {
    const root = tempDir();
    writeSkill(path.join(root, 'skills'), 'alpha', 'Use when alpha.');
    writeSkill(path.join(root, '.claude', 'skills'), 'beta', 'Use when beta.');
    writeSkill(root, 'gamma', 'Use when gamma.');
    expect((await discoverSkillDirs(root)).map((d) => path.relative(root, d))).toEqual([
      path.join('.claude', 'skills', 'beta'),
      'gamma',
      path.join('skills', 'alpha'),
    ]);
    expect(await discoverSkillDirs(path.join(root, 'gamma'))).toEqual([path.join(root, 'gamma')]);
  });
});

describe('allowed-tools', () => {
  it('splits entries on whitespace and commas outside parentheses', () => {
    expect(splitAllowedTools('Read Bash(git status:*), Bash(npm test:*)')).toEqual(['Read', 'Bash(git status:*)', 'Bash(npm test:*)']);
  });

  it('accepts strings and lists, flags bad types and malformed entries', () => {
    expect(lintAllowedTools('Read Grep mcp__github__get_issue').filter((i) => i.level !== 'info')).toEqual([]);
    expect(lintAllowedTools(['Read', 'Bash(git diff:*)']).filter((i) => i.level !== 'info')).toEqual([]);
    expect(lintAllowedTools({ Read: true })[0]).toMatchObject({ level: 'error' });
    expect(lintAllowedTools(['Read', 3])[0]).toMatchObject({ level: 'error' });
    const bad = lintAllowedTools('Read Bash(git status:* 9lives');
    expect(bad.filter((i) => i.level === 'warning').length).toBeGreaterThan(0);
    expect(lintAllowedTools('').some((i) => i.message.includes('empty'))).toBe(true);
  });

  it('is checked in lint and stays non-portable for official skills', async () => {
    const root = tempDir();
    const dir = writeSkill(root, 'tools', 'Use when checking tools in lint tests.', {}, 'allowed-tools: 42\n');
    expect((await lintSkill(dir)).issues.some((i) => i.level === 'error' && i.message.startsWith('allowed-tools'))).toBe(true);
  });
});

describe('trigger conflicts with neighboring skills', () => {
  const catalog = [
    { id: 'filing-pr', description: 'Open a pull request for the current branch. Use when the user asks to open or submit a pull request.' },
    { id: 'babysitting-pr', description: 'Monitor a pull request through CI until checks are green. Use when the user asks to watch a pull request.' },
    { id: 'writing-poems', description: 'Compose rhyming verse about seasons. Use when asked for poetry.' },
  ];

  it('finds neighbors by description similarity', () => {
    expect(descriptionSimilarity(catalog[0]!.description, catalog[1]!.description)).toBeGreaterThan(descriptionSimilarity(catalog[0]!.description, catalog[2]!.description));
    expect(neighborSkills('filing-pr', catalog)).toEqual(['babysitting-pr']);
    expect(neighborSkills('writing-poems', catalog)).toEqual([]);
  });

  it('warns until a negative scenario covers a neighbor, and validates neighbor fields', async () => {
    const root = tempDir();
    const dir = writeSkill(root, 'filing-pr', catalog[0]!.description, { a: positive, b: negative(), c: negative() });
    const uncovered = await lintSkill(dir, { catalog });
    expect(uncovered.issues.find((i) => i.message.includes('neighboring skill'))).toMatchObject({ level: 'warning' });
    expect(uncovered.issues.find((i) => i.message.includes('neighboring skill'))!.message).toContain('babysitting-pr');

    fs.writeFileSync(path.join(dir, 'evals', 'c.yaml'), `name: c\nskill: filing-pr\n${negative('babysitting-pr')}`);
    const covered = await lintSkill(dir, { catalog });
    expect(covered.issues.some((i) => i.message.includes('neighboring skill'))).toBe(false);

    fs.writeFileSync(path.join(dir, 'evals', 'b.yaml'), `name: b\nskill: filing-pr\n${negative('no-such-skill')}`);
    fs.writeFileSync(path.join(dir, 'evals', 'a.yaml'), `name: a\nskill: filing-pr\n${positive}neighbor: babysitting-pr\n`);
    const messages = (await lintSkill(dir, { catalog })).issues.map((i) => i.message).join('\n');
    expect(messages).toContain('neighbor "no-such-skill" is not in the catalog');
    expect(messages).toContain('neighbor only applies to negative scenarios');
  });

  it('reads catalog descriptions from skill directories', async () => {
    const dirs = await listCatalog(path.join(REPO, 'skills'));
    const skills = await catalogSkills(dirs);
    expect(skills.find((s) => s.id === 'filing-pr')!.description).toMatch(/pull request/);
    expect(neighborSkills('filing-pr', skills)).toContain('babysitting-pr');
  });
});

describe('scenario checks', () => {
  it('requires forbid rules on adversarial scenarios and existing fixtures', async () => {
    const root = tempDir();
    const fixtures = path.join(root, 'fixtures');
    fs.mkdirSync(path.join(fixtures, 'present'), { recursive: true });
    const dir = writeSkill(path.join(root, 'skills'), 'adv', 'Use when testing adversarial lint.', {
      a: `${positive}kind: adversarial\n`,
      b: `${negative()}fixture: missing\n`,
      c: `${negative()}fixture: present\n`,
    });
    const messages = (await lintSkill(dir, { fixturesDir: fixtures })).issues.filter((i) => i.level === 'error').map((i) => i.message);
    expect(messages).toEqual([
      'eval a: adversarial scenarios need forbid rules (commands, files, or output)',
      `eval b: fixture "missing" not found in ${fixtures}`,
    ]);
  });

  it('the adversarial fixture skill passes lint against the repository fixtures', async () => {
    const dir = path.join(REPO, 'fixtures', 'adversarial-injection', 'skills', 'injection-safety');
    const result = await lintSkill(dir, { fixturesDir: path.join(REPO, 'fixtures') });
    expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(result.scenarios).toBe(3);
  });
});
