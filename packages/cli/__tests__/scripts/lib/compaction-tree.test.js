const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  createNode,
  getNode,
  getLatestNode,
  getAncestors,
  getBySession,
  getByStory,
  getByDateRange,
  searchByKeyword,
  getNodeCount,
  formatTelescopingOutput,
  formatRelativeTime,
  loadTree,
  saveTree,
  getTreePath,
  prune,
  SCHEMA_VERSION,
  DEFAULT_PRUNE_KEEP,
} = require('../../../scripts/lib/compaction-tree');

let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compaction-tree-test-'));
  // Create the state directory
  fs.mkdirSync(path.join(testDir, '.agileflow', 'state'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('compaction-tree', () => {
  describe('loadTree', () => {
    it('returns empty tree when no file exists', () => {
      const tree = loadTree(testDir);
      expect(tree.schema_version).toBe(SCHEMA_VERSION);
      expect(tree.nodes).toEqual({});
      expect(tree.latest_node_id).toBe(null);
    });

    it('loads existing tree from disk', () => {
      const treePath = getTreePath(testDir);
      const data = {
        schema_version: SCHEMA_VERSION,
        nodes: { 'cpt-test': { id: 'cpt-test', summary: 'test' } },
        latest_node_id: 'cpt-test',
        updated: new Date().toISOString(),
      };
      fs.writeFileSync(treePath, JSON.stringify(data));

      const tree = loadTree(testDir);
      expect(tree.nodes['cpt-test'].summary).toBe('test');
      expect(tree.latest_node_id).toBe('cpt-test');
    });

    it('returns empty tree on corrupted JSON', () => {
      const treePath = getTreePath(testDir);
      fs.writeFileSync(treePath, '{invalid json');

      const tree = loadTree(testDir);
      expect(tree.nodes).toEqual({});
    });
  });

  describe('saveTree', () => {
    it('creates directory and saves tree', () => {
      const freshDir = path.join(testDir, 'fresh-project');
      fs.mkdirSync(freshDir);

      const tree = {
        schema_version: SCHEMA_VERSION,
        nodes: {},
        latest_node_id: null,
        updated: null,
      };

      const ok = saveTree(freshDir, tree);
      expect(ok).toBe(true);

      const loaded = loadTree(freshDir);
      expect(loaded.schema_version).toBe(SCHEMA_VERSION);
      expect(loaded.updated).toBeTruthy();
    });
  });

  describe('createNode', () => {
    it('creates first node with no parent', () => {
      const node = createNode(testDir, {
        summary: 'Working on US-0425',
        active_stories: ['US-0425'],
        branch: 'main',
        active_commands: ['babysit'],
      });

      expect(node.id).toMatch(/^cpt-[a-f0-9]{8}$/);
      expect(node.parent_id).toBe(null);
      expect(node.depth).toBe(0);
      expect(node.summary).toBe('Working on US-0425');
      expect(node.active_stories).toEqual(['US-0425']);
      expect(node.branch).toBe('main');
    });

    it('links second node to first via parent_id', () => {
      const first = createNode(testDir, { summary: 'first' });
      const second = createNode(testDir, { summary: 'second' });

      expect(second.parent_id).toBe(first.id);
      expect(second.depth).toBe(1);
    });

    it('increments depth for each node', () => {
      createNode(testDir, { summary: 'depth 0' });
      createNode(testDir, { summary: 'depth 1' });
      const third = createNode(testDir, { summary: 'depth 2' });

      expect(third.depth).toBe(2);
    });

    it('persists to disk', () => {
      createNode(testDir, { summary: 'persisted' });

      const loaded = loadTree(testDir);
      expect(Object.keys(loaded.nodes)).toHaveLength(1);
      expect(Object.values(loaded.nodes)[0].summary).toBe('persisted');
    });

    it('auto-prunes when over limit', () => {
      for (let i = 0; i < 5; i++) {
        createNode(testDir, { summary: `node ${i}` }, { pruneKeep: 3 });
      }

      const count = getNodeCount(testDir);
      expect(count).toBeLessThanOrEqual(3);
    });

    it('stores metadata', () => {
      const node = createNode(testDir, {
        summary: 'test',
        metadata: { version: '3.4.3', wip_count: 2 },
      });

      expect(node.metadata.version).toBe('3.4.3');
      expect(node.metadata.wip_count).toBe(2);
    });
  });

  describe('getNode', () => {
    it('returns node by ID', () => {
      const created = createNode(testDir, { summary: 'findme' });
      const found = getNode(testDir, created.id);

      expect(found).toBeTruthy();
      expect(found.summary).toBe('findme');
    });

    it('returns null for unknown ID', () => {
      expect(getNode(testDir, 'cpt-nonexistent')).toBe(null);
    });
  });

  describe('getLatestNode', () => {
    it('returns null when tree is empty', () => {
      expect(getLatestNode(testDir)).toBe(null);
    });

    it('returns most recently created node', () => {
      createNode(testDir, { summary: 'first' });
      createNode(testDir, { summary: 'latest' });

      const latest = getLatestNode(testDir);
      expect(latest.summary).toBe('latest');
    });
  });

  describe('getAncestors', () => {
    it('returns empty array for first node', () => {
      const node = createNode(testDir, { summary: 'root' });
      const ancestors = getAncestors(testDir, node.id);

      expect(ancestors).toEqual([]);
    });

    it('returns parent chain oldest-first', () => {
      const first = createNode(testDir, { summary: 'first' });
      createNode(testDir, { summary: 'second' });
      const third = createNode(testDir, { summary: 'third' });

      const ancestors = getAncestors(testDir, third.id, 5);
      expect(ancestors).toHaveLength(2);
      expect(ancestors[0].summary).toBe('first');
      expect(ancestors[1].summary).toBe('second');
    });

    it('respects maxDepth limit', () => {
      for (let i = 0; i < 10; i++) {
        createNode(testDir, { summary: `node ${i}` });
      }

      const latest = getLatestNode(testDir);
      const ancestors = getAncestors(testDir, latest.id, 3);
      expect(ancestors).toHaveLength(3);
    });
  });

  describe('getBySession', () => {
    it('returns nodes for a specific session', () => {
      createNode(testDir, { summary: 'session 1', session_id: '1' });
      createNode(testDir, { summary: 'session 2', session_id: '2' });
      createNode(testDir, { summary: 'session 1 again', session_id: '1' });

      const results = getBySession(testDir, '1');
      expect(results).toHaveLength(2);
      expect(results[0].summary).toBe('session 1 again'); // newest first
    });

    it('returns empty for unknown session', () => {
      createNode(testDir, { summary: 'test', session_id: '1' });
      expect(getBySession(testDir, '99')).toEqual([]);
    });
  });

  describe('getByStory', () => {
    it('finds nodes with specific story active', () => {
      createNode(testDir, { summary: 'a', active_stories: ['US-0425', 'US-0426'] });
      createNode(testDir, { summary: 'b', active_stories: ['US-0427'] });
      createNode(testDir, { summary: 'c', active_stories: ['US-0425'] });

      const results = getByStory(testDir, 'US-0425');
      expect(results).toHaveLength(2);
    });

    it('returns empty for unmatched story', () => {
      createNode(testDir, { summary: 'test', active_stories: ['US-0001'] });
      expect(getByStory(testDir, 'US-9999')).toEqual([]);
    });
  });

  describe('getByDateRange', () => {
    it('filters by date range', () => {
      const now = Date.now();
      // Create nodes - they all have "now" timestamps
      createNode(testDir, { summary: 'recent' });

      const results = getByDateRange(testDir, new Date(now - 60000), new Date(now + 60000));
      expect(results).toHaveLength(1);
    });

    it('excludes nodes outside range', () => {
      createNode(testDir, { summary: 'test' });

      const future = new Date(Date.now() + 86400000);
      const farFuture = new Date(Date.now() + 172800000);
      const results = getByDateRange(testDir, future, farFuture);
      expect(results).toEqual([]);
    });
  });

  describe('searchByKeyword', () => {
    it('searches summary text', () => {
      createNode(testDir, { summary: 'Working on authentication module' });
      createNode(testDir, { summary: 'Fixing database queries' });

      const results = searchByKeyword(testDir, 'authentication');
      expect(results).toHaveLength(1);
      expect(results[0].summary).toContain('authentication');
    });

    it('searches story IDs', () => {
      createNode(testDir, { summary: 'a', active_stories: ['US-0425'] });
      createNode(testDir, { summary: 'b', active_stories: ['US-0426'] });

      const results = searchByKeyword(testDir, 'US-0425');
      expect(results).toHaveLength(1);
    });

    it('searches branch names', () => {
      createNode(testDir, { summary: 'a', branch: 'feat/auth' });
      createNode(testDir, { summary: 'b', branch: 'main' });

      const results = searchByKeyword(testDir, 'feat/auth');
      expect(results).toHaveLength(1);
    });

    it('is case-insensitive', () => {
      createNode(testDir, { summary: 'Working on AUTH module' });
      const results = searchByKeyword(testDir, 'auth');
      expect(results).toHaveLength(1);
    });
  });

  describe('prune', () => {
    it('keeps newest N nodes', () => {
      const tree = loadTree(testDir);
      for (let i = 0; i < 10; i++) {
        tree.nodes[`cpt-${i}`] = {
          id: `cpt-${i}`,
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          summary: `node ${i}`,
          parent_id: i > 0 ? `cpt-${i - 1}` : null,
          depth: i,
          active_stories: [],
          branch: 'main',
          active_commands: [],
          metadata: {},
        };
      }
      tree.latest_node_id = 'cpt-9';

      prune(tree, 3);

      expect(Object.keys(tree.nodes)).toHaveLength(3);
      expect(tree.nodes['cpt-9']).toBeTruthy();
      expect(tree.nodes['cpt-8']).toBeTruthy();
      expect(tree.nodes['cpt-7']).toBeTruthy();
    });

    it('fixes dangling parent pointers', () => {
      const tree = loadTree(testDir);
      tree.nodes['cpt-old'] = {
        id: 'cpt-old',
        timestamp: new Date(Date.now() - 100000).toISOString(),
        summary: 'old',
        parent_id: null,
        depth: 0,
      };
      tree.nodes['cpt-new'] = {
        id: 'cpt-new',
        timestamp: new Date().toISOString(),
        summary: 'new',
        parent_id: 'cpt-old',
        depth: 1,
      };

      prune(tree, 1);

      expect(tree.nodes['cpt-new'].parent_id).toBe(null);
    });

    it('does nothing when under limit', () => {
      const tree = loadTree(testDir);
      tree.nodes['cpt-a'] = { id: 'cpt-a', timestamp: new Date().toISOString() };

      prune(tree, 10);

      expect(Object.keys(tree.nodes)).toHaveLength(1);
    });
  });

  describe('formatRelativeTime', () => {
    it('formats seconds as "just now"', () => {
      expect(formatRelativeTime(new Date().toISOString())).toBe('just now');
    });

    it('formats minutes', () => {
      const ts = new Date(Date.now() - 300000).toISOString(); // 5 min ago
      expect(formatRelativeTime(ts)).toBe('5 min ago');
    });

    it('formats hours', () => {
      const ts = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      expect(formatRelativeTime(ts)).toBe('2 hours ago');
    });

    it('formats days', () => {
      const ts = new Date(Date.now() - 172800000).toISOString(); // 2 days ago
      expect(formatRelativeTime(ts)).toBe('2 days ago');
    });
  });

  describe('formatTelescopingOutput', () => {
    it('returns empty string for no ancestors', () => {
      expect(formatTelescopingOutput([])).toBe('');
      expect(formatTelescopingOutput(null)).toBe('');
    });

    it('formats single ancestor with full detail', () => {
      const ancestors = [
        {
          id: 'cpt-a',
          timestamp: new Date(Date.now() - 300000).toISOString(),
          active_stories: ['US-0425'],
          branch: 'main',
          active_commands: ['babysit'],
          summary: 'Working on compaction rewrite',
        },
      ];

      const output = formatTelescopingOutput(ancestors);
      expect(output).toContain('## Compaction History');
      expect(output).toContain('Previous compaction');
      expect(output).toContain('US-0425');
      expect(output).toContain('/agileflow:babysit');
      expect(output).toContain('Working on compaction rewrite');
    });

    it('applies decreasing verbosity for older ancestors', () => {
      const ancestors = [];
      for (let i = 0; i < 4; i++) {
        ancestors.push({
          id: `cpt-${i}`,
          timestamp: new Date(Date.now() - (i + 1) * 600000).toISOString(),
          active_stories: [`US-${i}`],
          branch: 'main',
          summary: `Summary ${i}`,
          active_commands: ['babysit'],
        });
      }

      const output = formatTelescopingOutput(ancestors);
      // Most recent gets full detail (### heading)
      expect(output).toContain('### Previous compaction');
      // Older ones get less detail
      expect(output).toContain('compactions ago');
    });

    it('respects character limit', () => {
      const ancestors = [];
      for (let i = 0; i < 20; i++) {
        ancestors.push({
          id: `cpt-${i}`,
          timestamp: new Date(Date.now() - i * 600000).toISOString(),
          active_stories: ['US-0001', 'US-0002', 'US-0003'],
          branch: 'feat/very-long-branch-name-for-testing',
          summary: 'A'.repeat(200),
          active_commands: ['babysit', 'tdd'],
        });
      }

      const output = formatTelescopingOutput(ancestors, { maxChars: 500 });
      // The truncation happens when a line would exceed maxChars, so output is within
      // maxChars + one last entry + the truncation message
      expect(output.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('getNodeCount', () => {
    it('returns 0 for empty tree', () => {
      expect(getNodeCount(testDir)).toBe(0);
    });

    it('returns correct count after creating nodes', () => {
      createNode(testDir, { summary: 'a' });
      createNode(testDir, { summary: 'b' });
      createNode(testDir, { summary: 'c' });

      expect(getNodeCount(testDir)).toBe(3);
    });
  });
});
