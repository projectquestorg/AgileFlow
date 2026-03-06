#!/usr/bin/env node
/**
 * tool-shed.js - MCP Meta-Tool Registry
 *
 * Central registry for MCP tools. When agents need tools, this module
 * queries the registry by task description and returns a filtered list
 * of relevant tools, avoiding token explosion from sending all tools.
 *
 * Inspired by Stripe's "Tool Shed" pattern where a meta-tool selects
 * relevant tools per task from a large registry.
 *
 * Usage (as module):
 *   const { getToolsForTask, getAvailableServers, getToolCount } = require('./tool-shed');
 *   const tools = getToolsForTask('create a pull request for auth changes', { projectRoot });
 *
 * Usage (standalone):
 *   node scripts/lib/tool-shed.js --task "search for bugs" --project-root /path/to/project
 *   node scripts/lib/tool-shed.js --list-servers --project-root /path/to/project
 *   node scripts/lib/tool-shed.js --stats
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Lazy-load js-yaml only when needed
let _yaml;
function getYaml() {
  if (!_yaml) {
    try {
      _yaml = require('js-yaml');
    } catch {
      // Fallback: provide a minimal YAML parser for simple structures
      _yaml = null;
    }
  }
  return _yaml;
}

// =============================================================================
// Registry Loading
// =============================================================================

/**
 * Load the built-in tool registry from YAML
 * @returns {Object} Parsed registry object keyed by server name
 */
function loadBuiltinRegistry() {
  const registryPath = path.join(__dirname, 'tool-registry.yaml');
  try {
    const content = fs.readFileSync(registryPath, 'utf8');
    const yaml = getYaml();
    if (yaml) {
      return yaml.load(content) || {};
    }
    // Minimal fallback if js-yaml not available
    return {};
  } catch {
    return {};
  }
}

/**
 * Detect which MCP servers are configured in the project
 * @param {string} projectRoot - Project root directory
 * @returns {string[]} List of configured server names
 */
function detectConfiguredServers(projectRoot) {
  const servers = [];

  // Check .mcp.json (Claude Code MCP config)
  const mcpJsonPath = path.join(projectRoot, '.mcp.json');
  if (fs.existsSync(mcpJsonPath)) {
    try {
      const mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'));
      if (mcpConfig.mcpServers) {
        servers.push(...Object.keys(mcpConfig.mcpServers));
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check .claude/mcp.json (alternative location)
  const claudeMcpPath = path.join(projectRoot, '.claude', 'mcp.json');
  if (fs.existsSync(claudeMcpPath)) {
    try {
      const mcpConfig = JSON.parse(fs.readFileSync(claudeMcpPath, 'utf8'));
      if (mcpConfig.mcpServers) {
        servers.push(...Object.keys(mcpConfig.mcpServers));
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check agileflow-metadata.json for enabled MCP features
  const metadataPath = path.join(projectRoot, 'docs', '00-meta', 'agileflow-metadata.json');
  if (fs.existsSync(metadataPath)) {
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      const mcp =
        metadata.agileflow && metadata.agileflow.features && metadata.agileflow.features.mcp;
      if (mcp) {
        for (const [server, enabled] of Object.entries(mcp)) {
          if (enabled && !servers.includes(server)) {
            servers.push(server);
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  return [...new Set(servers)];
}

// =============================================================================
// Tool Matching
// =============================================================================

/**
 * Tokenize a task description into searchable terms
 * @param {string} text - Text to tokenize
 * @returns {string[]} Lowercased tokens
 */
function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

/**
 * Score a tool's relevance to a task description
 * @param {Object} tool - Tool definition from registry
 * @param {string[]} taskTokens - Tokenized task description
 * @returns {number} Relevance score (0-100)
 */
function scoreToolRelevance(tool, taskTokens) {
  if (!tool.keywords || !Array.isArray(tool.keywords)) return 0;
  if (taskTokens.length === 0) return 0;

  let matchCount = 0;
  const toolKeywords = tool.keywords.map(k => k.toLowerCase());

  for (const token of taskTokens) {
    for (const keyword of toolKeywords) {
      // Exact match or substring match
      if (keyword === token || keyword.includes(token) || token.includes(keyword)) {
        matchCount++;
        break;
      }
    }
  }

  if (matchCount === 0) return 0;

  // Score based on how many task tokens matched tool keywords
  const coverage = matchCount / taskTokens.length;
  // Bonus for tools where many keywords matched
  const density = matchCount / toolKeywords.length;

  return Math.round(coverage * 60 + density * 40);
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get tools relevant to a task description.
 * Filters by configured MCP servers and scores by keyword relevance.
 *
 * @param {string} taskDescription - Natural language task description
 * @param {Object} [options] - Options
 * @param {string} [options.projectRoot] - Project root directory
 * @param {number} [options.minScore] - Minimum relevance score (default: 15)
 * @param {number} [options.maxResults] - Maximum tools to return (default: 10)
 * @param {boolean} [options.includeUnconfigured] - Include tools from unconfigured servers (default: false)
 * @returns {Object} Results with matched tools and metadata
 */
function getToolsForTask(taskDescription, options = {}) {
  const {
    projectRoot = process.cwd(),
    minScore = 15,
    maxResults = 10,
    includeUnconfigured = false,
  } = options;

  const registry = loadBuiltinRegistry();
  const configuredServers = detectConfiguredServers(projectRoot);
  const taskTokens = tokenize(taskDescription);

  const scoredTools = [];

  for (const [serverName, tools] of Object.entries(registry)) {
    if (!Array.isArray(tools)) continue;

    const isConfigured = configuredServers.some(
      s =>
        s.toLowerCase().includes(serverName.toLowerCase()) ||
        serverName.toLowerCase().includes(s.toLowerCase())
    );

    if (!isConfigured && !includeUnconfigured) continue;

    for (const tool of tools) {
      const score = scoreToolRelevance(tool, taskTokens);
      if (score >= minScore) {
        scoredTools.push({
          ...tool,
          server: serverName,
          score,
          configured: isConfigured,
        });
      }
    }
  }

  // Sort by score descending, then by configured status
  scoredTools.sort((a, b) => {
    if (a.configured !== b.configured) return a.configured ? -1 : 1;
    return b.score - a.score;
  });

  const results = scoredTools.slice(0, maxResults);

  return {
    task: taskDescription,
    configured_servers: configuredServers,
    total_matched: scoredTools.length,
    tools: results,
    suggestions:
      !includeUnconfigured && scoredTools.length === 0
        ? getUnconfiguredSuggestions(taskDescription, registry, configuredServers)
        : [],
  };
}

/**
 * Get suggestions for unconfigured servers that could help with a task
 * @param {string} taskDescription - Task description
 * @param {Object} registry - Full registry
 * @param {string[]} configuredServers - Already configured servers
 * @returns {Object[]} Suggested servers to configure
 */
function getUnconfiguredSuggestions(taskDescription, registry, configuredServers) {
  const taskTokens = tokenize(taskDescription);
  const suggestions = [];

  for (const [serverName, tools] of Object.entries(registry)) {
    if (!Array.isArray(tools)) continue;

    const isConfigured = configuredServers.some(s =>
      s.toLowerCase().includes(serverName.toLowerCase())
    );
    if (isConfigured) continue;

    let bestScore = 0;
    let bestTool = null;
    for (const tool of tools) {
      const score = scoreToolRelevance(tool, taskTokens);
      if (score > bestScore) {
        bestScore = score;
        bestTool = tool;
      }
    }

    if (bestScore >= 20 && bestTool) {
      suggestions.push({
        server: serverName,
        best_match: bestTool.name,
        score: bestScore,
        description: `Configure ${serverName} MCP server to use ${bestTool.name} (${bestTool.description})`,
      });
    }
  }

  return suggestions.sort((a, b) => b.score - a.score).slice(0, 3);
}

/**
 * Get list of available MCP servers (both configured and in registry)
 * @param {string} [projectRoot] - Project root directory
 * @returns {Object} Server listing
 */
function getAvailableServers(projectRoot = process.cwd()) {
  const registry = loadBuiltinRegistry();
  const configuredServers = detectConfiguredServers(projectRoot);

  const servers = {};
  for (const [name, tools] of Object.entries(registry)) {
    if (!Array.isArray(tools)) continue;
    servers[name] = {
      tool_count: tools.length,
      configured: configuredServers.some(
        s =>
          s.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(s.toLowerCase())
      ),
      tools: tools.map(t => t.name),
    };
  }

  return {
    configured: configuredServers,
    registry: servers,
    total_servers: Object.keys(servers).length,
    total_tools: Object.values(servers).reduce((sum, s) => sum + s.tool_count, 0),
  };
}

/**
 * Get tool count statistics
 * @returns {Object} Statistics
 */
function getToolCount() {
  const registry = loadBuiltinRegistry();
  let total = 0;
  const byServer = {};

  for (const [name, tools] of Object.entries(registry)) {
    if (!Array.isArray(tools)) continue;
    byServer[name] = tools.length;
    total += tools.length;
  }

  return { total, byServer };
}

/**
 * Format tool results for display
 * @param {Object} result - Result from getToolsForTask
 * @returns {string} Formatted display text
 */
function formatToolResults(result) {
  const lines = [];

  lines.push(`## Tool Shed Results for: "${result.task}"`);
  lines.push('');

  if (result.configured_servers.length > 0) {
    lines.push(`**Configured MCP servers**: ${result.configured_servers.join(', ')}`);
  } else {
    lines.push('**No MCP servers configured.** Tools are recommended based on registry only.');
  }
  lines.push('');

  if (result.tools.length === 0) {
    lines.push('No matching tools found.');
    lines.push('');
  } else {
    lines.push(
      `### Matched Tools (${result.total_matched} total, showing top ${result.tools.length})`
    );
    lines.push('');

    for (const tool of result.tools) {
      const status = tool.configured ? '✅' : '⚠️';
      lines.push(`- ${status} **${tool.server}/${tool.name}** (score: ${tool.score})`);
      lines.push(`  ${tool.description}`);
      if (!tool.configured) {
        lines.push(`  _Server not configured - add ${tool.server} to .mcp.json_`);
      }
    }
    lines.push('');
  }

  if (result.suggestions.length > 0) {
    lines.push('### Suggested Servers to Configure');
    lines.push('');
    for (const suggestion of result.suggestions) {
      lines.push(`- **${suggestion.server}** - ${suggestion.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// =============================================================================
// CLI
// =============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const projectRoot = getArg(args, '--project-root') || process.cwd();

  if (args.includes('--list-servers')) {
    const servers = getAvailableServers(projectRoot);
    console.log(JSON.stringify(servers, null, 2));
  } else if (args.includes('--stats')) {
    const stats = getToolCount();
    console.log(JSON.stringify(stats, null, 2));
  } else {
    const task = getArg(args, '--task');
    if (!task) {
      console.error('Usage: node tool-shed.js --task "description" [--project-root /path]');
      console.error('       node tool-shed.js --list-servers [--project-root /path]');
      console.error('       node tool-shed.js --stats');
      process.exit(1);
    }

    const result = getToolsForTask(task, {
      projectRoot,
      includeUnconfigured: args.includes('--include-unconfigured'),
    });

    if (args.includes('--json')) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatToolResults(result));
    }
  }
}

function getArg(args, flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  loadBuiltinRegistry,
  detectConfiguredServers,
  tokenize,
  scoreToolRelevance,
  getToolsForTask,
  getAvailableServers,
  getToolCount,
  formatToolResults,
};
