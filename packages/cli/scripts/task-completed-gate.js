#!/usr/bin/env node

/**
 * task-completed-gate.js - TaskCompleted Hook for Validation Gates
 *
 * Runs when a builder marks a task as complete.
 * Checks if validator approval is required and blocks until received.
 *
 * Exit codes:
 *   0 - Allow task completion (no validator needed, or validator approved)
 *   1 - Error (fail-open, task completes)
 *   2 - Block completion (validator approval pending)
 *
 * Input: JSON on stdin with { task_id, agent, ... }
 * Output: Reason on stderr when blocking (exit 2)
 *
 * Configuration: agileflow-metadata.json → quality_gates.task_completed
 *
 * Usage in .claude/settings.json:
 *   "hooks": {
 *     "TaskCompleted": [{ "hooks": [{ "type": "command", "command": "node scripts/task-completed-gate.js" }] }]
 *   }
 */

const fs = require('fs');
const path = require('path');

// Lazy-load modules
let _validationRegistry;
function getValidationRegistry() {
  if (!_validationRegistry) {
    try {
      _validationRegistry = require('./lib/validation-registry');
    } catch (e) {
      return null;
    }
  }
  return _validationRegistry;
}

let _hookMetrics;
function getHookMetrics() {
  if (!_hookMetrics) {
    try {
      _hookMetrics = require('./lib/hook-metrics');
    } catch (e) {
      return null;
    }
  }
  return _hookMetrics;
}

let _paths;
function getPaths() {
  if (!_paths) {
    try {
      _paths = require('../lib/paths');
    } catch (e) {
      return null;
    }
  }
  return _paths;
}

/**
 * Read stdin for hook input
 */
function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    const timeout = setTimeout(() => resolve(data), 1000);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => {
      clearTimeout(timeout);
      resolve(data);
    });
    process.stdin.resume();
  });
}

/**
 * Get active team template from session state
 */
function getActiveTeamTemplate(rootDir) {
  try {
    const paths = getPaths();
    if (!paths) return null;

    const sessionStatePath = paths.getSessionStatePath(rootDir);
    if (!fs.existsSync(sessionStatePath)) return null;

    const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
    return state.active_team || null;
  } catch (e) {
    return null;
  }
}

async function main() {
  const rootDir = process.cwd();
  const hookMetrics = getHookMetrics();
  const timer = hookMetrics ? hookMetrics.startHookTimer('TaskCompleted', 'validation_gate') : null;

  try {
    // Read stdin for task context
    const stdin = await readStdin();
    let taskInfo = {};
    try {
      if (stdin.trim()) {
        taskInfo = JSON.parse(stdin);
      }
    } catch (e) {
      // Not JSON - continue without context
    }

    const builderAgent = taskInfo.agent || taskInfo.tool_input?.agent;
    const taskId = taskInfo.task_id || taskInfo.tool_input?.task_id;

    if (!builderAgent) {
      // No agent info - can't determine if validation needed, allow
      if (timer && hookMetrics) {
        hookMetrics.recordHookMetrics(timer, 'success', 'no agent info', { rootDir });
      }
      process.exit(0);
    }

    const registry = getValidationRegistry();
    if (!registry) {
      // Registry not available - fail open
      if (timer && hookMetrics) {
        hookMetrics.recordHookMetrics(timer, 'error', 'registry not available', { rootDir });
      }
      process.exit(0);
    }

    // Get active team template for context
    const teamTemplate = getActiveTeamTemplate(rootDir);

    // Check if this builder requires validation
    const needsValidation = registry.requiresValidation(builderAgent, {
      rootDir,
      teamTemplate,
    });

    if (!needsValidation) {
      // No validator required - allow completion
      if (timer && hookMetrics) {
        hookMetrics.recordHookMetrics(timer, 'success', 'no validator required', { rootDir });
      }
      process.exit(0);
    }

    // Get the validator agent
    const validatorAgent = registry.getValidator(builderAgent, {
      rootDir,
      teamTemplate,
    });

    if (!validatorAgent) {
      // No validator found - allow completion
      if (timer && hookMetrics) {
        hookMetrics.recordHookMetrics(timer, 'success', 'no validator found', { rootDir });
      }
      process.exit(0);
    }

    // Check if validator has approved
    const approved = registry.isValidatorApproved(taskId, validatorAgent, { rootDir });

    // Record gate run in session state metrics
    if (timer && hookMetrics) {
      try {
        const paths = getPaths();
        if (paths) {
          const sessionStatePath = paths.getSessionStatePath(rootDir);
          if (fs.existsSync(sessionStatePath)) {
            const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
            if (!state.hook_metrics) state.hook_metrics = { last_updated: new Date().toISOString(), session_total_ms: 0, hooks: {} };
            if (!state.hook_metrics.hooks) state.hook_metrics.hooks = {};
            if (!state.hook_metrics.hooks.TaskCompleted) state.hook_metrics.hooks.TaskCompleted = {};
            state.hook_metrics.hooks.TaskCompleted.validation_gate = {
              duration_ms: timer.end ? Math.round((timer.end - timer.start)) : 0,
              status: approved ? 'success' : 'blocked',
              at: new Date().toISOString(),
              builder: builderAgent,
              validator: validatorAgent,
              task_id: taskId,
            };
            state.hook_metrics.last_updated = new Date().toISOString();
            fs.writeFileSync(sessionStatePath, JSON.stringify(state, null, 2) + '\n');
          }
        }
      } catch (e) {
        // Non-critical - gate still completes
      }
    }

    if (approved) {
      // Validator approved - allow completion
      if (timer && hookMetrics) {
        hookMetrics.recordHookMetrics(timer, 'success', `approved by ${validatorAgent}`, { rootDir });
      }
      process.exit(0);
    } else {
      // Validator has not approved - block completion
      if (timer && hookMetrics) {
        hookMetrics.recordHookMetrics(timer, 'blocked', `awaiting ${validatorAgent}`, { rootDir });
      }

      console.error(`[BLOCKED] Validator approval required from ${validatorAgent}`);
      console.error(`  Builder: ${builderAgent}`);
      console.error(`  Task: ${taskId || 'unknown'}`);
      console.error(`  Validator must review and approve before task can be marked complete.`);
      process.exit(2);
    }
  } catch (e) {
    // Fail open on unexpected errors
    if (timer && hookMetrics) {
      hookMetrics.recordHookMetrics(timer, 'error', e.message, { rootDir });
    }
    process.exit(0);
  }
}

main();
