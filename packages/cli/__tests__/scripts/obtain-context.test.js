/**
 * Tests for obtain-context.js
 *
 * This script gathers project context for AgileFlow commands/agents.
 * Since it's primarily a CLI script with console output, we test:
 * - It executes without error
 * - It produces expected output structure
 * - It handles missing files gracefully
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

let testDir;
let originalCwd;
const scriptPath = path.resolve(__dirname, '../../scripts/obtain-context.js');

beforeEach(() => {
  // Create temp directory for each test
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agileflow-context-test-'));

  // Create minimal project structure
  fs.mkdirSync(path.join(testDir, '.agileflow'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'docs', '09-agents', 'bus'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'docs', '10-research'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'docs', '05-epics'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'docs', '04-architecture'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'docs', '02-practices'), { recursive: true });
  fs.mkdirSync(path.join(testDir, '.git'), { recursive: true });

  // Initialize git for the test
  try {
    execSync('git init', { cwd: testDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: testDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: testDir, stdio: 'pipe' });
  } catch (e) {
    // Continue if git init fails
  }

  originalCwd = process.cwd();
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('obtain-context.js', () => {
  describe('execution', () => {
    test('runs without error in empty project', () => {
      const result = spawnSync('node', [scriptPath], {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 10000,
      });

      // Should exit with code 0
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });

    test('accepts command name argument', () => {
      const result = spawnSync('node', [scriptPath, 'babysit'], {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 10000,
      });

      expect(result.status).toBe(0);
      // Output should mention the command name
      expect(result.stdout).toContain('babysit');
    });

    test('outputs git status information', () => {
      const result = spawnSync('node', [scriptPath], {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 10000,
      });

      expect(result.stdout).toContain('Git Status');
      expect(result.stdout).toContain('Branch');
    });
  });

  describe('status.json handling', () => {
    test('displays status.json content when present', () => {
      const statusData = {
        updated: new Date().toISOString(),
        stories: {
          'US-0001': { title: 'Test Story', status: 'in_progress' },
        },
      };
      fs.writeFileSync(
        path.join(testDir, 'docs', '09-agents', 'status.json'),
        JSON.stringify(statusData, null, 2)
      );

      const result = spawnSync('node', [scriptPath], {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 10000,
      });

      expect(result.stdout).toContain('Status.json');
      expect(result.stdout).toContain('US-0001');
      expect(result.stdout).toContain('Test Story');
    });

    test('handles missing status.json gracefully', () => {
      const result = spawnSync('node', [scriptPath], {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 10000,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('No status.json found');
    });
  });

  describe('session-state.json handling', () => {
    test('displays session information when present', () => {
      const sessionState = {
        current_session: {
          started_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
          current_story: 'US-0042',
        },
      };
      fs.writeFileSync(
        path.join(testDir, 'docs', '09-agents', 'session-state.json'),
        JSON.stringify(sessionState, null, 2)
      );

      const result = spawnSync('node', [scriptPath], {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 10000,
      });

      expect(result.stdout).toContain('Session State');
      expect(result.stdout).toMatch(/\d+ min/); // Duration in minutes
    });

    test('registers command name in session state', () => {
      const sessionState = {
        current_session: {
          started_at: new Date().toISOString(),
        },
      };
      fs.writeFileSync(
        path.join(testDir, 'docs', '09-agents', 'session-state.json'),
        JSON.stringify(sessionState, null, 2)
      );

      spawnSync('node', [scriptPath, 'mentor'], {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 10000,
      });

      const updated = JSON.parse(
        fs.readFileSync(path.join(testDir, 'docs', '09-agents', 'session-state.json'), 'utf8')
      );

      // Uses active_commands array (not legacy active_command object)
      expect(updated.active_commands).toBeDefined();
      expect(Array.isArray(updated.active_commands)).toBe(true);
      expect(updated.active_commands.some(c => c.name === 'mentor')).toBe(true);
    });
  });

  describe('research notes handling', () => {
    test('lists research notes when present', () => {
      fs.writeFileSync(
        path.join(testDir, 'docs', '10-research', '20251225-test-research.md'),
        '# Test Research\n\nSome content here.'
      );

      const result = spawnSync('node', [scriptPath], {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 10000,
      });

      expect(result.stdout).toContain('Research Notes');
      expect(result.stdout).toContain('20251225-test-research.md');
    });

    test('shows full content of most recent research note', () => {
      fs.writeFileSync(
        path.join(testDir, 'docs', '10-research', '20251225-important.md'),
        '# Important Research\n\nKey finding: Tests are good!'
      );

      const result = spawnSync('node', [scriptPath], {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 10000,
      });

      expect(result.stdout).toContain('Most Recent');
      expect(result.stdout).toContain('Key finding');
    });
  });

  describe('documentation structure', () => {
    test('lists documentation folders', () => {
      // Create some doc folders with content
      fs.writeFileSync(path.join(testDir, 'docs', '02-practices', 'testing.md'), '# Testing');
      fs.writeFileSync(path.join(testDir, 'docs', '04-architecture', 'overview.md'), '# Overview');

      const result = spawnSync('node', [scriptPath], {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 10000,
      });

      expect(result.stdout).toContain('Documentation');
      expect(result.stdout).toContain('02-practices');
      expect(result.stdout).toContain('04-architecture');
    });
  });

  describe('key files handling', () => {
    test('shows CLAUDE.md when present', () => {
      fs.writeFileSync(
        path.join(testDir, 'CLAUDE.md'),
        '# Project Instructions\n\nBuild instructions here.'
      );

      const result = spawnSync('node', [scriptPath], {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 10000,
      });

      expect(result.stdout).toContain('CLAUDE.md');
      expect(result.stdout).toContain('Project Instructions');
    });

    test('shows README.md when present', () => {
      fs.writeFileSync(path.join(testDir, 'README.md'), '# My Project\n\nProject description.');

      const result = spawnSync('node', [scriptPath], {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 10000,
      });

      expect(result.stdout).toContain('README.md');
      expect(result.stdout).toContain('My Project');
    });

    test('indicates missing key files', () => {
      const result = spawnSync('node', [scriptPath], {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 10000,
      });

      // Should indicate files are not found (without crashing)
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('not found');
    });
  });

  describe('bus messages handling', () => {
    test('shows recent agent messages', () => {
      const messages = [
        JSON.stringify({
          timestamp: new Date().toISOString(),
          from: 'AG-API',
          type: 'status',
          message: 'Working on endpoint',
        }),
        JSON.stringify({
          timestamp: new Date().toISOString(),
          from: 'AG-UI',
          type: 'complete',
          message: 'Component done',
        }),
      ].join('\n');

      fs.writeFileSync(path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl'), messages);

      const result = spawnSync('node', [scriptPath], {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 10000,
      });

      expect(result.stdout).toContain('Agent Messages');
      expect(result.stdout).toContain('AG-API');
    });
  });

  describe('summary output', () => {
    test('includes summary table', () => {
      const result = spawnSync('node', [scriptPath], {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 10000,
      });

      // Summary should have status counts
      expect(result.stdout).toMatch(/In Progress.*\d/);
      expect(result.stdout).toMatch(/Completed.*\d/);
    });

    test('includes key file check indicators', () => {
      const result = spawnSync('node', [scriptPath], {
        cwd: testDir,
        encoding: 'utf8',
        timeout: 10000,
      });

      expect(result.stdout).toContain('Key files');
    });
  });
});
