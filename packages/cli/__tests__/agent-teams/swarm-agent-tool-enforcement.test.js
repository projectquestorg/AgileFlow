/**
 * Swarm-level tests: Agent Tool Restriction Enforcement
 *
 * Tests the tool restriction enforcement hook that validates agent subprocesses
 * only use tools declared in their frontmatter. This prevents:
 * - Validators calling Write/Edit (bypassing read-only restriction)
 * - Lead agents calling destructive tools beyond their scope
 * - Rogue agents modifying files outside their assigned work
 *
 * Test categories:
 * - Environment variable parsing
 * - Role-based defaults
 * - Tool normalization
 * - Always-allowed tools
 * - Blocking unauthorized tools
 */

// Note: damage-control-agent-tools.js is a standalone script that runs via hooks.
// We test the logic patterns it uses rather than executing it as a process.

describe('Agent Tool Restriction Enforcement', () => {
  // Save original env
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('environment variable parsing', () => {
    it('parses AGILEFLOW_AGENT_TOOLS as comma-separated list', () => {
      process.env.AGILEFLOW_AGENT_TOOLS = 'Read,Glob,Grep';
      const tools = process.env.AGILEFLOW_AGENT_TOOLS.split(',').map(t => t.trim());
      expect(tools).toEqual(['Read', 'Glob', 'Grep']);
    });

    it('handles spaces in tool list', () => {
      process.env.AGILEFLOW_AGENT_TOOLS = 'Read, Write, Edit, Bash';
      const tools = process.env.AGILEFLOW_AGENT_TOOLS.split(',').map(t => t.trim());
      expect(tools).toEqual(['Read', 'Write', 'Edit', 'Bash']);
    });

    it('handles empty AGILEFLOW_AGENT_TOOLS', () => {
      process.env.AGILEFLOW_AGENT_TOOLS = '';
      const tools = process.env.AGILEFLOW_AGENT_TOOLS.split(',')
        .map(t => t.trim())
        .filter(Boolean);
      expect(tools).toEqual([]);
    });
  });

  describe('role-based defaults', () => {
    const ROLE_DEFAULTS = {
      validator: new Set(['Read', 'Glob', 'Grep']),
      reviewer: new Set(['Read', 'Glob', 'Grep']),
      lead: new Set([
        'Read',
        'Write',
        'Edit',
        'Bash',
        'Glob',
        'Grep',
        'Task',
        'TaskOutput',
        'Agent',
      ]),
      builder: new Set(['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep']),
      teammate: new Set(['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Task', 'TaskOutput']),
    };

    it('validator role allows only read-only tools', () => {
      const validatorTools = ROLE_DEFAULTS.validator;
      expect(validatorTools.has('Read')).toBe(true);
      expect(validatorTools.has('Glob')).toBe(true);
      expect(validatorTools.has('Grep')).toBe(true);
      expect(validatorTools.has('Write')).toBe(false);
      expect(validatorTools.has('Edit')).toBe(false);
      expect(validatorTools.has('Bash')).toBe(false);
    });

    it('builder role allows write tools but not agent spawning', () => {
      const builderTools = ROLE_DEFAULTS.builder;
      expect(builderTools.has('Write')).toBe(true);
      expect(builderTools.has('Edit')).toBe(true);
      expect(builderTools.has('Bash')).toBe(true);
      expect(builderTools.has('Agent')).toBe(false);
      expect(builderTools.has('Task')).toBe(false);
    });

    it('lead role allows everything including agent spawning', () => {
      const leadTools = ROLE_DEFAULTS.lead;
      expect(leadTools.has('Write')).toBe(true);
      expect(leadTools.has('Agent')).toBe(true);
      expect(leadTools.has('Task')).toBe(true);
    });

    it('reviewer role matches validator (read-only)', () => {
      expect(ROLE_DEFAULTS.reviewer).toEqual(ROLE_DEFAULTS.validator);
    });
  });

  describe('tool normalization', () => {
    const TOOL_ALIASES = {
      TaskCreate: 'Task',
      TaskUpdate: 'Task',
      TaskGet: 'Task',
      TaskList: 'Task',
      TaskStop: 'Task',
    };

    it('normalizes TaskCreate to Task', () => {
      expect(TOOL_ALIASES['TaskCreate']).toBe('Task');
    });

    it('normalizes TaskUpdate to Task', () => {
      expect(TOOL_ALIASES['TaskUpdate']).toBe('Task');
    });

    it('all Task* variants normalize to Task', () => {
      for (const [alias, normalized] of Object.entries(TOOL_ALIASES)) {
        expect(normalized).toBe('Task');
      }
    });
  });

  describe('always-allowed tools', () => {
    const ALWAYS_ALLOWED = new Set(['Read', 'Glob', 'Grep']);

    it('Read is always allowed regardless of restrictions', () => {
      expect(ALWAYS_ALLOWED.has('Read')).toBe(true);
    });

    it('Glob is always allowed regardless of restrictions', () => {
      expect(ALWAYS_ALLOWED.has('Glob')).toBe(true);
    });

    it('Grep is always allowed regardless of restrictions', () => {
      expect(ALWAYS_ALLOWED.has('Grep')).toBe(true);
    });

    it('Write is NOT always allowed', () => {
      expect(ALWAYS_ALLOWED.has('Write')).toBe(false);
    });

    it('Bash is NOT always allowed', () => {
      expect(ALWAYS_ALLOWED.has('Bash')).toBe(false);
    });
  });

  describe('enforcement scenarios', () => {
    function checkToolAllowed(role, toolName) {
      const ALWAYS_ALLOWED = new Set(['Read', 'Glob', 'Grep']);
      const ROLE_DEFAULTS = {
        validator: new Set(['Read', 'Glob', 'Grep']),
        reviewer: new Set(['Read', 'Glob', 'Grep']),
        lead: new Set([
          'Read',
          'Write',
          'Edit',
          'Bash',
          'Glob',
          'Grep',
          'Task',
          'TaskOutput',
          'Agent',
        ]),
        builder: new Set(['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep']),
        teammate: new Set(['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Task', 'TaskOutput']),
      };

      const TOOL_ALIASES = {
        TaskCreate: 'Task',
        TaskUpdate: 'Task',
        TaskGet: 'Task',
        TaskList: 'Task',
        TaskStop: 'Task',
      };

      const normalized = TOOL_ALIASES[toolName] || toolName;

      if (ALWAYS_ALLOWED.has(normalized)) return true;

      const allowedTools = ROLE_DEFAULTS[role];
      if (!allowedTools) return true; // Unknown role = fail open

      return allowedTools.has(normalized);
    }

    it('blocks validator from using Write', () => {
      expect(checkToolAllowed('validator', 'Write')).toBe(false);
    });

    it('blocks validator from using Edit', () => {
      expect(checkToolAllowed('validator', 'Edit')).toBe(false);
    });

    it('blocks validator from using Bash', () => {
      expect(checkToolAllowed('validator', 'Bash')).toBe(false);
    });

    it('allows validator to use Read', () => {
      expect(checkToolAllowed('validator', 'Read')).toBe(true);
    });

    it('allows builder to use Write', () => {
      expect(checkToolAllowed('builder', 'Write')).toBe(true);
    });

    it('blocks builder from using Agent', () => {
      expect(checkToolAllowed('builder', 'Agent')).toBe(false);
    });

    it('allows lead to use Agent', () => {
      expect(checkToolAllowed('lead', 'Agent')).toBe(true);
    });

    it('allows teammate to use TaskCreate (normalized to Task)', () => {
      expect(checkToolAllowed('teammate', 'TaskCreate')).toBe(true);
    });

    it('blocks teammate from using Agent', () => {
      expect(checkToolAllowed('teammate', 'Agent')).toBe(false);
    });

    it('fails open for unknown role', () => {
      expect(checkToolAllowed('unknown-role', 'Write')).toBe(true);
    });
  });
});
