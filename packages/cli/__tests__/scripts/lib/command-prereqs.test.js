/**
 * Tests for command-prereqs.js - Command prerequisite checking system
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  loadPrereqConfig,
  checkCommandPrereqs,
  formatPrereqWarnings,
  clearPrereqCache,
  CONFIG_PATHS,
  SEVERITY,
} = require('../../../scripts/lib/command-prereqs');

// =============================================================================
// Test Helpers
// =============================================================================

let tmpDir;

beforeEach(() => {
  clearPrereqCache();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prereqs-test-'));
});

afterEach(() => {
  clearPrereqCache();
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

function writeConfig(dir, content) {
  const configDir = path.join(dir, '.agileflow', 'templates');
  fs.mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, 'command-prerequisites.yaml');
  fs.writeFileSync(configPath, content, 'utf8');
  return configPath;
}

const VALID_YAML = `
version: "1.0.0"
settings:
  fail_open: true
  max_warnings: 3
commands:
  deploy:
    prerequisites:
      - signal: git.branch
        description: "Git repository must be initialized"
        fix: "Run: git init"
        severity: critical
      - signal: packageJson
        description: "package.json must exist"
        fix: "Run: npm init -y"
        severity: critical
  babysit:
    prerequisites:
      - signal: statusJson
        description: "status.json must exist"
        fix: "Create stories first"
        severity: critical
  review:
    prerequisites:
      - signal: git.onFeatureBranch
        description: "Must be on a feature branch"
        fix: "Create a feature branch"
        severity: critical
      - signal: git.filesChanged
        description: "Changed files needed"
        fix: "Make some changes"
        severity: high
      - signal: tests.hasTestSetup
        description: "Tests should exist"
        fix: "Add tests"
        severity: medium
`;

// =============================================================================
// loadPrereqConfig
// =============================================================================

describe('loadPrereqConfig', () => {
  it('should return default config when no file exists', () => {
    const config = loadPrereqConfig(tmpDir);
    expect(config).toEqual({
      commands: {},
      settings: { fail_open: true, max_warnings: 5 },
    });
  });

  it('should load valid YAML config', () => {
    writeConfig(tmpDir, VALID_YAML);
    const config = loadPrereqConfig(tmpDir);

    expect(config.commands).toBeDefined();
    expect(config.commands.deploy).toBeDefined();
    expect(config.commands.deploy.prerequisites).toHaveLength(2);
    expect(config.commands.deploy.prerequisites[0].signal).toBe('git.branch');
    expect(config.settings.max_warnings).toBe(3);
  });

  it('should return default config for malformed YAML', () => {
    const configDir = path.join(tmpDir, '.agileflow', 'templates');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'command-prerequisites.yaml'),
      '{{{{not yaml at all!!!',
      'utf8'
    );

    const config = loadPrereqConfig(tmpDir);
    expect(config).toEqual({
      commands: {},
      settings: { fail_open: true, max_warnings: 5 },
    });
  });

  it('should cache config based on mtime', () => {
    const configPath = writeConfig(tmpDir, VALID_YAML);

    const config1 = loadPrereqConfig(tmpDir);
    const config2 = loadPrereqConfig(tmpDir);

    // Same reference means cache was used
    expect(config1).toBe(config2);
  });

  it('should invalidate cache when file changes', () => {
    writeConfig(tmpDir, VALID_YAML);
    const config1 = loadPrereqConfig(tmpDir);

    // Modify file (need to ensure mtime changes)
    const updatedYaml = VALID_YAML.replace('max_warnings: 3', 'max_warnings: 10');
    const configDir = path.join(tmpDir, '.agileflow', 'templates');
    const configPath = path.join(configDir, 'command-prerequisites.yaml');

    // Force mtime change by waiting a bit and rewriting
    const origMtime = fs.statSync(configPath).mtimeMs;
    fs.writeFileSync(configPath, updatedYaml, 'utf8');

    // Manually set future mtime to guarantee difference
    const futureTime = origMtime + 2000;
    fs.utimesSync(configPath, futureTime / 1000, futureTime / 1000);

    const config2 = loadPrereqConfig(tmpDir);
    expect(config2.settings.max_warnings).toBe(10);
    expect(config2).not.toBe(config1);
  });

  it('should handle empty YAML file gracefully', () => {
    const configDir = path.join(tmpDir, '.agileflow', 'templates');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'command-prerequisites.yaml'), '', 'utf8');

    const config = loadPrereqConfig(tmpDir);
    // Empty YAML returns null from safeLoad, so falls through to default
    expect(config.commands).toBeDefined();
  });

  it('should merge settings with defaults', () => {
    const yamlWithPartialSettings = `
commands:
  deploy:
    prerequisites:
      - signal: git.branch
        description: "Need git"
        fix: "git init"
        severity: critical
settings:
  max_warnings: 10
`;
    writeConfig(tmpDir, yamlWithPartialSettings);
    const config = loadPrereqConfig(tmpDir);

    expect(config.settings.fail_open).toBe(true); // default preserved
    expect(config.settings.max_warnings).toBe(10); // override applied
  });
});

// =============================================================================
// checkCommandPrereqs
// =============================================================================

describe('checkCommandPrereqs', () => {
  let config;

  beforeEach(() => {
    writeConfig(tmpDir, VALID_YAML);
    config = loadPrereqConfig(tmpDir);
  });

  it('should return hasPrereqs=false for unknown commands', () => {
    const result = checkCommandPrereqs('nonexistent', {}, config);
    expect(result.command).toBe('nonexistent');
    expect(result.hasPrereqs).toBe(false);
    expect(result.allMet).toBe(true);
    expect(result.results).toHaveLength(0);
  });

  it('should return allMet=true when all signals are present', () => {
    const signals = {
      git: { branch: 'main' },
      packageJson: { name: 'test' },
    };
    const result = checkCommandPrereqs('deploy', signals, config);

    expect(result.hasPrereqs).toBe(true);
    expect(result.allMet).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.unmet).toHaveLength(0);
    expect(result.criticalUnmet).toBe(0);
  });

  it('should detect unmet prerequisites', () => {
    const signals = {
      git: { branch: 'main' },
      // packageJson is missing
    };
    const result = checkCommandPrereqs('deploy', signals, config);

    expect(result.allMet).toBe(false);
    expect(result.unmet).toHaveLength(1);
    expect(result.unmet[0].signal).toBe('packageJson');
    expect(result.unmet[0].severity).toBe('critical');
    expect(result.criticalUnmet).toBe(1);
  });

  it('should detect all unmet prerequisites', () => {
    const signals = {};
    const result = checkCommandPrereqs('deploy', signals, config);

    expect(result.allMet).toBe(false);
    expect(result.unmet).toHaveLength(2);
    expect(result.criticalUnmet).toBe(2);
  });

  it('should handle nested signal paths', () => {
    const signals = {
      git: { onFeatureBranch: true, filesChanged: ['a.js'] },
      tests: { hasTestSetup: true },
    };
    const result = checkCommandPrereqs('review', signals, config);

    expect(result.allMet).toBe(true);
    expect(result.results).toHaveLength(3);
  });

  it('should count severity levels correctly', () => {
    const signals = {}; // all unmet
    const result = checkCommandPrereqs('review', signals, config);

    expect(result.criticalUnmet).toBe(1); // git.onFeatureBranch
    expect(result.highUnmet).toBe(1); // git.filesChanged
    // medium: tests.hasTestSetup (not counted in criticalUnmet or highUnmet)
    expect(result.unmet).toHaveLength(3);
  });

  it('should handle null/undefined signals gracefully', () => {
    const result = checkCommandPrereqs('deploy', null, config);
    expect(result.allMet).toBe(false);
    expect(result.unmet).toHaveLength(2);
  });

  it('should handle null config gracefully', () => {
    const result = checkCommandPrereqs('deploy', {}, null);
    expect(result.hasPrereqs).toBe(false);
    expect(result.allMet).toBe(true);
  });

  it('should handle null commandName gracefully', () => {
    const result = checkCommandPrereqs(null, {}, config);
    expect(result.hasPrereqs).toBe(false);
  });

  it('should handle commands with no prerequisites array', () => {
    const configWithEmpty = {
      commands: { empty: {} },
      settings: { fail_open: true, max_warnings: 5 },
    };
    const result = checkCommandPrereqs('empty', {}, configWithEmpty);
    expect(result.hasPrereqs).toBe(false);
    expect(result.allMet).toBe(true);
  });

  it('should treat falsy signal values as unmet', () => {
    const signals = {
      git: { branch: '' }, // empty string is falsy
      packageJson: null,
    };
    const result = checkCommandPrereqs('deploy', signals, config);
    expect(result.allMet).toBe(false);
    expect(result.unmet).toHaveLength(2);
  });

  it('should treat empty arrays as unmet (no files changed = unmet)', () => {
    const signals = {
      git: { onFeatureBranch: true, filesChanged: [] },
      tests: { hasTestSetup: false },
    };
    const result = checkCommandPrereqs('review', signals, config);

    // onFeatureBranch=true -> met
    // filesChanged=[] -> unmet (empty array means no changes)
    // hasTestSetup=false -> unmet
    const metSignals = result.results.filter(r => r.met).map(r => r.signal);
    const unmetSignals = result.results.filter(r => !r.met).map(r => r.signal);

    expect(metSignals).toContain('git.onFeatureBranch');
    expect(unmetSignals).toContain('git.filesChanged');
    expect(unmetSignals).toContain('tests.hasTestSetup');
  });

  it('should treat non-empty arrays as met', () => {
    const signals = {
      git: { onFeatureBranch: true, filesChanged: ['a.js', 'b.js'] },
      tests: { hasTestSetup: true },
    };
    const result = checkCommandPrereqs('review', signals, config);

    expect(result.allMet).toBe(true);
  });
});

// =============================================================================
// formatPrereqWarnings
// =============================================================================

describe('formatPrereqWarnings', () => {
  it('should return empty string when all met', () => {
    const result = {
      command: 'deploy',
      allMet: true,
      unmet: [],
      criticalUnmet: 0,
    };
    expect(formatPrereqWarnings(result)).toBe('');
  });

  it('should return empty string for null input', () => {
    expect(formatPrereqWarnings(null)).toBe('');
  });

  it('should show critical warnings', () => {
    const result = {
      command: 'deploy',
      allMet: false,
      unmet: [
        {
          signal: 'git.branch',
          description: 'Git repo needed',
          fix: 'Run: git init',
          severity: 'critical',
        },
      ],
      criticalUnmet: 1,
    };

    const output = formatPrereqWarnings(result);
    expect(output).toContain('deploy');
    expect(output).toContain('CRITICAL');
    expect(output).toContain('Git repo needed');
    expect(output).toContain('git init');
    expect(output).toContain('critical prerequisite');
  });

  it('should show non-critical warnings differently', () => {
    const result = {
      command: 'review',
      allMet: false,
      unmet: [
        {
          signal: 'tests.hasTestSetup',
          description: 'Tests should exist',
          fix: 'Add tests',
          severity: 'medium',
        },
      ],
      criticalUnmet: 0,
    };

    const output = formatPrereqWarnings(result);
    expect(output).toContain('suboptimal');
    expect(output).not.toContain('critical prerequisite');
  });

  it('should respect max_warnings setting', () => {
    const result = {
      command: 'test',
      allMet: false,
      unmet: [
        { signal: 'a', description: 'A', fix: 'fix a', severity: 'high' },
        { signal: 'b', description: 'B', fix: 'fix b', severity: 'high' },
        { signal: 'c', description: 'C', fix: 'fix c', severity: 'medium' },
        { signal: 'd', description: 'D', fix: 'fix d', severity: 'medium' },
        { signal: 'e', description: 'E', fix: 'fix e', severity: 'medium' },
      ],
      criticalUnmet: 0,
    };

    const output = formatPrereqWarnings(result, { max_warnings: 2 });
    expect(output).toContain('A');
    expect(output).toContain('B');
    expect(output).not.toContain('fix c'); // beyond limit
    expect(output).toContain('3 more');
  });

  it('should show fix instructions', () => {
    const result = {
      command: 'deploy',
      allMet: false,
      unmet: [
        {
          signal: 'git.branch',
          description: 'Git needed',
          fix: 'Run: git init',
          severity: 'critical',
        },
      ],
      criticalUnmet: 1,
    };

    const output = formatPrereqWarnings(result);
    expect(output).toContain('Fix: Run: git init');
  });

  it('should handle entries without fix instruction', () => {
    const result = {
      command: 'test',
      allMet: false,
      unmet: [
        {
          signal: 'something',
          description: 'Need something',
          fix: '',
          severity: 'high',
        },
      ],
      criticalUnmet: 0,
    };

    const output = formatPrereqWarnings(result);
    expect(output).toContain('Need something');
    // Should not contain "Fix:" line for empty fix
    expect(output).not.toContain('Fix: \x1b');
  });
});

// =============================================================================
// Integration: Real YAML config
// =============================================================================

describe('integration with real YAML', () => {
  const realYamlPath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'src',
    'core',
    'templates',
    'command-prerequisites.yaml'
  );

  it('should load the real command-prerequisites.yaml', () => {
    // Read the real YAML and write it to our temp dir
    if (!fs.existsSync(realYamlPath)) {
      // Skip if real YAML doesn't exist yet (e.g., during initial dev)
      return;
    }

    const content = fs.readFileSync(realYamlPath, 'utf8');
    writeConfig(tmpDir, content);

    const config = loadPrereqConfig(tmpDir);
    expect(Object.keys(config.commands).length).toBeGreaterThanOrEqual(10);
    expect(config.settings.fail_open).toBe(true);
  });

  it('should validate all prereqs in real config have required fields', () => {
    if (!fs.existsSync(realYamlPath)) return;

    const content = fs.readFileSync(realYamlPath, 'utf8');
    writeConfig(tmpDir, content);

    const config = loadPrereqConfig(tmpDir);

    for (const [cmdName, cmdConfig] of Object.entries(config.commands)) {
      if (!cmdConfig.prerequisites) continue;

      for (const prereq of cmdConfig.prerequisites) {
        expect(prereq.signal).toBeDefined();
        expect(typeof prereq.signal).toBe('string');
        expect(prereq.description).toBeDefined();
        expect(typeof prereq.description).toBe('string');
        expect(prereq.severity).toBeDefined();
        expect(['critical', 'high', 'medium']).toContain(prereq.severity);
      }
    }
  });

  it('should check deploy prereqs with realistic signals', () => {
    if (!fs.existsSync(realYamlPath)) return;

    const content = fs.readFileSync(realYamlPath, 'utf8');
    writeConfig(tmpDir, content);

    const config = loadPrereqConfig(tmpDir);
    const signals = {
      git: { branch: 'main', onFeatureBranch: false, isClean: true },
      packageJson: { name: 'my-app', version: '1.0.0' },
      statusJson: null,
      storyCount: 0,
    };

    const deployResult = checkCommandPrereqs('deploy', signals, config);
    expect(deployResult.allMet).toBe(true);

    const babysitResult = checkCommandPrereqs('babysit', signals, config);
    expect(babysitResult.allMet).toBe(false);
    expect(babysitResult.criticalUnmet).toBeGreaterThan(0);
  });
});

// =============================================================================
// Module exports
// =============================================================================

describe('module exports', () => {
  it('should export CONFIG_PATHS', () => {
    expect(Array.isArray(CONFIG_PATHS)).toBe(true);
    expect(CONFIG_PATHS.length).toBeGreaterThan(0);
  });

  it('should export SEVERITY config', () => {
    expect(SEVERITY.critical).toBeDefined();
    expect(SEVERITY.high).toBeDefined();
    expect(SEVERITY.medium).toBeDefined();
  });

  it('should export clearPrereqCache function', () => {
    expect(typeof clearPrereqCache).toBe('function');
  });
});
