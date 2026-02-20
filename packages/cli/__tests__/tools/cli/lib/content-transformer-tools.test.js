/**
 * Tests for content-transformer.js tool reference transformations
 *
 * Tests the new IDE capability-aware tool reference replacement functionality:
 * - transformToolReferences: Main function for tool reference transformation
 * - TOOL_REFERENCE_REPLACEMENTS: Replacement patterns for each IDE
 * - transformForIde with transformTools option: Integration test
 *
 * Coverage includes:
 * - AskUserQuestion replacements per IDE
 * - Task tool references per IDE
 * - Plan mode references per IDE
 * - Task tracking tool references per IDE
 * - Hook references per IDE
 * - Backward compatibility (transformTools defaults to false)
 */

// Mock the content-injector module
jest.mock('../../../../tools/cli/lib/content-injector', () => ({
  injectContent: jest.fn((content, options) => {
    return content.replace('{{VERSION}}', options.version || 'unknown');
  }),
}));

// Mock the frontmatter-parser module
jest.mock('../../../../scripts/lib/frontmatter-parser', () => ({
  parseFrontmatter: jest.fn(content => {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    const lines = match[1].split('\n');
    const result = {};
    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length > 0) {
        result[key.trim()] = valueParts.join(':').trim();
      }
    }
    return result;
  }),
  extractBody: jest.fn(content => {
    const match = content.match(/^---\n[\s\S]*?\n---\n*/);
    if (!match) return content;
    return content.slice(match[0].length).trim();
  }),
}));

const {
  transformToolReferences,
  TOOL_REFERENCE_REPLACEMENTS,
  transformForIde,
} = require('../../../../tools/cli/lib/content-transformer');

describe('content-transformer.js - Tool Reference Transformations', () => {
  describe('transformToolReferences', () => {
    describe('Claude Code (canonical format)', () => {
      it('returns content unchanged for claude-code', () => {
        const content = 'Use the AskUserQuestion tool to get user input';
        const result = transformToolReferences(content, 'claude-code');
        expect(result).toBe(content);
      });

      it('returns content unchanged for unknown IDE', () => {
        const content = 'Use the AskUserQuestion tool';
        const result = transformToolReferences(content, 'unknown-ide');
        expect(result).toBe(content);
      });

      it('returns empty string for null input', () => {
        const result = transformToolReferences(null, 'cursor');
        expect(result).toBe('');
      });

      it('returns empty string for undefined input', () => {
        const result = transformToolReferences(undefined, 'windsurf');
        expect(result).toBe('');
      });
    });

    describe('Cursor transformations', () => {
      it('replaces AskUserQuestion with numbered list prompt', () => {
        const content = 'Use the AskUserQuestion tool to get user input';
        const result = transformToolReferences(content, 'cursor');
        expect(result).toContain('numbered list prompt');
        expect(result).not.toContain('AskUserQuestion');
      });

      it('handles bare AskUserQuestion references', () => {
        const content = 'Call AskUserQuestion for interactive input';
        const result = transformToolReferences(content, 'cursor');
        expect(result).toBe('Call numbered list prompt for interactive input');
      });

      it('replaces TaskCreate with not available message', () => {
        const content = 'Use TaskCreate to track work';
        const result = transformToolReferences(content, 'cursor');
        expect(result).toContain('not available - track progress in conversation');
      });

      it('replaces TaskUpdate with not available message', () => {
        const content = 'Call TaskUpdate to update progress';
        const result = transformToolReferences(content, 'cursor');
        expect(result).toContain('not available in Cursor');
      });

      it('replaces TaskList with not available message', () => {
        const content = 'List all tasks with TaskList';
        const result = transformToolReferences(content, 'cursor');
        expect(result).toContain('not available in Cursor');
      });

      it('handles Task( at end of line', () => {
        const content = 'Call the Task(\nto spawn subagent';
        const result = transformToolReferences(content, 'cursor');
        expect(result).toContain('/* Use Cursor subagents to spawn async work */');
      });

      it('does not replace Task( in middle of line', () => {
        const content = 'The Task(subagent_type: "agileflow-test") is ready';
        const result = transformToolReferences(content, 'cursor');
        // Should not replace Task( when not at end of line
        expect(result).toBe(content);
      });
    });

    describe('Windsurf transformations', () => {
      it('replaces AskUserQuestion with numbered list prompt', () => {
        const content = 'Use the AskUserQuestion tool';
        const result = transformToolReferences(content, 'windsurf');
        expect(result).toContain('numbered list prompt');
      });

      it('replaces "call the Task tool" with workflow suggestion', () => {
        const content = 'You can call the Task tool to delegate work';
        const result = transformToolReferences(content, 'windsurf');
        // transformToolReferences only handles tool-specific patterns, not IDE_REPLACEMENTS
        // This test should use transformForIde with transformTools: true to see full effect
        expect(result).toContain('workflow chaining');
      });

      it('replaces subagent_type with workflow syntax', () => {
        const content = 'Use subagent_type: "agileflow-security"';
        const result = transformToolReferences(content, 'windsurf');
        expect(result).toContain('workflow: "/agileflow-security"');
      });

      it('replaces multiple subagent_type references', () => {
        const content = `
          First: subagent_type: "agileflow-test"
          Second: subagent_type: "agileflow-deploy"
        `;
        const result = transformToolReferences(content, 'windsurf');
        expect(result).toContain('workflow: "/agileflow-test"');
        expect(result).toContain('workflow: "/agileflow-deploy"');
      });

      it('replaces EnterPlanMode with megaplan', () => {
        const content = 'When you EnterPlanMode, design the solution';
        const result = transformToolReferences(content, 'windsurf');
        expect(result).toContain('megaplan');
      });

      it('replaces ExitPlanMode', () => {
        const content = 'After ExitPlanMode, implement the plan';
        const result = transformToolReferences(content, 'windsurf');
        expect(result).toContain('(end megaplan)');
      });

      it('replaces task tracking tools', () => {
        const content = 'Use TaskCreate, TaskUpdate, and TaskList';
        const result = transformToolReferences(content, 'windsurf');
        expect(result).not.toContain('TaskCreate');
        expect(result).not.toContain('TaskUpdate');
        expect(result).not.toContain('TaskList');
        expect(result).toContain('not available');
      });

      it('replaces Task( at end of line', () => {
        const content = 'Delegate to async workflow:\nTask(\nwith workflow: "/agileflow-test"';
        const result = transformToolReferences(content, 'windsurf');
        expect(result).toContain('/* Suggest running /agileflow workflow via cascade */');
      });
    });

    describe('Codex transformations', () => {
      it('replaces AskUserQuestion with ask_user_question', () => {
        const content = 'Use AskUserQuestion tool';
        const result = transformToolReferences(content, 'codex');
        expect(result).toContain('ask_user_question');
        expect(result).not.toContain('AskUserQuestion');
      });

      it('specifies text-only limitation for ask_user_question', () => {
        const content = 'call the AskUserQuestion tool for user input';
        const result = transformToolReferences(content, 'codex');
        expect(result).toContain('text-only, no menus');
      });

      it('replaces Task references with skill invocation', () => {
        const content = 'Use the Task tool to delegate work';
        const result = transformToolReferences(content, 'codex');
        expect(result).toContain('skill invocation');
      });

      it('suggests $agileflow skill for Task calls', () => {
        const content = 'call the Task tool with subagent_type: "agileflow-test"';
        const result = transformToolReferences(content, 'codex');
        // transformToolReferences handles the subagent_type substitution
        // IDE_REPLACEMENTS already converts "Task tool" to "skill invocation"
        expect(result).toContain('$agileflow-test');
        expect(result).toContain('skill');
      });

      it('replaces subagent_type with skill syntax', () => {
        const content = 'Use subagent_type: "agileflow-security"';
        const result = transformToolReferences(content, 'codex');
        expect(result).toContain('skill: "$agileflow-security"');
      });

      it('replaces EnterPlanMode with not available', () => {
        const content = 'EnterPlanMode to design solution';
        const result = transformToolReferences(content, 'codex');
        expect(result).toContain('not available - no plan mode in Codex');
      });

      it('replaces ExitPlanMode with not available', () => {
        const content = 'Then ExitPlanMode to implement';
        const result = transformToolReferences(content, 'codex');
        expect(result).toContain('not available');
      });

      it('removes hook references (PreToolUse)', () => {
        const content = 'Configure PreToolUse hook';
        const result = transformToolReferences(content, 'codex');
        expect(result).toContain('not available - no hooks');
      });

      it('removes hook references (PostToolUse)', () => {
        const content = 'Set up PostToolUse handler';
        const result = transformToolReferences(content, 'codex');
        expect(result).toContain('not available - no hooks');
      });

      it('removes hook references (SessionStart)', () => {
        const content = 'Initialize with SessionStart event';
        const result = transformToolReferences(content, 'codex');
        expect(result).toContain('not available - no hooks');
      });

      it('removes all task tracking tools', () => {
        const content = 'TaskCreate tasks, TaskUpdate status, TaskList all';
        const result = transformToolReferences(content, 'codex');
        expect(result).not.toContain('TaskCreate');
        expect(result).not.toContain('TaskUpdate');
        expect(result).not.toContain('TaskList');
      });

      it('replaces Task( at end of line', () => {
        const content = 'Invoke skill via:\nTask(\nwith skill: "$agileflow-test"';
        const result = transformToolReferences(content, 'codex');
        expect(result).toContain('/* Invoke relevant skill via $agileflow-name */');
      });
    });

    describe('Edge cases', () => {
      it('handles content with multiple tool references', () => {
        const content = `
          First use AskUserQuestion to ask.
          Then call the Task tool for delegation.
          Track with TaskCreate.
          Use EnterPlanMode for planning.
        `;
        const result = transformToolReferences(content, 'windsurf');
        expect(result).toContain('numbered list prompt');
        expect(result).toContain('workflow chaining');
        expect(result).toContain('megaplan');
        expect(result).not.toContain('EnterPlanMode');
      });

      it('preserves text case sensitivity for pattern matching', () => {
        const content = 'askuserquestion vs AskUserQuestion';
        const result = transformToolReferences(content, 'cursor');
        // Only AskUserQuestion should be replaced (case-sensitive)
        expect(result).toContain('askuserquestion');
        expect(result).not.toContain('AskUserQuestion');
      });

      it('handles content with code blocks containing tool references', () => {
        const content = `
          Instruction: Call AskUserQuestion here
          \`\`\`javascript
          // In code: AskUserQuestion tool
          const tool = AskUserQuestion;
          \`\`\`
          And again: Call AskUserQuestion at end
        `;
        const result = transformToolReferences(content, 'cursor');
        // Should replace all instances including in code blocks
        expect(result).toContain('numbered list prompt');
      });

      it('handles empty content', () => {
        const result = transformToolReferences('', 'cursor');
        expect(result).toBe('');
      });

      it('handles content with only whitespace', () => {
        const result = transformToolReferences('   \n  \t  ', 'windsurf');
        expect(result).toBe('   \n  \t  ');
      });
    });
  });

  describe('TOOL_REFERENCE_REPLACEMENTS', () => {
    it('contains replacement rules for cursor', () => {
      expect(TOOL_REFERENCE_REPLACEMENTS.cursor).toBeDefined();
      expect(Array.isArray(TOOL_REFERENCE_REPLACEMENTS.cursor)).toBe(true);
      expect(TOOL_REFERENCE_REPLACEMENTS.cursor.length).toBeGreaterThan(0);
    });

    it('contains replacement rules for windsurf', () => {
      expect(TOOL_REFERENCE_REPLACEMENTS.windsurf).toBeDefined();
      expect(Array.isArray(TOOL_REFERENCE_REPLACEMENTS.windsurf)).toBe(true);
      expect(TOOL_REFERENCE_REPLACEMENTS.windsurf.length).toBeGreaterThan(0);
    });

    it('contains replacement rules for codex', () => {
      expect(TOOL_REFERENCE_REPLACEMENTS.codex).toBeDefined();
      expect(Array.isArray(TOOL_REFERENCE_REPLACEMENTS.codex)).toBe(true);
      expect(TOOL_REFERENCE_REPLACEMENTS.codex.length).toBeGreaterThan(0);
    });

    it('each rule has pattern and replacement', () => {
      for (const ide of ['cursor', 'windsurf', 'codex']) {
        for (const rule of TOOL_REFERENCE_REPLACEMENTS[ide]) {
          expect(rule.pattern).toBeDefined();
          expect(rule.replacement).toBeDefined();
        }
      }
    });

    it('patterns are RegExp objects', () => {
      for (const ide of ['cursor', 'windsurf', 'codex']) {
        for (const rule of TOOL_REFERENCE_REPLACEMENTS[ide]) {
          expect(rule.pattern instanceof RegExp).toBe(true);
        }
      }
    });

    it('replacements are strings', () => {
      for (const ide of ['cursor', 'windsurf', 'codex']) {
        for (const rule of TOOL_REFERENCE_REPLACEMENTS[ide]) {
          expect(typeof rule.replacement).toBe('string');
        }
      }
    });
  });

  describe('transformForIde integration with transformTools option', () => {
    it('does not apply tool transformations by default (backward compatibility)', () => {
      const content = 'Use AskUserQuestion tool';
      const result = transformForIde(content, 'cursor');
      // Without transformTools option, should only apply IDE_REPLACEMENTS
      // IDE_REPLACEMENTS has: AskUserQuestion: 'numbered list prompt'
      expect(result).toBe('Use numbered list prompt tool');
    });

    it('applies tool transformations when transformTools is true', () => {
      const content = 'Use the AskUserQuestion tool for input';
      const result = transformForIde(content, 'cursor', { transformTools: true });
      // Should apply tool transformations
      expect(result).toContain('numbered list prompt');
    });

    it('handles both IDE_REPLACEMENTS and tool transformations', () => {
      const content = 'Use Claude Code with AskUserQuestion tool';
      const result = transformForIde(content, 'cursor', { transformTools: true });
      // IDE_REPLACEMENTS: 'Claude Code' -> 'Cursor'
      expect(result).toContain('Cursor');
      // Tool transformations: AskUserQuestion -> 'numbered list prompt'
      expect(result).toContain('numbered list prompt');
    });

    it('respects transformTools false option explicitly', () => {
      const content = 'Use AskUserQuestion tool';
      const result = transformForIde(content, 'windsurf', { transformTools: false });
      // IDE_REPLACEMENTS has AskUserQuestion -> 'numbered list prompt'
      expect(result).toBe('Use numbered list prompt tool');
    });

    it('applies tool transformations with custom docs folder', () => {
      const content = 'See docs/ and use AskUserQuestion';
      const result = transformForIde(content, 'codex', {
        docsFolder: 'project-docs',
        transformTools: true,
      });
      expect(result).toContain('project-docs/');
      expect(result).toContain('ask_user_question');
    });

    it('combines all transformation types in correct order', () => {
      const content = 'Claude Code docs/ with AskUserQuestion and TaskCreate';
      const result = transformForIde(content, 'windsurf', {
        docsFolder: 'guides',
        transformTools: true,
        additionalReplacements: { 'and ': '& ' },
      });
      // All transformations applied
      expect(result).toContain('Windsurf');
      expect(result).toContain('guides/');
      expect(result).toContain('& ');
      expect(result).toContain('numbered list prompt');
    });
  });

  describe('Compatibility with replaceReferences array form', () => {
    it('tool replacements use array form with RegExp patterns', () => {
      // Verify that all TOOL_REFERENCE_REPLACEMENTS entries work with replaceReferences
      const content = 'Test AskUserQuestion TaskCreate EnterPlanMode';

      // These should all work without errors
      const cursorResult = transformToolReferences(content, 'cursor');
      const windsurfResult = transformToolReferences(content, 'windsurf');
      const codexResult = transformToolReferences(content, 'codex');

      expect(typeof cursorResult).toBe('string');
      expect(typeof windsurfResult).toBe('string');
      expect(typeof codexResult).toBe('string');
    });
  });

  describe('Case-sensitive and case-insensitive patterns', () => {
    it('applies case-insensitive replacements where needed', () => {
      const content = 'CALL THE ASKUNSERQUESTION TOOL and Call the AskUserQuestion tool';
      const result = transformToolReferences(content, 'cursor');
      // Both variations should be replaced due to 'gi' flags
      expect(result).toContain('ask the user to reply with their choice');
    });

    it('applies case-sensitive replacements where needed', () => {
      const content = 'taskcreate vs TaskCreate';
      const result = transformToolReferences(content, 'cursor');
      // Only TaskCreate should be replaced (word boundary)
      expect(result).toContain('taskcreate');
      expect(result).not.toContain('TaskCreate');
    });
  });
});
