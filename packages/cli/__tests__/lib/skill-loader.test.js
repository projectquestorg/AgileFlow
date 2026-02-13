/**
 * Tests for skill-loader.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  parseSkillFrontmatter,
  loadSkill,
  discoverSkills,
  filterByCategory,
  filterByModel,
  formatSkillSummary,
} = require('../../lib/skill-loader');

describe('skill-loader', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-loader-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('parseSkillFrontmatter', () => {
    it('parses standard frontmatter', () => {
      const content = `---
name: my-skill
description: A test skill
model: haiku
category: database
version: 1.0.0
---

# My Skill

Some content here.`;

      const result = parseSkillFrontmatter(content);
      expect(result.metadata.name).toBe('my-skill');
      expect(result.metadata.description).toBe('A test skill');
      expect(result.metadata.model).toBe('haiku');
      expect(result.metadata.category).toBe('database');
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.body).toContain('# My Skill');
    });

    it('handles content without frontmatter', () => {
      const content = '# No Frontmatter\n\nJust content.';
      const result = parseSkillFrontmatter(content);
      expect(result.metadata).toEqual({});
      expect(result.body).toBe(content);
    });

    it('handles empty content', () => {
      const result = parseSkillFrontmatter('');
      expect(result.metadata).toEqual({});
      expect(result.body).toBe('');
    });

    it('handles null/undefined content', () => {
      const result = parseSkillFrontmatter(null);
      expect(result.metadata).toEqual({});
    });

    it('handles quoted values', () => {
      const content = `---
name: "my-skill"
description: 'A test skill'
---
Body`;

      const result = parseSkillFrontmatter(content);
      expect(result.metadata.name).toBe('my-skill');
      expect(result.metadata.description).toBe('A test skill');
    });

    it('handles boolean values', () => {
      const content = `---
name: test
enabled: true
disabled: false
---
Body`;

      const result = parseSkillFrontmatter(content);
      expect(result.metadata.enabled).toBe(true);
      expect(result.metadata.disabled).toBe(false);
    });

    it('ignores comments and empty lines', () => {
      const content = `---
name: test
# This is a comment

model: haiku
---
Body`;

      const result = parseSkillFrontmatter(content);
      expect(result.metadata.name).toBe('test');
      expect(result.metadata.model).toBe('haiku');
    });

    it('handles frontmatter with no closing delimiter', () => {
      const content = '---\nname: test\nno closing';
      const result = parseSkillFrontmatter(content);
      expect(result.metadata).toEqual({});
      expect(result.body).toBe(content);
    });
  });

  describe('loadSkill', () => {
    it('loads a skill with frontmatter', () => {
      const skillDir = path.join(tmpDir, 'test-skill');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---
name: test-skill
model: haiku
category: database
version: 1.0.0
---

# Test Skill

A test skill for database operations.`
      );

      const skill = loadSkill(skillDir);
      expect(skill).not.toBeNull();
      expect(skill.name).toBe('test-skill');
      expect(skill.model).toBe('haiku');
      expect(skill.category).toBe('database');
      expect(skill.version).toBe('1.0.0');
    });

    it('loads a skill without frontmatter', () => {
      const skillDir = path.join(tmpDir, 'simple-skill');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `# Simple Skill\n\nA simple skill without metadata.`
      );

      const skill = loadSkill(skillDir);
      expect(skill).not.toBeNull();
      expect(skill.name).toBe('simple-skill'); // Falls back to dir name
      expect(skill.model).toBeNull();
    });

    it('detects references.md and cookbook', () => {
      const skillDir = path.join(tmpDir, 'full-skill');
      fs.mkdirSync(skillDir);
      fs.mkdirSync(path.join(skillDir, 'cookbook'));
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: full\n---\n# Full');
      fs.writeFileSync(path.join(skillDir, 'references.md'), '# Refs');
      fs.writeFileSync(path.join(skillDir, '.mcp.json'), '{}');

      const skill = loadSkill(skillDir);
      expect(skill.hasReferences).toBe(true);
      expect(skill.hasCookbook).toBe(true);
      expect(skill.hasMcp).toBe(true);
    });

    it('returns null for non-existent directory', () => {
      expect(loadSkill('/nonexistent')).toBeNull();
    });

    it('returns null for directory without SKILL.md', () => {
      const skillDir = path.join(tmpDir, 'empty-skill');
      fs.mkdirSync(skillDir);
      expect(loadSkill(skillDir)).toBeNull();
    });
  });

  describe('discoverSkills', () => {
    it('discovers skills in .claude/skills/', () => {
      const skillsDir = path.join(tmpDir, '.claude', 'skills', 'my-skill');
      fs.mkdirSync(skillsDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillsDir, 'SKILL.md'),
        '---\nname: my-skill\ncategory: api\n---\n# My Skill'
      );

      const skills = discoverSkills(tmpDir);
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('my-skill');
      expect(skills[0].category).toBe('api');
    });

    it('discovers skills in .agileflow/skills/', () => {
      const skillsDir = path.join(tmpDir, '.agileflow', 'skills', 'af-skill');
      fs.mkdirSync(skillsDir, { recursive: true });
      fs.writeFileSync(path.join(skillsDir, 'SKILL.md'), '---\nname: af-skill\n---\n# AF Skill');

      const skills = discoverSkills(tmpDir);
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('af-skill');
    });

    it('returns empty array when no skills directory', () => {
      const skills = discoverSkills(tmpDir);
      expect(skills).toEqual([]);
    });

    it('skips non-directory entries', () => {
      const skillsDir = path.join(tmpDir, '.claude', 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });
      fs.writeFileSync(path.join(skillsDir, 'not-a-dir.txt'), 'text');

      const skills = discoverSkills(tmpDir);
      expect(skills).toEqual([]);
    });
  });

  describe('filterByCategory', () => {
    const skills = [
      { name: 'a', category: 'database' },
      { name: 'b', category: 'api' },
      { name: 'c', category: 'database' },
      { name: 'd', category: null },
    ];

    it('filters by category', () => {
      expect(filterByCategory(skills, 'database')).toHaveLength(2);
      expect(filterByCategory(skills, 'api')).toHaveLength(1);
    });

    it('returns empty for unknown category', () => {
      expect(filterByCategory(skills, 'unknown')).toHaveLength(0);
    });
  });

  describe('filterByModel', () => {
    const skills = [
      { name: 'a', model: 'haiku' },
      { name: 'b', model: 'sonnet' },
      { name: 'c', model: 'haiku' },
    ];

    it('filters by model', () => {
      expect(filterByModel(skills, 'haiku')).toHaveLength(2);
      expect(filterByModel(skills, 'sonnet')).toHaveLength(1);
    });
  });

  describe('formatSkillSummary', () => {
    it('formats full skill info', () => {
      const result = formatSkillSummary({
        name: 'test',
        category: 'database',
        model: 'haiku',
        version: '1.0.0',
      });
      expect(result).toBe('test [database] (haiku) v1.0.0');
    });

    it('formats minimal skill info', () => {
      const result = formatSkillSummary({
        name: 'test',
        category: null,
        model: null,
        version: null,
      });
      expect(result).toBe('test');
    });
  });
});
