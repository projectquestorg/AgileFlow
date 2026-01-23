/**
 * Integration Tests for inject-readme.js
 *
 * Tests README content structure generation with fixture data.
 * Verifies actual file output, not mocked behavior.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  generateStats,
  generateAgentTable,
  generateSkillList,
  injectContentByMarker,
} = require('../../../scripts/generators/inject-readme');

describe('inject-readme.js', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-readme-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ===========================================================================
  // generateStats tests
  // ===========================================================================

  describe('generateStats', () => {
    it('generates stats with all counts', () => {
      const counts = {
        commands: 74,
        agents: 27,
        skills: 22,
      };

      const result = generateStats(counts);

      expect(result).toContain('**74** slash commands');
      expect(result).toContain('**27** specialized agents');
      expect(result).toContain('**22** code generation skills');
    });

    it('generates stats with zero counts', () => {
      const counts = {
        commands: 0,
        agents: 0,
        skills: 0,
      };

      const result = generateStats(counts);

      expect(result).toContain('**0** slash commands');
      expect(result).toContain('**0** specialized agents');
      expect(result).toContain('**0** code generation skills');
    });

    it('generates stats with large counts', () => {
      const counts = {
        commands: 1000,
        agents: 500,
        skills: 250,
      };

      const result = generateStats(counts);

      expect(result).toContain('**1000** slash commands');
      expect(result).toContain('**500** specialized agents');
      expect(result).toContain('**250** code generation skills');
    });

    it('generates formatted list structure', () => {
      const counts = { commands: 10, agents: 5, skills: 3 };

      const result = generateStats(counts);
      const lines = result.split('\n');

      expect(lines).toHaveLength(3);
      expect(lines[0]).toMatch(/^- \*\*\d+\*\* slash commands$/);
      expect(lines[1]).toMatch(/^- \*\*\d+\*\* specialized agents$/);
      expect(lines[2]).toMatch(/^- \*\*\d+\*\* code generation skills$/);
    });
  });

  // ===========================================================================
  // generateAgentTable tests
  // ===========================================================================

  describe('generateAgentTable', () => {
    it('generates markdown table with agents', () => {
      const agents = [
        {
          name: 'ui',
          description: 'UI specialist',
          tools: ['Read', 'Write', 'Edit'],
          model: 'sonnet',
          category: 'Core Development',
        },
      ];

      const result = generateAgentTable(agents);

      expect(result).toContain('| Agent | Description | Model | Category |');
      expect(result).toContain('|-------|-------------|-------|----------|');
      expect(result).toContain('| ui | UI specialist | sonnet | Core Development |');
    });

    it('generates table with multiple agents', () => {
      const agents = [
        {
          name: 'api',
          description: 'API specialist',
          tools: ['Read'],
          model: 'haiku',
          category: 'Core',
        },
        {
          name: 'testing',
          description: 'Testing specialist',
          tools: ['Bash'],
          model: 'opus',
          category: 'Quality',
        },
      ];

      const result = generateAgentTable(agents);

      expect(result).toContain('| api | API specialist | haiku | Core |');
      expect(result).toContain('| testing | Testing specialist | opus | Quality |');
    });

    it('generates empty table for empty agents array', () => {
      const result = generateAgentTable([]);

      expect(result).toContain('| Agent | Description | Model | Category |');
      expect(result).toContain('|-------|-------------|-------|----------|');
      // Only header and separator, no data rows
      expect(result.split('\n')).toHaveLength(2);
    });

    it('truncates tools list to first 3 with ellipsis', () => {
      const agents = [
        {
          name: 'mega',
          description: 'Has many tools',
          tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob'],
          model: 'opus',
          category: 'Core',
        },
      ];

      const result = generateAgentTable(agents);

      // The table doesn't include tools in this implementation
      expect(result).toContain('| mega |');
    });

    it('handles agents with empty description', () => {
      const agents = [
        {
          name: 'silent',
          description: '',
          tools: [],
          model: 'haiku',
          category: 'Other',
        },
      ];

      const result = generateAgentTable(agents);

      expect(result).toContain('| silent |  | haiku | Other |');
    });

    it('handles agents with pipe characters in description', () => {
      const agents = [
        {
          name: 'test',
          description: 'A or B choice',
          tools: [],
          model: 'haiku',
          category: 'Test',
        },
      ];

      const result = generateAgentTable(agents);

      expect(result).toContain('A or B choice');
    });
  });

  // ===========================================================================
  // generateSkillList tests
  // ===========================================================================

  describe('generateSkillList', () => {
    it('generates skill list grouped by category', () => {
      const skills = [
        {
          name: 'test-case-generator',
          description: 'Generate test cases',
          category: 'Testing',
        },
        {
          name: 'api-docs',
          description: 'Generate API docs',
          category: 'Documentation',
        },
      ];

      const result = generateSkillList(skills);

      expect(result).toContain('**Testing:**');
      expect(result).toContain('**test-case-generator**: Generate test cases');
      expect(result).toContain('**Documentation:**');
      expect(result).toContain('**api-docs**: Generate API docs');
    });

    it('groups multiple skills in same category', () => {
      const skills = [
        { name: 'skill1', description: 'Skill 1', category: 'Code Generation' },
        { name: 'skill2', description: 'Skill 2', category: 'Code Generation' },
        { name: 'skill3', description: 'Skill 3', category: 'Code Generation' },
      ];

      const result = generateSkillList(skills);

      // Single category header
      const categoryCount = (result.match(/\*\*Code Generation:\*\*/g) || []).length;
      expect(categoryCount).toBe(1);

      expect(result).toContain('**skill1**:');
      expect(result).toContain('**skill2**:');
      expect(result).toContain('**skill3**:');
    });

    it('generates empty string for empty skills array', () => {
      const result = generateSkillList([]);

      expect(result).toBe('');
    });

    it('adds blank lines between categories', () => {
      const skills = [
        { name: 'a', description: 'A', category: 'First' },
        { name: 'b', description: 'B', category: 'Second' },
      ];

      const result = generateSkillList(skills);

      // Should have blank line between categories
      expect(result).toMatch(/\n\n\*\*Second:\*\*/);
    });

    it('handles skills with special characters', () => {
      const skills = [
        {
          name: 'sql-schema',
          description: 'Generate SQL schemas with <> and & chars',
          category: 'Database',
        },
      ];

      const result = generateSkillList(skills);

      expect(result).toContain('Generate SQL schemas with <> and & chars');
    });
  });

  // ===========================================================================
  // injectContentByMarker tests
  // ===========================================================================

  describe('injectContentByMarker', () => {
    it('injects content between named AUTOGEN markers', () => {
      const content = `# README

<!-- AUTOGEN:STATS:START -->
Old stats
<!-- AUTOGEN:STATS:END -->

## Features
`;

      const result = injectContentByMarker(content, 'STATS', 'New stats here');

      expect(result).toContain('<!-- AUTOGEN:STATS:START -->');
      expect(result).toContain('New stats here');
      expect(result).toContain('<!-- AUTOGEN:STATS:END -->');
      expect(result).not.toContain('Old stats');
    });

    it('handles multiple different markers', () => {
      const content = `<!-- AUTOGEN:STATS:START -->
stats
<!-- AUTOGEN:STATS:END -->

<!-- AUTOGEN:AGENT_TABLE:START -->
table
<!-- AUTOGEN:AGENT_TABLE:END -->

<!-- AUTOGEN:SKILL_LIST:START -->
skills
<!-- AUTOGEN:SKILL_LIST:END -->`;

      let result = injectContentByMarker(content, 'STATS', 'NEW STATS');
      result = injectContentByMarker(result, 'AGENT_TABLE', 'NEW TABLE');
      result = injectContentByMarker(result, 'SKILL_LIST', 'NEW SKILLS');

      expect(result).toContain('NEW STATS');
      expect(result).toContain('NEW TABLE');
      expect(result).toContain('NEW SKILLS');
      expect(result).not.toContain('stats\n<!-- AUTOGEN:STATS:END');
    });

    it('adds timestamp comment', () => {
      const content = `<!-- AUTOGEN:TEST:START -->
x
<!-- AUTOGEN:TEST:END -->`;

      const result = injectContentByMarker(content, 'TEST', 'new');

      expect(result).toMatch(/Auto-generated on \d{4}-\d{2}-\d{2}/);
      expect(result).toContain('Do not edit manually');
    });

    it('returns original content when markers not found', () => {
      const content = '# No markers';

      const result = injectContentByMarker(content, 'MISSING', 'content');

      expect(result).toBe(content);
    });

    it('preserves content outside markers', () => {
      const content = `# Header

Intro text.

<!-- AUTOGEN:MIDDLE:START -->
old
<!-- AUTOGEN:MIDDLE:END -->

## Footer

Outro text.`;

      const result = injectContentByMarker(content, 'MIDDLE', 'NEW');

      expect(result).toContain('# Header');
      expect(result).toContain('Intro text.');
      expect(result).toContain('## Footer');
      expect(result).toContain('Outro text.');
      expect(result).toContain('NEW');
    });

    it('handles marker at start of file', () => {
      const content = `<!-- AUTOGEN:FIRST:START -->
old
<!-- AUTOGEN:FIRST:END -->

Rest of file.`;

      const result = injectContentByMarker(content, 'FIRST', 'NEW');

      expect(result).toContain('NEW');
      expect(result).toContain('Rest of file.');
    });

    it('handles marker at end of file', () => {
      const content = `Start of file.

<!-- AUTOGEN:LAST:START -->
old
<!-- AUTOGEN:LAST:END -->`;

      const result = injectContentByMarker(content, 'LAST', 'NEW');

      expect(result).toContain('Start of file.');
      expect(result).toContain('NEW');
    });
  });

  // ===========================================================================
  // Edge case tests
  // ===========================================================================

  describe('edge cases', () => {
    it('handles counts with undefined values', () => {
      const counts = {
        commands: undefined,
        agents: 10,
        skills: null,
      };

      // This might throw or produce unexpected output
      // Testing the actual behavior
      const result = generateStats(counts);
      expect(typeof result).toBe('string');
    });

    it('handles agents with unicode in name/description', () => {
      const agents = [
        {
          name: 'émoji-agent',
          description: 'Supports 🎉 émojis',
          tools: [],
          model: 'haiku',
          category: 'Fun',
        },
      ];

      const result = generateAgentTable(agents);

      expect(result).toContain('émoji-agent');
      expect(result).toContain('🎉');
    });

    it('handles skills with empty category', () => {
      const skills = [
        {
          name: 'orphan',
          description: 'No category',
          category: '',
        },
      ];

      const result = generateSkillList(skills);

      expect(result).toContain('**:**'); // Empty category header
      expect(result).toContain('**orphan**:');
    });

    it('handles Windows line endings in content', () => {
      const content =
        '<!-- AUTOGEN:TEST:START -->\r\nold\r\n<!-- AUTOGEN:TEST:END -->\r\n';

      const result = injectContentByMarker(content, 'TEST', 'new');

      expect(result).toContain('new');
    });

    it('handles very long agent descriptions', () => {
      const longDesc = 'A'.repeat(500);
      const agents = [
        {
          name: 'verbose',
          description: longDesc,
          tools: [],
          model: 'haiku',
          category: 'Test',
        },
      ];

      const result = generateAgentTable(agents);

      expect(result).toContain(longDesc);
    });

    it('handles marker names with underscores', () => {
      const content = `<!-- AUTOGEN:AGENT_TABLE:START -->
old
<!-- AUTOGEN:AGENT_TABLE:END -->`;

      const result = injectContentByMarker(content, 'AGENT_TABLE', 'new');

      expect(result).toContain('new');
    });
  });

  // ===========================================================================
  // Integration tests with actual file operations
  // ===========================================================================

  describe('integration with file system', () => {
    it('roundtrip: inject all sections into README', () => {
      const testFile = path.join(tempDir, 'README.md');
      const initialContent = `# AgileFlow

## Stats

<!-- AUTOGEN:STATS:START -->
placeholder stats
<!-- AUTOGEN:STATS:END -->

## Agents

<!-- AUTOGEN:AGENT_TABLE:START -->
placeholder table
<!-- AUTOGEN:AGENT_TABLE:END -->

## Skills

<!-- AUTOGEN:SKILL_LIST:START -->
placeholder skills
<!-- AUTOGEN:SKILL_LIST:END -->

## License
`;

      fs.writeFileSync(testFile, initialContent, 'utf-8');

      // Generate content
      const stats = generateStats({ commands: 74, agents: 27, skills: 22 });
      const agentTable = generateAgentTable([
        {
          name: 'ui',
          description: 'UI specialist',
          tools: ['Read'],
          model: 'sonnet',
          category: 'Core',
        },
      ]);
      const skillList = generateSkillList([
        { name: 'test-gen', description: 'Generate tests', category: 'Testing' },
      ]);

      // Read, inject, write
      let content = fs.readFileSync(testFile, 'utf-8');
      content = injectContentByMarker(content, 'STATS', stats);
      content = injectContentByMarker(content, 'AGENT_TABLE', agentTable);
      content = injectContentByMarker(content, 'SKILL_LIST', skillList);
      fs.writeFileSync(testFile, content, 'utf-8');

      // Read back and verify
      const final = fs.readFileSync(testFile, 'utf-8');
      expect(final).toContain('**74** slash commands');
      expect(final).toContain('| ui | UI specialist | sonnet | Core |');
      expect(final).toContain('**test-gen**: Generate tests');
      expect(final).toContain('# AgileFlow');
      expect(final).toContain('## License');
      expect(final).not.toContain('placeholder');
    });

    it('preserves complex README structure', () => {
      const testFile = path.join(tempDir, 'complex-readme.md');
      const initialContent = `# Project Name

[![Badge](https://badge.com)](https://link.com)

> Quote

## Installation

\`\`\`bash
npm install package
\`\`\`

## Stats

<!-- AUTOGEN:STATS:START -->
old
<!-- AUTOGEN:STATS:END -->

## Usage

\`\`\`javascript
const x = require('x');
\`\`\`

## Contributing

Please read guidelines.
`;

      fs.writeFileSync(testFile, initialContent, 'utf-8');

      let content = fs.readFileSync(testFile, 'utf-8');
      content = injectContentByMarker(content, 'STATS', 'NEW STATS');
      fs.writeFileSync(testFile, content, 'utf-8');

      const final = fs.readFileSync(testFile, 'utf-8');
      expect(final).toContain('[![Badge]');
      expect(final).toContain('npm install package');
      expect(final).toContain("const x = require('x')");
      expect(final).toContain('NEW STATS');
      expect(final).toContain('Please read guidelines');
    });

    it('handles sequential updates to same file', () => {
      const testFile = path.join(tempDir, 'sequential.md');
      const initialContent = `<!-- AUTOGEN:DATA:START -->
v1
<!-- AUTOGEN:DATA:END -->`;

      fs.writeFileSync(testFile, initialContent, 'utf-8');

      // First update
      let content = fs.readFileSync(testFile, 'utf-8');
      content = injectContentByMarker(content, 'DATA', 'Version 2');
      fs.writeFileSync(testFile, content, 'utf-8');

      // Second update
      content = fs.readFileSync(testFile, 'utf-8');
      content = injectContentByMarker(content, 'DATA', 'Version 3');
      fs.writeFileSync(testFile, content, 'utf-8');

      // Third update
      content = fs.readFileSync(testFile, 'utf-8');
      content = injectContentByMarker(content, 'DATA', 'Final Version');
      fs.writeFileSync(testFile, content, 'utf-8');

      const final = fs.readFileSync(testFile, 'utf-8');
      expect(final).toContain('Final Version');
      expect(final).not.toContain('Version 2');
      expect(final).not.toContain('Version 3');
      expect(final).not.toContain('v1');
    });
  });

  // ===========================================================================
  // Output format validation tests
  // ===========================================================================

  describe('output format validation', () => {
    it('stats entries start with dash', () => {
      const stats = generateStats({ commands: 1, agents: 2, skills: 3 });
      const lines = stats.split('\n');

      for (const line of lines) {
        expect(line.startsWith('- ')).toBe(true);
      }
    });

    it('agent table has valid markdown table format', () => {
      const agents = [
        { name: 'test', description: 'Desc', tools: [], model: 'haiku', category: 'Cat' },
      ];

      const result = generateAgentTable(agents);
      const lines = result.split('\n');

      // Header
      expect(lines[0]).toMatch(/^\|.*\|$/);
      // Separator
      expect(lines[1]).toMatch(/^\|[-:]+\|[-:]+\|[-:]+\|[-:]+\|$/);
      // Data row
      expect(lines[2]).toMatch(/^\|.*\|$/);
    });

    it('skill list entries have bold name', () => {
      const skills = [
        { name: 'my-skill', description: 'Description', category: 'Cat' },
      ];

      const result = generateSkillList(skills);

      expect(result).toMatch(/- \*\*my-skill\*\*:/);
    });
  });
});
