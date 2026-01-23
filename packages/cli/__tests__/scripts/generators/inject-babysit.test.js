/**
 * Integration Tests for inject-babysit.js
 *
 * Tests agent list generation with fixture data.
 * Verifies actual file output, not mocked behavior.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  generateAgentList,
  generateCommandReference,
  injectContentByMarker,
  addMarkersIfMissing,
} = require('../../../scripts/generators/inject-babysit');

describe('inject-babysit.js', () => {
  let tempDir;
  let agentsDir;

  beforeEach(() => {
    // Create fresh temp directory with fixture structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-babysit-test-'));
    agentsDir = path.join(tempDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ===========================================================================
  // Fixture data creation helpers
  // ===========================================================================

  function createAgentFixture(name, options = {}) {
    const {
      description = `${name} agent description`,
      tools = ['Read', 'Write'],
      model = 'haiku',
    } = options;

    const content = `---
name: ${name}
description: ${description}
tools:
${tools.map(t => `  - ${t}`).join('\n')}
model: ${model}
---

# ${name}

Agent implementation content.
`;

    fs.writeFileSync(path.join(agentsDir, `${name}.md`), content, 'utf-8');
  }

  function createAgentFixtureWithStringTools(name, toolsString) {
    const content = `---
name: ${name}
description: ${name} description
tools: ${toolsString}
model: sonnet
---
`;
    fs.writeFileSync(path.join(agentsDir, `${name}.md`), content, 'utf-8');
  }

  // ===========================================================================
  // generateAgentList tests
  // ===========================================================================

  describe('generateAgentList', () => {
    it('generates agent list with single agent fixture', () => {
      const agents = [
        {
          name: 'test-agent',
          description: 'A test agent',
          tools: ['Read', 'Write', 'Bash'],
          model: 'sonnet',
          category: 'Core Development',
        },
      ];

      const result = generateAgentList(agents);

      expect(result).toContain('**AVAILABLE AGENTS** (1 total):');
      expect(result).toContain('1. **test-agent** (model: sonnet)');
      expect(result).toContain('**Purpose**: A test agent');
      expect(result).toContain('**Tools**: Read, Write, Bash');
      expect(result).toContain('**Category**: Core Development');
    });

    it('generates agent list with multiple agents in correct order', () => {
      const agents = [
        {
          name: 'zebra-agent',
          description: 'Zebra agent',
          tools: ['Read'],
          model: 'haiku',
          category: 'Other',
        },
        {
          name: 'alpha-agent',
          description: 'Alpha agent',
          tools: ['Write'],
          model: 'opus',
          category: 'Other',
        },
      ];

      const result = generateAgentList(agents);

      expect(result).toContain('**AVAILABLE AGENTS** (2 total):');
      expect(result).toContain('1. **zebra-agent**');
      expect(result).toContain('2. **alpha-agent**');
    });

    it('generates empty list for empty agent array', () => {
      const result = generateAgentList([]);

      expect(result).toContain('**AVAILABLE AGENTS** (0 total):');
    });

    it('handles agents with many tools', () => {
      const agents = [
        {
          name: 'full-agent',
          description: 'Full access agent',
          tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Task'],
          model: 'opus',
          category: 'Core Development',
        },
      ];

      const result = generateAgentList(agents);

      expect(result).toContain('**Tools**: Read, Write, Edit, Bash, Glob, Grep, Task');
    });

    it('handles agents with empty tools array', () => {
      const agents = [
        {
          name: 'no-tools-agent',
          description: 'Agent without tools',
          tools: [],
          model: 'haiku',
          category: 'Other',
        },
      ];

      const result = generateAgentList(agents);

      expect(result).toContain('**Tools**: ');
    });

    it('handles agents with empty description', () => {
      const agents = [
        {
          name: 'silent-agent',
          description: '',
          tools: ['Read'],
          model: 'haiku',
          category: 'Other',
        },
      ];

      const result = generateAgentList(agents);

      expect(result).toContain('**Purpose**: ');
    });

    it('generates properly formatted output structure', () => {
      const agents = [
        {
          name: 'structured-agent',
          description: 'Well structured agent',
          tools: ['Read', 'Write'],
          model: 'sonnet',
          category: 'Testing',
        },
      ];

      const result = generateAgentList(agents);

      // Verify structure
      const lines = result.split('\n');
      expect(lines[0]).toBe('**AVAILABLE AGENTS** (1 total):');
      expect(lines[1]).toBe('');
      expect(lines[2]).toContain('1. **structured-agent** (model: sonnet)');
      expect(lines[3]).toContain('   - **Purpose**:');
      expect(lines[4]).toContain('   - **Tools**:');
      expect(lines[5]).toContain('   - **Category**:');
    });
  });

  // ===========================================================================
  // generateCommandReference tests
  // ===========================================================================

  describe('generateCommandReference', () => {
    it('generates command reference grouped by category', () => {
      const commands = [
        { name: 'status', category: 'Story Management' },
        { name: 'assign', category: 'Story Management' },
        { name: 'verify', category: 'Development' },
      ];

      const result = generateCommandReference(commands);

      expect(result).toContain('**Story Management**: status, assign');
      expect(result).toContain('**Development**: verify');
    });

    it('handles single command per category', () => {
      const commands = [
        { name: 'deploy', category: 'Deployment' },
        { name: 'test', category: 'Testing' },
      ];

      const result = generateCommandReference(commands);

      expect(result).toContain('**Deployment**: deploy');
      expect(result).toContain('**Testing**: test');
    });

    it('handles empty command array', () => {
      const result = generateCommandReference([]);

      expect(result).toBe('');
    });

    it('handles many commands in one category', () => {
      const commands = [
        { name: 'cmd1', category: 'System' },
        { name: 'cmd2', category: 'System' },
        { name: 'cmd3', category: 'System' },
        { name: 'cmd4', category: 'System' },
      ];

      const result = generateCommandReference(commands);

      expect(result).toContain('**System**: cmd1, cmd2, cmd3, cmd4');
    });
  });

  // ===========================================================================
  // injectContentByMarker tests
  // ===========================================================================

  describe('injectContentByMarker', () => {
    it('injects content between AUTOGEN markers', () => {
      const content = `# Header

<!-- AUTOGEN:AGENT_LIST:START -->
Old content here
<!-- AUTOGEN:AGENT_LIST:END -->

# Footer
`;

      const generated = '**NEW CONTENT**';
      const result = injectContentByMarker(content, 'AGENT_LIST', generated);

      expect(result).toContain('<!-- AUTOGEN:AGENT_LIST:START -->');
      expect(result).toContain('**NEW CONTENT**');
      expect(result).toContain('<!-- AUTOGEN:AGENT_LIST:END -->');
      expect(result).not.toContain('Old content here');
      expect(result).toContain('# Header');
      expect(result).toContain('# Footer');
    });

    it('adds timestamp comment in injection', () => {
      const content = `<!-- AUTOGEN:TEST:START -->
existing
<!-- AUTOGEN:TEST:END -->`;

      const result = injectContentByMarker(content, 'TEST', 'new content');

      expect(result).toMatch(/Auto-generated on \d{4}-\d{2}-\d{2}/);
      expect(result).toContain('Do not edit manually');
    });

    it('returns original content when markers not found', () => {
      const content = '# No markers here\n\nJust regular content.';

      const result = injectContentByMarker(content, 'MISSING', 'new content');

      expect(result).toBe(content);
    });

    it('returns original content when only start marker exists', () => {
      const content = '<!-- AUTOGEN:PARTIAL:START -->\nContent';

      const result = injectContentByMarker(content, 'PARTIAL', 'new');

      expect(result).toBe(content);
    });

    it('returns original content when only end marker exists', () => {
      const content = 'Content\n<!-- AUTOGEN:PARTIAL:END -->';

      const result = injectContentByMarker(content, 'PARTIAL', 'new');

      expect(result).toBe(content);
    });

    it('handles multiple injections with different markers', () => {
      const content = `<!-- AUTOGEN:A:START -->
old A
<!-- AUTOGEN:A:END -->

<!-- AUTOGEN:B:START -->
old B
<!-- AUTOGEN:B:END -->`;

      let result = injectContentByMarker(content, 'A', 'new A');
      result = injectContentByMarker(result, 'B', 'new B');

      expect(result).toContain('new A');
      expect(result).toContain('new B');
      expect(result).not.toContain('old A');
      expect(result).not.toContain('old B');
    });

    it('preserves content before and after markers', () => {
      const content = `First paragraph.

<!-- AUTOGEN:MIDDLE:START -->
replaceable
<!-- AUTOGEN:MIDDLE:END -->

Last paragraph.`;

      const result = injectContentByMarker(content, 'MIDDLE', 'inserted');

      expect(result).toContain('First paragraph.');
      expect(result).toContain('Last paragraph.');
      expect(result).toContain('inserted');
    });
  });

  // ===========================================================================
  // addMarkersIfMissing tests
  // ===========================================================================

  describe('addMarkersIfMissing', () => {
    it('adds AGENT_LIST markers around agent section', () => {
      const content = `# Babysit Command

Some intro text.

**AVAILABLE AGENTS** (10 total):

1. Agent one
2. Agent two

**WHEN TO SPAWN AGENTS**

Guidelines here.
`;

      const result = addMarkersIfMissing(content);

      expect(result).toContain('<!-- AUTOGEN:AGENT_LIST:START -->');
      expect(result).toContain('<!-- AUTOGEN:AGENT_LIST:END -->');
    });

    it('does not add markers if already present', () => {
      const content = `<!-- AUTOGEN:AGENT_LIST:START -->
Existing content
<!-- AUTOGEN:AGENT_LIST:END -->`;

      const result = addMarkersIfMissing(content);

      // Should not have duplicate markers
      const startCount = (result.match(/AUTOGEN:AGENT_LIST:START/g) || []).length;
      expect(startCount).toBe(1);
    });

    it('returns content unchanged if no agent section found', () => {
      const content = '# Other Content\n\nNo agent list here.';

      const result = addMarkersIfMissing(content);

      expect(result).not.toContain('AUTOGEN');
    });

    it('returns content unchanged if WHEN TO SPAWN section not found', () => {
      const content = `**AVAILABLE AGENTS** (5 total):

1. Agent one

But no end marker section.`;

      const result = addMarkersIfMissing(content);

      // Should not add markers if we can't find the end boundary
      expect(result).not.toContain('AUTOGEN');
    });
  });

  // ===========================================================================
  // Edge case tests
  // ===========================================================================

  describe('edge cases', () => {
    it('handles agent with special characters in description', () => {
      const agents = [
        {
          name: 'special-agent',
          description: 'Handles "quotes" and <tags> and & symbols',
          tools: ['Read'],
          model: 'haiku',
          category: 'Other',
        },
      ];

      const result = generateAgentList(agents);

      expect(result).toContain('Handles "quotes" and <tags> and & symbols');
    });

    it('handles agent with unicode in name/description', () => {
      const agents = [
        {
          name: 'emoji-agent',
          description: 'Supports émojis and ünïcödé ✨',
          tools: ['Read'],
          model: 'haiku',
          category: 'Other',
        },
      ];

      const result = generateAgentList(agents);

      expect(result).toContain('emoji-agent');
      expect(result).toContain('émojis and ünïcödé ✨');
    });

    it('handles very long tool list gracefully', () => {
      const manyTools = Array.from({ length: 20 }, (_, i) => `Tool${i + 1}`);
      const agents = [
        {
          name: 'mega-agent',
          description: 'Has many tools',
          tools: manyTools,
          model: 'opus',
          category: 'Core',
        },
      ];

      const result = generateAgentList(agents);

      expect(result).toContain('Tool1, Tool2');
      expect(result).toContain('Tool20');
    });

    it('handles content with Windows line endings', () => {
      const content = '<!-- AUTOGEN:TEST:START -->\r\nold\r\n<!-- AUTOGEN:TEST:END -->\r\n';

      const result = injectContentByMarker(content, 'TEST', 'new');

      expect(result).toContain('new');
    });

    it('handles marker names with numbers', () => {
      const content = `<!-- AUTOGEN:SECTION_1:START -->
content
<!-- AUTOGEN:SECTION_1:END -->`;

      const result = injectContentByMarker(content, 'SECTION_1', 'updated');

      expect(result).toContain('updated');
    });
  });

  // ===========================================================================
  // Integration tests with actual file operations
  // ===========================================================================

  describe('integration with file system', () => {
    it('roundtrip: inject content and read back', () => {
      const testFile = path.join(tempDir, 'test.md');
      const initialContent = `# Test

<!-- AUTOGEN:AGENTS:START -->
placeholder
<!-- AUTOGEN:AGENTS:END -->

Footer.
`;

      fs.writeFileSync(testFile, initialContent, 'utf-8');

      // Read, inject, write
      let content = fs.readFileSync(testFile, 'utf-8');
      content = injectContentByMarker(content, 'AGENTS', 'INJECTED CONTENT');
      fs.writeFileSync(testFile, content, 'utf-8');

      // Read back and verify
      const final = fs.readFileSync(testFile, 'utf-8');
      expect(final).toContain('INJECTED CONTENT');
      expect(final).toContain('# Test');
      expect(final).toContain('Footer.');
      expect(final).not.toContain('placeholder');
    });

    it('multiple sequential injections to same file', () => {
      const testFile = path.join(tempDir, 'multi.md');
      const initialContent = `<!-- AUTOGEN:A:START -->
a
<!-- AUTOGEN:A:END -->

<!-- AUTOGEN:B:START -->
b
<!-- AUTOGEN:B:END -->`;

      fs.writeFileSync(testFile, initialContent, 'utf-8');

      let content = fs.readFileSync(testFile, 'utf-8');
      content = injectContentByMarker(content, 'A', 'Section A Updated');
      content = injectContentByMarker(content, 'B', 'Section B Updated');
      fs.writeFileSync(testFile, content, 'utf-8');

      const final = fs.readFileSync(testFile, 'utf-8');
      expect(final).toContain('Section A Updated');
      expect(final).toContain('Section B Updated');
    });
  });
});
