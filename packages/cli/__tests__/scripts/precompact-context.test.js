/**
 * Tests for precompact-context.sh
 *
 * This script is the PreCompact hook that preserves critical context
 * when Claude Code compacts conversations. It extracts:
 * - Project status (version, branch, WIP count)
 * - Active command Compact Summaries
 * - Key files and conventions
 *
 * NOTE: Since the script reads from file system state,
 * we test using child processes with isolated test directories.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

// Create isolated test environment
let testDir;
let originalCwd;
const scriptPath = path.resolve(__dirname, '../../scripts/precompact-context.sh');

// Helper to run precompact-context.sh in isolated environment
function runPrecompact(cwd) {
  const result = spawnSync('bash', [scriptPath], {
    cwd: cwd || testDir,
    encoding: 'utf8',
    timeout: 10000,
  });
  return result;
}

// Helper to create package.json with version
function createPackageJson(version) {
  fs.writeFileSync(
    path.join(testDir, 'package.json'),
    JSON.stringify({ name: 'test-project', version }, null, 2)
  );
}

// Helper to create session-state.json with active commands
function createSessionState(activeCommands = []) {
  const docsDir = path.join(testDir, 'docs', '09-agents');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(
    path.join(docsDir, 'session-state.json'),
    JSON.stringify({ active_commands: activeCommands }, null, 2)
  );
}

// Helper to create status.json with stories
function createStatusJson(stories = {}) {
  const docsDir = path.join(testDir, 'docs', '09-agents');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'status.json'), JSON.stringify({ stories }, null, 2));
}

// Helper to create a command file with Compact Summary
function createCommand(name, compactSummary) {
  const commandDir = path.join(testDir, 'packages', 'cli', 'src', 'core', 'commands');
  fs.mkdirSync(commandDir, { recursive: true });

  const content = `# /agileflow:${name}

Some documentation here.

<!-- COMPACT_SUMMARY_START -->
${compactSummary}
<!-- COMPACT_SUMMARY_END -->

More content below.
`;

  fs.writeFileSync(path.join(commandDir, `${name}.md`), content);
}

// Helper to create CLAUDE.md with conventions
function createClaudeMd(content) {
  fs.writeFileSync(path.join(testDir, 'CLAUDE.md'), content);
}

beforeEach(() => {
  // Create temp directory for each test
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agileflow-precompact-test-'));

  // Initialize as git repo
  spawnSync('git', ['init'], { cwd: testDir });
  spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: testDir });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: testDir });

  // Create initial commit so we have a branch
  fs.writeFileSync(path.join(testDir, 'README.md'), '# Test');
  spawnSync('git', ['add', '.'], { cwd: testDir });
  spawnSync('git', ['commit', '-m', 'Initial'], { cwd: testDir });

  // Create basic package.json
  createPackageJson('1.0.0');

  // Save original cwd
  originalCwd = process.cwd();
});

afterEach(() => {
  // Restore original cwd
  process.chdir(originalCwd);

  // Clean up temp directory
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('precompact-context.sh', () => {
  describe('basic output', () => {
    test('outputs project context header', () => {
      const result = runPrecompact();

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('AGILEFLOW PROJECT CONTEXT');
      expect(result.stdout).toContain('preserve during compact');
    });

    test('includes project version from package.json', () => {
      createPackageJson('2.45.0');
      const result = runPrecompact();

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('AgileFlow v2.45.0');
    });

    test('includes current git branch', () => {
      // We're on main/master by default
      const result = runPrecompact();

      expect(result.status).toBe(0);
      // The branch could be 'main' or 'master' depending on git version
      expect(result.stdout).toMatch(/Branch: (main|master)/);
    });

    test('includes post-compact actions section', () => {
      const result = runPrecompact();

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Post-Compact Actions');
      expect(result.stdout).toContain('Re-read CLAUDE.md');
      expect(result.stdout).toContain('Check status.json');
    });
  });

  describe('story tracking', () => {
    test('shows in-progress stories', () => {
      createStatusJson({
        'US-0001': { title: 'Test Story One', status: 'in_progress' },
        'US-0002': { title: 'Test Story Two', status: 'done' },
      });

      const result = runPrecompact();

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('US-0001: Test Story One');
      expect(result.stdout).not.toContain('US-0002: Test Story Two');
    });

    test('shows WIP count', () => {
      createStatusJson({
        'US-0001': { title: 'Story 1', status: 'in_progress' },
        'US-0002': { title: 'Story 2', status: 'in_progress' },
        'US-0003': { title: 'Story 3', status: 'done' },
      });

      const result = runPrecompact();

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('WIP Count: 2');
    });

    test('handles no stories gracefully', () => {
      createStatusJson({});

      const result = runPrecompact();

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('None in progress');
      expect(result.stdout).toContain('WIP Count: 0');
    });
  });

  describe('active command extraction', () => {
    test('extracts Compact Summary from active command', () => {
      createCommand(
        'babysit',
        `## BABYSIT RULES

**Rule 1**: Always use AskUserQuestion
**Rule 2**: Delegate to experts`
      );

      createSessionState([{ name: 'babysit', activated_at: new Date().toISOString(), state: {} }]);

      const result = runPrecompact();

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('ACTIVE COMMAND: /agileflow:babysit');
      expect(result.stdout).toContain('## BABYSIT RULES');
      expect(result.stdout).toContain('Always use AskUserQuestion');
      expect(result.stdout).toContain('Delegate to experts');
    });

    test('handles multiple active commands', () => {
      createCommand('babysit', '**Babysit Summary**: Coordinate work');
      createCommand('epic', '**Epic Summary**: Plan features');

      createSessionState([
        { name: 'babysit', activated_at: new Date().toISOString(), state: {} },
        { name: 'epic', activated_at: new Date().toISOString(), state: {} },
      ]);

      const result = runPrecompact();

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('ACTIVE COMMAND: /agileflow:babysit');
      expect(result.stdout).toContain('Babysit Summary');
      expect(result.stdout).toContain('ACTIVE COMMAND: /agileflow:epic');
      expect(result.stdout).toContain('Epic Summary');
    });

    test('handles no active commands gracefully', () => {
      createSessionState([]);

      const result = runPrecompact();

      expect(result.status).toBe(0);
      // Should not contain any active command sections
      expect(result.stdout).not.toContain('ACTIVE COMMAND');
    });

    test('handles missing session-state.json gracefully', () => {
      // Don't create session-state.json
      const result = runPrecompact();

      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('ACTIVE COMMAND');
    });

    test('skips commands without Compact Summary markers', () => {
      // Create command without markers
      const commandDir = path.join(testDir, 'packages', 'cli', 'src', 'core', 'commands');
      fs.mkdirSync(commandDir, { recursive: true });
      fs.writeFileSync(
        path.join(commandDir, 'simple.md'),
        '# Simple Command\n\nNo compact summary here.'
      );

      createSessionState([{ name: 'simple', activated_at: new Date().toISOString(), state: {} }]);

      const result = runPrecompact();

      expect(result.status).toBe(0);
      // Should not include this command since no markers
      expect(result.stdout).not.toContain('ACTIVE COMMAND: /agileflow:simple');
    });

    test('finds commands in .agileflow/commands fallback location', () => {
      // Create command in installed location instead of source
      const commandDir = path.join(testDir, '.agileflow', 'commands');
      fs.mkdirSync(commandDir, { recursive: true });

      const content = `# Test Command

<!-- COMPACT_SUMMARY_START -->
**Installed Command Summary**: This works too
<!-- COMPACT_SUMMARY_END -->
`;
      fs.writeFileSync(path.join(commandDir, 'installed.md'), content);

      createSessionState([
        { name: 'installed', activated_at: new Date().toISOString(), state: {} },
      ]);

      const result = runPrecompact();

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('ACTIVE COMMAND: /agileflow:installed');
      expect(result.stdout).toContain('Installed Command Summary');
    });
  });

  describe('key files section', () => {
    test('lists key files to check', () => {
      const result = runPrecompact();

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('CLAUDE.md');
      expect(result.stdout).toContain('README.md');
      expect(result.stdout).toContain('status.json');
    });

    test('lists practices when directory exists', () => {
      const practicesDir = path.join(testDir, 'docs', '02-practices');
      fs.mkdirSync(practicesDir, { recursive: true });
      fs.writeFileSync(path.join(practicesDir, 'testing.md'), '# Testing');
      fs.writeFileSync(path.join(practicesDir, 'code-review.md'), '# Code Review');

      const result = runPrecompact();

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('testing');
      expect(result.stdout).toContain('code-review');
    });
  });

  describe('conventions extraction', () => {
    test('extracts key conventions from CLAUDE.md', () => {
      createClaudeMd(`# Project Guide

## Critical Rules

1. Always use TypeScript
2. Never commit secrets
3. Run tests before PR

## Other stuff
Some other content here.
`);

      const result = runPrecompact();

      expect(result.status).toBe(0);
      // Should extract content after "Critical" heading
      expect(result.stdout).toContain('Always use TypeScript');
    });

    test('handles missing CLAUDE.md gracefully', () => {
      // Don't create CLAUDE.md
      const result = runPrecompact();

      expect(result.status).toBe(0);
      // Script succeeds with empty conventions section (grep silently fails)
      expect(result.stdout).toContain('Key Conventions (from CLAUDE.md)');
    });
  });

  describe('error handling', () => {
    test('succeeds even with minimal setup', () => {
      // Just package.json exists (created in beforeEach)
      const result = runPrecompact();

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('AGILEFLOW PROJECT CONTEXT');
    });

    test('handles invalid JSON in session-state.json', () => {
      const docsDir = path.join(testDir, 'docs', '09-agents');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'session-state.json'), 'not valid json');

      const result = runPrecompact();

      // Should not crash
      expect(result.status).toBe(0);
    });

    test('handles invalid JSON in status.json', () => {
      const docsDir = path.join(testDir, 'docs', '09-agents');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'status.json'), '{broken');

      const result = runPrecompact();

      // Should not crash
      expect(result.status).toBe(0);
    });
  });
});
