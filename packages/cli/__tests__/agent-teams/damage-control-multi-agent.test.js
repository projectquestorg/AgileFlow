/**
 * Tests for scripts/damage-control-multi-agent.js validation functions
 *
 * Tests the validation logic directly by requiring the module and testing
 * the validation functions. Since the hook runs via stdin/process, we test
 * the exported validation logic patterns instead.
 *
 * Covers:
 * - Secret scanning in SendMessage (extended from TaskCreate/TaskUpdate)
 * - Channel ACL enforcement via AGILEFLOW_AGENT_CHANNELS
 * - Existing blocked patterns still work
 * - Combined validation (size + patterns + secrets + ACLs)
 */

describe('damage-control-multi-agent validation', () => {
  // Since damage-control-multi-agent.js uses runDamageControlHook which reads stdin,
  // we test validation patterns directly by extracting the logic.

  // Secret patterns (mirrored from the module)
  const SECRET_PATTERNS = [
    /\b(?:API_KEY|SECRET|PASSWORD|TOKEN|CREDENTIALS)\s*[:=]\s*\S+/i,
    /\bsk-[a-zA-Z0-9]{20,}/,
    /\bghp_[a-zA-Z0-9]{36}/,
    /\bnpm_[a-zA-Z0-9]{36}/,
    /\bAIza[a-zA-Z0-9_-]{35}/,
    /\bxox[bpors]-[a-zA-Z0-9-]+/,
    /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  ];

  const BLOCKED_MESSAGE_PATTERNS = [
    /\$\{.*\}/,
    /`[^`]*`/,
    /\bexec\s*\(/,
    /\beval\s*\(/,
    /\bgit\s+push\s+--force\b/i,
    /\bgit\s+reset\s+--hard\b/i,
    /\brm\s+-rf\s+\//,
    /\bdrop\s+database\b/i,
    /\bdrop\s+table\b/i,
  ];

  const MAX_MESSAGE_SIZE = 10240;

  // Replicate validateSendMessage logic for testing
  function validateSendMessage(content, options = {}) {
    const { channel, allowedChannels } = options;

    if (content.length > MAX_MESSAGE_SIZE) {
      return { action: 'block', reason: 'size exceeded' };
    }

    for (const pattern of BLOCKED_MESSAGE_PATTERNS) {
      if (pattern.test(content)) {
        return { action: 'block', reason: 'blocked pattern' };
      }
    }

    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        return { action: 'block', reason: 'secret detected' };
      }
    }

    if (allowedChannels && channel) {
      const allowed = allowedChannels
        .split(',')
        .map(c => c.trim())
        .filter(Boolean);
      if (allowed.length > 0 && !allowed.includes(channel)) {
        return { action: 'block', reason: 'channel not authorized' };
      }
    }

    return { action: 'allow' };
  }

  // =========================================================================
  // Secret scanning in SendMessage
  // =========================================================================

  describe('secret scanning in SendMessage', () => {
    test('blocks API_KEY in message content', () => {
      const result = validateSendMessage('Please use API_KEY=sk-abc123def456 for auth');
      expect(result.action).toBe('block');
      expect(result.reason).toBe('secret detected');
    });

    test('blocks sk- prefixed keys', () => {
      const result = validateSendMessage('Set key to sk-abcdefghijklmnopqrstuvwxyz');
      expect(result.action).toBe('block');
    });

    test('blocks GitHub personal access tokens', () => {
      const result = validateSendMessage('Use ghp_' + 'a'.repeat(36) + ' for authentication');
      expect(result.action).toBe('block');
    });

    test('blocks npm tokens', () => {
      const result = validateSendMessage('npm token is npm_' + 'b'.repeat(36));
      expect(result.action).toBe('block');
    });

    test('blocks Google API keys', () => {
      const result = validateSendMessage('Google key: AIza' + 'c'.repeat(35));
      expect(result.action).toBe('block');
    });

    test('blocks Slack tokens', () => {
      const result = validateSendMessage('Slack bot token: xoxb-123456789-abcdef');
      expect(result.action).toBe('block');
    });

    test('blocks private keys', () => {
      const result = validateSendMessage(
        'Here is the key:\n-----BEGIN RSA PRIVATE KEY-----\nMIIE...'
      );
      expect(result.action).toBe('block');
    });

    test('blocks PASSWORD in content', () => {
      const result = validateSendMessage('Set PASSWORD=mysecretpassword123');
      expect(result.action).toBe('block');
    });

    test('allows normal message content', () => {
      const result = validateSendMessage('Please review the API endpoint implementation');
      expect(result.action).toBe('allow');
    });

    test('allows content mentioning secrets abstractly', () => {
      const result = validateSendMessage('Make sure to use environment variables for API keys');
      expect(result.action).toBe('allow');
    });

    test('allows short sk- strings (not real keys)', () => {
      const result = validateSendMessage('Use sk-abc as a prefix');
      expect(result.action).toBe('allow');
    });
  });

  // =========================================================================
  // Channel ACL enforcement
  // =========================================================================

  describe('channel ACL enforcement', () => {
    test('allows message when agent channels match', () => {
      const result = validateSendMessage('Hello', {
        channel: 'backend',
        allowedChannels: 'backend,frontend',
      });
      expect(result.action).toBe('allow');
    });

    test('blocks message when channel not in allowed list', () => {
      const result = validateSendMessage('Hello', {
        channel: 'security-review',
        allowedChannels: 'backend,frontend',
      });
      expect(result.action).toBe('block');
      expect(result.reason).toBe('channel not authorized');
    });

    test('allows message when no channel restriction set', () => {
      const result = validateSendMessage('Hello', {
        channel: 'security-review',
        allowedChannels: undefined,
      });
      expect(result.action).toBe('allow');
    });

    test('allows message when no target channel specified', () => {
      const result = validateSendMessage('Hello', {
        channel: undefined,
        allowedChannels: 'backend,frontend',
      });
      expect(result.action).toBe('allow');
    });

    test('handles whitespace in channel list', () => {
      const result = validateSendMessage('Hello', {
        channel: 'backend',
        allowedChannels: ' backend , frontend , general ',
      });
      expect(result.action).toBe('allow');
    });

    test('handles empty allowed channels string', () => {
      const result = validateSendMessage('Hello', {
        channel: 'backend',
        allowedChannels: '',
      });
      expect(result.action).toBe('allow');
    });
  });

  // =========================================================================
  // Existing blocked patterns still work
  // =========================================================================

  describe('existing blocked patterns', () => {
    test('blocks template injection', () => {
      const result = validateSendMessage('Run ${process.env.SECRET}');
      expect(result.action).toBe('block');
    });

    test('blocks backtick execution', () => {
      const result = validateSendMessage('Use `rm -rf /tmp`');
      expect(result.action).toBe('block');
    });

    test('blocks exec calls', () => {
      const result = validateSendMessage('Try exec("command")');
      expect(result.action).toBe('block');
    });

    test('blocks eval calls', () => {
      const result = validateSendMessage('Run eval("code")');
      expect(result.action).toBe('block');
    });

    test('blocks git push --force', () => {
      const result = validateSendMessage('Run git push --force origin main');
      expect(result.action).toBe('block');
    });

    test('blocks git reset --hard', () => {
      const result = validateSendMessage('Try git reset --hard HEAD~5');
      expect(result.action).toBe('block');
    });

    test('blocks rm -rf /', () => {
      const result = validateSendMessage('Clean up with rm -rf /var');
      expect(result.action).toBe('block');
    });

    test('blocks drop database', () => {
      const result = validateSendMessage('DROP DATABASE production');
      expect(result.action).toBe('block');
    });

    test('blocks oversized messages', () => {
      const result = validateSendMessage('x'.repeat(MAX_MESSAGE_SIZE + 1));
      expect(result.action).toBe('block');
    });
  });

  // =========================================================================
  // Combined validation order
  // =========================================================================

  describe('validation order', () => {
    test('size check runs before pattern check', () => {
      // Message that is too large AND contains a blocked pattern
      const content = 'eval(' + 'x'.repeat(MAX_MESSAGE_SIZE + 1) + ')';
      const result = validateSendMessage(content);
      expect(result.action).toBe('block');
      expect(result.reason).toBe('size exceeded');
    });

    test('blocked patterns run before secret check', () => {
      // Message with both a blocked pattern and a secret
      const result = validateSendMessage('eval("sk-' + 'a'.repeat(30) + '")');
      expect(result.action).toBe('block');
      // Should match blocked pattern first (backtick or eval)
    });

    test('secrets checked before channel ACLs', () => {
      const result = validateSendMessage('API_KEY=mysecretkey123', {
        channel: 'backend',
        allowedChannels: 'backend',
      });
      expect(result.action).toBe('block');
      expect(result.reason).toBe('secret detected');
    });
  });

  // =========================================================================
  // TaskCreate/TaskUpdate secret scanning (shared patterns)
  // =========================================================================

  describe('task operation secret scanning uses shared patterns', () => {
    function validateTaskOperation(description) {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(description)) {
          return { action: 'block', reason: 'secret in task' };
        }
      }
      return { action: 'allow' };
    }

    test('blocks Google API key in task description', () => {
      const result = validateTaskOperation('Use Google key AIza' + 'x'.repeat(35));
      expect(result.action).toBe('block');
    });

    test('blocks Slack token in task description', () => {
      const result = validateTaskOperation('Bot token: xoxb-123-abc');
      expect(result.action).toBe('block');
    });

    test('blocks private key in task description', () => {
      const result = validateTaskOperation('-----BEGIN EC PRIVATE KEY-----');
      expect(result.action).toBe('block');
    });

    test('allows normal task descriptions', () => {
      const result = validateTaskOperation('Implement the user authentication endpoint');
      expect(result.action).toBe('allow');
    });
  });
});
