/**
 * Tests for content-injector.js
 *
 * Tests dynamic content injection for command/agent list generation
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  generateAgentList,
  generateCommandList,
  injectContent,
  extractSectionNames,
  filterSections,
  stripSectionMarkers,
  hasSections,
} = require('../../tools/cli/lib/content-injector');

describe('content-injector', () => {
  let tempDir;

  beforeEach(() => {
    // Create a fresh temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-injector-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('generateAgentList', () => {
    it('generates formatted agent list from directory', () => {
      const agentsDir = path.join(tempDir, 'agents');
      fs.mkdirSync(agentsDir);

      // Create test agent file
      fs.writeFileSync(
        path.join(agentsDir, 'test-agent.md'),
        `---
name: test-agent
description: A test agent for unit testing
tools:
  - Read
  - Write
  - Bash
model: sonnet
---

# Test Agent

Agent content here.
`
      );

      const result = generateAgentList(agentsDir);

      expect(result).toContain('**AVAILABLE AGENTS (1 total)**');
      expect(result).toContain('**test-agent** (model: sonnet)');
      expect(result).toContain('**Purpose**: A test agent for unit testing');
      expect(result).toContain('**Tools**: Read, Write, Bash');
      expect(result).toContain('`subagent_type: "agileflow-test-agent"`');
    });

    it('handles multiple agents and sorts alphabetically', () => {
      const agentsDir = path.join(tempDir, 'agents');
      fs.mkdirSync(agentsDir);

      // Create agents with names that would sort differently
      fs.writeFileSync(
        path.join(agentsDir, 'zebra-agent.md'),
        `---
name: zebra-agent
description: Z agent
tools:
  - Read
model: haiku
---
`
      );

      fs.writeFileSync(
        path.join(agentsDir, 'alpha-agent.md'),
        `---
name: alpha-agent
description: A agent
tools:
  - Write
model: opus
---
`
      );

      const result = generateAgentList(agentsDir);

      expect(result).toContain('**AVAILABLE AGENTS (2 total)**');
      // Alpha should come before Zebra
      const alphaIndex = result.indexOf('alpha-agent');
      const zebraIndex = result.indexOf('zebra-agent');
      expect(alphaIndex).toBeLessThan(zebraIndex);
    });

    it('handles tools as comma-separated string', () => {
      const agentsDir = path.join(tempDir, 'agents');
      fs.mkdirSync(agentsDir);

      fs.writeFileSync(
        path.join(agentsDir, 'string-tools.md'),
        `---
name: string-tools
description: Agent with string tools
tools: Read, Write, Edit
model: haiku
---
`
      );

      const result = generateAgentList(agentsDir);

      expect(result).toContain('**Tools**: Read, Write, Edit');
    });

    it('uses defaults for missing fields', () => {
      const agentsDir = path.join(tempDir, 'agents');
      fs.mkdirSync(agentsDir);

      fs.writeFileSync(
        path.join(agentsDir, 'minimal.md'),
        `---
name: minimal
---
`
      );

      const result = generateAgentList(agentsDir);

      expect(result).toContain('**minimal** (model: haiku)');
      expect(result).toContain('**Purpose**: ');
      expect(result).toContain('**Tools**: ');
    });

    it('uses filename as name when name not in frontmatter', () => {
      const agentsDir = path.join(tempDir, 'agents');
      fs.mkdirSync(agentsDir);

      fs.writeFileSync(
        path.join(agentsDir, 'filename-only.md'),
        `---
description: Uses filename as name
---
`
      );

      const result = generateAgentList(agentsDir);

      expect(result).toContain('**filename-only**');
    });

    it('skips files without frontmatter', () => {
      const agentsDir = path.join(tempDir, 'agents');
      fs.mkdirSync(agentsDir);

      fs.writeFileSync(
        path.join(agentsDir, 'no-frontmatter.md'),
        `# No Frontmatter

Just content, no YAML.
`
      );

      fs.writeFileSync(
        path.join(agentsDir, 'valid.md'),
        `---
name: valid-agent
description: Valid agent
tools:
  - Read
---
`
      );

      const result = generateAgentList(agentsDir);

      expect(result).toContain('**AVAILABLE AGENTS (1 total)**');
      expect(result).toContain('valid-agent');
      expect(result).not.toContain('no-frontmatter');
    });

    it('skips files with invalid YAML', () => {
      const agentsDir = path.join(tempDir, 'agents');
      fs.mkdirSync(agentsDir);

      fs.writeFileSync(
        path.join(agentsDir, 'invalid-yaml.md'),
        `---
name: [this is invalid yaml
  broken: structure
---
`
      );

      fs.writeFileSync(
        path.join(agentsDir, 'valid.md'),
        `---
name: valid
description: Valid
---
`
      );

      const result = generateAgentList(agentsDir);

      expect(result).toContain('**AVAILABLE AGENTS (1 total)**');
      expect(result).toContain('valid');
    });

    it('skips non-md files', () => {
      const agentsDir = path.join(tempDir, 'agents');
      fs.mkdirSync(agentsDir);

      fs.writeFileSync(path.join(agentsDir, 'ignore.txt'), 'not markdown');
      fs.writeFileSync(path.join(agentsDir, 'ignore.js'), 'const x = 1;');
      fs.writeFileSync(
        path.join(agentsDir, 'valid.md'),
        `---
name: valid
---
`
      );

      const result = generateAgentList(agentsDir);

      expect(result).toContain('**AVAILABLE AGENTS (1 total)**');
    });

    it('returns empty list for empty directory', () => {
      const agentsDir = path.join(tempDir, 'agents');
      fs.mkdirSync(agentsDir);

      const result = generateAgentList(agentsDir);

      expect(result).toContain('**AVAILABLE AGENTS (0 total)**');
    });

    it('skips files with null frontmatter', () => {
      const agentsDir = path.join(tempDir, 'agents');
      fs.mkdirSync(agentsDir);

      // YAML that parses to null (empty frontmatter)
      fs.writeFileSync(
        path.join(agentsDir, 'null-frontmatter.md'),
        `---
---

Content only
`
      );

      const result = generateAgentList(agentsDir);

      expect(result).toContain('**AVAILABLE AGENTS (0 total)**');
    });
  });

  describe('generateCommandList', () => {
    it('generates formatted command list from directory', () => {
      const commandsDir = path.join(tempDir, 'commands');
      fs.mkdirSync(commandsDir);

      fs.writeFileSync(
        path.join(commandsDir, 'test-command.md'),
        `---
description: A test command
argument-hint: STORY=<id>
---

# Test Command

Command content.
`
      );

      const result = generateCommandList(commandsDir);

      expect(result).toContain('Available commands (1 total)');
      expect(result).toContain('`/agileflow:test-command STORY=<id>`');
      expect(result).toContain('A test command');
    });

    it('handles commands without argument hints', () => {
      const commandsDir = path.join(tempDir, 'commands');
      fs.mkdirSync(commandsDir);

      fs.writeFileSync(
        path.join(commandsDir, 'no-args.md'),
        `---
description: Command without arguments
---
`
      );

      const result = generateCommandList(commandsDir);

      expect(result).toContain('`/agileflow:no-args`');
      expect(result).not.toContain('undefined');
    });

    it('sorts commands alphabetically', () => {
      const commandsDir = path.join(tempDir, 'commands');
      fs.mkdirSync(commandsDir);

      fs.writeFileSync(
        path.join(commandsDir, 'zebra.md'),
        `---
description: Z command
---
`
      );

      fs.writeFileSync(
        path.join(commandsDir, 'alpha.md'),
        `---
description: A command
---
`
      );

      const result = generateCommandList(commandsDir);

      const alphaIndex = result.indexOf('alpha');
      const zebraIndex = result.indexOf('zebra');
      expect(alphaIndex).toBeLessThan(zebraIndex);
    });

    it('skips files without valid frontmatter', () => {
      const commandsDir = path.join(tempDir, 'commands');
      fs.mkdirSync(commandsDir);

      fs.writeFileSync(path.join(commandsDir, 'no-frontmatter.md'), '# Just a heading');

      fs.writeFileSync(
        path.join(commandsDir, 'valid.md'),
        `---
description: Valid command
---
`
      );

      const result = generateCommandList(commandsDir);

      expect(result).toContain('Available commands (1 total)');
      expect(result).toContain('valid');
      expect(result).not.toContain('no-frontmatter');
    });

    it('returns empty list for empty directory', () => {
      const commandsDir = path.join(tempDir, 'commands');
      fs.mkdirSync(commandsDir);

      const result = generateCommandList(commandsDir);

      expect(result).toContain('Available commands (0 total)');
    });
  });

  describe('injectContent', () => {
    it('replaces agent list placeholder', () => {
      const agentsDir = path.join(tempDir, 'agents');
      const commandsDir = path.join(tempDir, 'commands');
      fs.mkdirSync(agentsDir);
      fs.mkdirSync(commandsDir);

      fs.writeFileSync(
        path.join(agentsDir, 'test.md'),
        `---
name: test-agent
description: Test
tools:
  - Read
---
`
      );

      const template = `# Title

{{AGENT_LIST}}

<!-- {{AGENT_LIST}} -->

## Footer
`;

      const result = injectContent(template, { coreDir: tempDir });

      expect(result).toContain('**AVAILABLE AGENTS (1 total)**');
      expect(result).toContain('test-agent');
      expect(result).not.toContain('<!-- {{AGENT_LIST}} -->');
    });

    it('replaces command list placeholder', () => {
      const agentsDir = path.join(tempDir, 'agents');
      const commandsDir = path.join(tempDir, 'commands');
      fs.mkdirSync(agentsDir);
      fs.mkdirSync(commandsDir);

      fs.writeFileSync(
        path.join(commandsDir, 'status.md'),
        `---
description: Show status
---
`
      );

      const template = `# Commands

{{COMMAND_LIST}}

<!-- {{COMMAND_LIST}} -->

Done.
`;

      const result = injectContent(template, { coreDir: tempDir });

      expect(result).toContain('Available commands (1 total)');
      expect(result).toContain('/agileflow:status');
      expect(result).not.toContain('<!-- {{COMMAND_LIST}} -->');
    });

    it('replaces both placeholders', () => {
      const agentsDir = path.join(tempDir, 'agents');
      const commandsDir = path.join(tempDir, 'commands');
      fs.mkdirSync(agentsDir);
      fs.mkdirSync(commandsDir);

      fs.writeFileSync(
        path.join(agentsDir, 'agent.md'),
        `---
name: my-agent
description: My agent
tools:
  - Read
---
`
      );

      fs.writeFileSync(
        path.join(commandsDir, 'cmd.md'),
        `---
description: My command
---
`
      );

      const template = `# Both Lists

## Agents
<!-- {{AGENT_LIST}} -->

## Commands
<!-- {{COMMAND_LIST}} -->
`;

      const result = injectContent(template, { coreDir: tempDir });

      expect(result).toContain('**AVAILABLE AGENTS (1 total)**');
      expect(result).toContain('my-agent');
      expect(result).toContain('Available commands (1 total)');
      expect(result).toContain('/agileflow:cmd');
    });

    it('leaves content unchanged when no placeholders', () => {
      const agentsDir = path.join(tempDir, 'agents');
      const commandsDir = path.join(tempDir, 'commands');
      fs.mkdirSync(agentsDir);
      fs.mkdirSync(commandsDir);

      const template = `# No Placeholders

Just regular content.
`;

      const result = injectContent(template, { coreDir: tempDir });

      expect(result).toBe(template);
    });

    it('handles multiple occurrences of same placeholder', () => {
      const agentsDir = path.join(tempDir, 'agents');
      const commandsDir = path.join(tempDir, 'commands');
      fs.mkdirSync(agentsDir);
      fs.mkdirSync(commandsDir);

      fs.writeFileSync(
        path.join(agentsDir, 'x.md'),
        `---
name: x
description: X
tools:
  - Read
---
`
      );

      const template = `First: <!-- {{AGENT_LIST}} -->

Second: <!-- {{AGENT_LIST}} -->
`;

      const result = injectContent(template, { coreDir: tempDir });

      // Both should be replaced
      const matches = result.match(/\*\*AVAILABLE AGENTS/g);
      expect(matches).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Progressive Disclosure: Section Processing Tests
  // ==========================================================================

  describe('extractSectionNames', () => {
    it('extracts section names from content', () => {
      const content = `
# Header

<!-- SECTION: loop-mode -->
Loop mode content
<!-- END_SECTION -->

Some regular content

<!-- SECTION: delegation -->
Delegation content
<!-- END_SECTION -->
`;

      const sections = extractSectionNames(content);

      expect(sections).toEqual(['loop-mode', 'delegation']);
    });

    it('returns empty array when no sections', () => {
      const content = '# Just regular content\n\nNo sections here.';

      const sections = extractSectionNames(content);

      expect(sections).toEqual([]);
    });

    it('handles sections with hyphens in names', () => {
      const content = `
<!-- SECTION: multi-session-coordination -->
Content
<!-- END_SECTION -->
`;

      const sections = extractSectionNames(content);

      expect(sections).toEqual(['multi-session-coordination']);
    });

    it('handles multiple occurrences of same section name', () => {
      const content = `
<!-- SECTION: test -->
First
<!-- END_SECTION -->

<!-- SECTION: test -->
Second
<!-- END_SECTION -->
`;

      const sections = extractSectionNames(content);

      // Should capture both occurrences (even if duplicate)
      expect(sections).toEqual(['test', 'test']);
    });
  });

  describe('filterSections', () => {
    it('keeps only specified sections', () => {
      const content = `
# Header

<!-- SECTION: loop-mode -->
Loop mode content here
<!-- END_SECTION -->

Regular content

<!-- SECTION: delegation -->
Delegation content here
<!-- END_SECTION -->

Footer
`;

      const result = filterSections(content, ['loop-mode']);

      expect(result).toContain('Loop mode content here');
      expect(result).not.toContain('Delegation content here');
      expect(result).toContain('Header');
      expect(result).toContain('Regular content');
      expect(result).toContain('Footer');
    });

    it('removes section markers when including section', () => {
      const content = `
<!-- SECTION: test -->
Content
<!-- END_SECTION -->
`;

      const result = filterSections(content, ['test']);

      expect(result).not.toContain('<!-- SECTION: test -->');
      expect(result).not.toContain('<!-- END_SECTION -->');
      expect(result).toContain('Content');
    });

    it('returns original content when no active sections specified', () => {
      const content = `
<!-- SECTION: test -->
Content
<!-- END_SECTION -->
`;

      const result = filterSections(content, []);

      expect(result).toBe(content);
    });

    it('returns original content when null passed for active sections', () => {
      const content = `
<!-- SECTION: test -->
Content
<!-- END_SECTION -->
`;

      const result = filterSections(content, null);

      expect(result).toBe(content);
    });

    it('handles multiple active sections', () => {
      const content = `
<!-- SECTION: a -->
Section A
<!-- END_SECTION -->

<!-- SECTION: b -->
Section B
<!-- END_SECTION -->

<!-- SECTION: c -->
Section C
<!-- END_SECTION -->
`;

      const result = filterSections(content, ['a', 'c']);

      expect(result).toContain('Section A');
      expect(result).not.toContain('Section B');
      expect(result).toContain('Section C');
    });

    it('preserves newlines and formatting inside sections', () => {
      const content = `
<!-- SECTION: formatted -->
Line 1
  Indented line
    Double indented

Code block:
\`\`\`js
const x = 1;
\`\`\`
<!-- END_SECTION -->
`;

      const result = filterSections(content, ['formatted']);

      expect(result).toContain('Line 1');
      expect(result).toContain('  Indented line');
      expect(result).toContain('const x = 1;');
    });
  });

  describe('stripSectionMarkers', () => {
    it('removes all section markers but keeps content', () => {
      const content = `
# Header

<!-- SECTION: test -->
Section content
<!-- END_SECTION -->

Footer
`;

      const result = stripSectionMarkers(content);

      expect(result).toContain('Header');
      expect(result).toContain('Section content');
      expect(result).toContain('Footer');
      expect(result).not.toContain('<!-- SECTION');
      expect(result).not.toContain('END_SECTION');
    });

    it('handles multiple sections', () => {
      const content = `
<!-- SECTION: a -->
A content
<!-- END_SECTION -->
<!-- SECTION: b -->
B content
<!-- END_SECTION -->
`;

      const result = stripSectionMarkers(content);

      expect(result).toContain('A content');
      expect(result).toContain('B content');
      expect(result).not.toContain('<!-- SECTION');
    });

    it('returns content unchanged when no markers present', () => {
      const content = '# No markers here\n\nJust content.';

      const result = stripSectionMarkers(content);

      expect(result).toBe(content);
    });
  });

  describe('hasSections', () => {
    it('returns true when content has sections', () => {
      const content = `
<!-- SECTION: test -->
Content
<!-- END_SECTION -->
`;

      expect(hasSections(content)).toBe(true);
    });

    it('returns false when content has no sections', () => {
      const content = '# Just regular markdown\n\nNo sections.';

      expect(hasSections(content)).toBe(false);
    });

    it('returns true for sections with hyphens', () => {
      const content = '<!-- SECTION: multi-word-name -->';

      expect(hasSections(content)).toBe(true);
    });

    it('returns false for similar-looking but invalid markers', () => {
      const content = '<!-- SECTION -->';

      expect(hasSections(content)).toBe(false);
    });
  });
});
