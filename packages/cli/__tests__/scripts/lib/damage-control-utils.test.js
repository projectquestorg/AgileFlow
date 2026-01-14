/**
 * Tests for damage-control-utils.js
 *
 * Tests cover:
 * - loadPatterns() YAML loading and parsing
 * - pathMatches() glob and pattern matching
 * - parseSimpleYAML() YAML parsing
 * - parseBashPatterns() bash pattern parsing
 * - parsePathPatterns() path pattern parsing
 * - validatePathAgainstPatterns() path validation
 * - expandPath() tilde expansion
 * - findProjectRoot() project root detection
 * - Fail-safe behavior (exit 0 on errors)
 */

const path = require('path');
const os = require('os');

// Module under test
const {
  findProjectRoot,
  expandPath,
  loadPatterns,
  pathMatches,
  parseSimpleYAML,
  parseBashPatterns,
  parsePathPatterns,
  validatePathAgainstPatterns,
  CONFIG_PATHS,
  STDIN_TIMEOUT_MS,
} = require('../../../scripts/lib/damage-control-utils');

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

const fs = require('fs');

describe('damage-control-utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('expandPath', () => {
    it('expands ~ to home directory', () => {
      const result = expandPath('~/.ssh/id_rsa');
      expect(result).toBe(path.join(os.homedir(), '.ssh/id_rsa'));
    });

    it('does not modify paths without ~', () => {
      const result = expandPath('/etc/passwd');
      expect(result).toBe('/etc/passwd');
    });

    it('handles ~/ at start only', () => {
      const result = expandPath('/home/user/~/.ssh');
      expect(result).toBe('/home/user/~/.ssh');
    });

    it('handles relative paths', () => {
      const result = expandPath('foo/bar');
      expect(result).toBe('foo/bar');
    });
  });

  describe('findProjectRoot', () => {
    it('returns cwd when .agileflow exists', () => {
      fs.existsSync.mockImplementation(p => p.endsWith('.agileflow'));
      const result = findProjectRoot();
      expect(result).toBe(process.cwd());
    });

    it('returns cwd when no .agileflow found', () => {
      fs.existsSync.mockReturnValue(false);
      const result = findProjectRoot();
      expect(result).toBe(process.cwd());
    });
  });

  describe('loadPatterns', () => {
    const mockParser = content => ({ parsed: content });

    it('loads patterns from first existing config path', () => {
      fs.existsSync.mockImplementation(p =>
        p.endsWith('damage-control-patterns.yaml')
      );
      fs.readFileSync.mockReturnValue('test: content');

      const result = loadPatterns('/project', mockParser);
      expect(result).toEqual({ parsed: 'test: content' });
    });

    it('tries all config paths in order', () => {
      fs.existsSync.mockReturnValue(false);
      const result = loadPatterns('/project', mockParser, { default: true });

      expect(fs.existsSync).toHaveBeenCalledTimes(CONFIG_PATHS.length);
      expect(result).toEqual({ default: true });
    });

    it('returns default config when no file found', () => {
      fs.existsSync.mockReturnValue(false);
      const defaultConfig = { bashToolPatterns: [], askPatterns: [] };
      const result = loadPatterns('/project', mockParser, defaultConfig);
      expect(result).toEqual(defaultConfig);
    });

    it('returns empty config when no file and no default', () => {
      fs.existsSync.mockReturnValue(false);
      const result = loadPatterns('/project', mockParser);
      expect(result).toEqual({});
    });

    it('continues to next path on read error', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync
        .mockImplementationOnce(() => {
          throw new Error('EACCES');
        })
        .mockReturnValueOnce('valid: content');

      const result = loadPatterns('/project', mockParser, { default: true });
      // Should try next path after first failure
      expect(fs.readFileSync).toHaveBeenCalled();
    });

    it('continues to next path on parse error', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('malformed yaml');

      const brokenParser = () => {
        throw new Error('YAML parse error');
      };
      const result = loadPatterns('/project', brokenParser, { default: true });
      expect(result).toEqual({ default: true });
    });

    it('handles corrupted YAML gracefully (fail-open)', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{{invalid yaml}}');

      const throwingParser = () => {
        throw new SyntaxError('Invalid YAML');
      };
      const result = loadPatterns('/project', throwingParser, {});
      expect(result).toEqual({});
    });
  });

  describe('pathMatches', () => {
    it('returns null for null filePath', () => {
      expect(pathMatches(null, ['/etc/passwd'])).toBeNull();
    });

    it('returns null for undefined filePath', () => {
      expect(pathMatches(undefined, ['/etc/passwd'])).toBeNull();
    });

    it('returns null for empty string filePath', () => {
      expect(pathMatches('', ['/etc/passwd'])).toBeNull();
    });

    it('returns null when no patterns match', () => {
      expect(pathMatches('/home/user/safe.txt', ['/etc/passwd'])).toBeNull();
    });

    it('matches exact paths', () => {
      const patterns = ['/etc/passwd'];
      expect(pathMatches('/etc/passwd', patterns)).toBe('/etc/passwd');
    });

    it('matches directory prefixes', () => {
      const patterns = ['~/.ssh/'];
      const expanded = path.join(os.homedir(), '.ssh/id_rsa');
      const result = pathMatches(expanded, patterns);
      expect(result).toBe('~/.ssh/');
    });

    it('matches file extension patterns with *', () => {
      const patterns = ['*.pem'];
      expect(pathMatches('/home/user/key.pem', patterns)).toBe('*.pem');
    });

    it('matches filename patterns at end of path', () => {
      const patterns = ['id_rsa'];
      expect(pathMatches('/home/user/.ssh/id_rsa', patterns)).toBe('id_rsa');
    });

    it('matches basename patterns', () => {
      const patterns = ['.env.production'];
      expect(pathMatches('/app/config/.env.production', patterns)).toBe(
        '.env.production'
      );
    });

    it('expands ~ in patterns', () => {
      const homeFile = path.join(os.homedir(), '.bashrc');
      const patterns = ['~/.bashrc'];
      expect(pathMatches(homeFile, patterns)).toBe('~/.bashrc');
    });

    it('handles relative paths', () => {
      const cwd = process.cwd();
      const patterns = ['secrets.json'];
      expect(pathMatches(path.join(cwd, 'secrets.json'), patterns)).toBe(
        'secrets.json'
      );
    });

    it('returns first matching pattern', () => {
      const patterns = ['*.key', '*.pem', 'id_rsa'];
      expect(pathMatches('/home/user/.ssh/id_rsa', patterns)).toBe('id_rsa');
    });

    it('handles directory patterns without trailing slash', () => {
      const patterns = ['/etc'];
      expect(pathMatches('/etc/passwd', patterns)).toBeNull();
      expect(pathMatches('/etc', patterns)).toBe('/etc');
    });

    it('handles Windows-style paths', () => {
      // Normalizes paths consistently
      const patterns = ['secrets.txt'];
      expect(pathMatches('/home/user/secrets.txt', patterns)).toBe('secrets.txt');
    });

    it('matches .env files with various suffixes', () => {
      const patterns = ['.env', '.env.local', '.env.production'];
      expect(pathMatches('/app/.env', patterns)).toBe('.env');
      expect(pathMatches('/app/.env.local', patterns)).toBe('.env.local');
      expect(pathMatches('/app/.env.production', patterns)).toBe('.env.production');
    });

    it('matches basename patterns for nested paths', () => {
      const patterns = ['credentials.json'];
      expect(pathMatches('/home/user/.config/gcloud/credentials.json', patterns)).toBe('credentials.json');
    });

    it('matches patterns via basename when other checks fail', () => {
      // Test the basename matching fallback (line 128)
      const patterns = ['config.yaml'];
      // path.basename('/app/config.yaml') === 'config.yaml'
      expect(pathMatches('/app/config.yaml', patterns)).toBe('config.yaml');
    });
  });

  describe('parseSimpleYAML', () => {
    it('parses pattern-based sections', () => {
      const content = `
bashToolPatterns:
  - pattern: "rm -rf"
    reason: "Dangerous delete"
    flags: "i"
  - pattern: "DROP TABLE"
    reason: "SQL injection risk"
`;
      const config = { bashToolPatterns: 'patterns' };
      const result = parseSimpleYAML(content, config);

      expect(result.bashToolPatterns).toHaveLength(2);
      expect(result.bashToolPatterns[0]).toEqual({
        pattern: 'rm -rf',
        reason: 'Dangerous delete',
        flags: 'i',
      });
      expect(result.bashToolPatterns[1]).toEqual({
        pattern: 'DROP TABLE',
        reason: 'SQL injection risk',
      });
    });

    it('parses list-based sections', () => {
      const content = `
zeroAccessPaths:
  - ~/.ssh/
  - /etc/passwd
  - "*.pem"
`;
      const config = { zeroAccessPaths: 'list' };
      const result = parseSimpleYAML(content, config);

      expect(result.zeroAccessPaths).toHaveLength(3);
      expect(result.zeroAccessPaths).toEqual(['~/.ssh/', '/etc/passwd', '*.pem']);
    });

    it('ignores unknown sections', () => {
      const content = `
unknownSection:
  - foo
  - bar
zeroAccessPaths:
  - /etc/passwd
`;
      const config = { zeroAccessPaths: 'list' };
      const result = parseSimpleYAML(content, config);

      expect(result.zeroAccessPaths).toHaveLength(1);
      expect(result).not.toHaveProperty('unknownSection');
    });

    it('skips comment lines', () => {
      const content = `
# This is a comment
zeroAccessPaths:
  # Another comment
  - /etc/passwd
  - /etc/shadow
`;
      const config = { zeroAccessPaths: 'list' };
      const result = parseSimpleYAML(content, config);

      expect(result.zeroAccessPaths).toHaveLength(2);
    });

    it('skips empty lines', () => {
      const content = `
zeroAccessPaths:

  - /etc/passwd

  - /etc/shadow

`;
      const config = { zeroAccessPaths: 'list' };
      const result = parseSimpleYAML(content, config);

      expect(result.zeroAccessPaths).toHaveLength(2);
    });

    it('strips quotes from values', () => {
      const content = `
zeroAccessPaths:
  - "/etc/passwd"
  - '/etc/shadow'
`;
      const config = { zeroAccessPaths: 'list' };
      const result = parseSimpleYAML(content, config);

      expect(result.zeroAccessPaths).toEqual(['/etc/passwd', '/etc/shadow']);
    });

    it('handles mixed sections', () => {
      const content = `
bashToolPatterns:
  - pattern: "rm -rf"
    reason: "Dangerous"
zeroAccessPaths:
  - ~/.ssh/
askPatterns:
  - pattern: "sudo"
    reason: "Requires confirmation"
`;
      const config = {
        bashToolPatterns: 'patterns',
        zeroAccessPaths: 'list',
        askPatterns: 'patterns',
      };
      const result = parseSimpleYAML(content, config);

      expect(result.bashToolPatterns).toHaveLength(1);
      expect(result.zeroAccessPaths).toHaveLength(1);
      expect(result.askPatterns).toHaveLength(1);
    });

    it('initializes empty arrays for missing sections', () => {
      const content = `
bashToolPatterns:
  - pattern: "rm -rf"
    reason: "Dangerous"
`;
      const config = {
        bashToolPatterns: 'patterns',
        zeroAccessPaths: 'list',
        askPatterns: 'patterns',
      };
      const result = parseSimpleYAML(content, config);

      expect(result.bashToolPatterns).toHaveLength(1);
      expect(result.zeroAccessPaths).toEqual([]);
      expect(result.askPatterns).toEqual([]);
    });

    it('handles empty content', () => {
      const config = { bashToolPatterns: 'patterns' };
      const result = parseSimpleYAML('', config);
      expect(result.bashToolPatterns).toEqual([]);
    });
  });

  describe('parseBashPatterns', () => {
    it('parses bash-specific sections', () => {
      const content = `
bashToolPatterns:
  - pattern: "rm -rf /"
    reason: "Dangerous root delete"
askPatterns:
  - pattern: "sudo"
    reason: "Elevated privileges"
agileflowProtections:
  - pattern: ".agileflow/"
    reason: "Protected directory"
`;
      const result = parseBashPatterns(content);

      expect(result.bashToolPatterns).toHaveLength(1);
      expect(result.askPatterns).toHaveLength(1);
      expect(result.agileflowProtections).toHaveLength(1);
    });
  });

  describe('parsePathPatterns', () => {
    it('parses path-specific sections', () => {
      const content = `
zeroAccessPaths:
  - ~/.ssh/
  - ~/.aws/
readOnlyPaths:
  - /etc/passwd
noDeletePaths:
  - .agileflow/
`;
      const result = parsePathPatterns(content);

      expect(result.zeroAccessPaths).toHaveLength(2);
      expect(result.readOnlyPaths).toHaveLength(1);
      expect(result.noDeletePaths).toHaveLength(1);
    });
  });

  describe('validatePathAgainstPatterns', () => {
    it('blocks zero-access paths', () => {
      const config = {
        zeroAccessPaths: ['/etc/passwd'],
        readOnlyPaths: [],
        noDeletePaths: [],
      };

      const result = validatePathAgainstPatterns('/etc/passwd', config);

      expect(result.action).toBe('block');
      expect(result.reason).toContain('Zero-access');
    });

    it('blocks read-only paths', () => {
      const config = {
        zeroAccessPaths: [],
        readOnlyPaths: ['/var/log/syslog'],
        noDeletePaths: [],
      };

      const result = validatePathAgainstPatterns('/var/log/syslog', config, 'edit');

      expect(result.action).toBe('block');
      expect(result.reason).toContain('Read-only');
      expect(result.detail).toContain('edited');
    });

    it('allows paths not in any protection list', () => {
      const config = {
        zeroAccessPaths: [],
        readOnlyPaths: [],
        noDeletePaths: [],
      };

      const result = validatePathAgainstPatterns('/home/user/safe.txt', config);

      expect(result.action).toBe('allow');
    });

    it('handles missing config sections gracefully', () => {
      const config = {};

      const result = validatePathAgainstPatterns('/home/user/safe.txt', config);

      expect(result.action).toBe('allow');
    });

    it('checks zero-access before read-only', () => {
      const config = {
        zeroAccessPaths: ['/etc/passwd'],
        readOnlyPaths: ['/etc/passwd'],
        noDeletePaths: [],
      };

      const result = validatePathAgainstPatterns('/etc/passwd', config);

      expect(result.action).toBe('block');
      expect(result.reason).toContain('Zero-access');
    });

    it('uses operation type in error messages', () => {
      const config = {
        zeroAccessPaths: [],
        readOnlyPaths: ['/var/log/syslog'],
        noDeletePaths: [],
      };

      const editResult = validatePathAgainstPatterns(
        '/var/log/syslog',
        config,
        'edit'
      );
      expect(editResult.detail).toContain('edited');

      const writeResult = validatePathAgainstPatterns(
        '/var/log/syslog',
        config,
        'write'
      );
      expect(writeResult.detail).toContain('written');
    });
  });

  describe('constants', () => {
    it('exports CONFIG_PATHS array', () => {
      expect(Array.isArray(CONFIG_PATHS)).toBe(true);
      expect(CONFIG_PATHS.length).toBeGreaterThan(0);
      expect(CONFIG_PATHS[0]).toContain('damage-control-patterns');
    });

    it('exports STDIN_TIMEOUT_MS', () => {
      expect(typeof STDIN_TIMEOUT_MS).toBe('number');
      expect(STDIN_TIMEOUT_MS).toBeGreaterThan(0);
    });
  });

  describe('outputBlocked', () => {
    const { outputBlocked } = require('../../../scripts/lib/damage-control-utils');
    let consoleErrorSpy;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('outputs blocked message with reason', () => {
      outputBlocked('Test reason');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[BLOCKED]')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test reason')
      );
    });

    it('outputs detail when provided', () => {
      outputBlocked('Reason', 'Detail text');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Detail text')
      );
    });

    it('outputs context when provided', () => {
      outputBlocked('Reason', 'Detail', 'Context info');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Context info')
      );
    });

    it('outputs help message', () => {
      outputBlocked('Test');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Damage Control blocked')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DO NOT retry')
      );
    });

    it('outputs disable instructions', () => {
      outputBlocked('Test');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('/configure')
      );
    });
  });

  describe('fail-safe behavior', () => {
    it('loadPatterns returns default when fs.existsSync always returns false', () => {
      fs.existsSync.mockReturnValue(false);

      const result = loadPatterns('/project', () => {}, { default: true });
      expect(result).toEqual({ default: true });
    });

    it('parseSimpleYAML handles malformed input gracefully', () => {
      const malformedContent = `
bashToolPatterns:
  - pattern: "unclosed string
  reason: missing dash
`;
      const config = { bashToolPatterns: 'patterns' };

      // Should not throw, returns partial results
      expect(() => {
        parseSimpleYAML(malformedContent, config);
      }).not.toThrow();
    });

    it('pathMatches handles empty string safely', () => {
      // Empty string input returns null (fail-open)
      expect(pathMatches('', ['pattern'])).toBeNull();
    });

    it('pathMatches handles falsy values safely', () => {
      expect(pathMatches(null, ['pattern'])).toBeNull();
      expect(pathMatches(undefined, ['pattern'])).toBeNull();
    });
  });

  describe('shell injection validation patterns', () => {
    it('can parse command injection patterns', () => {
      const dangerousPatterns = `
bashToolPatterns:
  - pattern: "\\$\\(.*\\)"
    reason: "Command substitution"
    flags: ""
  - pattern: "\`.*\`"
    reason: "Backtick execution"
    flags: ""
  - pattern: "\\|\\s*sh"
    reason: "Pipe to shell"
    flags: "i"
`;
      const result = parseBashPatterns(dangerousPatterns);

      expect(result.bashToolPatterns).toHaveLength(3);
      // Patterns are stored as escaped regex strings
      expect(result.bashToolPatterns[0].pattern).toMatch(/\$/);
      expect(result.bashToolPatterns[0].reason).toBe('Command substitution');
      expect(result.bashToolPatterns[1].reason).toBe('Backtick execution');
      expect(result.bashToolPatterns[2].reason).toBe('Pipe to shell');
      expect(result.bashToolPatterns[2].flags).toBe('i');
    });

    it('patterns can be used as regex', () => {
      const dangerousPatterns = `
bashToolPatterns:
  - pattern: "rm\\s+-rf"
    reason: "Dangerous recursive delete"
`;
      const result = parseBashPatterns(dangerousPatterns);
      const pattern = result.bashToolPatterns[0].pattern;
      const regex = new RegExp(pattern);

      expect(regex.test('rm -rf /')).toBe(true);
      expect(regex.test('rm file.txt')).toBe(false);
    });
  });
});
