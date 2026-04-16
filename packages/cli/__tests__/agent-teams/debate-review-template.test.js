/**
 * Tests for debate-review team template
 *
 * Validates the debate-review.json template structure, roles,
 * debate configuration, and compatibility with team-manager.
 */

const fs = require('fs');
const path = require('path');

describe('debate-review team template', () => {
  let template;

  beforeAll(() => {
    const templatePath = path.join(__dirname, '../../src/core/teams/debate-review.json');
    template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  });

  // =========================================================================
  // Basic structure
  // =========================================================================

  describe('basic structure', () => {
    test('has required top-level fields', () => {
      expect(template.name).toBe('debate-review');
      expect(template.description).toBeDefined();
      expect(template.version).toBeDefined();
      expect(template.lead).toBeDefined();
      expect(template.teammates).toBeDefined();
      expect(template.quality_gates).toBeDefined();
      expect(template.tags).toBeDefined();
    });

    test('has valid version format', () => {
      expect(template.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test('has meaningful description', () => {
      expect(template.description.length).toBeGreaterThan(20);
      expect(template.description).toMatch(/adversarial|debate|review/i);
    });
  });

  // =========================================================================
  // Lead configuration
  // =========================================================================

  describe('lead configuration', () => {
    test('has team-lead agent', () => {
      expect(template.lead.agent).toBe('team-lead');
    });

    test('uses delegate mode', () => {
      expect(template.lead.delegate_mode).toBe(true);
    });

    test('requires plan approval', () => {
      expect(template.lead.plan_approval).toBe(true);
    });
  });

  // =========================================================================
  // Teammate roles
  // =========================================================================

  describe('teammates', () => {
    test('has exactly 3 teammates', () => {
      expect(template.teammates).toHaveLength(3);
    });

    test('has presenter role', () => {
      const presenter = template.teammates.find(t => t.role === 'presenter');
      expect(presenter).toBeDefined();
      expect(presenter.domain).toBe('implementation');
      expect(presenter.instructions).toMatch(/presenter/i);
    });

    test('has challenger role', () => {
      const challenger = template.teammates.find(t => t.role === 'challenger');
      expect(challenger).toBeDefined();
      expect(challenger.domain).toBe('review');
      expect(challenger.instructions).toMatch(/challenger/i);
    });

    test('has synthesizer role', () => {
      const synthesizer = template.teammates.find(t => t.role === 'synthesizer');
      expect(synthesizer).toBeDefined();
      expect(synthesizer.domain).toBe('quality');
      expect(synthesizer.instructions).toMatch(/synthesizer/i);
    });

    test('all teammates have required fields', () => {
      for (const teammate of template.teammates) {
        expect(teammate.agent).toBeDefined();
        expect(teammate.role).toBeDefined();
        expect(teammate.domain).toBeDefined();
        expect(teammate.description).toBeDefined();
        expect(teammate.instructions).toBeDefined();
      }
    });

    test('all teammates have channel assignments', () => {
      for (const teammate of template.teammates) {
        expect(teammate.channels).toBeDefined();
        expect(Array.isArray(teammate.channels)).toBe(true);
        expect(teammate.channels.length).toBeGreaterThan(0);
      }
    });

    test('presenter and challenger share debate channel', () => {
      const presenter = template.teammates.find(t => t.role === 'presenter');
      const challenger = template.teammates.find(t => t.role === 'challenger');
      expect(presenter.channels).toContain('debate');
      expect(challenger.channels).toContain('debate');
    });

    test('synthesizer has access to both debate and synthesis channels', () => {
      const synthesizer = template.teammates.find(t => t.role === 'synthesizer');
      expect(synthesizer.channels).toContain('debate');
      expect(synthesizer.channels).toContain('synthesis');
    });

    test('all teammates have general channel', () => {
      for (const teammate of template.teammates) {
        expect(teammate.channels).toContain('general');
      }
    });
  });

  // =========================================================================
  // Debate configuration
  // =========================================================================

  describe('debate configuration', () => {
    test('has debate config section', () => {
      expect(template.debate).toBeDefined();
    });

    test('has max_rounds limit', () => {
      expect(template.debate.max_rounds).toBeDefined();
      expect(typeof template.debate.max_rounds).toBe('number');
      expect(template.debate.max_rounds).toBeGreaterThan(0);
      expect(template.debate.max_rounds).toBeLessThanOrEqual(10);
    });

    test('default max_rounds is 3', () => {
      expect(template.debate.max_rounds).toBe(3);
    });

    test('has 3 phases', () => {
      expect(template.debate.phases).toHaveLength(3);
    });

    test('phases are in correct order: presentation, challenge, synthesis', () => {
      expect(template.debate.phases[0].name).toBe('presentation');
      expect(template.debate.phases[1].name).toBe('challenge');
      expect(template.debate.phases[2].name).toBe('synthesis');
    });

    test('each phase has name, description, and actor', () => {
      for (const phase of template.debate.phases) {
        expect(phase.name).toBeDefined();
        expect(phase.description).toBeDefined();
        expect(phase.actor).toBeDefined();
      }
    });

    test('phase actors map to teammate roles', () => {
      const roles = template.teammates.map(t => t.role);
      for (const phase of template.debate.phases) {
        expect(roles).toContain(phase.actor);
      }
    });
  });

  // =========================================================================
  // Quality gates
  // =========================================================================

  describe('quality gates', () => {
    test('requires tests on idle', () => {
      expect(template.quality_gates.teammate_idle.tests).toBe(true);
    });

    test('requires lint on idle', () => {
      expect(template.quality_gates.teammate_idle.lint).toBe(true);
    });

    test('requires validator approval', () => {
      expect(template.quality_gates.task_completed.require_validator_approval).toBe(true);
    });
  });

  // =========================================================================
  // Tags
  // =========================================================================

  describe('tags', () => {
    test('includes review tag', () => {
      expect(template.tags).toContain('review');
    });

    test('includes debate tag', () => {
      expect(template.tags).toContain('debate');
    });

    test('includes high-confidence tag', () => {
      expect(template.tags).toContain('high-confidence');
    });
  });

  // =========================================================================
  // Compatibility with team-manager
  // =========================================================================

  describe('team-manager compatibility', () => {
    test('teammate count within MAX_TEAMMATES limit (8)', () => {
      expect(template.teammates.length).toBeLessThanOrEqual(8);
    });

    test('valid JSON structure (no circular refs)', () => {
      expect(() => JSON.stringify(template)).not.toThrow();
    });

    test('all agent names follow naming convention', () => {
      for (const teammate of template.teammates) {
        // Agents should start with "agileflow-"
        expect(teammate.agent).toMatch(/^agileflow-/);
      }
    });
  });
});
