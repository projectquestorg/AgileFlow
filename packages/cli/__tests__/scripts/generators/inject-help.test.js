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
    it('generates command list grouped by category', () => {
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

      expect(result).toContain('**Story Management:**');
      expect(result).toContain('**Development:**');
      expect(result).toContain('`/agileflow:status STORY=<id>`');
      expect(result).toContain('Show story status');
      expect(result).toContain('`/agileflow:verify`');
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

      expect(result).toContain('`/agileflow:help`');
      expect(result).not.toContain('`/agileflow:help `'); // No trailing space
    });

    it('handles commands with complex argument hints', () => {
      const commands = [
        {
          name: 'sprint',
          description: 'Sprint planning',
          argumentHint: '[SPRINT=<id>] [DURATION=<days>] [MODE=suggest|commit]',
          category: 'Planning',
        },
      ];

      const result = generateCommandList(commands);

      expect(result).toContain(
        '`/agileflow:sprint [SPRINT=<id>] [DURATION=<days>] [MODE=suggest|commit]`'
      );
    });

    it('groups multiple commands in same category', () => {
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

      // Should have single Story Management header
      const categoryCount = (result.match(/\*\*Story Management:\*\*/g) || []).length;
      expect(categoryCount).toBe(1);

      // All commands should be under it
      expect(result).toContain('/agileflow:story');
      expect(result).toContain('/agileflow:epic');
      expect(result).toContain('/agileflow:assign');
    });

    it('generates empty string for empty command array', () => {
      const result = generateCommandList([]);

      expect(result).toBe('');
    });

    it('handles many categories', () => {
      const commands = [
        { name: 'cmd1', description: 'Desc 1', argumentHint: '', category: 'Category A' },
        { name: 'cmd2', description: 'Desc 2', argumentHint: '', category: 'Category B' },
        { name: 'cmd3', description: 'Desc 3', argumentHint: '', category: 'Category C' },
        { name: 'cmd4', description: 'Desc 4', argumentHint: '', category: 'Category D' },
      ];

      const result = generateCommandList(commands);

      expect(result).toContain('**Category A:**');
      expect(result).toContain('**Category B:**');
      expect(result).toContain('**Category C:**');
      expect(result).toContain('**Category D:**');
    });

    it('adds blank lines between categories', () => {
      const commands = [
        { name: 'a', description: 'A', argumentHint: '', category: 'First' },
        { name: 'b', description: 'B', argumentHint: '', category: 'Second' },
      ];

      const result = generateCommandList(commands);
      const lines = result.split('\n');

      // Find the blank line between categories
      let foundBlankBetweenCategories = false;
      for (let i = 1; i < lines.length - 1; i++) {
        if (
          lines[i] === '' &&
          lines[i - 1].includes('/agileflow:') &&
          lines[i + 1].includes('**')
        ) {
          foundBlankBetweenCategories = true;
          break;
        }
      }
      expect(foundBlankBetweenCategories).toBe(true);
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
    it('handles command with special characters in description', () => {
      const commands = [
        {
          name: 'special',
          description: 'Handles "quotes", <tags>, & ampersands',
          argumentHint: '',
          category: 'Test',
        },
      ];

      const result = generateCommandList(commands);

      expect(result).toContain('Handles "quotes", <tags>, & ampersands');
    });

    it('handles command with unicode description', () => {
      const commands = [
        {
          name: 'unicode',
          description: 'Supports émojis 🎉 and ünïcödé',
          argumentHint: '',
          category: 'Test',
        },
      ];

      const result = generateCommandList(commands);

      expect(result).toContain('émojis 🎉 and ünïcödé');
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

      expect(result).toContain('/agileflow:very-long-command-name-that-exceeds-normal-length');
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

      expect(result).toContain('/agileflow:story:view');
      expect(result).toContain('/agileflow:story:list');
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

      expect(result).toContain('`/agileflow:nodesc` - ');
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

      expect(result).toContain('**Quality & Testing:**');
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
      expect(final).toContain('/agileflow:help');
      expect(final).toContain('/agileflow:status STORY=<id>');
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

      // Should be a valid markdown list item
      expect(result).toMatch(/^- `/m);
      expect(result).toContain('` - ');
    });

    it('command entries follow consistent format', () => {
      const commands = [
        { name: 'cmd1', description: 'Description 1', argumentHint: 'A=<a>', category: 'Cat' },
        { name: 'cmd2', description: 'Description 2', argumentHint: '', category: 'Cat' },
      ];

      const result = generateCommandList(commands);

      // Both should follow pattern: - `/agileflow:name [args]` - description
      expect(result).toMatch(/- `\/agileflow:cmd1 A=<a>` - Description 1/);
      expect(result).toMatch(/- `\/agileflow:cmd2` - Description 2/);
    });

    it('categories are bold formatted', () => {
      const commands = [{ name: 'x', description: 'X', argumentHint: '', category: 'My Category' }];

      const result = generateCommandList(commands);

      expect(result).toContain('**My Category:**');
    });
  });
});
