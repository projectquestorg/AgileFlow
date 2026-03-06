/**
 * Tests for tool-shed.js - MCP Meta-Tool Registry
 *
 * Tests the tool matching, server detection, and registry loading
 * for the Tool Shed system inspired by Stripe's tool selection pattern.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  loadBuiltinRegistry,
  detectConfiguredServers,
  tokenize,
  scoreToolRelevance,
  getToolsForTask,
  getAvailableServers,
  getToolCount,
  formatToolResults,
} = require('../../../scripts/lib/tool-shed');

// ============================================================================
// loadBuiltinRegistry
// ============================================================================

describe('loadBuiltinRegistry', () => {
  it('loads the YAML registry successfully', () => {
    const registry = loadBuiltinRegistry();
    expect(typeof registry).toBe('object');
    // Should have at least some server categories
    expect(Object.keys(registry).length).toBeGreaterThan(0);
  });

  it('contains github tools', () => {
    const registry = loadBuiltinRegistry();
    expect(registry.github).toBeDefined();
    expect(Array.isArray(registry.github)).toBe(true);
    expect(registry.github.length).toBeGreaterThan(0);
  });

  it('each tool has required fields', () => {
    const registry = loadBuiltinRegistry();
    for (const [serverName, tools] of Object.entries(registry)) {
      if (!Array.isArray(tools)) continue;
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.keywords).toBeDefined();
        expect(Array.isArray(tool.keywords)).toBe(true);
      }
    }
  });
});

// ============================================================================
// tokenize
// ============================================================================

describe('tokenize', () => {
  it('splits text into lowercase tokens', () => {
    expect(tokenize('Create a Pull Request')).toEqual(['create', 'pull', 'request']);
  });

  it('removes punctuation', () => {
    expect(tokenize("what's the bug?")).toEqual(['what', 'the', 'bug']);
  });

  it('filters out single-character tokens', () => {
    expect(tokenize('I want a PR')).toEqual(['want', 'pr']);
  });

  it('handles empty input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize(null)).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
  });

  it('handles hyphens in words', () => {
    expect(tokenize('pull-request code-review')).toEqual(['pull-request', 'code-review']);
  });
});

// ============================================================================
// scoreToolRelevance
// ============================================================================

describe('scoreToolRelevance', () => {
  it('returns 0 for no keyword matches', () => {
    const tool = { keywords: ['database', 'sql'] };
    const tokens = tokenize('create a react component');
    expect(scoreToolRelevance(tool, tokens)).toBe(0);
  });

  it('returns positive score for keyword matches', () => {
    const tool = { keywords: ['pr', 'pull request', 'merge', 'review'] };
    const tokens = tokenize('create a pull request');
    expect(scoreToolRelevance(tool, tokens)).toBeGreaterThan(0);
  });

  it('returns higher score for more matches', () => {
    const tool = { keywords: ['issue', 'bug', 'ticket', 'report'] };
    const fewMatches = tokenize('report a bug');
    const moreMatches = tokenize('report a bug ticket issue');

    const scoreFew = scoreToolRelevance(tool, fewMatches);
    const scoreMore = scoreToolRelevance(tool, moreMatches);

    expect(scoreMore).toBeGreaterThanOrEqual(scoreFew);
  });

  it('handles empty keywords array', () => {
    const tool = { keywords: [] };
    expect(scoreToolRelevance(tool, ['test'])).toBe(0);
  });

  it('handles empty task tokens', () => {
    const tool = { keywords: ['test'] };
    expect(scoreToolRelevance(tool, [])).toBe(0);
  });

  it('handles missing keywords', () => {
    const tool = {};
    expect(scoreToolRelevance(tool, ['test'])).toBe(0);
  });

  it('matches substrings', () => {
    const tool = { keywords: ['pull request'] };
    const tokens = tokenize('pull');
    expect(scoreToolRelevance(tool, tokens)).toBeGreaterThan(0);
  });
});

// ============================================================================
// detectConfiguredServers
// ============================================================================

describe('detectConfiguredServers', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-shed-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array when no MCP config exists', () => {
    const servers = detectConfiguredServers(tmpDir);
    expect(servers).toEqual([]);
  });

  it('detects servers from .mcp.json', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          github: { command: 'npx', args: ['@anthropic/mcp-server-github'] },
          filesystem: { command: 'npx', args: ['@anthropic/mcp-server-filesystem'] },
        },
      })
    );

    const servers = detectConfiguredServers(tmpDir);
    expect(servers).toContain('github');
    expect(servers).toContain('filesystem');
  });

  it('detects servers from .claude/mcp.json', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(
      path.join(claudeDir, 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          notion: { command: 'npx', args: ['@anthropic/mcp-server-notion'] },
        },
      })
    );

    const servers = detectConfiguredServers(tmpDir);
    expect(servers).toContain('notion');
  });

  it('detects servers from agileflow-metadata.json mcp features', () => {
    const metaDir = path.join(tmpDir, 'docs', '00-meta');
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(
      path.join(metaDir, 'agileflow-metadata.json'),
      JSON.stringify({
        agileflow: {
          features: {
            mcp: {
              github: true,
              notion: false,
            },
          },
        },
      })
    );

    const servers = detectConfiguredServers(tmpDir);
    expect(servers).toContain('github');
    expect(servers).not.toContain('notion');
  });

  it('deduplicates servers from multiple sources', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.mcp.json'),
      JSON.stringify({
        mcpServers: { github: {} },
      })
    );

    const metaDir = path.join(tmpDir, 'docs', '00-meta');
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(
      path.join(metaDir, 'agileflow-metadata.json'),
      JSON.stringify({
        agileflow: { features: { mcp: { github: true } } },
      })
    );

    const servers = detectConfiguredServers(tmpDir);
    const githubCount = servers.filter(s => s === 'github').length;
    expect(githubCount).toBe(1);
  });

  it('handles malformed .mcp.json gracefully', () => {
    fs.writeFileSync(path.join(tmpDir, '.mcp.json'), 'not json');
    expect(() => detectConfiguredServers(tmpDir)).not.toThrow();
    expect(detectConfiguredServers(tmpDir)).toEqual([]);
  });
});

// ============================================================================
// getToolsForTask
// ============================================================================

describe('getToolsForTask', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-shed-task-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty tools when no servers configured and includeUnconfigured is false', () => {
    const result = getToolsForTask('search for bugs', { projectRoot: tmpDir });
    expect(result.tools).toEqual([]);
    expect(result.configured_servers).toEqual([]);
  });

  it('returns matching tools when servers are configured', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.mcp.json'),
      JSON.stringify({
        mcpServers: { github: {} },
      })
    );

    const result = getToolsForTask('create a pull request', { projectRoot: tmpDir });
    expect(result.tools.length).toBeGreaterThan(0);
    expect(result.tools.some(t => t.name === 'create_pull_request')).toBe(true);
  });

  it('includes unconfigured tools when flag is set', () => {
    const result = getToolsForTask('create a pull request', {
      projectRoot: tmpDir,
      includeUnconfigured: true,
    });
    expect(result.tools.length).toBeGreaterThan(0);
  });

  it('respects maxResults limit', () => {
    const result = getToolsForTask('search for bugs and create issues', {
      projectRoot: tmpDir,
      includeUnconfigured: true,
      maxResults: 2,
    });
    expect(result.tools.length).toBeLessThanOrEqual(2);
  });

  it('respects minScore threshold', () => {
    const result = getToolsForTask('search for bugs', {
      projectRoot: tmpDir,
      includeUnconfigured: true,
      minScore: 90,
    });
    for (const tool of result.tools) {
      expect(tool.score).toBeGreaterThanOrEqual(90);
    }
  });

  it('provides suggestions for unconfigured servers', () => {
    const result = getToolsForTask('create a github issue', { projectRoot: tmpDir });
    // Should suggest configuring github server
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('sorts results by score', () => {
    const result = getToolsForTask('search code and create pull request', {
      projectRoot: tmpDir,
      includeUnconfigured: true,
    });
    for (let i = 1; i < result.tools.length; i++) {
      // Within same configured status, should be sorted by score
      if (result.tools[i].configured === result.tools[i - 1].configured) {
        expect(result.tools[i].score).toBeLessThanOrEqual(result.tools[i - 1].score);
      }
    }
  });
});

// ============================================================================
// getAvailableServers
// ============================================================================

describe('getAvailableServers', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-shed-servers-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns registry info with total counts', () => {
    const result = getAvailableServers(tmpDir);
    expect(result.total_servers).toBeGreaterThan(0);
    expect(result.total_tools).toBeGreaterThan(0);
    expect(result.registry).toBeDefined();
  });

  it('marks servers as configured when present in .mcp.json', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.mcp.json'),
      JSON.stringify({
        mcpServers: { github: {} },
      })
    );

    const result = getAvailableServers(tmpDir);
    expect(result.registry.github.configured).toBe(true);
    expect(result.configured).toContain('github');
  });

  it('lists tools for each server', () => {
    const result = getAvailableServers(tmpDir);
    for (const [, info] of Object.entries(result.registry)) {
      expect(Array.isArray(info.tools)).toBe(true);
      expect(info.tool_count).toBe(info.tools.length);
    }
  });
});

// ============================================================================
// getToolCount
// ============================================================================

describe('getToolCount', () => {
  it('returns total and per-server counts', () => {
    const stats = getToolCount();
    expect(stats.total).toBeGreaterThan(0);
    expect(typeof stats.byServer).toBe('object');
    // Sum of per-server should equal total
    const sum = Object.values(stats.byServer).reduce((a, b) => a + b, 0);
    expect(sum).toBe(stats.total);
  });
});

// ============================================================================
// formatToolResults
// ============================================================================

describe('formatToolResults', () => {
  it('formats results with tool details', () => {
    const result = {
      task: 'create a pull request',
      configured_servers: ['github'],
      total_matched: 2,
      tools: [
        {
          name: 'create_pull_request',
          server: 'github',
          description: 'Create a PR',
          score: 80,
          configured: true,
        },
        {
          name: 'get_pull_request',
          server: 'github',
          description: 'Get PR details',
          score: 60,
          configured: true,
        },
      ],
      suggestions: [],
    };

    const formatted = formatToolResults(result);
    expect(formatted).toContain('create a pull request');
    expect(formatted).toContain('create_pull_request');
    expect(formatted).toContain('github');
  });

  it('shows suggestion for unconfigured servers', () => {
    const result = {
      task: 'send slack message',
      configured_servers: [],
      total_matched: 0,
      tools: [],
      suggestions: [
        { server: 'slack', best_match: 'send_message', score: 80, description: 'Configure slack' },
      ],
    };

    const formatted = formatToolResults(result);
    expect(formatted).toContain('Suggested Servers');
    expect(formatted).toContain('slack');
  });

  it('handles empty results', () => {
    const result = {
      task: 'unknown task',
      configured_servers: [],
      total_matched: 0,
      tools: [],
      suggestions: [],
    };

    const formatted = formatToolResults(result);
    expect(formatted).toContain('No matching tools found');
  });
});
