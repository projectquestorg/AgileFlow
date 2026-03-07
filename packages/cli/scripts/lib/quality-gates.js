/**
 * quality-gates.js - Reusable Quality Gate Framework for Builder/Validator Pairing
 *
 * Quality gates are checkpoints that validators use to verify builder work.
 * This module provides:
 * - Predefined gate types (tests, coverage, lint, types, visual)
 * - Gate execution and result formatting
 * - Pass/fail threshold logic
 * - Integration with task-registry for state tracking
 *
 * Builder/Validator Pattern:
 * - Builders have full tools (Read, Write, Edit, Bash)
 * - Validators have read-only tools (Read, Glob, Grep only)
 * - Validators verify work meets quality gates before completion
 * - This prevents auto-marking done without independent verification
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { buildSpawnArgs } = require('../../lib/validate-commands');

// ============================================================================
// Constants
// ============================================================================

/**
 * Available quality gate types
 */
const GATE_TYPES = {
  TESTS: 'tests',
  COVERAGE: 'coverage',
  LINT: 'lint',
  TYPES: 'types',
  VISUAL: 'visual',
  CUSTOM: 'custom',
};

/**
 * Default commands for each gate type
 */
const DEFAULT_COMMANDS = {
  [GATE_TYPES.TESTS]: 'npm test',
  [GATE_TYPES.COVERAGE]: 'npm test -- --coverage',
  [GATE_TYPES.LINT]: 'npm run lint',
  [GATE_TYPES.TYPES]: 'npx tsc --noEmit',
};

/**
 * Gate result statuses
 */
const GATE_STATUS = {
  PASSED: 'passed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  ERROR: 'error',
};

/**
 * Builder tool set (full access)
 */
const BUILDER_TOOLS = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'];

/**
 * Validator tool set (read-only)
 */
const VALIDATOR_TOOLS = ['Read', 'Glob', 'Grep'];

// ============================================================================
// Quality Gate Definition
// ============================================================================

/**
 * Create a quality gate definition
 * @param {Object} config - Gate configuration
 * @returns {Object} Gate definition
 */
function createGate(config) {
  const {
    type,
    name,
    command,
    threshold,
    description,
    required = true,
    timeout = 120000, // 2 minutes default
    patterns = [],
  } = config;

  if (!type || !Object.values(GATE_TYPES).includes(type)) {
    throw new Error(`Invalid gate type: ${type}. Valid: ${Object.values(GATE_TYPES).join(', ')}`);
  }

  return {
    type,
    name: name || type,
    command: command || DEFAULT_COMMANDS[type],
    threshold: threshold || null,
    description: description || `Quality gate: ${type}`,
    required,
    timeout,
    patterns,
    created_at: new Date().toISOString(),
  };
}

/**
 * Create standard gates for a validator
 * @param {Object} options - Options
 * @returns {Object[]} Array of gate definitions
 */
function createStandardGates(options = {}) {
  const {
    includeTests = true,
    includeCoverage = false,
    coverageThreshold = 80,
    includeLint = true,
    includeTypes = true,
    customGates = [],
  } = options;

  const gates = [];

  if (includeTests) {
    gates.push(
      createGate({
        type: GATE_TYPES.TESTS,
        name: 'Unit Tests',
        description: 'All tests must pass',
      })
    );
  }

  if (includeCoverage) {
    gates.push(
      createGate({
        type: GATE_TYPES.COVERAGE,
        name: 'Code Coverage',
        threshold: coverageThreshold,
        description: `Coverage must be >= ${coverageThreshold}%`,
      })
    );
  }

  if (includeLint) {
    gates.push(
      createGate({
        type: GATE_TYPES.LINT,
        name: 'Lint',
        description: 'No lint errors',
      })
    );
  }

  if (includeTypes) {
    gates.push(
      createGate({
        type: GATE_TYPES.TYPES,
        name: 'Type Check',
        description: 'TypeScript types must compile',
      })
    );
  }

  for (const custom of customGates) {
    gates.push(createGate({ ...custom, type: GATE_TYPES.CUSTOM }));
  }

  return gates;
}

// ============================================================================
// Gate Execution
// ============================================================================

/**
 * Execute a quality gate
 * @param {Object} gate - Gate definition
 * @param {Object} options - Execution options
 * @returns {Object} Gate result
 */
function executeGate(gate, options = {}) {
  const { cwd = process.cwd(), env = process.env, dryRun = false } = options;

  const startTime = Date.now();

  if (dryRun) {
    return {
      gate: gate.name,
      type: gate.type,
      status: GATE_STATUS.SKIPPED,
      message: 'Dry run - gate not executed',
      duration_ms: 0,
    };
  }

  if (!gate.command) {
    return {
      gate: gate.name,
      type: gate.type,
      status: GATE_STATUS.SKIPPED,
      message: 'No command specified',
      duration_ms: 0,
    };
  }

  try {
    // Try safe spawn first (no shell injection possible)
    const validation = buildSpawnArgs(gate.command, { strict: false });
    let result;
    if (validation.ok) {
      result = spawnSync(validation.data.file, validation.data.args, {
        cwd,
        env,
        timeout: gate.timeout,
        encoding: 'utf8',
        shell: false,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });
    } else {
      // Fallback for complex commands (pipes, shell builtins, etc.)
      result = spawnSync('sh', ['-c', gate.command], {
        cwd,
        env,
        timeout: gate.timeout,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });
    }

    const duration = Date.now() - startTime;

    // Check exit code
    if (result.status === 0) {
      // Check threshold if applicable
      if (gate.type === GATE_TYPES.COVERAGE && gate.threshold) {
        const coverage = parseCoverageOutput(result.stdout + result.stderr);
        if (coverage !== null && coverage < gate.threshold) {
          return {
            gate: gate.name,
            type: gate.type,
            status: GATE_STATUS.FAILED,
            message: `Coverage ${coverage}% below threshold ${gate.threshold}%`,
            value: coverage,
            threshold: gate.threshold,
            duration_ms: duration,
          };
        }
      }

      return {
        gate: gate.name,
        type: gate.type,
        status: GATE_STATUS.PASSED,
        message: 'Gate passed',
        duration_ms: duration,
        output: truncateOutput(result.stdout),
      };
    } else {
      return {
        gate: gate.name,
        type: gate.type,
        status: GATE_STATUS.FAILED,
        message: `Exit code: ${result.status}`,
        exit_code: result.status,
        duration_ms: duration,
        output: truncateOutput(result.stdout),
        error: truncateOutput(result.stderr),
      };
    }
  } catch (e) {
    return {
      gate: gate.name,
      type: gate.type,
      status: GATE_STATUS.ERROR,
      message: e.message,
      duration_ms: Date.now() - startTime,
    };
  }
}

/**
 * Execute multiple gates
 * @param {Object[]} gates - Gate definitions
 * @param {Object} options - Execution options
 * @returns {Object} Combined results
 */
function executeGates(gates, options = {}) {
  const { stopOnFailure = false, parallel = false } = options;

  const results = [];
  let allPassed = true;

  for (const gate of gates) {
    if (stopOnFailure && !allPassed) {
      results.push({
        gate: gate.name,
        type: gate.type,
        status: GATE_STATUS.SKIPPED,
        message: 'Skipped due to previous failure',
        duration_ms: 0,
      });
      continue;
    }

    const result = executeGate(gate, options);
    results.push(result);

    if (result.status === GATE_STATUS.FAILED || result.status === GATE_STATUS.ERROR) {
      if (gate.required) {
        allPassed = false;
      }
    }
  }

  return {
    passed: allPassed,
    total: gates.length,
    passed_count: results.filter(r => r.status === GATE_STATUS.PASSED).length,
    failed_count: results.filter(r => r.status === GATE_STATUS.FAILED).length,
    skipped_count: results.filter(r => r.status === GATE_STATUS.SKIPPED).length,
    results,
    executed_at: new Date().toISOString(),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse coverage percentage from command output
 * @param {string} output - Command output
 * @returns {number|null} Coverage percentage or null
 */
function parseCoverageOutput(output) {
  // Common coverage patterns
  const patterns = [
    /All files[^|]*\|[^|]*\|\s*([\d.]+)/,
    /Coverage[:\s]+([\d.]+)%/i,
    /Statements\s*:\s*([\d.]+)%/i,
    /Lines\s*:\s*([\d.]+)%/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return parseFloat(match[1]);
    }
  }

  return null;
}

/**
 * Truncate output to reasonable length
 * @param {string} output - Raw output
 * @param {number} maxLength - Max characters
 * @returns {string} Truncated output
 */
function truncateOutput(output, maxLength = 2000) {
  if (!output) return '';
  if (output.length <= maxLength) return output;
  return output.slice(0, maxLength) + '\n... (truncated)';
}

// ============================================================================
// Builder/Validator Framework
// ============================================================================

/**
 * Check if an agent is a builder (has write tools)
 * @param {string[]} tools - Agent's tools
 * @returns {boolean}
 */
function isBuilderAgent(tools) {
  return tools.some(t => ['Write', 'Edit', 'Bash'].includes(t));
}

/**
 * Check if an agent is a validator (read-only tools)
 * @param {string[]} tools - Agent's tools
 * @returns {boolean}
 */
function isValidatorAgent(tools) {
  const writeTools = ['Write', 'Edit', 'Bash'];
  return !tools.some(t => writeTools.includes(t));
}

/**
 * Get validator tools from builder tools
 * @param {string[]} builderTools - Builder's tools
 * @returns {string[]} Validator tools (read-only subset)
 */
function getValidatorTools(builderTools) {
  const readOnlyTools = ['Read', 'Glob', 'Grep', 'Task', 'TaskOutput', 'WebFetch', 'WebSearch'];
  return builderTools.filter(t => readOnlyTools.includes(t));
}

/**
 * Create validator agent config from builder
 * @param {Object} builderConfig - Builder agent frontmatter
 * @returns {Object} Validator agent config
 */
function createValidatorConfig(builderConfig) {
  const { name, description, model, compact_context } = builderConfig;

  return {
    name: `${name}-validator`,
    description: `Validator for ${name}. Verifies work meets quality gates. Read-only access.`,
    tools: VALIDATOR_TOOLS,
    model: model || 'haiku',
    is_validator: true,
    validates_builder: name,
    compact_context: compact_context
      ? {
          ...compact_context,
          preserve_rules: [
            ...(compact_context.preserve_rules || []),
            'You are a VALIDATOR - you CANNOT modify files',
            'Your job is to VERIFY work meets quality gates',
            'Report issues but do NOT fix them',
          ],
        }
      : undefined,
  };
}

/**
 * Parse frontmatter from agent markdown.
 * Reads both YAML frontmatter and AGILEFLOW_META comment block.
 * Native fields come from YAML, AgileFlow fields from comment block.
 *
 * @param {string} content - Agent markdown content
 * @returns {Object|null} Parsed frontmatter (merged) or null
 */
function parseAgentFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = {};
  const lines = match[1].split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();

      // Handle arrays and booleans
      if (value.startsWith('[') || value.startsWith('{')) {
        // Skip complex values for now
        continue;
      } else if (value === 'true') {
        value = true;
      } else if (value === 'false') {
        value = false;
      }

      frontmatter[key] = value;
    }
  }

  // Parse tools from the special format
  const toolsMatch = match[1].match(/tools:\s*([^\n]+)/);
  if (toolsMatch) {
    frontmatter.tools = toolsMatch[1].split(',').map(t => t.trim());
  }

  // Parse AGILEFLOW_META comment block (for migrated agents)
  const metaMatch = content.match(/<!-- AGILEFLOW_META\n([\s\S]*?)AGILEFLOW_META -->/);
  if (metaMatch) {
    const metaLines = metaMatch[1].split('\n');
    for (const line of metaLines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
        const key = line.slice(0, colonIdx).trim();
        let value = line.slice(colonIdx + 1).trim();

        if (value === 'true') value = true;
        else if (value === 'false') value = false;

        // Only set if not already in frontmatter (YAML takes priority)
        if (!(key in frontmatter)) {
          frontmatter[key] = value;
        }
      }
    }
  }

  return frontmatter;
}

/**
 * Check if agent has validator support
 * @param {Object} frontmatter - Agent frontmatter
 * @returns {boolean}
 */
function hasValidatorSupport(frontmatter) {
  return frontmatter && frontmatter.has_validator === true;
}

// ============================================================================
// Validation Report
// ============================================================================

/**
 * Create a validation report
 * @param {Object} gateResults - Results from executeGates
 * @param {Object} options - Report options
 * @returns {string} Formatted report
 */
function createValidationReport(gateResults, options = {}) {
  const { storyId, builderAgent, validatorAgent } = options;

  const lines = [];

  lines.push('## Validation Report');
  lines.push('');

  if (storyId) {
    lines.push(`**Story**: ${storyId}`);
  }
  if (builderAgent) {
    lines.push(`**Builder**: ${builderAgent}`);
  }
  if (validatorAgent) {
    lines.push(`**Validator**: ${validatorAgent}`);
  }
  lines.push(`**Executed**: ${gateResults.executed_at}`);
  lines.push('');

  // Summary
  const statusEmoji = gateResults.passed ? '✅' : '❌';
  lines.push(`### Overall Status: ${statusEmoji} ${gateResults.passed ? 'PASSED' : 'FAILED'}`);
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Gates | ${gateResults.total} |`);
  lines.push(`| Passed | ${gateResults.passed_count} |`);
  lines.push(`| Failed | ${gateResults.failed_count} |`);
  lines.push(`| Skipped | ${gateResults.skipped_count} |`);
  lines.push('');

  // Individual results
  lines.push('### Gate Results');
  lines.push('');

  for (const result of gateResults.results) {
    const emoji =
      result.status === GATE_STATUS.PASSED
        ? '✅'
        : result.status === GATE_STATUS.FAILED
          ? '❌'
          : result.status === GATE_STATUS.SKIPPED
            ? '⏭️'
            : '⚠️';

    lines.push(`#### ${emoji} ${result.gate}`);
    lines.push(`- **Type**: ${result.type}`);
    lines.push(`- **Status**: ${result.status}`);
    lines.push(`- **Message**: ${result.message}`);
    if (result.duration_ms) {
      lines.push(`- **Duration**: ${result.duration_ms}ms`);
    }
    if (result.value !== undefined) {
      lines.push(`- **Value**: ${result.value}`);
    }
    if (result.threshold !== undefined) {
      lines.push(`- **Threshold**: ${result.threshold}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// CI Feedback Loop
// ============================================================================

/**
 * Default CI feedback loop configuration
 */
const CI_FEEDBACK_DEFAULTS = {
  enabled: true,
  max_rounds: 3,
};

/**
 * Load CI feedback loop config from agileflow-metadata.json
 * @param {string} projectRoot - Project root directory
 * @returns {Object} CI feedback loop config
 */
function loadCIFeedbackConfig(projectRoot) {
  const metadataPath = path.join(projectRoot, 'docs', '00-meta', 'agileflow-metadata.json');
  try {
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      if (metadata.ci_feedback_loops) {
        return {
          ...CI_FEEDBACK_DEFAULTS,
          ...metadata.ci_feedback_loops,
        };
      }
    }
  } catch {
    // Fall through to defaults
  }
  return { ...CI_FEEDBACK_DEFAULTS };
}

/**
 * Execute a CI feedback loop - runs gates, and if they fail, returns
 * structured feedback for the agent to retry (up to max_rounds).
 *
 * This implements the Stripe "Minions" pattern: deterministic CI check
 * followed by agent retry, with a hard iteration limit.
 *
 * @param {Object[]} gates - Quality gate definitions to check
 * @param {Object} options - Loop options
 * @param {string} [options.projectRoot] - Project root directory
 * @param {number} [options.maxRounds] - Override max retry rounds (default: from config)
 * @param {number} [options.currentRound] - Current round number (1-based, default: 1)
 * @param {string} [options.cwd] - Working directory for gate execution
 * @returns {Object} Loop result with status and agent feedback
 */
function executeCIFeedbackLoop(gates, options = {}) {
  const { projectRoot = process.cwd(), maxRounds, currentRound = 1, cwd } = options;

  const config = loadCIFeedbackConfig(projectRoot);

  if (!config.enabled) {
    return {
      status: 'disabled',
      message: 'CI feedback loops are disabled in agileflow-metadata.json',
      should_retry: false,
      round: currentRound,
      max_rounds: 0,
    };
  }

  const effectiveMaxRounds = maxRounds || config.max_rounds || CI_FEEDBACK_DEFAULTS.max_rounds;

  // Execute all gates
  const gateResults = executeGates(gates, { cwd, stopOnFailure: false });

  if (gateResults.passed) {
    return {
      status: 'passed',
      message: `All ${gateResults.passed_count} gates passed on round ${currentRound}`,
      should_retry: false,
      round: currentRound,
      max_rounds: effectiveMaxRounds,
      gate_results: gateResults,
    };
  }

  // Gates failed - determine if we should retry
  const hasRoundsLeft = currentRound < effectiveMaxRounds;

  if (!hasRoundsLeft) {
    return {
      status: 'exhausted',
      message: `Gates failed after ${currentRound}/${effectiveMaxRounds} rounds. Escalating to human.`,
      should_retry: false,
      round: currentRound,
      max_rounds: effectiveMaxRounds,
      gate_results: gateResults,
      failures: gateResults.results
        .filter(r => r.status === GATE_STATUS.FAILED || r.status === GATE_STATUS.ERROR)
        .map(r => ({
          gate: r.gate,
          message: r.message,
          output: r.output,
          error: r.error,
        })),
    };
  }

  // Build structured feedback for agent retry
  const failures = gateResults.results.filter(
    r => r.status === GATE_STATUS.FAILED || r.status === GATE_STATUS.ERROR
  );

  const feedbackLines = [
    `## CI Feedback Loop - Round ${currentRound}/${effectiveMaxRounds}`,
    '',
    `**${failures.length} gate(s) failed.** ${effectiveMaxRounds - currentRound} retry round(s) remaining.`,
    '',
    '### Failures',
    '',
  ];

  for (const failure of failures) {
    feedbackLines.push(`#### ${failure.gate} (${failure.type})`);
    feedbackLines.push(`- **Status**: ${failure.status}`);
    feedbackLines.push(`- **Message**: ${failure.message}`);
    if (failure.output) {
      feedbackLines.push('- **Output**:');
      feedbackLines.push('```');
      feedbackLines.push(failure.output);
      feedbackLines.push('```');
    }
    if (failure.error) {
      feedbackLines.push('- **Error**:');
      feedbackLines.push('```');
      feedbackLines.push(failure.error);
      feedbackLines.push('```');
    }
    feedbackLines.push('');
  }

  feedbackLines.push('### Action Required');
  feedbackLines.push('');
  feedbackLines.push('Fix the failing gates above, then re-run verification.');

  return {
    status: 'retry',
    message: `Round ${currentRound}/${effectiveMaxRounds} failed. Agent should fix and retry.`,
    should_retry: true,
    round: currentRound,
    max_rounds: effectiveMaxRounds,
    next_round: currentRound + 1,
    gate_results: gateResults,
    agent_feedback: feedbackLines.join('\n'),
    failures: failures.map(r => ({
      gate: r.gate,
      message: r.message,
      output: r.output,
      error: r.error,
    })),
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Constants
  GATE_TYPES,
  GATE_STATUS,
  BUILDER_TOOLS,
  VALIDATOR_TOOLS,
  DEFAULT_COMMANDS,

  // Gate creation
  createGate,
  createStandardGates,

  // Gate execution
  executeGate,
  executeGates,

  // Helper functions
  parseCoverageOutput,
  truncateOutput,

  // Builder/Validator framework
  isBuilderAgent,
  isValidatorAgent,
  getValidatorTools,
  createValidatorConfig,
  parseAgentFrontmatter,
  hasValidatorSupport,

  // Reporting
  createValidationReport,

  // CI Feedback Loop
  CI_FEEDBACK_DEFAULTS,
  loadCIFeedbackConfig,
  executeCIFeedbackLoop,
};
