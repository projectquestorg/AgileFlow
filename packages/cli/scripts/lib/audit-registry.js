/**
 * audit-registry.js - Static registry mapping audit types to analyzers
 *
 * Centralizes the mapping of 6 audit commands to their analyzer agents,
 * consensus coordinators, and depth configurations. Previously this info
 * was duplicated across 6 .md command files.
 *
 * Usage:
 *   const { getAuditType, getAnalyzersForAudit } = require('./audit-registry');
 *   const security = getAuditType('security');
 *   const focused = getAnalyzersForAudit('security', 'deep', ['injection', 'auth']);
 */

/**
 * Complete audit type registry.
 * Each entry defines: name, short prefix for tmux, color for tab groups,
 * all analyzers with their subagent_type, which are quick vs deep,
 * and the consensus coordinator.
 */
const AUDIT_TYPES = {
  logic: {
    name: 'Logic Analysis',
    prefix: 'Logic',
    color: '#7aa2f7', // sky
    command: 'code/logic',
    analyzers: {
      edge: { subagent_type: 'logic-analyzer-edge', label: 'Edge Cases' },
      invariant: { subagent_type: 'logic-analyzer-invariant', label: 'Invariants' },
      flow: { subagent_type: 'logic-analyzer-flow', label: 'Control Flow' },
      type: { subagent_type: 'logic-analyzer-type', label: 'Type Safety' },
      race: { subagent_type: 'logic-analyzer-race', label: 'Race Conditions' },
    },
    consensus: { subagent_type: 'logic-consensus', label: 'Logic Consensus' },
    quick_analyzers: ['edge', 'invariant', 'flow', 'type', 'race'],
    deep_analyzers: ['edge', 'invariant', 'flow', 'type', 'race'],
  },

  security: {
    name: 'Security Vulnerability',
    prefix: 'Sec',
    color: '#f7768e', // coral
    command: 'code/security',
    analyzers: {
      injection: { subagent_type: 'security-analyzer-injection', label: 'Injection' },
      auth: { subagent_type: 'security-analyzer-auth', label: 'Authentication' },
      authz: { subagent_type: 'security-analyzer-authz', label: 'Authorization' },
      secrets: { subagent_type: 'security-analyzer-secrets', label: 'Secrets' },
      input: { subagent_type: 'security-analyzer-input', label: 'Input Validation' },
      deps: { subagent_type: 'security-analyzer-deps', label: 'Dependencies' },
      infra: { subagent_type: 'security-analyzer-infra', label: 'Infrastructure' },
      api: { subagent_type: 'security-analyzer-api', label: 'API Security' },
    },
    consensus: { subagent_type: 'security-consensus', label: 'Security Consensus' },
    quick_analyzers: ['injection', 'auth', 'authz', 'secrets', 'input'],
    deep_analyzers: ['injection', 'auth', 'authz', 'secrets', 'input', 'deps', 'infra', 'api'],
  },

  performance: {
    name: 'Performance Bottleneck',
    prefix: 'Perf',
    color: '#73daca', // mint
    command: 'code/performance',
    analyzers: {
      queries: { subagent_type: 'perf-analyzer-queries', label: 'Queries' },
      rendering: { subagent_type: 'perf-analyzer-rendering', label: 'Rendering' },
      memory: { subagent_type: 'perf-analyzer-memory', label: 'Memory' },
      bundle: { subagent_type: 'perf-analyzer-bundle', label: 'Bundle Size' },
      compute: { subagent_type: 'perf-analyzer-compute', label: 'Compute' },
      network: { subagent_type: 'perf-analyzer-network', label: 'Network' },
      caching: { subagent_type: 'perf-analyzer-caching', label: 'Caching' },
      assets: { subagent_type: 'perf-analyzer-assets', label: 'Assets' },
    },
    consensus: { subagent_type: 'perf-consensus', label: 'Performance Consensus' },
    quick_analyzers: ['queries', 'rendering', 'memory', 'bundle', 'compute'],
    deep_analyzers: [
      'queries',
      'rendering',
      'memory',
      'bundle',
      'compute',
      'network',
      'caching',
      'assets',
    ],
  },

  test: {
    name: 'Test Quality',
    prefix: 'Test',
    color: '#e0af68', // amber
    command: 'code/test',
    analyzers: {
      coverage: { subagent_type: 'test-analyzer-coverage', label: 'Coverage' },
      fragility: { subagent_type: 'test-analyzer-fragility', label: 'Fragility' },
      mocking: { subagent_type: 'test-analyzer-mocking', label: 'Mocking' },
      assertions: { subagent_type: 'test-analyzer-assertions', label: 'Assertions' },
      structure: { subagent_type: 'test-analyzer-structure', label: 'Structure' },
      integration: { subagent_type: 'test-analyzer-integration', label: 'Integration' },
      maintenance: { subagent_type: 'test-analyzer-maintenance', label: 'Maintenance' },
      patterns: { subagent_type: 'test-analyzer-patterns', label: 'Anti-Patterns' },
    },
    consensus: { subagent_type: 'test-consensus', label: 'Test Consensus' },
    quick_analyzers: ['coverage', 'fragility', 'mocking', 'assertions', 'structure'],
    deep_analyzers: [
      'coverage',
      'fragility',
      'mocking',
      'assertions',
      'structure',
      'integration',
      'maintenance',
      'patterns',
    ],
  },

  completeness: {
    name: 'Completeness',
    prefix: 'Comp',
    color: '#bb9af7', // violet
    command: 'code/completeness',
    analyzers: {
      handlers: { subagent_type: 'completeness-analyzer-handlers', label: 'Handlers' },
      routes: { subagent_type: 'completeness-analyzer-routes', label: 'Routes' },
      api: { subagent_type: 'completeness-analyzer-api', label: 'API Endpoints' },
      stubs: { subagent_type: 'completeness-analyzer-stubs', label: 'Stubs' },
      state: { subagent_type: 'completeness-analyzer-state', label: 'State' },
      imports: { subagent_type: 'completeness-analyzer-imports', label: 'Imports' },
      conditional: { subagent_type: 'completeness-analyzer-conditional', label: 'Conditionals' },
    },
    consensus: { subagent_type: 'completeness-consensus', label: 'Completeness Consensus' },
    quick_analyzers: ['handlers', 'routes', 'api', 'stubs', 'state'],
    deep_analyzers: ['handlers', 'routes', 'api', 'stubs', 'state', 'imports', 'conditional'],
  },

  brainstorm: {
    name: 'Feature Brainstorm',
    prefix: 'Brain',
    color: '#c0caf5', // lavender
    command: 'ideate/features',
    analyzers: {
      features: { subagent_type: 'brainstorm-analyzer-features', label: 'Feature Gaps' },
      ux: { subagent_type: 'brainstorm-analyzer-ux', label: 'UX Improvements' },
      market: { subagent_type: 'brainstorm-analyzer-market', label: 'Market Features' },
      growth: { subagent_type: 'brainstorm-analyzer-growth', label: 'Growth & Engagement' },
      integration: { subagent_type: 'brainstorm-analyzer-integration', label: 'Integrations' },
    },
    consensus: { subagent_type: 'brainstorm-consensus', label: 'Brainstorm Consensus' },
    quick_analyzers: ['features', 'ux', 'market'],
    deep_analyzers: ['features', 'ux', 'market', 'growth', 'integration'],
  },

  ideate: {
    name: 'Ideation',
    prefix: 'Idea',
    color: '#ff9e64', // orange
    command: 'ideate/new',
    analyzers: {
      security: { subagent_type: 'agileflow-security', label: 'Security' },
      performance: { subagent_type: 'agileflow-performance', label: 'Performance' },
      refactor: { subagent_type: 'agileflow-refactor', label: 'Code Quality' },
      ui: { subagent_type: 'agileflow-ui', label: 'UX/Design' },
      testing: { subagent_type: 'agileflow-testing', label: 'Testing' },
      api: { subagent_type: 'agileflow-api', label: 'API/Architecture' },
      accessibility: { subagent_type: 'agileflow-accessibility', label: 'Accessibility' },
      compliance: { subagent_type: 'agileflow-compliance', label: 'Compliance' },
      database: { subagent_type: 'agileflow-database', label: 'Database' },
      monitoring: { subagent_type: 'agileflow-monitoring', label: 'Monitoring' },
      qa: { subagent_type: 'agileflow-qa', label: 'QA' },
      analytics: { subagent_type: 'agileflow-analytics', label: 'Analytics' },
      documentation: { subagent_type: 'agileflow-documentation', label: 'Documentation' },
    },
    consensus: null, // ideation does its own synthesis (no consensus coordinator)
    quick_analyzers: ['security', 'performance', 'refactor', 'ui', 'testing', 'api'],
    deep_analyzers: [
      'security',
      'performance',
      'refactor',
      'ui',
      'testing',
      'api',
      'accessibility',
      'compliance',
      'database',
      'monitoring',
      'qa',
      'analytics',
      'documentation',
    ],
  },

  legal: {
    name: 'Legal Risk',
    prefix: 'Legal',
    color: '#9ece6a', // lime
    command: 'code/legal',
    analyzers: {
      privacy: { subagent_type: 'legal-analyzer-privacy', label: 'Privacy' },
      terms: { subagent_type: 'legal-analyzer-terms', label: 'Terms' },
      a11y: { subagent_type: 'legal-analyzer-a11y', label: 'Accessibility' },
      licensing: { subagent_type: 'legal-analyzer-licensing', label: 'Licensing' },
      consumer: { subagent_type: 'legal-analyzer-consumer', label: 'Consumer' },
      security: { subagent_type: 'legal-analyzer-security', label: 'Security' },
      ai: { subagent_type: 'legal-analyzer-ai', label: 'AI Compliance' },
      content: { subagent_type: 'legal-analyzer-content', label: 'Content' },
      international: { subagent_type: 'legal-analyzer-international', label: 'International' },
    },
    consensus: { subagent_type: 'legal-consensus', label: 'Legal Consensus' },
    quick_analyzers: ['privacy', 'terms', 'a11y', 'licensing', 'consumer'],
    deep_analyzers: [
      'privacy',
      'terms',
      'a11y',
      'licensing',
      'consumer',
      'security',
      'ai',
      'content',
      'international',
    ],
  },
};

/**
 * Get audit type configuration.
 *
 * @param {string} type - Audit type key (logic, security, performance, test, completeness, legal, ideate)
 * @returns {object|null} Audit type config or null if invalid
 */
function getAuditType(type) {
  return AUDIT_TYPES[type] || null;
}

/**
 * Get all valid audit type keys.
 *
 * @returns {string[]} Array of audit type keys
 */
function getAuditTypeKeys() {
  return Object.keys(AUDIT_TYPES);
}

/**
 * Get analyzers for a given audit type, depth, and focus.
 *
 * @param {string} type - Audit type key
 * @param {string} [depth='quick'] - 'quick', 'deep', or 'ultradeep'
 * @param {string[]} [focus] - Array of focus areas, or null/['all'] for all
 * @returns {{ analyzers: Array<{ key: string, subagent_type: string, label: string }>, consensus: object }|null}
 */
function getAnalyzersForAudit(type, depth, focus) {
  const audit = AUDIT_TYPES[type];
  if (!audit) return null;

  const effectiveDepth = depth === 'ultradeep' ? 'deep' : depth || 'quick';
  const analyzerKeys = effectiveDepth === 'deep' ? audit.deep_analyzers : audit.quick_analyzers;

  // Filter by focus if specified
  let selectedKeys = analyzerKeys;
  if (focus && focus.length > 0 && !focus.includes('all')) {
    selectedKeys = analyzerKeys.filter(key => focus.includes(key));
    // If focus specifies keys not in current depth, include them anyway
    for (const f of focus) {
      if (audit.analyzers[f] && !selectedKeys.includes(f)) {
        selectedKeys.push(f);
      }
    }
  }

  const analyzers = selectedKeys.map(key => ({
    key,
    subagent_type: audit.analyzers[key].subagent_type,
    label: audit.analyzers[key].label,
  }));

  return {
    analyzers,
    consensus: audit.consensus,
  };
}

/**
 * Get analyzer count for a given audit type at each depth.
 *
 * @param {string} type - Audit type key
 * @returns {{ quick: number, deep: number, total: number }|null}
 */
function getAnalyzerCounts(type) {
  const audit = AUDIT_TYPES[type];
  if (!audit) return null;

  return {
    quick: audit.quick_analyzers.length,
    deep: audit.deep_analyzers.length,
    total: Object.keys(audit.analyzers).length,
  };
}

module.exports = {
  AUDIT_TYPES,
  getAuditType,
  getAuditTypeKeys,
  getAnalyzersForAudit,
  getAnalyzerCounts,
};
