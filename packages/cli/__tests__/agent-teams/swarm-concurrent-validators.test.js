/**
 * Swarm-level tests: Concurrent Validator Enforcement
 *
 * Tests that when multiple validator agents run in parallel (as in the
 * Overstory swarm pattern), the tool restriction infrastructure correctly
 * enforces boundaries. This tests the patterns and data structures used
 * by damage-control-agent-tools.js.
 *
 * Test categories:
 * - Multiple validators running simultaneously
 * - Tool frontmatter parsing and normalization
 * - Cross-agent tool isolation
 * - Damage control multi-agent hook integration
 */

describe('Swarm: Concurrent Validator Enforcement', () => {
  describe('parallel validator isolation', () => {
    // Simulate the tool-checking logic from damage-control-agent-tools.js
    function createAgentContext(role, tools) {
      return {
        role,
        allowedTools: new Set(tools),
        checkTool(toolName) {
          const ALWAYS_ALLOWED = new Set(['Read', 'Glob', 'Grep']);
          const TOOL_ALIASES = {
            TaskCreate: 'Task',
            TaskUpdate: 'Task',
            TaskGet: 'Task',
            TaskList: 'Task',
            TaskStop: 'Task',
          };
          const normalized = TOOL_ALIASES[toolName] || toolName;
          if (ALWAYS_ALLOWED.has(normalized)) return { allowed: true };
          if (this.allowedTools.has(normalized)) return { allowed: true };
          return {
            allowed: false,
            reason: `Agent role "${this.role}" is not authorized to use ${toolName}`,
          };
        },
      };
    }

    it('two validators running in parallel both blocked from Write', () => {
      const validator1 = createAgentContext('validator', ['Read', 'Glob', 'Grep']);
      const validator2 = createAgentContext('validator', ['Read', 'Glob', 'Grep']);

      expect(validator1.checkTool('Write').allowed).toBe(false);
      expect(validator2.checkTool('Write').allowed).toBe(false);
    });

    it('validator and builder have different permissions simultaneously', () => {
      const validator = createAgentContext('validator', ['Read', 'Glob', 'Grep']);
      const builder = createAgentContext('builder', [
        'Read',
        'Write',
        'Edit',
        'Bash',
        'Glob',
        'Grep',
      ]);

      // Validator blocked from Write
      expect(validator.checkTool('Write').allowed).toBe(false);
      // Builder allowed Write
      expect(builder.checkTool('Write').allowed).toBe(true);

      // Both allowed Read
      expect(validator.checkTool('Read').allowed).toBe(true);
      expect(builder.checkTool('Read').allowed).toBe(true);
    });

    it('lead agent can spawn sub-agents while validators cannot', () => {
      const lead = createAgentContext('lead', [
        'Read',
        'Write',
        'Edit',
        'Bash',
        'Glob',
        'Grep',
        'Task',
        'TaskOutput',
        'Agent',
      ]);
      const validator = createAgentContext('validator', ['Read', 'Glob', 'Grep']);

      expect(lead.checkTool('Agent').allowed).toBe(true);
      expect(lead.checkTool('Task').allowed).toBe(true);
      expect(validator.checkTool('Agent').allowed).toBe(false);
      expect(validator.checkTool('Task').allowed).toBe(false);
    });
  });

  describe('frontmatter tool parsing', () => {
    // Test the normalizeTools pattern from frontmatter-parser.js
    function normalizeTools(tools) {
      if (!tools) return [];
      if (Array.isArray(tools)) return tools;
      if (typeof tools === 'string') {
        return tools
          .split(',')
          .map(t => t.trim())
          .filter(Boolean);
      }
      return [];
    }

    it('parses comma-separated string', () => {
      expect(normalizeTools('Read, Write, Edit, Bash, Glob, Grep')).toEqual([
        'Read',
        'Write',
        'Edit',
        'Bash',
        'Glob',
        'Grep',
      ]);
    });

    it('handles array input', () => {
      expect(normalizeTools(['Read', 'Glob'])).toEqual(['Read', 'Glob']);
    });

    it('handles null/undefined', () => {
      expect(normalizeTools(null)).toEqual([]);
      expect(normalizeTools(undefined)).toEqual([]);
    });

    it('handles empty string', () => {
      expect(normalizeTools('')).toEqual([]);
    });

    it('strips whitespace from tool names', () => {
      expect(normalizeTools(' Read , Write ')).toEqual(['Read', 'Write']);
    });
  });

  describe('cross-agent scenarios', () => {
    it('simulates 5 agents with different roles running concurrently', () => {
      const agents = [
        {
          role: 'lead',
          tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Task', 'TaskOutput', 'Agent'],
        },
        { role: 'builder', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'] },
        { role: 'builder', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'] },
        { role: 'validator', tools: ['Read', 'Glob', 'Grep'] },
        { role: 'validator', tools: ['Read', 'Glob', 'Grep'] },
      ];

      // All agents should be able to Read
      for (const agent of agents) {
        const toolSet = new Set(agent.tools);
        expect(toolSet.has('Read')).toBe(true);
      }

      // Only lead can spawn agents
      const agentSpawners = agents.filter(a => new Set(a.tools).has('Agent'));
      expect(agentSpawners).toHaveLength(1);
      expect(agentSpawners[0].role).toBe('lead');

      // Only builders and lead can write
      const writers = agents.filter(a => new Set(a.tools).has('Write'));
      expect(writers).toHaveLength(3); // 1 lead + 2 builders

      // Validators cannot write
      const validatorWriters = agents.filter(
        a => a.role === 'validator' && new Set(a.tools).has('Write')
      );
      expect(validatorWriters).toHaveLength(0);
    });

    it('task operations are normalized correctly for permission checks', () => {
      const TOOL_ALIASES = {
        TaskCreate: 'Task',
        TaskUpdate: 'Task',
        TaskGet: 'Task',
        TaskList: 'Task',
        TaskStop: 'Task',
      };

      const teammateTools = new Set([
        'Read',
        'Write',
        'Edit',
        'Bash',
        'Glob',
        'Grep',
        'Task',
        'TaskOutput',
      ]);

      // All Task* operations should be allowed for teammate
      for (const [alias, normalized] of Object.entries(TOOL_ALIASES)) {
        expect(teammateTools.has(normalized)).toBe(true);
      }
    });
  });

  describe('damage control multi-agent integration patterns', () => {
    it('blocked message patterns detect dangerous content', () => {
      const BLOCKED_PATTERNS = [
        /\$\{.*\}/,
        /`[^`]*`/,
        /\bexec\s*\(/,
        /\beval\s*\(/,
        /\bgit\s+push\s+--force\b/i,
        /\bgit\s+reset\s+--hard\b/i,
        /\brm\s+-rf\s+\//,
      ];

      const dangerousMessages = [
        '${process.env.SECRET}',
        '`rm -rf /`',
        'exec("ls")',
        'eval(code)',
        'git push --force origin main',
        'git reset --hard HEAD~5',
        'rm -rf /',
      ];

      const safeMessages = [
        'Please review the code',
        'Task completed successfully',
        'Found 3 issues in the codebase',
      ];

      for (const msg of dangerousMessages) {
        const matched = BLOCKED_PATTERNS.some(p => p.test(msg));
        expect(matched).toBe(true);
      }

      for (const msg of safeMessages) {
        const matched = BLOCKED_PATTERNS.some(p => p.test(msg));
        expect(matched).toBe(false);
      }
    });

    it('TeamCreate validation enforces teammate limits', () => {
      const MAX_TEAMMATES = 8;

      function validateTeamCreate(teammates) {
        if (teammates.length > MAX_TEAMMATES) {
          return { action: 'block', reason: `Too many teammates: ${teammates.length}` };
        }
        if (teammates.length === 0) {
          return { action: 'ask', reason: 'Empty team' };
        }
        return { action: 'allow' };
      }

      // Normal team
      expect(validateTeamCreate([1, 2, 3]).action).toBe('allow');

      // Too large
      expect(validateTeamCreate(Array(10).fill(1)).action).toBe('block');

      // Empty
      expect(validateTeamCreate([]).action).toBe('ask');

      // At limit
      expect(validateTeamCreate(Array(MAX_TEAMMATES).fill(1)).action).toBe('allow');
    });
  });
});
