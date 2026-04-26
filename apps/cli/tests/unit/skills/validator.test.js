/**
 * Unit tests for the skill validator.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import validatorModule from '../../../src/runtime/skills/validator.js';

const {
  validateSkill,
  validateSkillsAtRoot,
  detectKeywordCollisions,
  loadSkill,
  splitFrontmatter,
  hasErrors,
  MAX_BODY_LINES,
} = validatorModule;

/**
 * Build a SKILL.md file at `<dir>/SKILL.md` with the given frontmatter
 * and body. Used by every test below.
 */
function writeSkill(dir, fm, body = '# Body\n\nContent.\n') {
  fs.mkdirSync(dir, { recursive: true });
  const fmText = Object.entries(fm)
    .map(([k, v]) =>
      typeof v === 'object'
        ? `${k}: ${JSON.stringify(v)}`
        : `${k}: ${v}`,
    )
    .join('\n');
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `---\n${fmText}\n---\n${body}`,
  );
}

const MIN_FM = {
  name: 'agileflow-test',
  version: '1.0.0',
  category: 'agileflow/core',
  description: 'Use when running validator unit tests against a synthetic skill.',
  triggers: { keywords: ['test'], priority: 50 },
};

describe('splitFrontmatter', () => {
  it('extracts frontmatter and body', () => {
    const r = splitFrontmatter('---\nname: x\n---\n# Body\n');
    expect(r.frontmatterText).toBe('name: x');
    expect(r.body).toBe('# Body\n');
  });

  it('returns null frontmatter when none present', () => {
    const r = splitFrontmatter('# Just a body\n');
    expect(r.frontmatterText).toBeNull();
    expect(r.body).toBe('# Just a body\n');
  });

  it('handles Windows CRLF line endings', () => {
    const r = splitFrontmatter('---\r\nname: x\r\n---\r\n# Body\r\n');
    expect(r.frontmatterText).toBe('name: x');
    expect(r.body).toBe('# Body\r\n');
  });

  it('strips a UTF-8 BOM prefix before matching', () => {
    const r = splitFrontmatter('\uFEFF---\nname: x\n---\n# Body\n');
    expect(r.frontmatterText).toBe('name: x');
    expect(r.body).toBe('# Body\n');
  });

  it('handles BOM + CRLF together', () => {
    const r = splitFrontmatter('\uFEFF---\r\nname: x\r\n---\r\n# Body\r\n');
    expect(r.frontmatterText).toBe('name: x');
    expect(r.body).toBe('# Body\r\n');
  });
});

describe('validateSkill (per-skill)', () => {
  /** @type {string} */
  let scratch;
  beforeEach(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-skv-')); });
  afterEach(() => { fs.rmSync(scratch, { recursive: true, force: true }); });

  it('passes a fully-valid minimal skill', async () => {
    writeSkill(path.join(scratch, 'agileflow-test'), MIN_FM);
    const skill = await loadSkill(path.join(scratch, 'agileflow-test', 'SKILL.md'));
    expect(await validateSkill(skill)).toEqual([]);
  });

  it('flags missing required fields', async () => {
    writeSkill(path.join(scratch, 'agileflow-test'), {
      name: 'agileflow-test',
      // version, category, description, triggers all missing
    });
    const skill = await loadSkill(path.join(scratch, 'agileflow-test', 'SKILL.md'));
    const issues = await validateSkill(skill);
    const messages = issues.map((i) => i.message).join('\n');
    expect(messages).toMatch(/missing required.*"version"/);
    expect(messages).toMatch(/missing required.*"category"/);
    expect(messages).toMatch(/missing required.*"description"/);
    expect(messages).toMatch(/missing required.*"triggers"/);
  });

  it('rejects descriptions that do not start with "Use when"', async () => {
    writeSkill(path.join(scratch, 'agileflow-test'), {
      ...MIN_FM,
      description: 'A skill that does various things.',
    });
    const skill = await loadSkill(path.join(scratch, 'agileflow-test', 'SKILL.md'));
    const issues = await validateSkill(skill);
    expect(issues.some((i) => /must start with "Use when/.test(i.message))).toBe(true);
  });

  it('rejects an invalid skill name (uppercase)', async () => {
    writeSkill(path.join(scratch, 'BadName'), { ...MIN_FM, name: 'BadName' });
    const skill = await loadSkill(path.join(scratch, 'BadName', 'SKILL.md'));
    const issues = await validateSkill(skill);
    expect(issues.some((i) => /must match.*kebab-case/.test(i.message))).toBe(true);
  });

  it('rejects non-semver version', async () => {
    writeSkill(path.join(scratch, 'agileflow-test'), { ...MIN_FM, version: 'beta' });
    const skill = await loadSkill(path.join(scratch, 'agileflow-test', 'SKILL.md'));
    const issues = await validateSkill(skill);
    expect(issues.some((i) => /version must be valid semver/.test(i.message))).toBe(true);
  });

  it('rejects empty triggers.keywords', async () => {
    writeSkill(path.join(scratch, 'agileflow-test'), {
      ...MIN_FM,
      triggers: { keywords: [], priority: 50 },
    });
    const skill = await loadSkill(path.join(scratch, 'agileflow-test', 'SKILL.md'));
    const issues = await validateSkill(skill);
    expect(issues.some((i) => /triggers.keywords must be a non-empty array/.test(i.message))).toBe(true);
  });

  it('rejects priority out of [0, 100]', async () => {
    writeSkill(path.join(scratch, 'agileflow-test'), {
      ...MIN_FM,
      triggers: { keywords: ['test'], priority: 999 },
    });
    const skill = await loadSkill(path.join(scratch, 'agileflow-test', 'SKILL.md'));
    const issues = await validateSkill(skill);
    expect(issues.some((i) => /triggers.priority must be an integer in/.test(i.message))).toBe(true);
  });

  it('rejects bodies longer than MAX_BODY_LINES', async () => {
    const body = 'line\n'.repeat(MAX_BODY_LINES + 10);
    writeSkill(path.join(scratch, 'agileflow-test'), MIN_FM, body);
    const skill = await loadSkill(path.join(scratch, 'agileflow-test', 'SKILL.md'));
    const issues = await validateSkill(skill);
    expect(issues.some((i) => /body has \d+ lines/.test(i.message))).toBe(true);
  });

  it('warns when learns.enabled but learnings file is absent', async () => {
    writeSkill(path.join(scratch, 'agileflow-test'), {
      ...MIN_FM,
      learns: { enabled: true, file: '_learnings/test.yaml' },
    });
    const skill = await loadSkill(path.join(scratch, 'agileflow-test', 'SKILL.md'));
    const issues = await validateSkill(skill);
    const warning = issues.find((i) => i.severity === 'warning' && /_learnings/.test(i.message));
    expect(warning).toBeDefined();
  });

  it('warns when provides.command is set (skills-only policy)', async () => {
    writeSkill(path.join(scratch, 'agileflow-test'), {
      ...MIN_FM,
      provides: { command: '/agileflow:test' },
    });
    const skill = await loadSkill(path.join(scratch, 'agileflow-test', 'SKILL.md'));
    const issues = await validateSkill(skill);
    expect(issues.some((i) => i.severity === 'warning' && /provides.command/.test(i.message))).toBe(true);
  });
});

describe('detectKeywordCollisions', () => {
  it('returns no issues when all (keyword, priority) pairs are unique', () => {
    const skills = [
      { skillId: 'a', skillPath: 'a', frontmatter: { triggers: { keywords: ['x'], priority: 50 } } },
      { skillId: 'b', skillPath: 'b', frontmatter: { triggers: { keywords: ['y'], priority: 50 } } },
    ];
    expect(detectKeywordCollisions(/** @type {any} */ (skills))).toEqual([]);
  });

  it('flags two skills sharing the same keyword + priority', () => {
    const skills = [
      { skillId: 'a', skillPath: 'a', frontmatter: { triggers: { keywords: ['story'], priority: 50 } } },
      { skillId: 'b', skillPath: 'b', frontmatter: { triggers: { keywords: ['story'], priority: 50 } } },
    ];
    const issues = detectKeywordCollisions(/** @type {any} */ (skills));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => /collides with/.test(i.message))).toBe(true);
  });

  it('does NOT flag the same keyword at different priorities', () => {
    const skills = [
      { skillId: 'a', skillPath: 'a', frontmatter: { triggers: { keywords: ['shared'], priority: 10 } } },
      { skillId: 'b', skillPath: 'b', frontmatter: { triggers: { keywords: ['shared'], priority: 90 } } },
    ];
    expect(detectKeywordCollisions(/** @type {any} */ (skills))).toEqual([]);
  });

  it('treats keyword case-insensitively', () => {
    const skills = [
      { skillId: 'a', skillPath: 'a', frontmatter: { triggers: { keywords: ['Story'], priority: 50 } } },
      { skillId: 'b', skillPath: 'b', frontmatter: { triggers: { keywords: ['STORY'], priority: 50 } } },
    ];
    expect(detectKeywordCollisions(/** @type {any} */ (skills)).length).toBeGreaterThan(0);
  });
});

describe('validateSkillsAtRoot', () => {
  /** @type {string} */
  let scratch;
  beforeEach(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-skv-')); });
  afterEach(() => { fs.rmSync(scratch, { recursive: true, force: true }); });

  it('returns empty when the root does not exist', async () => {
    const r = await validateSkillsAtRoot(path.join(scratch, 'no-such'));
    expect(r.skills).toEqual([]);
    expect(r.issues).toEqual([]);
  });

  it('loads and validates every skill under the root', async () => {
    writeSkill(path.join(scratch, 'agileflow-a'), {
      ...MIN_FM,
      name: 'agileflow-a',
      triggers: { keywords: ['alpha'], priority: 50 },
    });
    writeSkill(path.join(scratch, 'agileflow-b'), {
      ...MIN_FM,
      name: 'agileflow-b',
      triggers: { keywords: ['beta'], priority: 50 },
    });
    const r = await validateSkillsAtRoot(scratch);
    expect(r.skills.map((s) => s.skillId).sort()).toEqual(['agileflow-a', 'agileflow-b']);
    expect(hasErrors(r.issues)).toBe(false);
  });

  it('reports a load error per skill (does not blow up the pass)', async () => {
    fs.mkdirSync(path.join(scratch, 'agileflow-broken'), { recursive: true });
    fs.writeFileSync(path.join(scratch, 'agileflow-broken', 'SKILL.md'), 'no frontmatter here');
    writeSkill(path.join(scratch, 'agileflow-ok'), { ...MIN_FM, name: 'agileflow-ok' });
    const r = await validateSkillsAtRoot(scratch);
    expect(r.skills.map((s) => s.skillId)).toEqual(['agileflow-ok']);
    expect(r.issues.some((i) => /failed to load skill/.test(i.message))).toBe(true);
  });

  it('runs cross-skill collision detection', async () => {
    writeSkill(path.join(scratch, 'agileflow-a'), {
      ...MIN_FM,
      name: 'agileflow-a',
      triggers: { keywords: ['shared'], priority: 50 },
    });
    writeSkill(path.join(scratch, 'agileflow-b'), {
      ...MIN_FM,
      name: 'agileflow-b',
      triggers: { keywords: ['shared'], priority: 50 },
    });
    const r = await validateSkillsAtRoot(scratch);
    expect(r.issues.some((i) => /collides with/.test(i.message))).toBe(true);
  });
});
