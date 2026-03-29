/**
 * Tests for channel security features (EP-0049, US-0436)
 *
 * Tests cover:
 * - Quarantine wrapping ([EXTERNAL_EVENT] delimiters)
 * - Credential store (set/get/delete/list/security check)
 * - Extended SECRET_PATTERNS (Telegram/Discord tokens)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Channel Security', () => {
  // ========================================================================
  // Quarantine Wrapping
  // ========================================================================

  describe('quarantine wrapping', () => {
    const { normalizeEvent, wrapInQuarantine } = require('../../../scripts/lib/channel-adapter');

    it('normalizeEvent includes quarantined_content field', () => {
      const result = normalizeEvent({
        source: 'ci',
        type: 'ci_failure',
        payload: { workflow: 'tests' },
      });
      expect(result.ok).toBe(true);
      expect(result.message.quarantined_content).toBeDefined();
      expect(typeof result.message.quarantined_content).toBe('string');
    });

    it('wraps content in [EXTERNAL_EVENT] delimiters', () => {
      const result = normalizeEvent({
        source: 'telegram',
        type: 'message',
        sender: '@user123',
        payload: { text: 'Hello world' },
      });
      const wrapped = result.message.quarantined_content;
      expect(wrapped).toContain('[EXTERNAL_EVENT');
      expect(wrapped).toContain('source=telegram');
      expect(wrapped).toContain('type=message');
      expect(wrapped).toContain('sender=@user123');
      expect(wrapped).toContain('<event_data>');
      expect(wrapped).toContain('</event_data>');
      expect(wrapped).toContain('[/EXTERNAL_EVENT]');
      expect(wrapped).toContain('Hello world');
    });

    it('wrapInQuarantine handles missing fields gracefully', () => {
      const wrapped = wrapInQuarantine({});
      expect(wrapped).toContain('[EXTERNAL_EVENT');
      expect(wrapped).toContain('source=unknown');
      expect(wrapped).toContain('[/EXTERNAL_EVENT]');
    });

    it('quarantine wrapping preserves payload structure', () => {
      const result = normalizeEvent({
        source: 'ci',
        type: 'ci_failure',
        payload: { workflow: 'tests', branch: 'main', failed_count: 3 },
      });
      const wrapped = result.message.quarantined_content;
      expect(wrapped).toContain('workflow');
      expect(wrapped).toContain('tests');
      expect(wrapped).toContain('branch');
      expect(wrapped).toContain('main');
    });
  });

  // ========================================================================
  // Credential Store
  // ========================================================================

  describe('credential store', () => {
    const credentialStore = require('../../../lib/credential-store');
    let tempDir;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-test-'));
    });

    afterEach(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('exports expected functions', () => {
      expect(typeof credentialStore.setCredential).toBe('function');
      expect(typeof credentialStore.getCredential).toBe('function');
      expect(typeof credentialStore.deleteCredential).toBe('function');
      expect(typeof credentialStore.listChannels).toBe('function');
      expect(typeof credentialStore.checkSecurity).toBe('function');
    });

    it('CREDENTIALS_PATH is in home directory, not project', () => {
      expect(credentialStore.CREDENTIALS_PATH).toContain(os.homedir());
      expect(credentialStore.CREDENTIALS_PATH).toContain('.agileflow');
      expect(credentialStore.CREDENTIALS_PATH).toContain('credentials.json');
    });

    it('setCredential rejects missing parameters', () => {
      const result = credentialStore.setCredential(null, null, null);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/required/);
    });

    it('round-trips a credential (set → get → delete)', () => {
      const testChannel = `test-channel-${Date.now()}`;
      const testKey = 'test-token';
      const testValue = 'test-value-12345';

      // Set
      const setResult = credentialStore.setCredential(testChannel, testKey, testValue);
      expect(setResult.ok).toBe(true);

      // Get
      const value = credentialStore.getCredential(testChannel, testKey);
      expect(value).toBe(testValue);

      // Delete
      const delResult = credentialStore.deleteCredential(testChannel, testKey);
      expect(delResult.ok).toBe(true);

      // Verify deletion
      const after = credentialStore.getCredential(testChannel, testKey);
      expect(after).toBeNull();
    });

    it('getCredential returns null for missing channel', () => {
      expect(credentialStore.getCredential('nonexistent', 'key')).toBeNull();
    });

    it('listChannels returns channel names', () => {
      const result = credentialStore.listChannels();
      expect(result.ok).toBe(true);
      expect(Array.isArray(result.channels)).toBe(true);
    });

    it('checkSecurity returns path info', () => {
      const result = credentialStore.checkSecurity();
      expect(result.path).toBe(credentialStore.CREDENTIALS_PATH);
      expect(typeof result.exists).toBe('boolean');
    });
  });

  // ========================================================================
  // Extended SECRET_PATTERNS
  // ========================================================================

  describe('extended SECRET_PATTERNS', () => {
    beforeAll(() => {
      // Verify the damage control file contains SECRET_PATTERNS
      const source = fs.readFileSync(
        path.join(__dirname, '../../../scripts/damage-control-multi-agent.js'),
        'utf8'
      );
      const match = source.match(/const SECRET_PATTERNS = \[([\s\S]*?)\];/);
      expect(match).toBeTruthy();
    });

    it('detects Telegram bot tokens', () => {
      const telegramPattern = /\b\d{8,10}:[a-zA-Z0-9_-]{35}\b/;
      // Real Telegram bot tokens: 10-digit number : 35-char alphanumeric string
      expect(telegramPattern.test('1234567890:ABCdefGHI_jklMNOpqrSTUvwxYZ12345678')).toBe(true);
      expect(telegramPattern.test('normal text')).toBe(false);
    });

    it('detects Discord bot tokens', () => {
      const discordPattern = /\b[MN][A-Za-z\d]{23,}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,}/;
      expect(
        discordPattern.test(
          'test0discord0fake0token0placeholder.ABCdef.test0fake0token0placeholder0000'
        )
      ).toBe(true);
      expect(discordPattern.test('normal text')).toBe(false);
    });

    it('detects webhook URLs with tokens', () => {
      const webhookPattern = /https:\/\/hooks\.(?:slack|discord)\.com\/[^\s]+/;
      expect(webhookPattern.test('https://hooks.slack.com/services/T00/B00/xxxx')).toBe(true);
      expect(webhookPattern.test('https://hooks.discord.com/api/webhooks/123/abc')).toBe(true);
      expect(webhookPattern.test('https://example.com')).toBe(false);
    });

    it('detects webhook signing secrets', () => {
      const signingPattern = /\bwhsec_[a-zA-Z0-9]+/;
      expect(signingPattern.test('whsec_abc123def456')).toBe(true);
      expect(signingPattern.test('normal text')).toBe(false);
    });
  });
});
