/**
 * Tests for ide-generator.js - IDE-specific content generation
 *
 * Tests all exported functions:
 * - generateForIde() with all IDE targets
 * - generateCommandForIde() for each IDE
 * - generateAgentForIde() for each IDE
 * - Claude Code passthrough behavior
 * - Command prefix conversion
 * - Frontmatter handling
 */

// Mock the YAML utilities
jest.mock('../../../../lib/yaml-utils', () => ({
  yaml: {
    dump: jest.fn(obj => {
      // Simple YAML serialization for tests
      let result = '';
      for (const [key, value] of Object.entries(obj)) {
        result += `${key}: ${value}\n`;
      }
      return result;
    }),
  },
}));

// Mock the content-transformer module
jest.mock('../../../../tools/cli/lib/content-transformer', () => ({
  transformForIde: jest.fn((content, targetIde, options) => {
    // Mock basic IDE transformations
    let result = content;

    // Apply IDE-specific replacements
    const replacements = {
      codex: { 'Claude Code': 'OpenAI Codex', '.claude/': '.codex/' },
      cursor: { 'Claude Code': 'Cursor', '.claude/': '.cursor/' },
      windsurf: { 'Claude Code': 'Windsurf', '.claude/': '.windsurf/' },
    };

    if (replacements[targetIde]) {
      for (const [pattern, replacement] of Object.entries(replacements[targetIde])) {
        result = result.replace(new RegExp(pattern, 'g'), replacement);
      }
    }

    return result;
  }),
  transformToolReferences: jest.fn((content, targetIde) => {
    // Mock tool reference transformations
    if (targetIde === 'cursor') {
      return content.replace(/AskUserQuestion/g, 'numbered list prompt');
    }
    if (targetIde === 'windsurf') {
      return content
        .replace(/AskUserQuestion/g, 'numbered list prompt')
        .replace(/EnterPlanMode/g, 'megaplan');
    }
    if (targetIde === 'codex') {
      return content
        .replace(/AskUserQuestion/g, 'ask_user_question')
        .replace(/EnterPlanMode/g, '(not available in Codex)');
    }
    return content;
  }),
  replaceReferences: jest.fn((content, replacements) => {
    let result = content;
    if (typeof replacements === 'object') {
      for (const [pattern, replacement] of Object.entries(replacements)) {
        result = result.replace(new RegExp(pattern, 'g'), replacement);
      }
    }
    return result;
  }),
  stripFrontmatter: jest.fn(content => {
    // Remove frontmatter
    const match = content.match(/^---\n[\s\S]*?\n---\n*/);
    if (!match) return content;
    return content.slice(match[0].length).trim();
  }),
  getFrontmatter: jest.fn(content => {
    // Parse simple YAML frontmatter
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};

    const result = {};
    const lines = match[1].split('\n');
    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length > 0) {
        result[key.trim()] = valueParts.join(':').trim();
      }
    }
    return result;
  }),
  convertFrontmatter: jest.fn((frontmatter, config) => {
    // Simple conversion
    return frontmatter;
  }),
}));

const ideGenerator = require('../../../../tools/cli/lib/ide-generator');

describe('ide-generator.js', () => {
  beforeEach(() => {
    // Clear mock call history before each test
    jest.clearAllMocks();
  });

  describe('generateForIde()', () => {
    describe('with Claude Code target', () => {
      it('returns content unchanged for canonical format', () => {
        const content = 'Test content with /agileflow:cmd and AskUserQuestion';
        const result = ideGenerator.generateForIde(content, 'claude-code');
        expect(result).toBe(content);
      });

      it('does not apply transformations for claude-code', () => {
        const content = 'Use the Task tool';
        const result = ideGenerator.generateForIde(content, 'claude-code');
        expect(result).toBe(content);
      });
    });

    describe('with Cursor target', () => {
      it('converts /agileflow:foo:bar to /foo-bar', () => {
        const content = 'Try /agileflow:story:list command';
        const result = ideGenerator.generateForIde(content, 'cursor', {
          transformPrefixes: true,
        });
        expect(result).toContain('/story-list');
      });

      it('applies tool reference transformations', () => {
        const content = 'Call the AskUserQuestion tool';
        const result = ideGenerator.generateForIde(content, 'cursor', {
          transformTools: true,
        });
        expect(result).toContain('numbered list prompt');
      });

      it('replaces Claude Code references', () => {
        const content = 'Claude Code supports the Task tool';
        const result = ideGenerator.generateForIde(content, 'cursor');
        expect(result).toContain('Cursor');
      });
    });

    describe('with Windsurf target', () => {
      it('converts /agileflow:foo:bar to /agileflow-foo-bar', () => {
        const content = 'Try /agileflow:story:list command';
        const result = ideGenerator.generateForIde(content, 'windsurf', {
          transformPrefixes: true,
        });
        expect(result).toContain('/agileflow-story-list');
      });

      it('applies tool reference transformations', () => {
        const content = 'Use EnterPlanMode for planning';
        const result = ideGenerator.generateForIde(content, 'windsurf', {
          transformTools: true,
        });
        expect(result).toContain('megaplan');
      });

      it('replaces Claude Code references', () => {
        const content = 'Claude Code uses .claude/ folder';
        const result = ideGenerator.generateForIde(content, 'windsurf');
        expect(result).toContain('Windsurf');
        expect(result).toContain('.windsurf/');
      });
    });

    describe('with Codex target', () => {
      it('converts /agileflow:foo:bar to $agileflow-foo-bar', () => {
        const content = 'Try /agileflow:story:list skill';
        const result = ideGenerator.generateForIde(content, 'codex', {
          transformPrefixes: true,
        });
        expect(result).toContain('$agileflow-story-list');
      });

      it('applies tool reference transformations', () => {
        const content = 'Cannot use EnterPlanMode in Codex';
        const result = ideGenerator.generateForIde(content, 'codex', {
          transformTools: true,
        });
        expect(result).toContain('(not available in Codex)');
      });

      it('replaces Claude Code references', () => {
        const content = 'Claude Code in .claude/';
        const result = ideGenerator.generateForIde(content, 'codex');
        expect(result).toContain('OpenAI Codex');
        expect(result).toContain('.codex/');
      });
    });

    describe('edge cases', () => {
      it('handles null content gracefully', () => {
        const result = ideGenerator.generateForIde(null, 'cursor');
        expect(result).toBe('');
      });

      it('handles undefined content gracefully', () => {
        const result = ideGenerator.generateForIde(undefined, 'windsurf');
        expect(result).toBe('');
      });

      it('handles empty string content', () => {
        const result = ideGenerator.generateForIde('', 'codex');
        expect(result).toBe('');
      });

      it('disables prefix conversion when transformPrefixes is false', () => {
        const content = '/agileflow:test:cmd';
        const result = ideGenerator.generateForIde(content, 'cursor', {
          transformPrefixes: false,
        });
        // Should still have /agileflow: if prefix conversion is disabled
        expect(result).toContain('/agileflow');
      });

      it('disables tool transformation when transformTools is false', () => {
        const content = 'Use AskUserQuestion tool';
        const result = ideGenerator.generateForIde(content, 'cursor', {
          transformTools: false,
        });
        // Should still have AskUserQuestion if tool transformation is disabled
        expect(result).toContain('AskUserQuestion');
      });
    });

    describe('docs folder handling', () => {
      it('passes docs folder option to transformForIde', () => {
        const { transformForIde } = require('../../../../tools/cli/lib/content-transformer');
        const content = 'See docs/guides/';
        ideGenerator.generateForIde(content, 'cursor', { docsFolder: 'project-docs' });

        expect(transformForIde).toHaveBeenCalledWith(
          content,
          'cursor',
          expect.objectContaining({
            docsFolder: 'project-docs',
          })
        );
      });
    });

    describe('additional replacements', () => {
      it('includes additional replacements in transformation', () => {
        const { transformForIde } = require('../../../../tools/cli/lib/content-transformer');
        const content = 'Custom text here';
        const additionalReplacements = { 'Custom text': 'Modified text' };

        ideGenerator.generateForIde(content, 'cursor', {
          additionalReplacements,
        });

        expect(transformForIde).toHaveBeenCalledWith(
          content,
          'cursor',
          expect.objectContaining({
            additionalReplacements,
          })
        );
      });
    });
  });

  describe('generateCommandForIde()', () => {
    describe('with Claude Code target', () => {
      it('returns command unchanged for canonical format', () => {
        const content = 'Deploy the application';
        const result = ideGenerator.generateCommandForIde(content, 'deploy', 'claude-code');
        expect(result).toBe(content);
      });
    });

    describe('with Cursor target', () => {
      it('transforms command for Cursor', () => {
        const content = '/agileflow:test:run some test';
        const result = ideGenerator.generateCommandForIde(content, 'test', 'cursor');
        expect(result).toContain('/test-run');
      });

      it('includes command name in output', () => {
        const content = 'Test command';
        const result = ideGenerator.generateCommandForIde(content, 'mytest', 'cursor');
        expect(result).toBeDefined();
      });
    });

    describe('with Codex target', () => {
      it('adds {{input}} placeholder for Codex', () => {
        const content = 'Command instructions';
        const result = ideGenerator.generateCommandForIde(content, 'deploy', 'codex');
        expect(result).toContain('{{input}}');
      });

      it('includes header and context section for Codex', () => {
        const content = 'Instructions here';
        const result = ideGenerator.generateCommandForIde(content, 'mycommand', 'codex');
        expect(result).toContain('# AgileFlow:');
        expect(result).toContain('## Context');
      });

      it('strips frontmatter for Codex format', () => {
        const content = `---
description: Test command
---
Command body`;
        const result = ideGenerator.generateCommandForIde(content, 'cmd', 'codex');
        // Should not contain frontmatter markers
        expect(result).not.toContain('---');
      });

      it('extracts description from frontmatter', () => {
        const contentWithFrontmatter = `---
description: Deploy to production
---
Steps to deploy`;
        const result = ideGenerator.generateCommandForIde(
          contentWithFrontmatter,
          'deploy',
          'codex'
        );
        expect(result).toContain('Deploy to production');
      });
    });

    describe('with Windsurf target', () => {
      it('transforms command for Windsurf', () => {
        const content = '/agileflow:test:run';
        const result = ideGenerator.generateCommandForIde(content, 'test', 'windsurf');
        expect(result).toContain('/agileflow-test-run');
      });
    });

    describe('edge cases', () => {
      it('handles null content gracefully', () => {
        const result = ideGenerator.generateCommandForIde(null, 'test', 'cursor');
        expect(result).toBe('');
      });

      it('handles empty string content gracefully', () => {
        const result = ideGenerator.generateCommandForIde('', 'test', 'codex');
        expect(result).toBe('');
      });
    });
  });

  describe('generateAgentForIde()', () => {
    const sampleAgent = `---
name: security
description: Security analysis agent
model: claude-3-5-sonnet
---

# Security Agent

Analyzes code for security vulnerabilities.`;

    describe('with Claude Code target', () => {
      it('returns agent unchanged for canonical format', () => {
        const result = ideGenerator.generateAgentForIde(sampleAgent, 'security', 'claude-code');
        expect(result).toBe(sampleAgent);
      });
    });

    describe('with Codex target', () => {
      it('generates Codex SKILL.md format', () => {
        const result = ideGenerator.generateAgentForIde(sampleAgent, 'security', 'codex');
        expect(result).toContain('name: agileflow-security');
        expect(result).toContain('# AgileFlow: Security Agent');
        expect(result).toContain('Invoke with `$agileflow-security`');
      });

      it('includes version in Codex skill', () => {
        const result = ideGenerator.generateAgentForIde(sampleAgent, 'test', 'codex');
        expect(result).toContain('version: 1.0.0');
      });

      it('extracts description from source agent', () => {
        const result = ideGenerator.generateAgentForIde(sampleAgent, 'security', 'codex');
        expect(result).toContain('Security analysis agent');
      });

      it('includes YAML frontmatter', () => {
        const result = ideGenerator.generateAgentForIde(sampleAgent, 'security', 'codex');
        expect(result).toContain('---');
        expect(result).toMatch(/name:.*agileflow-security/);
      });
    });

    describe('with Windsurf target', () => {
      it('generates Windsurf SKILL.md format (agentskills.io spec)', () => {
        const result = ideGenerator.generateAgentForIde(sampleAgent, 'security', 'windsurf');
        expect(result).toContain('name: agileflow-security');
        expect(result).toContain('# AgileFlow: Security Skill');
        expect(result).toContain('Use this skill via `@agileflow-security`');
      });

      it('does not include version in Windsurf skill (agentskills.io spec)', () => {
        const result = ideGenerator.generateAgentForIde(sampleAgent, 'test', 'windsurf');
        expect(result).not.toContain('version:');
      });

      it('includes YAML frontmatter', () => {
        const result = ideGenerator.generateAgentForIde(sampleAgent, 'security', 'windsurf');
        expect(result).toContain('---');
        expect(result).toMatch(/name:.*agileflow-security/);
      });
    });

    describe('with Cursor target', () => {
      it('generates Cursor agent format with YAML frontmatter', () => {
        const result = ideGenerator.generateAgentForIde(sampleAgent, 'security', 'cursor');
        expect(result).toContain('name: agileflow-security');
        expect(result).toContain('---');
      });

      it('includes model field from source frontmatter', () => {
        const result = ideGenerator.generateAgentForIde(sampleAgent, 'test', 'cursor');
        // Should preserve or default model
        expect(result).toMatch(/model:/);
      });

      it('includes readonly and other agent fields', () => {
        const result = ideGenerator.generateAgentForIde(sampleAgent, 'security', 'cursor');
        expect(result).toContain('readonly');
      });
    });

    describe('tool transformation', () => {
      const agentWithTools = `---
name: test
description: Test agent
---

Use the AskUserQuestion tool.`;

      it('applies tool transformation when enabled', () => {
        const result = ideGenerator.generateAgentForIde(agentWithTools, 'test', 'cursor', {
          transformTools: true,
        });
        expect(result).toContain('numbered list prompt');
      });

      it('skips tool transformation when disabled', () => {
        const result = ideGenerator.generateAgentForIde(agentWithTools, 'test', 'cursor', {
          transformTools: false,
        });
        expect(result).toContain('AskUserQuestion');
      });
    });

    describe('edge cases', () => {
      it('handles null content gracefully', () => {
        const result = ideGenerator.generateAgentForIde(null, 'test', 'cursor');
        expect(result).toBe('');
      });

      it('handles undefined content gracefully', () => {
        const result = ideGenerator.generateAgentForIde(undefined, 'test', 'windsurf');
        expect(result).toBe('');
      });

      it('handles empty string content', () => {
        const result = ideGenerator.generateAgentForIde('', 'test', 'codex');
        expect(result).toBe('');
      });

      it('generates default description when missing', () => {
        const agentWithoutDescription = `---
name: test
---
Agent body`;
        const result = ideGenerator.generateAgentForIde(
          agentWithoutDescription,
          'myagent',
          'codex'
        );
        expect(result).toContain('AgileFlow myagent agent');
      });
    });
  });

  describe('getCommandPrefix()', () => {
    it('returns /agileflow: for claude-code', () => {
      const prefix = ideGenerator.getCommandPrefix('claude-code');
      expect(prefix).toBe('/agileflow:');
    });

    it('returns / for cursor', () => {
      const prefix = ideGenerator.getCommandPrefix('cursor');
      expect(prefix).toBe('/');
    });

    it('returns / for windsurf', () => {
      const prefix = ideGenerator.getCommandPrefix('windsurf');
      expect(prefix).toBe('/');
    });

    it('returns $agileflow- for codex', () => {
      const prefix = ideGenerator.getCommandPrefix('codex');
      expect(prefix).toBe('$agileflow-');
    });

    it('returns default prefix for unknown IDE', () => {
      const prefix = ideGenerator.getCommandPrefix('unknown-ide');
      expect(prefix).toBe('/agileflow:');
    });
  });

  describe('command prefix conversion', () => {
    describe('_convertCommandPrefixes (private)', () => {
      it('converts /agileflow:foo:bar to /foo-bar for Cursor', () => {
        const content = 'Use /agileflow:story:list command';
        const result = ideGenerator._convertCommandPrefixes(content, 'cursor');
        expect(result).toContain('/story-list');
        expect(result).not.toContain('/agileflow:');
      });

      it('converts /agileflow:foo:bar to /agileflow-foo-bar for Windsurf', () => {
        const content = 'Run /agileflow:test:run';
        const result = ideGenerator._convertCommandPrefixes(content, 'windsurf');
        expect(result).toContain('/agileflow-test-run');
      });

      it('converts /agileflow:foo:bar to $agileflow-foo-bar for Codex', () => {
        const content = 'Call /agileflow:deploy:prod';
        const result = ideGenerator._convertCommandPrefixes(content, 'codex');
        expect(result).toContain('$agileflow-deploy-prod');
      });

      it('leaves Claude Code commands unchanged', () => {
        const content = '/agileflow:story:list is still the same';
        const result = ideGenerator._convertCommandPrefixes(content, 'claude-code');
        expect(result).toBe(content);
      });

      it('handles multiple command prefixes in same content', () => {
        const content = 'Use /agileflow:foo:bar and /agileflow:baz:qux';
        const result = ideGenerator._convertCommandPrefixes(content, 'cursor');
        expect(result).toContain('/foo-bar');
        expect(result).toContain('/baz-qux');
      });

      it('preserves colons in command names', () => {
        const content = '/agileflow:story:list:my:test';
        const result = ideGenerator._convertCommandPrefixes(content, 'windsurf');
        expect(result).toContain('/agileflow-story-list-my-test');
      });

      it('handles underscores and hyphens in command names', () => {
        const content = '/agileflow:foo_bar:baz-qux';
        const result = ideGenerator._convertCommandPrefixes(content, 'codex');
        expect(result).toContain('$agileflow-foo_bar-baz-qux');
      });
    });
  });

  describe('integration scenarios', () => {
    const commandMarkdown = `---
description: Build the application
---

# Build Command

Use \`/agileflow:build:prod\` to build for production.
Call the AskUserQuestion tool to select options.
See docs/guides/build.md for details.`;

    const agentMarkdown = `---
name: build
description: Build automation agent
model: claude-3-5-sonnet
tools:
  - Bash
  - Read
  - Write
---

# Build Agent

Automates the build process using /agileflow:build commands.`;

    it('transforms command for multiple IDEs consistently', () => {
      const cursorCmd = ideGenerator.generateCommandForIde(commandMarkdown, 'build', 'cursor');
      const windsurfCmd = ideGenerator.generateCommandForIde(commandMarkdown, 'build', 'windsurf');
      const codexCmd = ideGenerator.generateCommandForIde(commandMarkdown, 'build', 'codex');

      // All should be strings
      expect(typeof cursorCmd).toBe('string');
      expect(typeof windsurfCmd).toBe('string');
      expect(typeof codexCmd).toBe('string');

      // Each should have IDE-specific transformations
      expect(cursorCmd).toContain('/build');
      expect(windsurfCmd).toContain('/agileflow-build');
      expect(codexCmd).toContain('{{input}}');
    });

    it('transforms agent for multiple IDEs consistently', () => {
      const cursorAgent = ideGenerator.generateAgentForIde(agentMarkdown, 'build', 'cursor');
      const windsurfAgent = ideGenerator.generateAgentForIde(agentMarkdown, 'build', 'windsurf');
      const codexAgent = ideGenerator.generateAgentForIde(agentMarkdown, 'build', 'codex');

      // All should be strings with YAML frontmatter
      expect(typeof cursorAgent).toBe('string');
      expect(typeof windsurfAgent).toBe('string');
      expect(typeof codexAgent).toBe('string');

      // All should have agileflow prefix
      expect(cursorAgent).toContain('agileflow-build');
      expect(windsurfAgent).toContain('agileflow-build');
      expect(codexAgent).toContain('agileflow-build');
    });

    it('preserves core agent functionality across IDEs', () => {
      const cursorAgent = ideGenerator.generateAgentForIde(agentMarkdown, 'build', 'cursor');
      const windsurfAgent = ideGenerator.generateAgentForIde(agentMarkdown, 'build', 'windsurf');

      // Both should preserve the description
      expect(cursorAgent).toContain('Build automation agent');
      expect(windsurfAgent).toContain('Build automation agent');

      // Both should preserve agent name
      expect(cursorAgent).toContain('agileflow-build');
      expect(windsurfAgent).toContain('agileflow-build');
    });
  });
});
