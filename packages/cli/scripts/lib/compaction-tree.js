/**
 * compaction-tree.js - Hierarchical compaction history
 *
 * Tracks context compaction events as a linked chain of nodes.
 * Each compaction creates a node with a summary of what was happening,
 * enabling telescoping output (progressively less detail for older events)
 * and cross-session search over compaction history.
 *
 * Storage: .agileflow/state/compaction-tree.json
 * Design: Flat node map with parent pointers (not nested tree)
 *
 * NO EXTERNAL DEPENDENCIES - only Node.js built-ins
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = '1.0.0';
const DEFAULT_PRUNE_KEEP = 20;
const DEFAULT_MAX_ANCESTORS = 5;
const TREE_FILENAME = 'compaction-tree.json';

/**
 * Generate a short unique node ID
 * @returns {string} e.g., "cpt-a1b2c3d4"
 */
function generateNodeId() {
  return 'cpt-' + crypto.randomBytes(4).toString('hex');
}

/**
 * Get the path to the compaction tree file
 * @param {string} rootDir - Project root
 * @returns {string}
 */
function getTreePath(rootDir) {
  return path.join(rootDir, '.agileflow', 'state', TREE_FILENAME);
}

/**
 * Load the compaction tree from disk
 * @param {string} rootDir - Project root
 * @returns {object} Tree state
 */
function loadTree(rootDir) {
  const treePath = getTreePath(rootDir);
  try {
    if (fs.existsSync(treePath)) {
      const data = JSON.parse(fs.readFileSync(treePath, 'utf8'));
      if (data.schema_version && data.nodes) {
        return data;
      }
    }
  } catch {
    // Corrupted - start fresh
  }
  return {
    schema_version: SCHEMA_VERSION,
    nodes: {},
    latest_node_id: null,
    updated: null,
  };
}

/**
 * Save the compaction tree to disk atomically (temp + rename)
 * @param {string} rootDir - Project root
 * @param {object} tree - Tree state
 * @returns {boolean} Success
 */
function saveTree(rootDir, tree) {
  const treePath = getTreePath(rootDir);
  try {
    const dir = path.dirname(treePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    tree.updated = new Date().toISOString();

    const tmpPath = treePath + '.tmp.' + process.pid;
    fs.writeFileSync(tmpPath, JSON.stringify(tree, null, 2) + '\n');
    fs.renameSync(tmpPath, treePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a new compaction node
 * @param {string} rootDir - Project root
 * @param {object} data - Node data
 * @param {string} data.summary - 1-5 line summary of context at compaction time
 * @param {string[]} [data.active_stories] - Story IDs active at compaction
 * @param {string} [data.branch] - Git branch
 * @param {string[]} [data.active_commands] - Active command names
 * @param {string|null} [data.session_id] - Session ID
 * @param {object} [data.metadata] - Additional metadata
 * @param {object} [options] - Options
 * @param {number} [options.pruneKeep] - Max nodes to keep after pruning
 * @returns {object} Created node
 */
function createNode(rootDir, data, options = {}) {
  const tree = loadTree(rootDir);
  const pruneKeep = options.pruneKeep || DEFAULT_PRUNE_KEEP;

  const parentId = tree.latest_node_id || null;
  const parentNode = parentId ? tree.nodes[parentId] : null;
  const depth = parentNode ? parentNode.depth + 1 : 0;

  const node = {
    id: generateNodeId(),
    timestamp: new Date().toISOString(),
    session_id: data.session_id || null,
    parent_id: parentId,
    depth,
    summary: data.summary || '',
    active_stories: data.active_stories || [],
    branch: data.branch || '',
    active_commands: data.active_commands || [],
    metadata: data.metadata || {},
  };

  tree.nodes[node.id] = node;
  tree.latest_node_id = node.id;

  // Auto-prune if over limit
  const nodeCount = Object.keys(tree.nodes).length;
  if (nodeCount > pruneKeep) {
    prune(tree, pruneKeep);
  }

  saveTree(rootDir, tree);
  return node;
}

/**
 * Get a node by ID
 * @param {string} rootDir - Project root
 * @param {string} nodeId - Node ID
 * @returns {object|null}
 */
function getNode(rootDir, nodeId) {
  const tree = loadTree(rootDir);
  return tree.nodes[nodeId] || null;
}

/**
 * Get the most recent node
 * @param {string} rootDir - Project root
 * @returns {object|null}
 */
function getLatestNode(rootDir) {
  const tree = loadTree(rootDir);
  if (!tree.latest_node_id) return null;
  return tree.nodes[tree.latest_node_id] || null;
}

/**
 * Walk the parent chain and return ancestors (oldest first)
 * @param {string} rootDir - Project root
 * @param {string} nodeId - Starting node ID
 * @param {number} [maxDepth] - Maximum ancestors to return
 * @returns {object[]} Array of ancestor nodes, oldest first
 */
function getAncestors(rootDir, nodeId, maxDepth = DEFAULT_MAX_ANCESTORS) {
  const tree = loadTree(rootDir);
  const ancestors = [];
  let currentId = nodeId;

  for (let i = 0; i < maxDepth; i++) {
    const node = tree.nodes[currentId];
    if (!node || !node.parent_id) break;

    const parent = tree.nodes[node.parent_id];
    if (!parent) break;

    ancestors.unshift(parent); // prepend to get oldest-first order
    currentId = parent.id;
  }

  return ancestors;
}

/**
 * Get all nodes for a specific session
 * @param {string} rootDir - Project root
 * @param {string} sessionId - Session ID
 * @returns {object[]} Matching nodes, newest first
 */
function getBySession(rootDir, sessionId) {
  const tree = loadTree(rootDir);
  return Object.values(tree.nodes)
    .filter(n => n.session_id === sessionId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Get all nodes where a specific story was active
 * @param {string} rootDir - Project root
 * @param {string} storyId - Story ID (e.g., "US-0425")
 * @returns {object[]} Matching nodes, newest first
 */
function getByStory(rootDir, storyId) {
  const tree = loadTree(rootDir);
  return Object.values(tree.nodes)
    .filter(n => (n.active_stories || []).includes(storyId))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Get nodes within a date range
 * @param {string} rootDir - Project root
 * @param {Date|string} from - Start date
 * @param {Date|string} to - End date
 * @returns {object[]} Matching nodes, newest first
 */
function getByDateRange(rootDir, from, to) {
  const tree = loadTree(rootDir);
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();

  return Object.values(tree.nodes)
    .filter(n => {
      const ts = new Date(n.timestamp).getTime();
      return ts >= fromMs && ts <= toMs;
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Search nodes by keyword in summary text
 * @param {string} rootDir - Project root
 * @param {string} keyword - Search term (case-insensitive)
 * @returns {object[]} Matching nodes, newest first
 */
function searchByKeyword(rootDir, keyword) {
  const tree = loadTree(rootDir);
  const lower = keyword.toLowerCase();

  return Object.values(tree.nodes)
    .filter(n => {
      const summary = (n.summary || '').toLowerCase();
      const stories = (n.active_stories || []).join(' ').toLowerCase();
      const branch = (n.branch || '').toLowerCase();
      return summary.includes(lower) || stories.includes(lower) || branch.includes(lower);
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Prune tree to keep only the most recent N nodes
 * Maintains the parent chain integrity for kept nodes.
 * @param {object} tree - Tree state (modified in place)
 * @param {number} keepCount - Number of nodes to keep
 */
function prune(tree, keepCount = DEFAULT_PRUNE_KEEP) {
  const nodes = Object.values(tree.nodes);
  if (nodes.length <= keepCount) return;

  // Sort by timestamp, newest first
  nodes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Keep the newest N
  const toKeep = new Set(nodes.slice(0, keepCount).map(n => n.id));

  // Remove old nodes
  for (const id of Object.keys(tree.nodes)) {
    if (!toKeep.has(id)) {
      delete tree.nodes[id];
    }
  }

  // Fix dangling parent pointers
  for (const node of Object.values(tree.nodes)) {
    if (node.parent_id && !tree.nodes[node.parent_id]) {
      node.parent_id = null;
    }
  }

  // Fix dangling latest_node_id pointer
  if (tree.latest_node_id && !tree.nodes[tree.latest_node_id]) {
    // Point to the newest remaining node
    const remaining = Object.values(tree.nodes);
    if (remaining.length > 0) {
      remaining.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      tree.latest_node_id = remaining[0].id;
    } else {
      tree.latest_node_id = null;
    }
  }
}

/**
 * Get total node count
 * @param {string} rootDir - Project root
 * @returns {number}
 */
function getNodeCount(rootDir) {
  const tree = loadTree(rootDir);
  return Object.keys(tree.nodes).length;
}

/**
 * Format a relative time string
 * @param {string} timestamp - ISO timestamp
 * @returns {string} e.g., "15 min ago", "2 hours ago"
 */
function formatRelativeTime(timestamp) {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

/**
 * Format telescoping output from ancestor nodes
 * Progressively less detail for older compactions.
 *
 * @param {object[]} ancestors - Array of ancestor nodes (oldest first)
 * @param {object} [options]
 * @param {number} [options.maxChars=2000] - Maximum characters for entire section
 * @returns {string} Formatted output section
 */
function formatTelescopingOutput(ancestors, options = {}) {
  if (!ancestors || ancestors.length === 0) return '';

  const maxChars = options.maxChars || 2000;
  const lines = ['## Compaction History (recent context)', ''];

  // Reverse to newest-first for display
  const reversed = [...ancestors].reverse();

  for (let i = 0; i < reversed.length; i++) {
    const node = reversed[i];
    const timeAgo = formatRelativeTime(node.timestamp);
    const stories = (node.active_stories || []).join(', ') || 'no active stories';
    const branch = node.branch || 'unknown';

    if (i === 0) {
      // Most recent ancestor: 3-5 lines of detail
      lines.push(`### Previous compaction (${timeAgo})`);
      lines.push(`Working on ${stories} on branch ${branch}`);
      if (node.active_commands && node.active_commands.length > 0) {
        lines.push(
          `Active commands: ${node.active_commands.map(c => '/agileflow:' + c).join(', ')}`
        );
      }
      if (node.summary) {
        lines.push(`Summary: ${node.summary}`);
      }
      lines.push('');
    } else if (i <= 2) {
      // 1-2 compactions back: 2-3 lines
      lines.push(`### ${i + 1} compactions ago (${timeAgo})`);
      lines.push(`${stories} on ${branch}. ${(node.summary || '').split('\n')[0]}`);
      lines.push('');
    } else {
      // Older: 1 line
      lines.push(`[${timeAgo}] ${stories} on ${branch}`);
    }

    // Check character budget
    const currentOutput = lines.join('\n');
    if (currentOutput.length > maxChars) {
      // Truncate at current entry
      lines.pop();
      lines.push('(older compaction history truncated)');
      break;
    }
  }

  return lines.join('\n');
}

module.exports = {
  // Core operations
  createNode,
  getNode,
  getLatestNode,
  getAncestors,

  // Search
  getBySession,
  getByStory,
  getByDateRange,
  searchByKeyword,

  // Maintenance
  getNodeCount,

  // Display
  formatTelescopingOutput,
  formatRelativeTime,

  // I/O (exposed for testing)
  loadTree,
  saveTree,
  getTreePath,
  generateNodeId,
  prune,

  // Constants
  SCHEMA_VERSION,
  DEFAULT_PRUNE_KEEP,
  DEFAULT_MAX_ANCESTORS,
};
