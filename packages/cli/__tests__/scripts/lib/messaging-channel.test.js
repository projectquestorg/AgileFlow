/**
 * Tests for messaging-channel.js (EP-0049, US-0438)
 *
 * Tests cover:
 * - Telegram token validation and setup
 * - Discord token validation and setup
 * - Channel list display formatting
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  validateTelegramToken,
  getTelegramSetupGuide,
  setupTelegramChannel,
  validateDiscordToken,
  getDiscordSetupGuide,
  setupDiscordChannel,
  formatChannelList,
} = require('../../../scripts/lib/messaging-channel');

describe('messaging-channel', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msg-channel-test-'));
    fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ========================================================================
  // Telegram
  // ========================================================================

  describe('validateTelegramToken', () => {
    it('accepts valid token', () => {
      const result = validateTelegramToken('1234567890:ABCdefGHI_jklMNOpqrSTUvwxYZ12345678');
      expect(result.valid).toBe(true);
    });

    it('rejects empty token', () => {
      expect(validateTelegramToken('').valid).toBe(false);
      expect(validateTelegramToken(null).valid).toBe(false);
      expect(validateTelegramToken(undefined).valid).toBe(false);
    });

    it('rejects token without colon', () => {
      const result = validateTelegramToken('nocolonhere');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('colon');
    });

    it('rejects token with non-numeric bot ID', () => {
      const result = validateTelegramToken('abcdefgh:ABCdefGHI_jklMNOpqrSTUvwxYZ12345678');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('digits');
    });

    it('rejects token with short secret', () => {
      const result = validateTelegramToken('1234567890:short');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('30');
    });
  });

  describe('getTelegramSetupGuide', () => {
    it('returns array of steps', () => {
      const guide = getTelegramSetupGuide();
      expect(Array.isArray(guide)).toBe(true);
      expect(guide.length).toBeGreaterThan(3);
      expect(guide[0]).toContain('BotFather');
    });

    it('includes security reminder', () => {
      const guide = getTelegramSetupGuide();
      const text = guide.join('\n');
      expect(text).toContain('allow-list');
    });
  });

  describe('setupTelegramChannel', () => {
    const validToken = '1234567890:ABCdefGHI_jklMNOpqrSTUvwxYZ12345678';

    it('sets up channel with valid token', () => {
      const result = setupTelegramChannel(tempDir, validToken);
      expect(result.ok).toBe(true);
      expect(result.securityReminders).toBeDefined();
      expect(result.securityReminders.length).toBeGreaterThan(0);
    });

    it('registers channel in config', () => {
      setupTelegramChannel(tempDir, validToken);

      const configPath = path.join(tempDir, 'docs', '09-agents', 'channels.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(config.channels.telegram).toBeDefined();
      expect(config.channels.telegram.source).toBe('telegram');
      expect(config.channels.telegram.trustLevel).toBe('observe');
    });

    it('stores token in credential store', () => {
      setupTelegramChannel(tempDir, validToken);

      const credentialStore = require('../../../lib/credential-store');
      const stored = credentialStore.getCredential('telegram', 'bot-token');
      expect(stored).toBe(validToken);

      // Clean up
      credentialStore.deleteCredential('telegram', 'bot-token');
    });

    it('rejects invalid token and returns guide', () => {
      const result = setupTelegramChannel(tempDir, 'bad-token');
      expect(result.ok).toBe(false);
      expect(result.guide).toBeDefined();
    });

    it('respects custom name and trust level', () => {
      setupTelegramChannel(tempDir, validToken, {
        name: 'my-telegram',
        trustLevel: 'suggest',
      });

      const configPath = path.join(tempDir, 'docs', '09-agents', 'channels.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(config.channels['my-telegram']).toBeDefined();
      expect(config.channels['my-telegram'].trustLevel).toBe('suggest');
    });

    it('includes allow-list security reminder', () => {
      const result = setupTelegramChannel(tempDir, validToken);
      const reminders = result.securityReminders.join('\n');
      expect(reminders).toContain('allow-list');
    });
  });

  // ========================================================================
  // Discord
  // ========================================================================

  describe('validateDiscordToken', () => {
    it('accepts valid token', () => {
      const result = validateDiscordToken(
        'test0discord0fake0token0placeholder.ABCdef.test0fake0token0placeholder0000'
      );
      expect(result.valid).toBe(true);
    });

    it('rejects empty token', () => {
      expect(validateDiscordToken('').valid).toBe(false);
      expect(validateDiscordToken(null).valid).toBe(false);
    });

    it('rejects token without 3 parts', () => {
      expect(validateDiscordToken('only.two').valid).toBe(false);
      expect(validateDiscordToken('nodots').valid).toBe(false);
    });

    it('rejects token with short parts', () => {
      const result = validateDiscordToken('short.x.short');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too short');
    });
  });

  describe('getDiscordSetupGuide', () => {
    it('returns array of steps', () => {
      const guide = getDiscordSetupGuide();
      expect(Array.isArray(guide)).toBe(true);
      expect(guide.length).toBeGreaterThan(3);
      expect(guide[0]).toContain('discord.com');
    });
  });

  describe('setupDiscordChannel', () => {
    const validToken = 'test0discord0fake0token0placeholder.ABCdef.test0fake0token0placeholder0000';

    it('sets up channel with valid token', () => {
      const result = setupDiscordChannel(tempDir, validToken);
      expect(result.ok).toBe(true);
      expect(result.securityReminders).toBeDefined();
    });

    it('registers channel in config', () => {
      setupDiscordChannel(tempDir, validToken);

      const configPath = path.join(tempDir, 'docs', '09-agents', 'channels.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(config.channels.discord).toBeDefined();
      expect(config.channels.discord.source).toBe('discord');
    });

    it('stores token in credential store', () => {
      setupDiscordChannel(tempDir, validToken);

      const credentialStore = require('../../../lib/credential-store');
      const stored = credentialStore.getCredential('discord', 'bot-token');
      expect(stored).toBe(validToken);

      // Clean up
      credentialStore.deleteCredential('discord', 'bot-token');
    });

    it('rejects invalid token and returns guide', () => {
      const result = setupDiscordChannel(tempDir, 'bad');
      expect(result.ok).toBe(false);
      expect(result.guide).toBeDefined();
    });
  });

  // ========================================================================
  // Channel List Display
  // ========================================================================

  describe('formatChannelList', () => {
    it('shows empty state with suggestions', () => {
      const result = formatChannelList(tempDir);
      expect(result.ok).toBe(true);
      expect(result.display).toContain('No channels configured');
      expect(result.display).toContain('/channels add ci');
      expect(result.channels).toEqual([]);
    });

    it('shows table with registered channels', () => {
      const channelAdapter = require('../../../scripts/lib/channel-adapter');
      channelAdapter.registerChannel(tempDir, 'ci', { source: 'ci', trustLevel: 'observe' });
      channelAdapter.registerChannel(tempDir, 'telegram', {
        source: 'telegram',
        trustLevel: 'suggest',
      });

      const result = formatChannelList(tempDir);
      expect(result.ok).toBe(true);
      expect(result.display).toContain('ci');
      expect(result.display).toContain('telegram');
      expect(result.display).toContain('observe');
      expect(result.display).toContain('suggest');
      expect(result.channels.length).toBe(2);
    });

    it('includes header and separator', () => {
      const channelAdapter = require('../../../scripts/lib/channel-adapter');
      channelAdapter.registerChannel(tempDir, 'test', { source: 'webhook' });

      const result = formatChannelList(tempDir);
      expect(result.display).toContain('| Name |');
      expect(result.display).toContain('|------|');
    });
  });
});
