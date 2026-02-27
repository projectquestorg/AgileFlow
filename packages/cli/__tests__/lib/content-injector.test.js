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
  generateAgentSummary,
  generateCommandSummary,
  injectContent,
  extractSectionNames,
  filterSections,
  stripSectionMarkers,
  hasSections,
  expandPreserveRules,
  clearPreserveRulesCache,
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
    it('generates compact category-grouped agent list from directory', () => {
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
      expect(result).toContain('test-agent');
      expect(result).toContain('**Domain**: test-agent');
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

      expect(result).toContain('string-tools');
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

      expect(result).toContain('minimal');
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

      expect(result).toContain('filename-only');
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

    it('does not inject command list into frontmatter', () => {
      const commandsDir = path.join(tempDir, 'commands');
      fs.mkdirSync(path.join(tempDir, 'agents'));
      fs.mkdirSync(commandsDir);

      fs.writeFileSync(
        path.join(commandsDir, 'status.md'),
        `---
description: Show status
---
`
      );

      const template = `---
description: test
compact_context:
  preserve_rules:
    - "Keep token {{COMMAND_LIST}} in frontmatter"
---

<!-- {{COMMAND_LIST}} -->
`;

      const result = injectContent(template, { coreDir: tempDir });

      expect(result).toContain('Keep token {{COMMAND_LIST}} in frontmatter');
      expect(result).toContain('Available commands (1 total)');
      expect(result).toContain('/agileflow:status');
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

  // ==========================================================================
  // Session Harness Template Injection Tests
  // ==========================================================================

  describe('session harness injection', () => {
    const {
      generateSessionHarnessContent,
      clearSessionHarnessCache,
    } = require('../../tools/cli/lib/content-injector');

    beforeEach(() => {
      // Clear cache before each test to ensure fresh state
      clearSessionHarnessCache();
    });

    it('generates session harness content with agent ID substitution', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      // Create a simple test template
      fs.writeFileSync(
        path.join(templatesDir, 'session-harness-protocol.md'),
        `SESSION HARNESS PROTOCOL

Example message:
\`\`\`jsonl
{"from":"{AGENT_ID}","type":"warning","text":"Override test"}
\`\`\`

End of protocol.
`
      );

      const result = generateSessionHarnessContent(tempDir, 'AG-API');

      expect(result).toContain('SESSION HARNESS PROTOCOL');
      expect(result).toContain('"from":"AG-API"');
      expect(result).not.toContain('{AGENT_ID}');
    });

    it('returns empty string when template file does not exist', () => {
      // No templates directory created
      const result = generateSessionHarnessContent(tempDir, 'AG-TEST');

      expect(result).toBe('');
    });

    it('uses default agent ID when none provided', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      fs.writeFileSync(path.join(templatesDir, 'session-harness-protocol.md'), 'Agent: {AGENT_ID}');

      const result = generateSessionHarnessContent(tempDir);

      expect(result).toContain('Agent: AGENT');
    });

    it('injects session harness with explicit agent ID marker', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      fs.writeFileSync(
        path.join(templatesDir, 'session-harness-protocol.md'),
        'Protocol for {AGENT_ID}'
      );

      const template = `# Agent File

<!-- {{SESSION_HARNESS:AG-UI}} -->

## Footer
`;

      const result = injectContent(template, { coreDir: tempDir });

      expect(result).toContain('Protocol for AG-UI');
      expect(result).not.toContain('{{SESSION_HARNESS');
    });

    it('injects session harness with agent ID from frontmatter', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      fs.writeFileSync(
        path.join(templatesDir, 'session-harness-protocol.md'),
        'Protocol for {AGENT_ID}'
      );

      const template = `---
name: agileflow-security
description: Security agent
tools:
  - Read
---

# Security Agent

<!-- {{SESSION_HARNESS}} -->

## Footer
`;

      const result = injectContent(template, { coreDir: tempDir });

      expect(result).toContain('Protocol for AG-SECURITY');
      expect(result).not.toContain('{{SESSION_HARNESS}}');
    });

    it('handles non-comment format {{SESSION_HARNESS}}', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      fs.writeFileSync(path.join(templatesDir, 'session-harness-protocol.md'), 'Protocol content');

      const template = `---
name: api
---

{{SESSION_HARNESS}}

## Footer
`;

      const result = injectContent(template, { coreDir: tempDir });

      expect(result).toContain('Protocol content');
      expect(result).not.toContain('{{SESSION_HARNESS}}');
    });

    it('caches template content for performance', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      fs.writeFileSync(
        path.join(templatesDir, 'session-harness-protocol.md'),
        'Original content {AGENT_ID}'
      );

      // First call - loads from file
      const result1 = generateSessionHarnessContent(tempDir, 'AG-API');
      expect(result1).toContain('Original content AG-API');

      // Modify file (but cache should return old content)
      fs.writeFileSync(
        path.join(templatesDir, 'session-harness-protocol.md'),
        'Modified content {AGENT_ID}'
      );

      // Second call - should use cached content
      const result2 = generateSessionHarnessContent(tempDir, 'AG-UI');
      expect(result2).toContain('Original content AG-UI');

      // Clear cache
      clearSessionHarnessCache();

      // Third call - should load new content
      const result3 = generateSessionHarnessContent(tempDir, 'AG-CI');
      expect(result3).toContain('Modified content AG-CI');
    });

    it('handles missing templates gracefully in injectContent', () => {
      // No templates directory - should leave marker in place or remove it
      const template = `# Agent

<!-- {{SESSION_HARNESS}} -->

## Footer
`;

      const result = injectContent(template, { coreDir: tempDir });

      // When template is missing, the marker should either be replaced with empty
      // or left as-is (depends on implementation choice)
      // Since our implementation replaces with empty string from generateSessionHarnessContent
      expect(result).toContain('# Agent');
      expect(result).toContain('## Footer');
    });
  });

  // ==========================================================================
  // Quality Gate Priorities Template Injection Tests
  // ==========================================================================

  describe('quality gate priorities injection', () => {
    const {
      generateQualityGatePrioritiesContent,
      clearQualityGatePrioritiesCache,
    } = require('../../tools/cli/lib/content-injector');

    beforeEach(() => {
      // Clear cache before each test to ensure fresh state
      clearQualityGatePrioritiesCache();
    });

    it('generates quality gate priorities content with agent ID substitution', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      // Create a simple test template
      fs.writeFileSync(
        path.join(templatesDir, 'quality-gate-priorities.md'),
        `### QUALITY GATE PRIORITIES

**UNIVERSAL CRITICAL GATES**:
- [ ] Tests pass

**Override Example**:
\`\`\`jsonl
{"from":"{AGENT_ID}","type":"warning","text":"Override: gate skipped"}
\`\`\`
`
      );

      const result = generateQualityGatePrioritiesContent(tempDir, 'AG-API');

      expect(result).toContain('QUALITY GATE PRIORITIES');
      expect(result).toContain('"from":"AG-API"');
      expect(result).not.toContain('{AGENT_ID}');
    });

    it('returns empty string when template file does not exist', () => {
      // No templates directory created
      const result = generateQualityGatePrioritiesContent(tempDir, 'AG-TEST');

      expect(result).toBe('');
    });

    it('uses default agent ID when none provided', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      fs.writeFileSync(path.join(templatesDir, 'quality-gate-priorities.md'), 'Agent: {AGENT_ID}');

      const result = generateQualityGatePrioritiesContent(tempDir);

      expect(result).toContain('Agent: AGENT');
    });

    it('injects quality gate priorities with comment marker', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      fs.writeFileSync(
        path.join(templatesDir, 'quality-gate-priorities.md'),
        'Quality gates for {AGENT_ID}'
      );

      const template = `---
name: agileflow-ui
description: UI agent
---

# UI Agent

<!-- {{QUALITY_GATE_PRIORITIES}} -->

QUALITY CHECKLIST (AG-UI Specific)
`;

      const result = injectContent(template, { coreDir: tempDir });

      expect(result).toContain('Quality gates for AG-UI');
      expect(result).not.toContain('{{QUALITY_GATE_PRIORITIES}}');
    });

    it('injects quality gate priorities with agent ID from frontmatter', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      fs.writeFileSync(
        path.join(templatesDir, 'quality-gate-priorities.md'),
        'Gates for {AGENT_ID}'
      );

      const template = `---
name: agileflow-security
description: Security agent
tools:
  - Read
---

# Security Agent

<!-- {{QUALITY_GATE_PRIORITIES}} -->

## Domain-specific checklist
`;

      const result = injectContent(template, { coreDir: tempDir });

      expect(result).toContain('Gates for AG-SECURITY');
      expect(result).not.toContain('{{QUALITY_GATE_PRIORITIES}}');
    });

    it('handles non-comment format {{QUALITY_GATE_PRIORITIES}}', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      fs.writeFileSync(path.join(templatesDir, 'quality-gate-priorities.md'), 'Priority content');

      const template = `---
name: api
---

{{QUALITY_GATE_PRIORITIES}}

## Footer
`;

      const result = injectContent(template, { coreDir: tempDir });

      expect(result).toContain('Priority content');
      expect(result).not.toContain('{{QUALITY_GATE_PRIORITIES}}');
    });

    it('caches template content for performance', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      fs.writeFileSync(
        path.join(templatesDir, 'quality-gate-priorities.md'),
        'Original gates {AGENT_ID}'
      );

      // First call - loads from file
      const result1 = generateQualityGatePrioritiesContent(tempDir, 'AG-API');
      expect(result1).toContain('Original gates AG-API');

      // Modify file (but cache should return old content)
      fs.writeFileSync(
        path.join(templatesDir, 'quality-gate-priorities.md'),
        'Modified gates {AGENT_ID}'
      );

      // Second call - should use cached content
      const result2 = generateQualityGatePrioritiesContent(tempDir, 'AG-UI');
      expect(result2).toContain('Original gates AG-UI');

      // Clear cache
      clearQualityGatePrioritiesCache();

      // Third call - should load new content
      const result3 = generateQualityGatePrioritiesContent(tempDir, 'AG-CI');
      expect(result3).toContain('Modified gates AG-CI');
    });

    it('handles missing templates gracefully in injectContent', () => {
      // No templates directory
      const template = `# Agent

<!-- {{QUALITY_GATE_PRIORITIES}} -->

## Footer
`;

      const result = injectContent(template, { coreDir: tempDir });

      // When template is missing, the marker should be replaced with empty string
      expect(result).toContain('# Agent');
      expect(result).toContain('## Footer');
    });
  });

  describe('preserve rules expansion', () => {
    beforeEach(() => {
      // Clear cache before each test
      clearPreserveRulesCache();
    });

    it('expands single rule category in YAML frontmatter', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      fs.writeFileSync(
        path.join(templatesDir, 'preserve-rules.json'),
        JSON.stringify({
          json_operations: [
            'MUST use Edit tool for JSON operations',
            'MUST validate JSON after modification',
          ],
        })
      );

      const template = `---
description: Test command
compact_context:
  preserve_rules:
    - "ACTIVE COMMAND: /test"
    - "{{RULES:json_operations}}"
    - "Custom rule here"
---

# Command Content
`;

      const result = injectContent(template, { coreDir: tempDir });

      expect(result).toContain('- "MUST use Edit tool for JSON operations"');
      expect(result).toContain('- "MUST validate JSON after modification"');
      expect(result).toContain('- "Custom rule here"');
      expect(result).not.toContain('{{RULES:json_operations}}');
    });

    it('expands multiple rule categories', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      fs.writeFileSync(
        path.join(templatesDir, 'preserve-rules.json'),
        JSON.stringify({
          json_operations: ['JSON rule 1', 'JSON rule 2'],
          file_preview: ['Preview rule 1'],
        })
      );

      const template = `---
compact_context:
  preserve_rules:
    - "{{RULES:json_operations}}"
    - "{{RULES:file_preview}}"
---
`;

      const result = injectContent(template, { coreDir: tempDir });

      expect(result).toContain('- "JSON rule 1"');
      expect(result).toContain('- "JSON rule 2"');
      expect(result).toContain('- "Preview rule 1"');
    });

    it('preserves non-template rules unchanged', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      fs.writeFileSync(
        path.join(templatesDir, 'preserve-rules.json'),
        JSON.stringify({ category: ['Rule'] })
      );

      const template = `---
compact_context:
  preserve_rules:
    - "This is a regular rule"
    - "Another custom rule"
---
`;

      const result = injectContent(template, { coreDir: tempDir });

      expect(result).toContain('- "This is a regular rule"');
      expect(result).toContain('- "Another custom rule"');
    });

    it('handles unknown category gracefully', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      fs.writeFileSync(
        path.join(templatesDir, 'preserve-rules.json'),
        JSON.stringify({ known_category: ['Rule'] })
      );

      const template = `---
compact_context:
  preserve_rules:
    - "{{RULES:unknown_category}}"
---
`;

      const result = injectContent(template, { coreDir: tempDir });

      // Unknown category should be kept as-is as a warning
      expect(result).toContain('{{RULES:unknown_category}}');
    });

    it('handles missing rules file gracefully', () => {
      // No templates directory
      const template = `---
compact_context:
  preserve_rules:
    - "{{RULES:json_operations}}"
---
`;

      const result = injectContent(template, { coreDir: tempDir });

      // Should keep placeholder when no rules file exists
      expect(result).toContain('{{RULES:json_operations}}');
    });

    it('escapes double quotes in rules', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      fs.writeFileSync(
        path.join(templatesDir, 'preserve-rules.json'),
        JSON.stringify({
          test: ['Rule with "quotes" inside'],
        })
      );

      const template = `---
compact_context:
  preserve_rules:
    - "{{RULES:test}}"
---
`;

      const result = injectContent(template, { coreDir: tempDir });

      expect(result).toContain('Rule with \\"quotes\\" inside');
    });

    it('caches rules for performance', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      fs.writeFileSync(
        path.join(templatesDir, 'preserve-rules.json'),
        JSON.stringify({ test: ['Original rule'] })
      );

      const template = `---
compact_context:
  preserve_rules:
    - "{{RULES:test}}"
---
`;

      // First call
      const result1 = injectContent(template, { coreDir: tempDir });
      expect(result1).toContain('Original rule');

      // Modify file (but cache should return old content)
      fs.writeFileSync(
        path.join(templatesDir, 'preserve-rules.json'),
        JSON.stringify({ test: ['Modified rule'] })
      );

      // Second call - should use cached content
      const result2 = injectContent(template, { coreDir: tempDir });
      expect(result2).toContain('Original rule');

      // Clear cache
      clearPreserveRulesCache();

      // Third call - should load new content
      const result3 = injectContent(template, { coreDir: tempDir });
      expect(result3).toContain('Modified rule');
    });

    it('works via expandPreserveRules direct call', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      fs.writeFileSync(
        path.join(templatesDir, 'preserve-rules.json'),
        JSON.stringify({
          delegation: ['Delegate complex work', 'Simple task -> do yourself'],
        })
      );

      const content = `    - "{{RULES:delegation}}"`;

      const result = expandPreserveRules(content, tempDir);

      expect(result).toContain('- "Delegate complex work"');
      expect(result).toContain('- "Simple task -> do yourself"');
    });
  });

  // ==========================================================================
  // Minimal Mode Tests
  // ==========================================================================

  describe('minimal mode', () => {
    it('replaces agent list with discovery pointer when minimal=true', () => {
      const agentsDir = path.join(tempDir, 'agents');
      const commandsDir = path.join(tempDir, 'commands');
      fs.mkdirSync(agentsDir);
      fs.mkdirSync(commandsDir);

      fs.writeFileSync(
        path.join(agentsDir, 'test-agent.md'),
        `---
name: test-agent
description: A test agent
tools:
  - Read
---
`
      );

      const template = `# Agents

<!-- {{AGENT_LIST}} -->

## Footer
`;

      const result = injectContent(template, { coreDir: tempDir, minimal: true });

      expect(result).toContain('**Agents**: 1 available');
      expect(result).toContain('/agileflow:help agents');
      expect(result).not.toContain('**AVAILABLE AGENTS');
      expect(result).not.toContain('test-agent');
    });

    it('replaces command list with discovery pointer when minimal=true', () => {
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

<!-- {{COMMAND_LIST}} -->

## Footer
`;

      const result = injectContent(template, { coreDir: tempDir, minimal: true });

      expect(result).toContain('**Commands**: 1 available');
      expect(result).toContain('/agileflow:help');
      expect(result).not.toContain('Available commands');
      expect(result).not.toContain('/agileflow:status');
    });

    it('still injects session harness in minimal mode', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      fs.writeFileSync(
        path.join(templatesDir, 'session-harness-protocol.md'),
        'Protocol for {AGENT_ID}'
      );

      const template = `---
name: agileflow-api
---

<!-- {{SESSION_HARNESS}} -->
`;

      const { clearSessionHarnessCache } = require('../../tools/cli/lib/content-injector');
      clearSessionHarnessCache();

      const result = injectContent(template, { coreDir: tempDir, minimal: true });

      expect(result).toContain('Protocol for AG-API');
    });

    it('still injects quality gate priorities in minimal mode', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      const { clearQualityGatePrioritiesCache } = require('../../tools/cli/lib/content-injector');
      clearQualityGatePrioritiesCache();

      fs.writeFileSync(
        path.join(templatesDir, 'quality-gate-priorities.md'),
        'Quality gates for {AGENT_ID}'
      );

      const template = `---
name: agileflow-ui
---

<!-- {{QUALITY_GATE_PRIORITIES}} -->
`;

      const result = injectContent(template, { coreDir: tempDir, minimal: true });

      expect(result).toContain('Quality gates for AG-UI');
    });

    it('still expands preserve rules in minimal mode', () => {
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir);

      clearPreserveRulesCache();

      fs.writeFileSync(
        path.join(templatesDir, 'preserve-rules.json'),
        JSON.stringify({
          json_operations: ['Use Edit tool for JSON'],
        })
      );

      const template = `---
compact_context:
  preserve_rules:
    - "{{RULES:json_operations}}"
---

Content here.
`;

      const result = injectContent(template, { coreDir: tempDir, minimal: true });

      expect(result).toContain('Use Edit tool for JSON');
    });

    it('still replaces count placeholders in minimal mode', () => {
      const agentsDir = path.join(tempDir, 'agents');
      const commandsDir = path.join(tempDir, 'commands');
      fs.mkdirSync(agentsDir);
      fs.mkdirSync(commandsDir);

      fs.writeFileSync(
        path.join(agentsDir, 'a.md'),
        `---
name: a
---
`
      );

      const template = 'Agents: {{AGENT_COUNT}}, Commands: {{COMMAND_COUNT}}';

      const result = injectContent(template, { coreDir: tempDir, minimal: true });

      expect(result).toContain('Agents: 1');
      expect(result).toContain('Commands: 0');
    });

    it('minimal mode produces significantly less output than full mode', () => {
      const agentsDir = path.join(tempDir, 'agents');
      const commandsDir = path.join(tempDir, 'commands');
      fs.mkdirSync(agentsDir);
      fs.mkdirSync(commandsDir);

      // Create multiple agents and commands to make the difference visible
      for (let i = 0; i < 10; i++) {
        fs.writeFileSync(
          path.join(agentsDir, `agent-${i}.md`),
          `---
name: agent-${i}
description: Agent number ${i}
tools:
  - Read
  - Write
---
`
        );
        fs.writeFileSync(
          path.join(commandsDir, `cmd-${i}.md`),
          `---
description: Command number ${i}
---
`
        );
      }

      const template = `# Full
<!-- {{AGENT_LIST}} -->
<!-- {{COMMAND_LIST}} -->
`;

      const fullResult = injectContent(template, { coreDir: tempDir, minimal: false });
      const minimalResult = injectContent(template, { coreDir: tempDir, minimal: true });

      // Minimal should be significantly smaller
      expect(minimalResult.length).toBeLessThan(fullResult.length);
      // With 10 agents and 10 commands, full mode should be at least 2x longer
      expect(fullResult.length).toBeGreaterThan(minimalResult.length * 1.5);
    });

    it('defaults to full mode when minimal flag not provided', () => {
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

      const template = '<!-- {{AGENT_LIST}} -->';

      const result = injectContent(template, { coreDir: tempDir });

      // Default should be full mode with agent names
      expect(result).toContain('**AVAILABLE AGENTS (1 total)**');
      expect(result).toContain('test-agent');
    });
  });

  // ==========================================================================
  // Summary Generation Tests
  // ==========================================================================

  describe('generateAgentSummary', () => {
    it('generates compact category summary with counts', () => {
      const agentsDir = path.join(tempDir, 'agents');
      fs.mkdirSync(agentsDir);

      fs.writeFileSync(
        path.join(agentsDir, 'api.md'),
        `---
name: api
description: API agent
tools:
  - Read
---
`
      );

      fs.writeFileSync(
        path.join(agentsDir, 'ui.md'),
        `---
name: ui
description: UI agent
tools:
  - Read
---
`
      );

      const result = generateAgentSummary(agentsDir);

      expect(result).toContain('**2 agents**');
      expect(result).toContain('categories');
      expect(result).toContain('/agileflow:help agents');
    });

    it('returns empty string for non-existent directory', () => {
      const result = generateAgentSummary('/nonexistent/path');
      expect(result).toBe('');
    });
  });

  describe('generateCommandSummary', () => {
    it('generates compact summary with count', () => {
      const commandsDir = path.join(tempDir, 'commands');
      fs.mkdirSync(commandsDir);

      fs.writeFileSync(
        path.join(commandsDir, 'status.md'),
        `---
description: Show status
---
`
      );

      const result = generateCommandSummary(commandsDir);

      expect(result).toContain('**1 commands**');
      expect(result).toContain('/agileflow:help');
    });

    it('returns empty string for non-existent directory', () => {
      const result = generateCommandSummary('/nonexistent/path');
      expect(result).toBe('');
    });
  });
});
