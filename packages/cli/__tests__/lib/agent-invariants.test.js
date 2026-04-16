/**
 * Agent Invariant Tests
 *
 * Auto-generated tests that validate ALL agent .md files in the codebase.
 * Tests invariants that must hold for every agent:
 * - Valid frontmatter (name, description, tools, model)
 * - No circular extends chains
 * - Base templates exist for all extends references
 * - Unique agent names
 * - assemblePrompt produces valid output for all agents
 */

const fs = require('fs');
const path = require('path');
const { parseFrontmatter, normalizeTools } = require('../../scripts/lib/frontmatter-parser');
const { assemblePrompt, clearAssemblerCaches } = require('../../tools/cli/lib/prompt-assembler');

const AGENTS_DIR = path.join(__dirname, '../../src/core/agents');
const CORE_DIR = path.join(__dirname, '../../src/core');

// Load all agent files
const agentFiles = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'));
const agents = agentFiles.map(file => {
  const filePath = path.join(AGENTS_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const frontmatter = parseFrontmatter(content);
  return { file, filePath, content, frontmatter };
});

beforeEach(() => {
  clearAssemblerCaches();
});

// =============================================================================
// Frontmatter validation
// =============================================================================
describe('Agent frontmatter validation', () => {
  test.each(agents.map(a => [a.file, a]))('%s has valid frontmatter', (file, agent) => {
    expect(agent.frontmatter).toBeDefined();
    expect(typeof agent.frontmatter).toBe('object');
    expect(Object.keys(agent.frontmatter).length).toBeGreaterThan(0);
  });

  test.each(agents.map(a => [a.file, a]))('%s has a name field', (file, agent) => {
    expect(agent.frontmatter.name).toBeDefined();
    expect(typeof agent.frontmatter.name).toBe('string');
    expect(agent.frontmatter.name.length).toBeGreaterThan(0);
  });

  test.each(agents.map(a => [a.file, a]))('%s has a description field', (file, agent) => {
    expect(agent.frontmatter.description).toBeDefined();
    expect(typeof agent.frontmatter.description).toBe('string');
    expect(agent.frontmatter.description.length).toBeGreaterThan(0);
  });

  test.each(agents.map(a => [a.file, a]))('%s has a tools field', (file, agent) => {
    expect(agent.frontmatter.tools).toBeDefined();
    const tools = normalizeTools(agent.frontmatter.tools);
    expect(tools.length).toBeGreaterThan(0);
  });

  test.each(agents.map(a => [a.file, a]))('%s has a valid model field', (file, agent) => {
    const validModels = ['haiku', 'sonnet', 'opus'];
    expect(agent.frontmatter.model).toBeDefined();
    expect(validModels).toContain(agent.frontmatter.model);
  });
});

// =============================================================================
// Unique names
// =============================================================================
describe('Agent name uniqueness', () => {
  test('all agents have unique names', () => {
    const names = agents.map(a => a.frontmatter.name).filter(Boolean);
    const uniqueNames = new Set(names);
    const duplicates = names.filter((name, idx) => names.indexOf(name) !== idx);
    expect(duplicates).toEqual([]);
    expect(uniqueNames.size).toBe(names.length);
  });
});

// =============================================================================
// Extends validation
// =============================================================================
describe('Extends references', () => {
  const agentsWithExtends = agents.filter(a => a.frontmatter.extends);

  if (agentsWithExtends.length > 0) {
    test.each(agentsWithExtends.map(a => [a.file, a]))(
      '%s references an existing base template',
      (file, agent) => {
        const baseName = agent.frontmatter.extends;
        const basePath = path.join(CORE_DIR, 'base-prompts', `${baseName}.md`);
        expect(fs.existsSync(basePath)).toBe(true);
      }
    );
  }

  test('no circular extends chains', () => {
    const baseDir = path.join(CORE_DIR, 'base-prompts');
    if (!fs.existsSync(baseDir)) return;

    const baseFiles = fs.readdirSync(baseDir).filter(f => f.endsWith('.md'));

    for (const baseFile of baseFiles) {
      const content = fs.readFileSync(path.join(baseDir, baseFile), 'utf8');
      const fm = parseFrontmatter(content);
      // Base templates must NOT extend anything (max 1 level)
      expect(fm.extends).toBeUndefined();
    }
  });
});

// =============================================================================
// Variables validation (for agents with extends)
// =============================================================================
describe('Variables validation', () => {
  const agentsWithVars = agents.filter(a => a.frontmatter.extends && a.frontmatter.variables);

  if (agentsWithVars.length > 0) {
    test.each(agentsWithVars.map(a => [a.file, a]))(
      '%s has valid variables object',
      (file, agent) => {
        const vars = agent.frontmatter.variables;
        expect(typeof vars).toBe('object');
        expect(vars).not.toBeNull();

        // All variable keys should be uppercase with underscores
        for (const key of Object.keys(vars)) {
          expect(key).toMatch(/^[A-Z_][A-Z0-9_]*$/);
        }
      }
    );
  }
});

// =============================================================================
// Mixins validation
// =============================================================================
describe('Mixins validation', () => {
  const agentsWithMixins = agents.filter(
    a => Array.isArray(a.frontmatter.mixins) && a.frontmatter.mixins.length > 0
  );

  if (agentsWithMixins.length > 0) {
    test.each(agentsWithMixins.map(a => [a.file, a]))(
      '%s references existing mixin files',
      (file, agent) => {
        for (const mixinName of agent.frontmatter.mixins) {
          const mixinPath = path.join(CORE_DIR, 'mixins', `${mixinName}.md`);
          expect(fs.existsSync(mixinPath)).toBe(true);
        }
      }
    );
  }
});

// =============================================================================
// Assembly validation
// =============================================================================
describe('Assembly produces valid output', () => {
  const agentsWithExtends = agents.filter(a => a.frontmatter.extends);

  if (agentsWithExtends.length > 0) {
    test.each(agentsWithExtends.map(a => [a.file, a]))(
      '%s assembles without error',
      (file, agent) => {
        clearAssemblerCaches();
        const result = assemblePrompt(agent.content, CORE_DIR);

        // Should produce valid content
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);

        // Should have frontmatter
        expect(result).toMatch(/^---\n/);

        // Should NOT have unresolved section placeholders
        expect(result).not.toMatch(/<!-- \{\{SECTION:[\w-]+\}\} -->/);

        // Should NOT have unresolved variable placeholders from the base template
        // (agent-specific variables like {{ANALYZER_TITLE}} should be resolved)
        if (agent.frontmatter.variables) {
          for (const key of Object.keys(agent.frontmatter.variables)) {
            expect(result).not.toContain(`{{${key}}}`);
          }
        }

        // Should preserve the agent name in frontmatter
        expect(result).toContain(`name: ${agent.frontmatter.name}`);
      }
    );
  }

  // Also test agents without extends still work
  const simpleAgents = agents.filter(a => !a.frontmatter.extends);
  if (simpleAgents.length > 0) {
    test.each(simpleAgents.slice(0, 10).map(a => [a.file, a]))(
      '%s passes through unchanged',
      (file, agent) => {
        clearAssemblerCaches();
        const result = assemblePrompt(agent.content, CORE_DIR);
        expect(result).toBe(agent.content);
      }
    );
  }
});

// =============================================================================
// Content structure validation
// =============================================================================
describe('Agent content structure', () => {
  // Analyzer agents should have sections when using extends
  const analyzerAgents = agents.filter(a => a.frontmatter.extends === 'analyzer-specialist');

  if (analyzerAgents.length > 0) {
    test.each(analyzerAgents.map(a => [a.file, a]))(
      '%s has required sections for analyzer-specialist',
      (file, agent) => {
        // Must have focus_areas section
        expect(agent.content).toMatch(/<!-- SECTION: focus_areas -->/);
        // Must have exclusions section
        expect(agent.content).toMatch(/<!-- SECTION: exclusions -->/);
        // Must have patterns section
        expect(agent.content).toMatch(/<!-- SECTION: patterns -->/);
      }
    );
  }
});

// =============================================================================
// Summary stats
// =============================================================================
describe('Agent inventory', () => {
  test('has expected number of agents', () => {
    expect(agents.length).toBeGreaterThanOrEqual(100);
  });

  test('reports agent statistics', () => {
    const withExtends = agents.filter(a => a.frontmatter.extends).length;
    const withMixins = agents.filter(
      a => Array.isArray(a.frontmatter.mixins) && a.frontmatter.mixins.length > 0
    ).length;
    const models = {};
    for (const a of agents) {
      const m = a.frontmatter.model || 'unknown';
      models[m] = (models[m] || 0) + 1;
    }

    // Log stats (visible in test output)
    console.log(`Total agents: ${agents.length}`);
    console.log(`With extends: ${withExtends}`);
    console.log(`With mixins: ${withMixins}`);
    console.log(`Models:`, models);

    // Basic sanity
    expect(agents.length).toBeGreaterThan(0);
  });
});
