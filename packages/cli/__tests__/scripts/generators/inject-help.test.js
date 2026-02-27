/**
 * Integration Tests for inject-help.js
 *
 * Tests command list generation with fixture data.
 * Verifies actual file output, not mocked behavior.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { generateCommandList, injectContent } = require('../../../scripts/generators/inject-help');

describe('inject-help.js', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-help-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ===========================================================================
  // generateCommandList tests
  // ===========================================================================

  describe('generateCommandList', () => {
    it('generates compact category summary with counts', () => {
      const commands = [
        {
          name: 'status',
          description: 'Show story status',
          argumentHint: 'STORY=<id>',
          category: 'Story Management',
        },
        {
          name: 'verify',
          description: 'Run verification',
          argumentHint: '',
          category: 'Development',
        },
      ];

      const result = generateCommandList(commands);

      expect(result).toContain('**2 commands** across 2 categories:');
      expect(result).toContain('**Story Management** (1): status');
      expect(result).toContain('**Development** (1): verify');
      expect(result).toContain('Browse all:');
    });

    it('handles commands without argument hints', () => {
      const commands = [
        {
          name: 'help',
          description: 'Show help',
          argumentHint: '',
          category: 'System',
        },
      ];

      const result = generateCommandList(commands);

      expect(result).toContain('help');
      expect(result).toContain('**System** (1)');
    });

    it('handles commands with complex argument hints (names still appear as examples)', () => {
      const commands = [
        {
          name: 'sprint',
          description: 'Sprint planning',
          argumentHint: '[SPRINT=<id>] [DURATION=<days>] [MODE=suggest|commit]',
          category: 'Planning',
        },
      ];

      const result = generateCommandList(commands);

      expect(result).toContain('**Planning** (1): sprint');
    });

    it('groups multiple commands in same category with count', () => {
      const commands = [
        {
          name: 'story',
          description: 'Create story',
          argumentHint: '',
          category: 'Story Management',
        },
        {
          name: 'epic',
          description: 'Create epic',
          argumentHint: '',
          category: 'Story Management',
        },
        {
          name: 'assign',
          description: 'Assign story',
          argumentHint: '',
          category: 'Story Management',
        },
      ];

      const result = generateCommandList(commands);

      // Should have single Story Management header with count
      const categoryCount = (result.match(/\*\*Story Management\*\*/g) || []).length;
      expect(categoryCount).toBe(1);
      expect(result).toContain('**Story Management** (3)');

      // All commands should appear as examples
      expect(result).toContain('story');
      expect(result).toContain('epic');
      expect(result).toContain('assign');
    });

    it('generates summary header for empty command array', () => {
      const result = generateCommandList([]);

      expect(result).toContain('**0 commands**');
    });

    it('handles many categories', () => {
      const commands = [
        { name: 'cmd1', description: 'Desc 1', argumentHint: '', category: 'Category A' },
        { name: 'cmd2', description: 'Desc 2', argumentHint: '', category: 'Category B' },
        { name: 'cmd3', description: 'Desc 3', argumentHint: '', category: 'Category C' },
        { name: 'cmd4', description: 'Desc 4', argumentHint: '', category: 'Category D' },
      ];

      const result = generateCommandList(commands);

      expect(result).toContain('**4 commands** across 4 categories:');
      expect(result).toContain('**Category A** (1)');
      expect(result).toContain('**Category B** (1)');
      expect(result).toContain('**Category C** (1)');
      expect(result).toContain('**Category D** (1)');
    });

    it('truncates to 3 examples and shows +N more for large categories', () => {
      const commands = [
        { name: 'a', description: 'A', argumentHint: '', category: 'Big' },
        { name: 'b', description: 'B', argumentHint: '', category: 'Big' },
        { name: 'c', description: 'C', argumentHint: '', category: 'Big' },
        { name: 'd', description: 'D', argumentHint: '', category: 'Big' },
        { name: 'e', description: 'E', argumentHint: '', category: 'Big' },
      ];

      const result = generateCommandList(commands);

      expect(result).toContain('**Big** (5): a, b, c, +2 more');
    });
  });

  // ===========================================================================
  // injectContent tests
  // ===========================================================================

  describe('injectContent', () => {
    it('injects content between COMMAND_LIST markers', () => {
      const content = `# Help

<!-- AUTOGEN:COMMAND_LIST:START -->
Old command list
<!-- AUTOGEN:COMMAND_LIST:END -->

## More info
`;

      const generated = '**New Commands**\n- Command 1\n- Command 2';
      const result = injectContent(content, generated);

      expect(result).toContain('<!-- AUTOGEN:COMMAND_LIST:START -->');
      expect(result).toContain('**New Commands**');
      expect(result).toContain('Command 1');
      expect(result).not.toContain('Old command list');
    });

    it('preserves content before and after markers', () => {
      const content = `# Header Before

<!-- AUTOGEN:COMMAND_LIST:START -->
middle
<!-- AUTOGEN:COMMAND_LIST:END -->

# Footer After`;

      const result = injectContent(content, 'INJECTED');

      expect(result).toContain('# Header Before');
      expect(result).toContain('# Footer After');
      expect(result).toContain('INJECTED');
    });

    it('adds timestamp comment', () => {
      const content = `<!-- AUTOGEN:COMMAND_LIST:START -->
x
<!-- AUTOGEN:COMMAND_LIST:END -->`;

      const result = injectContent(content, 'new');

      expect(result).toMatch(/Auto-generated on \d{4}-\d{2}-\d{2}/);
      expect(result).toContain('Do not edit manually');
    });

    it('returns original content when markers not found', () => {
      const content = '# No markers here';

      const result = injectContent(content, 'ignored');

      expect(result).toBe(content);
    });

    it('returns original content when only START marker exists', () => {
      const content = '<!-- AUTOGEN:COMMAND_LIST:START -->\nContent';

      const result = injectContent(content, 'new');

      expect(result).toBe(content);
    });

    it('returns original content when only END marker exists', () => {
      const content = 'Content\n<!-- AUTOGEN:COMMAND_LIST:END -->';

      const result = injectContent(content, 'new');

      expect(result).toBe(content);
    });

    it('handles multiple injections (idempotent)', () => {
      const content = `<!-- AUTOGEN:COMMAND_LIST:START -->
original
<!-- AUTOGEN:COMMAND_LIST:END -->`;

      const first = injectContent(content, 'First injection');
      const second = injectContent(first, 'Second injection');

      expect(second).toContain('Second injection');
      expect(second).not.toContain('First injection');
      expect(second).not.toContain('original');
    });
  });

  // ===========================================================================
  // Edge case tests
  // ===========================================================================

  describe('edge cases', () => {
    it('handles command with special characters in category name', () => {
      const commands = [
        {
          name: 'special',
          description: 'Handles "quotes", <tags>, & ampersands',
          argumentHint: '',
          category: 'Test',
        },
      ];

      const result = generateCommandList(commands);

      expect(result).toContain('**Test** (1): special');
    });

    it('handles command with unicode description', () => {
      const commands = [
        {
          name: 'unicode',
          description: 'Supports émojis and ünïcödé',
          argumentHint: '',
          category: 'Test',
        },
      ];

      const result = generateCommandList(commands);

      expect(result).toContain('unicode');
    });

    it('handles very long command name', () => {
      const commands = [
        {
          name: 'very-long-command-name-that-exceeds-normal-length',
          description: 'Long name command',
          argumentHint: '',
          category: 'Test',
        },
      ];

      const result = generateCommandList(commands);

      expect(result).toContain('very-long-command-name-that-exceeds-normal-length');
    });

    it('handles namespaced commands (e.g., story:view)', () => {
      const commands = [
        {
          name: 'story:view',
          description: 'View a story',
          argumentHint: 'STORY=<id>',
          category: 'Story Management',
        },
        {
          name: 'story:list',
          description: 'List stories',
          argumentHint: '',
          category: 'Story Management',
        },
      ];

      const result = generateCommandList(commands);

      expect(result).toContain('story:view');
      expect(result).toContain('story:list');
    });

    it('handles content with Windows line endings', () => {
      const content =
        '<!-- AUTOGEN:COMMAND_LIST:START -->\r\nold\r\n<!-- AUTOGEN:COMMAND_LIST:END -->';

      const result = injectContent(content, 'new');

      expect(result).toContain('new');
    });

    it('handles empty description', () => {
      const commands = [
        {
          name: 'nodesc',
          description: '',
          argumentHint: '',
          category: 'Test',
        },
      ];

      const result = generateCommandList(commands);

      expect(result).toContain('nodesc');
    });

    it('handles category with special characters', () => {
      const commands = [
        {
          name: 'cmd',
          description: 'Test',
          argumentHint: '',
          category: 'Quality & Testing',
        },
      ];

      const result = generateCommandList(commands);

      expect(result).toContain('**Quality & Testing** (1)');
    });
  });

  // ===========================================================================
  // Integration tests with actual file operations
  // ===========================================================================

  describe('integration with file system', () => {
    it('roundtrip: inject command list into file', () => {
      const testFile = path.join(tempDir, 'help.md');
      const initialContent = `# AgileFlow Help

Available commands:

<!-- AUTOGEN:COMMAND_LIST:START -->
placeholder
<!-- AUTOGEN:COMMAND_LIST:END -->

## Getting Started
`;

      fs.writeFileSync(testFile, initialContent, 'utf-8');

      // Generate command list
      const commands = [
        { name: 'help', description: 'Show help', argumentHint: '', category: 'System' },
        {
          name: 'status',
          description: 'Show status',
          argumentHint: 'STORY=<id>',
          category: 'Story',
        },
      ];
      const commandList = generateCommandList(commands);

      // Read, inject, write
      let content = fs.readFileSync(testFile, 'utf-8');
      content = injectContent(content, commandList);
      fs.writeFileSync(testFile, content, 'utf-8');

      // Read back and verify
      const final = fs.readFileSync(testFile, 'utf-8');
      expect(final).toContain('help');
      expect(final).toContain('status');
      expect(final).toContain('**2 commands**');
      expect(final).toContain('# AgileFlow Help');
      expect(final).toContain('## Getting Started');
      expect(final).not.toContain('placeholder');
    });

    it('preserves file structure with complex content', () => {
      const testFile = path.join(tempDir, 'complex.md');
      const initialContent = `---
title: Help
---

# Header

Some intro text with **bold** and _italic_.

\`\`\`javascript
const example = true;
\`\`\`

<!-- AUTOGEN:COMMAND_LIST:START -->
old
<!-- AUTOGEN:COMMAND_LIST:END -->

## Footer

More content.
`;

      fs.writeFileSync(testFile, initialContent, 'utf-8');

      let content = fs.readFileSync(testFile, 'utf-8');
      content = injectContent(content, 'NEW COMMANDS');
      fs.writeFileSync(testFile, content, 'utf-8');

      const final = fs.readFileSync(testFile, 'utf-8');
      expect(final).toContain('title: Help');
      expect(final).toContain('const example = true;');
      expect(final).toContain('NEW COMMANDS');
      expect(final).toContain('## Footer');
    });
  });

  // ===========================================================================
  // Output format validation tests
  // ===========================================================================

  describe('output format validation', () => {
    it('generates valid markdown list format', () => {
      const commands = [
        { name: 'test', description: 'Test command', argumentHint: 'ARG=<val>', category: 'Test' },
      ];

      const result = generateCommandList(commands);

      // Should contain a markdown list item for the category
      expect(result).toMatch(/^- \*\*/m);
    });

    it('command names appear as examples in category', () => {
      const commands = [
        { name: 'cmd1', description: 'Description 1', argumentHint: 'A=<a>', category: 'Cat' },
        { name: 'cmd2', description: 'Description 2', argumentHint: '', category: 'Cat' },
      ];

      const result = generateCommandList(commands);

      expect(result).toContain('cmd1');
      expect(result).toContain('cmd2');
      expect(result).toContain('**Cat** (2)');
    });

    it('categories are bold formatted with counts', () => {
      const commands = [{ name: 'x', description: 'X', argumentHint: '', category: 'My Category' }];

      const result = generateCommandList(commands);

      expect(result).toContain('**My Category** (1)');
    });
  });
});
