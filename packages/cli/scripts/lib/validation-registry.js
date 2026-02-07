/**
 * validation-registry.js - Maps builders to their validators
 *
 * Provides lookup for which validator agent should approve a builder's work.
 * Used by task-completed-gate.js to enforce validator approval.
 *
 * Registry is built from:
 * 1. Agent frontmatter (has_validator + validator_agent fields in AGILEFLOW_META)
 * 2. Team template configuration (paired_validator fields)
 * 3. Manual overrides in agileflow-metadata.json
 */

const fs = require('fs');
const path = require('path');

/**
 * Static builder-validator pairs (built-in defaults)
 * These match the agents that have has_validator: true
 */
const BUILT_IN_PAIRS = {
  'agileflow-api': 'agileflow-api-validator',
  'agileflow-ui': 'agileflow-ui-validator',
  'agileflow-database': 'agileflow-schema-validator',
};

/**
 * Get the validator for a given builder agent.
 *
 * @param {string} builderAgent - Builder agent name
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root
 * @param {object} [options.teamTemplate] - Active team template
 * @returns {string|null} Validator agent name, or null if no validator required
 */
function getValidator(builderAgent, options = {}) {
  // 1. Check team template for paired validators
  if (options.teamTemplate) {
    const teammate = options.teamTemplate.teammates?.find(t => t.agent === builderAgent);
    if (teammate?.paired_validator) {
      return teammate.paired_validator;
    }
  }

  // 2. Check metadata overrides
  if (options.rootDir) {
    try {
      const metadataPath = path.join(options.rootDir, 'docs', '00-meta', 'agileflow-metadata.json');
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        const override = metadata.validation_pairs?.[builderAgent];
        if (override) return override;
      }
    } catch (e) {
      // Fall through
    }
  }

  // 3. Check built-in pairs
  return BUILT_IN_PAIRS[builderAgent] || null;
}

/**
 * Check if a builder requires validator approval.
 *
 * @param {string} builderAgent - Builder agent name
 * @param {object} [options] - Options
 * @returns {boolean}
 */
function requiresValidation(builderAgent, options = {}) {
  // Check if team template requires validator approval
  if (options.teamTemplate?.quality_gates?.task_completed?.require_validator_approval) {
    return getValidator(builderAgent, options) !== null;
  }

  // Check metadata
  if (options.rootDir) {
    try {
      const metadataPath = path.join(options.rootDir, 'docs', '00-meta', 'agileflow-metadata.json');
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        if (metadata.quality_gates?.task_completed?.require_validator_approval) {
          return getValidator(builderAgent, options) !== null;
        }
      }
    } catch (e) {
      // Fall through
    }
  }

  return false;
}

/**
 * Check if a validator has approved a task.
 * Looks for approval signal in the native task list or bus log.
 *
 * @param {string} taskId - Task ID
 * @param {string} validatorAgent - Validator agent name
 * @param {object} [options] - Options
 * @returns {boolean} True if approved
 */
function isValidatorApproved(taskId, validatorAgent, options = {}) {
  if (!options.rootDir) return false;

  try {
    // Check bus log for approval messages
    const busLogPath = path.join(options.rootDir, 'docs', '09-agents', 'bus', 'log.jsonl');
    if (fs.existsSync(busLogPath)) {
      const lines = fs.readFileSync(busLogPath, 'utf8').trim().split('\n');

      // Search from end (most recent first)
      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 100); i--) {
        try {
          const msg = JSON.parse(lines[i]);
          if (
            msg.from === validatorAgent &&
            msg.type === 'validation' &&
            msg.task_id === taskId &&
            msg.status === 'approved'
          ) {
            return true;
          }
        } catch (e) {
          // Skip malformed lines
        }
      }
    }
  } catch (e) {
    // Fall through
  }

  return false;
}

/**
 * Get all registered builder-validator pairs.
 *
 * @param {object} [options] - Options
 * @returns {object} Map of builder -> validator
 */
function getAllPairs(options = {}) {
  const pairs = { ...BUILT_IN_PAIRS };

  // Merge team template pairs
  if (options.teamTemplate?.teammates) {
    for (const t of options.teamTemplate.teammates) {
      if (t.paired_validator) {
        pairs[t.agent] = t.paired_validator;
      }
    }
  }

  // Merge metadata overrides
  if (options.rootDir) {
    try {
      const metadataPath = path.join(options.rootDir, 'docs', '00-meta', 'agileflow-metadata.json');
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        if (metadata.validation_pairs) {
          Object.assign(pairs, metadata.validation_pairs);
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  return pairs;
}

module.exports = {
  getValidator,
  requiresValidation,
  isValidatorApproved,
  getAllPairs,
  BUILT_IN_PAIRS,
};
