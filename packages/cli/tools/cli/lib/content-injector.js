/**
 * Content Injector - Dynamic content injection for AgileFlow files
 *
 * Supports template variables that get replaced at install time:
 *
 * COUNTS:
 *   {{COMMAND_COUNT}}  - Total number of commands
 *   {{AGENT_COUNT}}    - Total number of agents
 *   {{SKILL_COUNT}}    - Total number of skills
 *
 * LISTS:
 *   <!-- {{AGENT_LIST}} -->   - Full formatted agent list
 *   <!-- {{COMMAND_LIST}} --> - Full formatted command list
 *
 * TEMPLATES:
 *   <!-- {{SESSION_HARNESS}} -->       - Session harness protocol (generic)
 *   <!-- {{SESSION_HARNESS:AG-API}} --> - Session harness protocol (with agent ID)
 *   <!-- {{QUALITY_GATE_PRIORITIES}} --> - Quality gate priorities (CRITICAL/HIGH/MEDIUM)
 *
 * METADATA:
 *   {{VERSION}}        - AgileFlow version from package.json
 *   {{INSTALL_DATE}}   - Date of installation (YYYY-MM-DD)
 *
 * FOLDER REFERENCES:
 *   {agileflow_folder} - Name of the agileflow folder (e.g., .agileflow)
 *   {docs_folder}      - Name of the docs folder (e.g., docs, agileflow-docs)
 *   {project-root}     - Project root reference
 *
 * PATH INJECTION:
 *   When docsFolder is not 'docs', all path references like `docs/` are replaced
 *   with the actual folder name (e.g., `agileflow-docs/`).
 */

const fs = require('fs');
const path = require('path');

// Use shared modules
const { parseFrontmatter, normalizeTools } = require('../../../scripts/lib/frontmatter-parser');
const { validatePath } = require('../../../lib/validate');
const {
  countCommands,
  countAgents,
  countSkills,
  getCounts,
} = require('../../../scripts/lib/counter');
const {
  sanitize,
  sanitizeAgentData,
  sanitizeCommandData,
  validatePlaceholderValue,
  detectInjectionAttempt,
} = require('../../../lib/content-sanitizer');

// =============================================================================
// List Generation Functions
// =============================================================================

/**
 * Validate that a file path is within the expected directory.
 * Prevents reading files outside the expected scope.
 * Security: Symlinks are NOT allowed to prevent escape attacks.
 * @param {string} filePath - File path to validate
 * @param {string} baseDir - Expected base directory
 * @returns {boolean} True if path is safe
 */
function isPathSafe(filePath, baseDir) {
  // Security hardening (US-0104): Symlinks disabled to prevent escape attacks
  const result = validatePath(filePath, baseDir, { allowSymlinks: false });
  return result.ok;
}

/**
 * Derive agent category from name for compact grouping.
 * @param {string} name - Agent name
 * @returns {string} Category name
 */
function categorizeAgent(name) {
  // Audit analyzer families
  const analyzerMatch = name.match(/^(logic|security|perf|test|completeness|legal)-analyzer-/);
  if (analyzerMatch) {
    const familyNames = {
      logic: 'Logic',
      security: 'Security',
      perf: 'Performance',
      test: 'Tests',
      completeness: 'Completeness',
      legal: 'Legal',
    };
    return `Audit - ${familyNames[analyzerMatch[1]] || analyzerMatch[1]}`;
  }
  // Consensus coordinators for audit families
  const consensusMatch = name.match(/^(logic|security|perf|test|completeness|legal)-consensus$/);
  if (consensusMatch) {
    const familyNames = {
      logic: 'Logic',
      security: 'Security',
      perf: 'Performance',
      test: 'Tests',
      completeness: 'Completeness',
      legal: 'Legal',
    };
    return `Audit - ${familyNames[consensusMatch[1]] || consensusMatch[1]}`;
  }
  if (name.startsWith('council-')) return 'Council';
  if (name.endsWith('-validator')) return 'Validation';
  return 'Domain';
}

/**
 * Scan agents directory and generate compact category-grouped agent list
 * @param {string} agentsDir - Path to agents directory
 * @returns {string} Formatted agent list grouped by category
 */
function generateAgentList(agentsDir) {
  if (!fs.existsSync(agentsDir)) return '';

  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
  const agents = [];

  for (const file of files) {
    const filePath = path.join(agentsDir, file);

    // Validate path before reading to prevent traversal via symlinks or malicious names
    if (!isPathSafe(filePath, agentsDir)) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const frontmatter = parseFrontmatter(content);

    if (!frontmatter || Object.keys(frontmatter).length === 0) {
      continue;
    }

    // Sanitize agent data to prevent injection attacks
    const rawAgent = {
      name: frontmatter.name || path.basename(file, '.md'),
      description: frontmatter.description || '',
      tools: normalizeTools(frontmatter.tools),
      model: frontmatter.model || 'haiku',
    };

    const sanitizedAgent = sanitizeAgentData(rawAgent);

    // Skip if sanitization produced invalid data
    if (!sanitizedAgent.name || sanitizedAgent.name === 'unknown') {
      continue;
    }

    agents.push(sanitizedAgent);
  }

  agents.sort((a, b) => a.name.localeCompare(b.name));

  // Sanitize the count value
  const safeCount = sanitize.count(agents.length);

  // Group by category for compact output
  const categories = {};
  for (const agent of agents) {
    const cat = categorizeAgent(agent.name);
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(agent.name);
  }

  let output = `**AVAILABLE AGENTS (${safeCount} total)**:\n\n`;

  for (const [category, names] of Object.entries(categories)) {
    output += `**${category}**: ${names.join(', ')}\n`;
  }

  return output;
}

/**
 * Scan commands directory and generate formatted command list
 * @param {string} commandsDir - Path to commands directory
 * @returns {string} Formatted command list
 */
function generateCommandList(commandsDir) {
  if (!fs.existsSync(commandsDir)) return '';

  const commands = [];

  // Scan main commands
  const mainFiles = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
  for (const file of mainFiles) {
    const filePath = path.join(commandsDir, file);

    // Validate path before reading
    if (!isPathSafe(filePath, commandsDir)) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const frontmatter = parseFrontmatter(content);
    const cmdName = path.basename(file, '.md');

    if (!frontmatter || Object.keys(frontmatter).length === 0) {
      continue;
    }

    // Sanitize command data to prevent injection attacks
    const rawCommand = {
      name: cmdName,
      description: frontmatter.description || '',
      argumentHint: frontmatter['argument-hint'] || '',
    };

    const sanitizedCommand = sanitizeCommandData(rawCommand);
    if (!sanitizedCommand.name || sanitizedCommand.name === 'unknown') {
      continue;
    }

    commands.push(sanitizedCommand);
  }

  // Scan subdirectories (e.g., session/)
  const entries = fs.readdirSync(commandsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(commandsDir, entry.name);

      // Validate subdirectory path
      if (!isPathSafe(subDir, commandsDir)) {
        continue;
      }

      const subFiles = fs.readdirSync(subDir).filter(f => f.endsWith('.md'));

      for (const file of subFiles) {
        const filePath = path.join(subDir, file);

        // Validate file path within subdirectory
        if (!isPathSafe(filePath, commandsDir)) {
          continue;
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const frontmatter = parseFrontmatter(content);
        const cmdName = `${entry.name}:${path.basename(file, '.md')}`;

        if (!frontmatter || Object.keys(frontmatter).length === 0) {
          continue;
        }

        // Sanitize command data
        const rawCommand = {
          name: cmdName,
          description: frontmatter.description || '',
          argumentHint: frontmatter['argument-hint'] || '',
        };

        const sanitizedCommand = sanitizeCommandData(rawCommand);
        if (!sanitizedCommand.name || sanitizedCommand.name === 'unknown') {
          continue;
        }

        commands.push(sanitizedCommand);
      }
    }
  }

  commands.sort((a, b) => a.name.localeCompare(b.name));

  // Sanitize the count value
  const safeCount = sanitize.count(commands.length);
  let output = `Available commands (${safeCount} total):\n`;

  commands.forEach(cmd => {
    // All values are already sanitized by sanitizeCommandData
    const argHint = cmd.argumentHint ? ` ${cmd.argumentHint}` : '';
    output += `- \`/agileflow:${cmd.name}${argHint}\` - ${cmd.description}\n`;
  });

  return output;
}

/**
 * Generate a compact category summary for agents (no individual names).
 * Used by minimal mode and generators that want a discovery-oriented summary.
 * @param {string} agentsDir - Path to agents directory
 * @returns {string} Compact category summary with counts
 */
function generateAgentSummary(agentsDir) {
  if (!fs.existsSync(agentsDir)) return '';

  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
  const agents = [];

  for (const file of files) {
    const filePath = path.join(agentsDir, file);
    if (!isPathSafe(filePath, agentsDir)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    const frontmatter = parseFrontmatter(content);
    if (!frontmatter || Object.keys(frontmatter).length === 0) continue;

    const name = frontmatter.name || path.basename(file, '.md');
    agents.push(name);
  }

  // Group by category, count per category
  const categories = {};
  for (const name of agents) {
    const cat = categorizeAgent(name);
    if (!categories[cat]) categories[cat] = 0;
    categories[cat]++;
  }

  const safeCount = sanitize.count(agents.length);
  let output = `**${safeCount} agents** across ${Object.keys(categories).length} categories:\n`;
  for (const [category, count] of Object.entries(categories)) {
    output += `- **${category}**: ${count} agents\n`;
  }
  output += `\nRun \`/agileflow:help agents\` or browse \`.agileflow/agents/\` for the full list.`;
  return output;
}

/**
 * Generate a compact category summary for commands (no individual names).
 * Used by minimal mode and generators that want a discovery-oriented summary.
 * @param {string} commandsDir - Path to commands directory
 * @returns {string} Compact category summary with counts
 */
function generateCommandSummary(commandsDir) {
  if (!fs.existsSync(commandsDir)) return '';

  const commands = [];

  // Count main command files
  const mainFiles = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
  for (const file of mainFiles) {
    const filePath = path.join(commandsDir, file);
    if (!isPathSafe(filePath, commandsDir)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    const frontmatter = parseFrontmatter(content);
    if (!frontmatter || Object.keys(frontmatter).length === 0) continue;
    commands.push(path.basename(file, '.md'));
  }

  // Count subdirectory command files
  const entries = fs.readdirSync(commandsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(commandsDir, entry.name);
      if (!isPathSafe(subDir, commandsDir)) continue;

      const subFiles = fs.readdirSync(subDir).filter(f => f.endsWith('.md'));
      for (const file of subFiles) {
        const filePath = path.join(subDir, file);
        if (!isPathSafe(filePath, commandsDir)) continue;

        const content = fs.readFileSync(filePath, 'utf8');
        const frontmatter = parseFrontmatter(content);
        if (!frontmatter || Object.keys(frontmatter).length === 0) continue;
        commands.push(`${entry.name}:${path.basename(file, '.md')}`);
      }
    }
  }

  const safeCount = sanitize.count(commands.length);
  return `**${safeCount} commands** available. Run \`/agileflow:help\` for the full list with descriptions.`;
}

// =============================================================================
// Template Generation Functions
// =============================================================================

/**
 * Session harness template cache
 * @type {string|null}
 */
let sessionHarnessTemplateCache = null;

/**
 * Quality gate priorities template cache
 * @type {string|null}
 */
let qualityGatePrioritiesCache = null;

/**
 * Load session harness template from templates directory
 * @param {string} coreDir - Path to core directory
 * @returns {string} Template content or empty string if not found
 */
function loadSessionHarnessTemplate(coreDir) {
  // Return cached template if available
  if (sessionHarnessTemplateCache !== null) {
    return sessionHarnessTemplateCache;
  }

  const templatePath = path.join(coreDir, 'templates', 'session-harness-protocol.md');

  if (!fs.existsSync(templatePath)) {
    // Template not found, return empty string
    sessionHarnessTemplateCache = '';
    return sessionHarnessTemplateCache;
  }

  // Validate path is within core directory (security)
  if (!isPathSafe(templatePath, coreDir)) {
    sessionHarnessTemplateCache = '';
    return sessionHarnessTemplateCache;
  }

  try {
    sessionHarnessTemplateCache = fs.readFileSync(templatePath, 'utf8');
    return sessionHarnessTemplateCache;
  } catch (err) {
    sessionHarnessTemplateCache = '';
    return sessionHarnessTemplateCache;
  }
}

/**
 * Generate session harness protocol content for a specific agent
 * @param {string} coreDir - Path to core directory
 * @param {string} agentId - Agent ID (e.g., "AG-API", "AG-UI")
 * @returns {string} Session harness content with agent ID substituted
 */
function generateSessionHarnessContent(coreDir, agentId = 'AGENT') {
  const template = loadSessionHarnessTemplate(coreDir);

  if (!template) {
    return '';
  }

  // Substitute agent ID in the template
  // The template uses {AGENT_ID} as placeholder
  return template.replace(/\{AGENT_ID\}/g, agentId);
}

/**
 * Clear the session harness template cache
 * Useful for testing or when template file changes
 */
function clearSessionHarnessCache() {
  sessionHarnessTemplateCache = null;
}

/**
 * Load quality gate priorities template from templates directory
 * @param {string} coreDir - Path to core directory
 * @returns {string} Template content or empty string if not found
 */
function loadQualityGatePrioritiesTemplate(coreDir) {
  // Return cached template if available
  if (qualityGatePrioritiesCache !== null) {
    return qualityGatePrioritiesCache;
  }

  const templatePath = path.join(coreDir, 'templates', 'quality-gate-priorities.md');

  if (!fs.existsSync(templatePath)) {
    qualityGatePrioritiesCache = '';
    return qualityGatePrioritiesCache;
  }

  // Validate path is within core directory (security)
  if (!isPathSafe(templatePath, coreDir)) {
    qualityGatePrioritiesCache = '';
    return qualityGatePrioritiesCache;
  }

  try {
    qualityGatePrioritiesCache = fs.readFileSync(templatePath, 'utf8');
    return qualityGatePrioritiesCache;
  } catch (err) {
    qualityGatePrioritiesCache = '';
    return qualityGatePrioritiesCache;
  }
}

/**
 * Generate quality gate priorities content for a specific agent
 * @param {string} coreDir - Path to core directory
 * @param {string} agentId - Agent ID (e.g., "AG-API", "AG-UI")
 * @returns {string} Quality gate priorities content with agent ID substituted
 */
function generateQualityGatePrioritiesContent(coreDir, agentId = 'AGENT') {
  const template = loadQualityGatePrioritiesTemplate(coreDir);

  if (!template) {
    return '';
  }

  // Substitute placeholders in the template
  return template
    .replace(/\{AGENT_ID\}/g, agentId)
    .replace(/\{TIMESTAMP\}/g, new Date().toISOString())
    .replace(/\{STORY_ID\}/g, 'US-XXXX');
}

/**
 * Clear the quality gate priorities template cache
 * Useful for testing or when template file changes
 */
function clearQualityGatePrioritiesCache() {
  qualityGatePrioritiesCache = null;
}

// =============================================================================
// Preserve Rules Expansion Functions
// =============================================================================

/**
 * Preserve rules template cache
 * @type {Object|null}
 */
let preserveRulesCache = null;

/**
 * Load preserve rules definitions from templates directory
 * @param {string} coreDir - Path to core directory
 * @returns {Object} Rules object with category keys and rule arrays
 */
function loadPreserveRules(coreDir) {
  // Return cached rules if available
  if (preserveRulesCache !== null) {
    return preserveRulesCache;
  }

  const rulesPath = path.join(coreDir, 'templates', 'preserve-rules.json');

  if (!fs.existsSync(rulesPath)) {
    preserveRulesCache = {};
    return preserveRulesCache;
  }

  // Validate path is within core directory (security)
  if (!isPathSafe(rulesPath, coreDir)) {
    preserveRulesCache = {};
    return preserveRulesCache;
  }

  try {
    const content = fs.readFileSync(rulesPath, 'utf8');
    preserveRulesCache = JSON.parse(content);
    return preserveRulesCache;
  } catch (err) {
    preserveRulesCache = {};
    return preserveRulesCache;
  }
}

/**
 * Expand preserve rules placeholders in content
 * Replaces "{{RULES:category}}" with actual rule strings from the template
 *
 * @param {string} content - Content with preserve rules placeholders
 * @param {string} coreDir - Path to core directory
 * @returns {string} Content with rules expanded
 */
function expandPreserveRules(content, coreDir) {
  const rules = loadPreserveRules(coreDir);

  if (!rules || Object.keys(rules).length === 0) {
    return content;
  }

  // Pattern matches: - "{{RULES:category}}" in YAML preserve_rules arrays
  // We need to handle the YAML list context carefully
  const pattern = /- "\{\{RULES:(\w+)\}\}"/g;

  return content.replace(pattern, (match, category) => {
    const ruleList = rules[category];

    if (!ruleList || !Array.isArray(ruleList) || ruleList.length === 0) {
      // Unknown category or empty, keep original placeholder as warning
      return match;
    }

    // Sanitize rules before injecting
    const sanitizedRules = ruleList.map(rule => {
      // Escape double quotes in rule text
      const escaped = String(rule).replace(/"/g, '\\"');
      // Validate it's a reasonable rule string
      if (escaped.length > 500) {
        return escaped.substring(0, 500);
      }
      return escaped;
    });

    // Return expanded rules as YAML list items with proper indentation
    // Each rule becomes: - "rule text"
    return sanitizedRules.map(rule => `- "${rule}"`).join('\n    ');
  });
}

/**
 * Clear the preserve rules template cache
 * Useful for testing or when template file changes
 */
function clearPreserveRulesCache() {
  preserveRulesCache = null;
}

// =============================================================================
// Main Injection Function
// =============================================================================

/**
 * Inject all template variables into content
 * @param {string} content - Template content with placeholders
 * @param {Object} context - Context for replacements
 * @param {string} context.coreDir - Path to core directory (commands/, agents/, skills/)
 * @param {string} context.agileflowFolder - AgileFlow folder name
 * @param {string} context.docsFolder - Docs folder name (default: 'docs')
 * @param {string} context.version - AgileFlow version
 * @param {boolean} context.minimal - When true, skip AGENT_LIST and COMMAND_LIST injection
 *   (replaces with discovery pointers). Keeps session harness, quality gates, preserve_rules.
 * @returns {string} Content with all placeholders replaced
 */
function injectContent(content, context = {}) {
  const {
    coreDir,
    agileflowFolder = '.agileflow',
    docsFolder = 'docs',
    version = 'unknown',
    minimal = false,
  } = context;

  let result = content;

  // Multi-line list placeholders can corrupt YAML if injected into frontmatter.
  // Keep frontmatter untouched for these placeholders and inject only in body.
  const replaceInBodyOnly = (input, replacer) => {
    const frontmatterMatch = input.match(/^(---\n[\s\S]*?\n---\n?)([\s\S]*)$/);
    if (!frontmatterMatch) {
      return replacer(input);
    }

    const frontmatter = frontmatterMatch[1];
    const body = frontmatterMatch[2];
    return `${frontmatter}${replacer(body)}`;
  };

  // Expand preserve rules placeholders first (YAML frontmatter processing)
  if (coreDir && fs.existsSync(coreDir) && result.includes('{{RULES:')) {
    result = expandPreserveRules(result, coreDir);
  }

  // Get counts if core directory is available
  let counts = { commands: 0, agents: 0, skills: 0 };
  if (coreDir && fs.existsSync(coreDir)) {
    counts = getCounts(coreDir);
  }

  // Validate and sanitize all placeholder values before injection
  const safeCommandCount = validatePlaceholderValue('COMMAND_COUNT', counts.commands).sanitized;
  const safeAgentCount = validatePlaceholderValue('AGENT_COUNT', counts.agents).sanitized;
  const safeSkillCount = validatePlaceholderValue('SKILL_COUNT', counts.skills).sanitized;
  const safeVersion = validatePlaceholderValue('VERSION', version).sanitized;
  const safeDate = validatePlaceholderValue('INSTALL_DATE', new Date()).sanitized;
  const safeAgileflowFolder = validatePlaceholderValue(
    'agileflow_folder',
    agileflowFolder
  ).sanitized;
  const safeDocsFolder = validatePlaceholderValue('docs_folder', docsFolder).sanitized;

  // Replace count placeholders (both formats: {{X}} and <!-- {{X}} -->)
  result = result.replace(/\{\{COMMAND_COUNT\}\}/g, String(safeCommandCount));
  result = result.replace(/\{\{AGENT_COUNT\}\}/g, String(safeAgentCount));
  result = result.replace(/\{\{SKILL_COUNT\}\}/g, String(safeSkillCount));

  // Replace metadata placeholders
  result = result.replace(/\{\{VERSION\}\}/g, safeVersion);
  result = result.replace(/\{\{INSTALL_DATE\}\}/g, safeDate);

  // Replace list placeholders (only if core directory available)
  // List generation already includes sanitization via sanitizeAgentData/sanitizeCommandData
  if (coreDir && fs.existsSync(coreDir)) {
    if (result.includes('{{AGENT_LIST}}')) {
      let agentList;
      if (minimal) {
        // Minimal mode: replace with compact discovery pointer
        agentList = `**Agents**: ${safeAgentCount} available. Run \`/agileflow:help agents\` or \`ls .agileflow/agents/\` to browse.`;
      } else {
        agentList = generateAgentList(path.join(coreDir, 'agents'));
      }
      result = replaceInBodyOnly(result, body => {
        let updated = body.replace(/<!-- \{\{AGENT_LIST\}\} -->/g, agentList);
        updated = updated.replace(/\{\{AGENT_LIST\}\}/g, agentList);
        return updated;
      });
    }

    if (result.includes('{{COMMAND_LIST}}')) {
      let commandList;
      if (minimal) {
        // Minimal mode: replace with compact discovery pointer
        commandList = `**Commands**: ${safeCommandCount} available. Run \`/agileflow:help\` or \`ls .agileflow/commands/\` to browse.`;
      } else {
        commandList = generateCommandList(path.join(coreDir, 'commands'));
      }
      result = replaceInBodyOnly(result, body => {
        let updated = body.replace(/<!-- \{\{COMMAND_LIST\}\} -->/g, commandList);
        updated = updated.replace(/\{\{COMMAND_LIST\}\}/g, commandList);
        return updated;
      });
    }

    // Replace session harness template placeholder
    // Supports two formats:
    //   <!-- {{SESSION_HARNESS}} -->        - Uses default agent ID
    //   <!-- {{SESSION_HARNESS:AG-API}} --> - Uses specified agent ID
    if (result.includes('SESSION_HARNESS')) {
      // First, handle agent-specific format: <!-- {{SESSION_HARNESS:AG-XXX}} -->
      const agentSpecificPattern = /<!-- \{\{SESSION_HARNESS:(AG-[A-Z]+)\}\} -->/g;
      result = result.replace(agentSpecificPattern, (match, agentId) => {
        return generateSessionHarnessContent(coreDir, agentId);
      });

      // Then, handle generic format: <!-- {{SESSION_HARNESS}} -->
      // Try to extract agent ID from frontmatter name field if available
      const genericPattern = /<!-- \{\{SESSION_HARNESS\}\} -->/g;
      result = result.replace(genericPattern, () => {
        // Try to get agent ID from frontmatter 'name' field
        // Look for "name: agileflow-xxx" pattern in the content
        const frontmatterMatch = result.match(/^---[\s\S]*?name:\s*(agileflow-)?(\w+)[\s\S]*?---/m);
        let agentId = 'AGENT';
        if (frontmatterMatch && frontmatterMatch[2]) {
          // Convert agent name to uppercase agent ID format
          // e.g., "api" -> "AG-API", "ui" -> "AG-UI"
          agentId = `AG-${frontmatterMatch[2].toUpperCase()}`;
        }
        return generateSessionHarnessContent(coreDir, agentId);
      });

      // Also handle non-comment format: {{SESSION_HARNESS}}
      result = result.replace(/\{\{SESSION_HARNESS\}\}/g, () => {
        const frontmatterMatch = result.match(/^---[\s\S]*?name:\s*(agileflow-)?(\w+)[\s\S]*?---/m);
        let agentId = 'AGENT';
        if (frontmatterMatch && frontmatterMatch[2]) {
          agentId = `AG-${frontmatterMatch[2].toUpperCase()}`;
        }
        return generateSessionHarnessContent(coreDir, agentId);
      });
    }

    // Replace quality gate priorities template placeholder
    // Supports: <!-- {{QUALITY_GATE_PRIORITIES}} -->
    if (result.includes('QUALITY_GATE_PRIORITIES')) {
      // Handle comment format: <!-- {{QUALITY_GATE_PRIORITIES}} -->
      const qualityGatePattern = /<!-- \{\{QUALITY_GATE_PRIORITIES\}\} -->/g;
      result = result.replace(qualityGatePattern, () => {
        const frontmatterMatch = result.match(/^---[\s\S]*?name:\s*(agileflow-)?(\w+)[\s\S]*?---/m);
        let agentId = 'AGENT';
        if (frontmatterMatch && frontmatterMatch[2]) {
          agentId = `AG-${frontmatterMatch[2].toUpperCase()}`;
        }
        return generateQualityGatePrioritiesContent(coreDir, agentId);
      });

      // Also handle non-comment format: {{QUALITY_GATE_PRIORITIES}}
      result = result.replace(/\{\{QUALITY_GATE_PRIORITIES\}\}/g, () => {
        const frontmatterMatch = result.match(/^---[\s\S]*?name:\s*(agileflow-)?(\w+)[\s\S]*?---/m);
        let agentId = 'AGENT';
        if (frontmatterMatch && frontmatterMatch[2]) {
          agentId = `AG-${frontmatterMatch[2].toUpperCase()}`;
        }
        return generateQualityGatePrioritiesContent(coreDir, agentId);
      });
    }
  }

  // Replace folder placeholders with sanitized values
  result = result.replace(/\{agileflow_folder\}/g, safeAgileflowFolder);
  result = result.replace(/\{docs_folder\}/g, safeDocsFolder);
  result = result.replace(/\{project-root\}/g, '{project-root}'); // Keep as-is for runtime

  // Replace docs/ path references with actual folder if different from default
  // This ensures all path references point to the correct folder
  // Pattern matches: `docs/`, "docs/", 'docs/' but NOT word boundaries like "documents/"
  if (safeDocsFolder !== 'docs') {
    // Replace in code/path contexts: `docs/xxx`, "docs/xxx", 'docs/xxx'
    result = result.replace(/`docs\//g, `\`${safeDocsFolder}/`);
    result = result.replace(/"docs\//g, `"${safeDocsFolder}/`);
    result = result.replace(/'docs\//g, `'${safeDocsFolder}/`);
    // Replace standalone path references like: docs/00-meta, docs/09-agents
    // Must be followed by a path component (letter, number, or dash)
    result = result.replace(/\bdocs\/([0-9a-zA-Z_-])/g, `${safeDocsFolder}/$1`);
  }

  return result;
}

// =============================================================================
// Section Processing Functions (Progressive Disclosure)
// =============================================================================

/**
 * Extract section names from content
 * @param {string} content - Content with section markers
 * @returns {string[]} Array of section names
 */
function extractSectionNames(content) {
  const sectionPattern = /<!-- SECTION: (\w+[-\w]*) -->/g;
  const sections = [];
  let match;
  while ((match = sectionPattern.exec(content)) !== null) {
    sections.push(match[1]);
  }
  return sections;
}

/**
 * Filter content to only include specified sections
 * Sections are marked with: <!-- SECTION: name --> ... <!-- END_SECTION -->
 *
 * @param {string} content - Content with section markers
 * @param {string[]} activeSections - Sections to include (empty = include all)
 * @returns {string} Content with only active sections
 */
function filterSections(content, activeSections = []) {
  // If no active sections specified, include all content
  if (!activeSections || activeSections.length === 0) {
    return content;
  }

  // Pattern matches: <!-- SECTION: name --> content <!-- END_SECTION -->
  const sectionPattern = /<!-- SECTION: (\w+[-\w]*) -->([\s\S]*?)<!-- END_SECTION -->/g;

  return content.replace(sectionPattern, (match, sectionName, sectionContent) => {
    if (activeSections.includes(sectionName)) {
      // Keep the section content, remove the markers
      return sectionContent;
    }
    // Remove the entire section
    return '';
  });
}

/**
 * Remove all section markers but keep content
 * Used when no filtering is needed but markers should be cleaned
 *
 * @param {string} content - Content with section markers
 * @returns {string} Content without section markers
 */
function stripSectionMarkers(content) {
  // Remove section start markers
  let result = content.replace(/<!-- SECTION: \w+[-\w]* -->\n?/g, '');
  // Remove section end markers
  result = result.replace(/<!-- END_SECTION -->\n?/g, '');
  return result;
}

/**
 * Check if content has section markers
 * @param {string} content - Content to check
 * @returns {boolean} True if content has sections
 */
function hasSections(content) {
  return /<!-- SECTION: \w+[-\w]* -->/.test(content);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if content has any template variables
 * @param {string} content - Content to check
 * @returns {boolean} True if content has placeholders
 */
function hasPlaceholders(content) {
  const patterns = [
    /\{\{COMMAND_COUNT\}\}/,
    /\{\{AGENT_COUNT\}\}/,
    /\{\{SKILL_COUNT\}\}/,
    /\{\{VERSION\}\}/,
    /\{\{INSTALL_DATE\}\}/,
    /\{\{AGENT_LIST\}\}/,
    /\{\{COMMAND_LIST\}\}/,
    /\{\{SESSION_HARNESS\}\}/,
    /\{\{QUALITY_GATE_PRIORITIES\}\}/,
    /\{\{RULES:\w+\}\}/,
    /\{agileflow_folder\}/,
    /\{docs_folder\}/,
  ];

  return patterns.some(pattern => pattern.test(content));
}

/**
 * List all supported placeholders
 * @returns {Object} Placeholder documentation
 */
function getPlaceholderDocs() {
  return {
    counts: {
      '{{COMMAND_COUNT}}': 'Total number of slash commands',
      '{{AGENT_COUNT}}': 'Total number of specialized agents',
      '{{SKILL_COUNT}}': 'Total number of skills',
    },
    lists: {
      '<!-- {{AGENT_LIST}} -->': 'Full formatted agent list with details',
      '<!-- {{COMMAND_LIST}} -->': 'Full formatted command list',
    },
    templates: {
      '<!-- {{SESSION_HARNESS}} -->':
        'Session harness protocol (auto-detects agent ID from frontmatter)',
      '<!-- {{SESSION_HARNESS:AG-API}} -->': 'Session harness protocol with explicit agent ID',
      '<!-- {{QUALITY_GATE_PRIORITIES}} -->':
        'Quality gate priorities with CRITICAL/HIGH/MEDIUM levels',
    },
    preserve_rules: {
      '{{RULES:json_operations}}': 'Rules for safe JSON file modifications',
      '{{RULES:file_preview}}': 'Rules for showing previews before writing',
      '{{RULES:user_confirmation}}': 'Rules for using AskUserQuestion tool',
      '{{RULES:task_tracking}}': 'Rules for using TaskCreate/TaskUpdate tool',
      '{{RULES:bus_messaging}}': 'Rules for bus message logging',
      '{{RULES:plan_mode}}': 'Rules for using EnterPlanMode',
      '{{RULES:commit_approval}}': 'Rules about git commits',
      '{{RULES:delegation}}': 'Rules for expert delegation',
      '{{RULES:research_first}}': 'Rules for checking research before starting',
      '{{RULES:status_updates}}': 'Rules for updating status.json',
    },
    metadata: {
      '{{VERSION}}': 'AgileFlow version from package.json',
      '{{INSTALL_DATE}}': 'Installation date (YYYY-MM-DD)',
    },
    folders: {
      '{agileflow_folder}': 'Name of the AgileFlow folder',
      '{docs_folder}': 'Name of the docs folder (docs/ paths auto-replaced when different)',
      '{project-root}': 'Project root reference (kept as-is)',
    },
  };
}

module.exports = {
  // Count functions
  countCommands,
  countAgents,
  countSkills,
  getCounts,

  // List generation
  generateAgentList,
  generateCommandList,

  // Summary generation (compact, for minimal mode)
  generateAgentSummary,
  generateCommandSummary,

  // Template generation
  generateSessionHarnessContent,
  clearSessionHarnessCache,
  generateQualityGatePrioritiesContent,
  clearQualityGatePrioritiesCache,

  // Preserve rules expansion
  expandPreserveRules,
  clearPreserveRulesCache,

  // Main injection
  injectContent,
  hasPlaceholders,
  getPlaceholderDocs,

  // Section processing (progressive disclosure)
  extractSectionNames,
  filterSections,
  stripSectionMarkers,
  hasSections,
};
