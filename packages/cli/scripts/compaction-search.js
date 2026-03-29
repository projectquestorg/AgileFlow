#!/usr/bin/env node
/**
 * compaction-search.js - Search compaction history
 *
 * CLI helper for /agileflow:compact:search command.
 * Searches the compaction tree by keyword, story ID, date range, or session.
 *
 * Usage:
 *   node compaction-search.js <keyword>
 *   node compaction-search.js US-0425
 *   node compaction-search.js --since 2d
 *   node compaction-search.js --session 3
 *   node compaction-search.js --json
 */

const path = require('path');
const fs = require('fs');

// Find project root
function findProjectRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (
      fs.existsSync(path.join(dir, '.agileflow')) ||
      fs.existsSync(path.join(dir, 'package.json'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const filteredArgs = args.filter(a => a !== '--json');

  const root = findProjectRoot();

  // Load compaction tree
  let ct;
  try {
    ct = require('./lib/compaction-tree');
  } catch (e) {
    console.error('Error: compaction-tree module not found');
    process.exit(1);
  }

  const treePath = ct.getTreePath(root);
  if (!fs.existsSync(treePath)) {
    console.log('No compaction history found.');
    console.log('');
    console.log('Hierarchical compaction may not be enabled yet.');
    console.log('Enable with: /agileflow:configure --enable=hierarchicalcompaction');
    process.exit(0);
  }

  const nodeCount = ct.getNodeCount(root);
  if (nodeCount === 0) {
    console.log('Compaction tree is empty (no compaction events recorded yet).');
    process.exit(0);
  }

  let results = [];

  // Parse arguments
  if (filteredArgs.length === 0) {
    // No args - show all nodes
    const tree = ct.loadTree(root);
    results = Object.values(tree.nodes).sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );
  } else if (filteredArgs[0] === '--since') {
    // Date range search
    const sinceStr = filteredArgs[1];
    if (!sinceStr) {
      console.error('Error: --since requires a duration (e.g., 2d, 12h, 30m)');
      process.exit(1);
    }

    const match = sinceStr.match(/^(\d+)(m|h|d)$/);
    if (!match) {
      console.error('Error: invalid duration format. Use Nd (days), Nh (hours), or Nm (minutes)');
      process.exit(1);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multiplier = { m: 60000, h: 3600000, d: 86400000 };
    const sinceMs = Date.now() - value * multiplier[unit];

    results = ct.getByDateRange(root, new Date(sinceMs), new Date());
  } else if (filteredArgs[0] === '--session') {
    // Session search
    const sessionId = filteredArgs[1];
    if (!sessionId) {
      console.error('Error: --session requires a session ID');
      process.exit(1);
    }
    results = ct.getBySession(root, sessionId);
  } else {
    // Keyword or story ID search
    const keyword = filteredArgs.join(' ');
    results = ct.searchByKeyword(root, keyword);
  }

  // Output
  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log('No matching compaction events found.');
    console.log(`Total compaction events in tree: ${nodeCount}`);
    return;
  }

  console.log(`Found ${results.length} compaction event(s):\n`);

  for (const node of results) {
    const timeAgo = ct.formatRelativeTime(node.timestamp);
    const stories = (node.active_stories || []).join(', ') || 'none';
    const branch = node.branch || 'unknown';
    const session = node.session_id ? `session ${node.session_id}` : 'no session';

    console.log(`[${node.timestamp}] (${timeAgo})`);
    console.log(`  Branch: ${branch} | Stories: ${stories} | ${session}`);
    if (node.summary) {
      console.log(`  Summary: ${node.summary}`);
    }
    console.log('');
  }
}

main();
