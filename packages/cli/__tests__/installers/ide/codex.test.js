/**
 * Tests for OpenAI Codex CLI installer
 * This is the largest IDE installer at 436 LOC - requires comprehensive testing
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { CodexSetup } = require('../../../tools/cli/installers/ide/codex');

describe('CodexSetup', () => {
  let testDir;
  let codexSetup;
  let originalCodexHome;

  beforeEach(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));

    // Create a mock CODEX_HOME for testing
    originalCodexHome = process.env.CODEX_HOME;
    process.env.CODEX_HOME = path.join(testDir, '.codex-home');
    await fs.ensureDir(process.env.CODEX_HOME);

    codexSetup = new CodexSetup();
  });

  afterEach(async () => {
    await fs.remove(testDir);
    if (originalCodexHome) {
      process.env.CODEX_HOME = originalCodexHome;
    } else {
      delete process.env.CODEX_HOME;
    }
  });

  describe('constructor', () => {
    it('initializes with correct name and configDir', () => {
      expect(codexSetup.name).toBe('codex');
      expect(codexSetup.displayName).toBe('OpenAI Codex CLI');
      expect(codexSetup.preferred).toBe(false);
      expect(codexSetup.configDir).toBe('.codex');
    });

    it('uses CODEX_HOME environment variable', () => {
      expect(codexSetup.codexHome).toBe(process.env.CODEX_HOME);
    });
  });

  describe('getCodexHome', () => {
    it('returns the codex home directory', () => {
      expect(codexSetup.getCodexHome()).toBe(process.env.CODEX_HOME);
    });

    it('falls back to ~/.codex when CODEX_HOME not set', () => {
      delete process.env.CODEX_HOME;
      const newSetup = new CodexSetup();
      expect(newSetup.getCodexHome()).toBe(path.join(os.homedir(), '.codex'));
    });
  });

  describe('detect', () => {
    it('returns false when no Codex configuration exists', async () => {
      const emptyDir = path.join(testDir, 'empty');
      await fs.ensureDir(emptyDir);

      // Override codexHome to a non-existent path
      codexSetup.codexHome = path.join(testDir, 'nonexistent');

      const result = await codexSetup.detect(emptyDir);
      expect(result).toBe(false);
    });

    it('returns true when CODEX_HOME exists', async () => {
      const projectDir = path.join(testDir, 'project');
      await fs.ensureDir(projectDir);

      const result = await codexSetup.detect(projectDir);
      expect(result).toBe(true);
    });

    it('returns true when project has .codex directory', async () => {
      const projectDir = path.join(testDir, 'project');
      await fs.ensureDir(path.join(projectDir, '.codex'));
      codexSetup.codexHome = path.join(testDir, 'nonexistent');

      const result = await codexSetup.detect(projectDir);
      expect(result).toBe(true);
    });

    it('returns true when project has AGENTS.md', async () => {
      const projectDir = path.join(testDir, 'project');
      await fs.ensureDir(projectDir);
      await fs.writeFile(path.join(projectDir, 'AGENTS.md'), '# AGENTS');
      codexSetup.codexHome = path.join(testDir, 'nonexistent');

      const result = await codexSetup.detect(projectDir);
      expect(result).toBe(true);
    });
  });

  describe('convertAgentToSkill', () => {
    it('converts agent markdown to Codex SKILL.md format', () => {
      const agentContent = `---
name: test-agent
description: Test agent description
model: haiku
---

# Test Agent

This is a test agent for Claude Code.`;

      const result = codexSetup.convertAgentToSkill(agentContent, 'test');

      expect(result).toContain('name: agileflow-test');
      expect(result).toContain('description: Test agent description');
      expect(result).toContain('version: 1.0.0');
      expect(result).toContain('# AgileFlow: Test Agent');
      expect(result).toContain('Codex CLI'); // Claude Code replaced
    });

    it('replaces Claude-specific references', () => {
      const agentContent = `---
description: Agent
---

Uses Claude Code and CLAUDE.md in .claude/ with Task tool.`;

      const result = codexSetup.convertAgentToSkill(agentContent, 'test');

      expect(result).toContain('Codex CLI');
      expect(result).toContain('AGENTS.md');
      expect(result).toContain('.codex/');
      expect(result).toContain('skill invocation');
    });

    it('handles missing frontmatter', () => {
      const agentContent = `# Simple Agent

No frontmatter here.`;

      const result = codexSetup.convertAgentToSkill(agentContent, 'simple');

      expect(result).toContain('name: agileflow-simple');
      expect(result).toContain('description: AgileFlow simple agent');
    });
  });

  describe('convertCommandToPrompt', () => {
    it('converts command markdown to Codex prompt format', () => {
      const commandContent = `---
description: Test command description
---

# Test Command

Instructions for the command.`;

      const result = codexSetup.convertCommandToPrompt(commandContent, 'test');

      expect(result).toContain('# AgileFlow: test');
      expect(result).toContain('> Test command description');
      expect(result).toContain('## Instructions');
      expect(result).toContain('{{input}}');
    });

    it('replaces Claude-specific references', () => {
      const commandContent = `---
description: Command
---

Use /agileflow:board with Claude Code.`;

      const result = codexSetup.convertCommandToPrompt(commandContent, 'board');

      expect(result).toContain('Codex CLI');
      expect(result).toContain('$agileflow-');
    });

    it('handles missing frontmatter', () => {
      const commandContent = `# Simple Command

Instructions without frontmatter.`;

      const result = codexSetup.convertCommandToPrompt(commandContent, 'simple');

      expect(result).toContain('# AgileFlow: simple');
      expect(result).toContain('> AgileFlow simple command');
    });
  });

  describe('installSkills', () => {
    let agileflowDir;
    let projectDir;

    beforeEach(async () => {
      projectDir = path.join(testDir, 'project');
      await fs.ensureDir(projectDir);

      agileflowDir = path.join(testDir, '.agileflow');
      await fs.ensureDir(path.join(agileflowDir, 'agents'));

      // Create sample agents
      await fs.writeFile(
        path.join(agileflowDir, 'agents', 'database.md'),
        `---
description: Database specialist
---
# Database Agent`
      );
      await fs.writeFile(
        path.join(agileflowDir, 'agents', 'api.md'),
        `---
description: API specialist
---
# API Agent`
      );
    });

    it('installs agents as skills', async () => {
      const count = await codexSetup.installSkills(projectDir, agileflowDir);

      expect(count).toBe(2);
      expect(
        await fs.pathExists(path.join(projectDir, '.codex', 'skills', 'agileflow-database'))
      ).toBe(true);
      expect(await fs.pathExists(path.join(projectDir, '.codex', 'skills', 'agileflow-api'))).toBe(
        true
      );
    });

    it('creates SKILL.md in each skill directory', async () => {
      await codexSetup.installSkills(projectDir, agileflowDir);

      const skillPath = path.join(projectDir, '.codex', 'skills', 'agileflow-database', 'SKILL.md');
      expect(await fs.pathExists(skillPath)).toBe(true);

      const content = await fs.readFile(skillPath, 'utf8');
      expect(content).toContain('name: agileflow-database');
    });

    it('returns 0 when no agents exist', async () => {
      const emptyDir = path.join(testDir, 'empty');
      await fs.ensureDir(emptyDir);

      const count = await codexSetup.installSkills(projectDir, emptyDir);
      expect(count).toBe(0);
    });
  });

  describe('installPrompts', () => {
    let agileflowDir;

    beforeEach(async () => {
      agileflowDir = path.join(testDir, '.agileflow');
      await fs.ensureDir(path.join(agileflowDir, 'commands'));

      // Create sample commands
      await fs.writeFile(
        path.join(agileflowDir, 'commands', 'board.md'),
        `---
description: Display kanban board
---
# Board Command`
      );
      await fs.writeFile(
        path.join(agileflowDir, 'commands', 'status.md'),
        `---
description: Show status
---
# Status Command`
      );
    });

    it('installs commands as prompts to CODEX_HOME', async () => {
      const count = await codexSetup.installPrompts(agileflowDir);

      expect(count).toBe(2);
      expect(
        await fs.pathExists(path.join(process.env.CODEX_HOME, 'prompts', 'agileflow-board.md'))
      ).toBe(true);
      expect(
        await fs.pathExists(path.join(process.env.CODEX_HOME, 'prompts', 'agileflow-status.md'))
      ).toBe(true);
    });

    it('creates proper prompt format', async () => {
      await codexSetup.installPrompts(agileflowDir);

      const promptPath = path.join(process.env.CODEX_HOME, 'prompts', 'agileflow-board.md');
      const content = await fs.readFile(promptPath, 'utf8');

      expect(content).toContain('# AgileFlow: board');
      expect(content).toContain('{{input}}');
    });

    it('returns 0 when no commands exist', async () => {
      const emptyDir = path.join(testDir, 'empty');
      await fs.ensureDir(emptyDir);

      const count = await codexSetup.installPrompts(emptyDir);
      expect(count).toBe(0);
    });
  });

  describe('generateAgentsMd', () => {
    let projectDir;

    beforeEach(async () => {
      projectDir = path.join(testDir, 'project');
      await fs.ensureDir(projectDir);
    });

    it('creates AGENTS.md at project root', async () => {
      const created = await codexSetup.generateAgentsMd(projectDir);

      expect(created).toBe(true);
      expect(await fs.pathExists(path.join(projectDir, 'AGENTS.md'))).toBe(true);
    });

    it('includes proper content structure', async () => {
      await codexSetup.generateAgentsMd(projectDir);

      const content = await fs.readFile(path.join(projectDir, 'AGENTS.md'), 'utf8');

      expect(content).toContain('# AGENTS.md');
      expect(content).toContain('Project Commands');
      expect(content).toContain('npm test');
      expect(content).toContain('When to Use AgileFlow Skills');
      expect(content).toContain('$agileflow-database');
      expect(content).toContain('status.json');
    });

    it('does not overwrite existing AGENTS.md', async () => {
      const existingContent = '# Existing AGENTS.md';
      await fs.writeFile(path.join(projectDir, 'AGENTS.md'), existingContent);

      const created = await codexSetup.generateAgentsMd(projectDir);

      expect(created).toBe(false);
      const content = await fs.readFile(path.join(projectDir, 'AGENTS.md'), 'utf8');
      expect(content).toBe(existingContent);
    });
  });

  describe('generateAgentsOverride', () => {
    let targetDir;

    beforeEach(async () => {
      targetDir = path.join(testDir, 'subdir');
      await fs.ensureDir(targetDir);
    });

    it('creates AGENTS.override.md', async () => {
      const created = await codexSetup.generateAgentsOverride(targetDir);

      expect(created).toBe(true);
      expect(await fs.pathExists(path.join(targetDir, 'AGENTS.override.md'))).toBe(true);
    });

    it('does not overwrite existing override', async () => {
      const existingContent = '# Existing Override';
      await fs.writeFile(path.join(targetDir, 'AGENTS.override.md'), existingContent);

      const created = await codexSetup.generateAgentsOverride(targetDir);

      expect(created).toBe(false);
      const content = await fs.readFile(path.join(targetDir, 'AGENTS.override.md'), 'utf8');
      expect(content).toBe(existingContent);
    });
  });

  describe('setup', () => {
    let agileflowDir;
    let projectDir;

    beforeEach(async () => {
      projectDir = path.join(testDir, 'project');
      await fs.ensureDir(projectDir);

      agileflowDir = path.join(testDir, '.agileflow');
      await fs.ensureDir(path.join(agileflowDir, 'commands'));
      await fs.ensureDir(path.join(agileflowDir, 'agents'));

      // Create sample command and agent
      await fs.writeFile(
        path.join(agileflowDir, 'commands', 'test.md'),
        `---
description: Test
---
# Test`
      );
      await fs.writeFile(
        path.join(agileflowDir, 'agents', 'test.md'),
        `---
description: Test agent
---
# Test Agent`
      );
    });

    it('performs complete installation', async () => {
      const result = await codexSetup.setup(projectDir, agileflowDir);

      expect(result.success).toBe(true);
      expect(result.skills).toBe(1);
      expect(result.prompts).toBe(1);
      expect(result.agentsMd).toBe(true);
    });

    it('creates .codex directory', async () => {
      await codexSetup.setup(projectDir, agileflowDir);

      expect(await fs.pathExists(path.join(projectDir, '.codex'))).toBe(true);
    });

    it('creates skills in .codex/skills/', async () => {
      await codexSetup.setup(projectDir, agileflowDir);

      expect(await fs.pathExists(path.join(projectDir, '.codex', 'skills', 'agileflow-test'))).toBe(
        true
      );
    });

    it('creates prompts in CODEX_HOME/prompts/', async () => {
      await codexSetup.setup(projectDir, agileflowDir);

      expect(
        await fs.pathExists(path.join(process.env.CODEX_HOME, 'prompts', 'agileflow-test.md'))
      ).toBe(true);
    });

    it('creates AGENTS.md', async () => {
      await codexSetup.setup(projectDir, agileflowDir);

      expect(await fs.pathExists(path.join(projectDir, 'AGENTS.md'))).toBe(true);
    });
  });

  describe('cleanup', () => {
    let projectDir;

    beforeEach(async () => {
      projectDir = path.join(testDir, 'project');
      await fs.ensureDir(projectDir);

      // Create skills to clean up
      await fs.ensureDir(path.join(projectDir, '.codex', 'skills', 'agileflow-test'));
      await fs.writeFile(
        path.join(projectDir, '.codex', 'skills', 'agileflow-test', 'SKILL.md'),
        'skill'
      );

      // Create prompts to clean up
      await fs.ensureDir(path.join(process.env.CODEX_HOME, 'prompts'));
      await fs.writeFile(
        path.join(process.env.CODEX_HOME, 'prompts', 'agileflow-test.md'),
        'prompt'
      );

      // Create AGENTS.md
      await fs.writeFile(path.join(projectDir, 'AGENTS.md'), '# AGENTS');
    });

    it('removes agileflow skills from .codex/skills/', async () => {
      await codexSetup.cleanup(projectDir);

      expect(await fs.pathExists(path.join(projectDir, '.codex', 'skills', 'agileflow-test'))).toBe(
        false
      );
    });

    it('removes agileflow prompts from CODEX_HOME/prompts/', async () => {
      await codexSetup.cleanup(projectDir);

      expect(
        await fs.pathExists(path.join(process.env.CODEX_HOME, 'prompts', 'agileflow-test.md'))
      ).toBe(false);
    });

    it('preserves AGENTS.md by default', async () => {
      await codexSetup.cleanup(projectDir);

      expect(await fs.pathExists(path.join(projectDir, 'AGENTS.md'))).toBe(true);
    });

    it('removes AGENTS.md when removeAgentsMd option is set', async () => {
      await codexSetup.cleanup(projectDir, { removeAgentsMd: true });

      expect(await fs.pathExists(path.join(projectDir, 'AGENTS.md'))).toBe(false);
    });

    it('does not remove non-agileflow skills', async () => {
      await fs.ensureDir(path.join(projectDir, '.codex', 'skills', 'other-skill'));
      await fs.writeFile(
        path.join(projectDir, '.codex', 'skills', 'other-skill', 'SKILL.md'),
        'other'
      );

      await codexSetup.cleanup(projectDir);

      expect(await fs.pathExists(path.join(projectDir, '.codex', 'skills', 'other-skill'))).toBe(
        true
      );
    });

    it('handles non-existent directories gracefully', async () => {
      const emptyDir = path.join(testDir, 'empty');
      await fs.ensureDir(emptyDir);

      await expect(codexSetup.cleanup(emptyDir)).resolves.not.toThrow();
    });
  });

  describe('setAgileflowFolder and setDocsFolder', () => {
    it('sets the agileflow folder name', () => {
      codexSetup.setAgileflowFolder('custom-agileflow');
      expect(codexSetup.agileflowFolder).toBe('custom-agileflow');
    });

    it('sets the docs folder name', () => {
      codexSetup.setDocsFolder('documentation');
      expect(codexSetup.docsFolder).toBe('documentation');
    });

    it('uses custom docs folder in AGENTS.md generation', async () => {
      codexSetup.setDocsFolder('custom-docs');

      const projectDir = path.join(testDir, 'project');
      await fs.ensureDir(projectDir);

      await codexSetup.generateAgentsMd(projectDir);

      const content = await fs.readFile(path.join(projectDir, 'AGENTS.md'), 'utf8');
      expect(content).toContain('custom-docs/09-agents/status.json');
    });
  });
});
