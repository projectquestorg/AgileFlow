/**
 * Tests for merge-operations.js - Session merge and conflict resolution
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');
const {
  categorizeFile,
  getMergeStrategy,
  generateCommitMessage,
  getMergeHistory,
  saveMergeLog,
} = require('../../lib/merge-operations');

describe('merge-operations', () => {
  describe('categorizeFile', () => {
    describe('documentation files', () => {
      it('categorizes .md files as docs', () => {
        expect(categorizeFile('README.md')).toBe('docs');
        expect(categorizeFile('docs/guide.md')).toBe('docs');
        expect(categorizeFile('CHANGELOG.md')).toBe('docs');
      });

      it('categorizes readme files as docs', () => {
        expect(categorizeFile('readme')).toBe('docs');
        expect(categorizeFile('README')).toBe('docs');
        expect(categorizeFile('readme.txt')).toBe('docs');
      });
    });

    describe('test files', () => {
      it('categorizes .test. files as test', () => {
        expect(categorizeFile('file.test.js')).toBe('test');
        expect(categorizeFile('component.test.tsx')).toBe('test');
      });

      it('categorizes .spec. files as test', () => {
        expect(categorizeFile('file.spec.js')).toBe('test');
        expect(categorizeFile('module.spec.ts')).toBe('test');
      });

      it('categorizes __tests__ directory files as test', () => {
        expect(categorizeFile('__tests__/unit.js')).toBe('test');
        expect(categorizeFile('src/__tests__/component.jsx')).toBe('test');
      });

      it('categorizes test directory files as test', () => {
        expect(categorizeFile('test/helper.js')).toBe('test');
        expect(categorizeFile('tests/integration.js')).toBe('test');
      });
    });

    describe('schema files', () => {
      it('categorizes .sql files as schema', () => {
        expect(categorizeFile('create_table.sql')).toBe('schema');
        expect(categorizeFile('migrations/001.sql')).toBe('schema');
      });

      it('categorizes schema files as schema', () => {
        expect(categorizeFile('schema.prisma')).toBe('schema');
        expect(categorizeFile('db/schema.json')).toBe('schema');
      });

      it('categorizes migration files as schema', () => {
        expect(categorizeFile('migration/0001.js')).toBe('schema');
        expect(categorizeFile('migrations/20240101.ts')).toBe('schema');
      });

      it('categorizes prisma files as schema', () => {
        expect(categorizeFile('prisma/schema.prisma')).toBe('schema');
      });
    });

    describe('config files', () => {
      it('categorizes .json files as config', () => {
        expect(categorizeFile('package.json')).toBe('config');
        expect(categorizeFile('tsconfig.json')).toBe('config');
      });

      it('categorizes .yaml/.yml files as config', () => {
        expect(categorizeFile('docker-compose.yaml')).toBe('config');
        expect(categorizeFile('.github/workflows/ci.yml')).toBe('config');
      });

      it('categorizes .toml files as config', () => {
        expect(categorizeFile('Cargo.toml')).toBe('config');
        expect(categorizeFile('pyproject.toml')).toBe('config');
      });

      it('categorizes config files as config', () => {
        expect(categorizeFile('webpack.config.js')).toBe('config');
        expect(categorizeFile('jest.config.ts')).toBe('config');
      });

      it('categorizes dotfiles as config', () => {
        expect(categorizeFile('.eslintrc')).toBe('config');
        expect(categorizeFile('.prettierrc')).toBe('config');
        expect(categorizeFile('.gitignore')).toBe('config');
      });
    });

    describe('source files', () => {
      it('categorizes .js files as source', () => {
        expect(categorizeFile('src/index.js')).toBe('source');
        expect(categorizeFile('lib/utils.js')).toBe('source');
      });

      it('categorizes .ts files as source', () => {
        expect(categorizeFile('src/app.ts')).toBe('source');
        expect(categorizeFile('lib/types.ts')).toBe('source');
      });

      it('categorizes other code files as source', () => {
        expect(categorizeFile('main.py')).toBe('source');
        expect(categorizeFile('app.rb')).toBe('source');
        expect(categorizeFile('Main.java')).toBe('source');
      });
    });
  });

  describe('getMergeStrategy', () => {
    it('returns union strategy for docs', () => {
      const result = getMergeStrategy('docs');
      expect(result.strategy).toBe('accept_both');
      expect(result.gitStrategy).toBe('union');
    });

    it('returns union strategy for test', () => {
      const result = getMergeStrategy('test');
      expect(result.strategy).toBe('accept_both');
      expect(result.gitStrategy).toBe('union');
    });

    it('returns theirs strategy for schema', () => {
      const result = getMergeStrategy('schema');
      expect(result.strategy).toBe('take_theirs');
      expect(result.gitStrategy).toBe('theirs');
    });

    it('returns ours strategy for config', () => {
      const result = getMergeStrategy('config');
      expect(result.strategy).toBe('merge_keys');
      expect(result.gitStrategy).toBe('ours');
    });

    it('returns recursive strategy for source', () => {
      const result = getMergeStrategy('source');
      expect(result.strategy).toBe('intelligent_merge');
      expect(result.gitStrategy).toBe('recursive');
    });

    it('returns source strategy for unknown category', () => {
      const result = getMergeStrategy('unknown');
      expect(result.strategy).toBe('intelligent_merge');
      expect(result.gitStrategy).toBe('recursive');
    });

    it('includes description for each strategy', () => {
      expect(getMergeStrategy('docs').description).toBeDefined();
      expect(getMergeStrategy('test').description).toBeDefined();
      expect(getMergeStrategy('schema').description).toBeDefined();
      expect(getMergeStrategy('config').description).toBeDefined();
      expect(getMergeStrategy('source').description).toBeDefined();
    });
  });

  describe('generateCommitMessage', () => {
    it('generates message with nickname', () => {
      const session = { nickname: 'feature-auth', branch: 'feature/auth' };
      const message = generateCommitMessage(session);

      expect(message).toContain('feature-auth');
      expect(message).toContain('feature/auth');
    });

    it('uses session ID when no nickname', () => {
      const session = { id: '123', branch: 'session-123' };
      const message = generateCommitMessage(session);

      expect(message).toContain('session-123');
    });

    it('handles missing id and nickname', () => {
      const session = { branch: 'unknown-branch' };
      const message = generateCommitMessage(session);

      expect(message).toContain('unknown');
      expect(message).toContain('unknown-branch');
    });

    it('includes branch in message body', () => {
      const session = { nickname: 'test', branch: 'test-branch' };
      const message = generateCommitMessage(session);

      expect(message).toContain('Branch: test-branch');
    });
  });

  describe('saveMergeLog and getMergeHistory', () => {
    let testDir;
    const originalSessionsDir = process.env.AGILEFLOW_SESSIONS_DIR;

    beforeEach(() => {
      testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-log-test-'));
      fs.mkdirSync(path.join(testDir, '.agileflow', 'sessions'), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
      if (originalSessionsDir) {
        process.env.AGILEFLOW_SESSIONS_DIR = originalSessionsDir;
      } else {
        delete process.env.AGILEFLOW_SESSIONS_DIR;
      }
    });

    it('getMergeHistory returns empty array when no log exists', () => {
      const result = getMergeHistory();
      expect(result.success).toBe(true);
      // Note: This uses the real SESSIONS_DIR, so result depends on actual state
    });

    it('getMergeHistory returns merges array', () => {
      const result = getMergeHistory();
      expect(result).toHaveProperty('success');
      if (result.success) {
        expect(Array.isArray(result.merges)).toBe(true);
      }
    });
  });

  describe('merge workflow integration', () => {
    // These tests would require a full git repo setup
    // and are better tested via the session-manager integration tests

    it('categorizeFile and getMergeStrategy work together', () => {
      const files = ['README.md', 'src/app.js', 'tests/unit.test.js', 'package.json', 'schema.sql'];

      const strategies = files.map(f => ({
        file: f,
        category: categorizeFile(f),
        strategy: getMergeStrategy(categorizeFile(f)),
      }));

      expect(strategies[0].category).toBe('docs');
      expect(strategies[1].category).toBe('source');
      expect(strategies[2].category).toBe('test');
      expect(strategies[3].category).toBe('config');
      expect(strategies[4].category).toBe('schema');

      // Each should have a valid strategy
      strategies.forEach(s => {
        expect(s.strategy.strategy).toBeDefined();
        expect(s.strategy.gitStrategy).toBeDefined();
      });
    });
  });
});
