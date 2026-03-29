/**
 * messaging-channel.js - Telegram & Discord Channel Setup (EP-0049, US-0438)
 *
 * Helpers for setting up messaging platform channels:
 * - Telegram: BotFather flow, token validation, allow-list reminder
 * - Discord: Bot token validation, guild setup
 *
 * Usage:
 *   const { setupTelegramChannel, setupDiscordChannel, formatChannelList } = require('./lib/messaging-channel');
 */

// Lazy-load dependencies
let _channelAdapter;
function getChannelAdapter() {
  if (!_channelAdapter) {
    _channelAdapter = require('./channel-adapter');
  }
  return _channelAdapter;
}

let _credentialStore;
function getCredentialStore() {
  if (!_credentialStore) {
    _credentialStore = require('../../lib/credential-store');
  }
  return _credentialStore;
}

// ============================================================================
// TELEGRAM
// ============================================================================

/**
 * Validate a Telegram bot token format.
 *
 * Telegram tokens follow the pattern: {bot_id}:{secret}
 * where bot_id is 8-10 digits and secret is 35 alphanumeric chars.
 *
 * @param {string} token - Token to validate
 * @returns {{ valid: boolean, error?: string }}
 */
function validateTelegramToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token is required' };
  }

  const trimmed = token.trim();
  if (!trimmed.includes(':')) {
    return { valid: false, error: 'Token must contain a colon (format: BOT_ID:SECRET)' };
  }

  const [botId, secret] = trimmed.split(':');
  if (!/^\d{8,10}$/.test(botId)) {
    return { valid: false, error: 'Bot ID must be 8-10 digits' };
  }
  if (!/^[a-zA-Z0-9_-]{30,}$/.test(secret)) {
    return { valid: false, error: 'Secret must be at least 30 alphanumeric characters' };
  }

  return { valid: true };
}

/**
 * Get the step-by-step guide for Telegram BotFather setup.
 *
 * @returns {string[]} Array of instruction steps
 */
function getTelegramSetupGuide() {
  return [
    '1. Open Telegram and search for @BotFather',
    '2. Send /newbot to create a new bot',
    '3. Choose a display name for your bot (e.g., "My AgileFlow Bot")',
    '4. Choose a username ending in "bot" (e.g., "my_agileflow_bot")',
    '5. BotFather will give you an API token - copy it',
    '6. Paste the token when prompted',
    '',
    'After setup:',
    '- Send a message to your bot on Telegram',
    '- Run /telegram:configure to pair the session',
    '- Run /telegram access-policy allow-list to lock down access',
  ];
}

/**
 * Set up a Telegram channel end-to-end.
 *
 * @param {string} rootDir - Project root
 * @param {string} token - Bot token from BotFather
 * @param {object} [options] - Options
 * @param {string} [options.trustLevel] - Trust level (default: 'observe')
 * @param {string} [options.name] - Custom channel name (default: 'telegram')
 * @returns {{ ok: boolean, error?: string, guide?: string[] }}
 */
function setupTelegramChannel(rootDir, token, options = {}) {
  const name = options.name || 'telegram';
  const trustLevel = options.trustLevel || 'observe';

  // Validate token
  const validation = validateTelegramToken(token);
  if (!validation.valid) {
    return { ok: false, error: validation.error, guide: getTelegramSetupGuide() };
  }

  // Store token securely
  const credStore = getCredentialStore();
  const storeResult = credStore.setCredential(name, 'bot-token', token.trim());
  if (!storeResult.ok) {
    return { ok: false, error: `Failed to store token: ${storeResult.error}` };
  }

  // Register channel
  const adapter = getChannelAdapter();
  const regResult = adapter.registerChannel(rootDir, name, {
    source: 'telegram',
    trustLevel,
    platform: 'telegram',
  });

  if (!regResult.ok) {
    return { ok: false, error: `Failed to register channel: ${regResult.error}` };
  }

  return {
    ok: true,
    securityReminders: [
      'IMPORTANT: Run /telegram access-policy allow-list to restrict who can send messages',
      'Only your Telegram account should be able to reach this session',
      `Token stored securely at ${credStore.CREDENTIALS_PATH}`,
    ],
  };
}

// ============================================================================
// DISCORD
// ============================================================================

/**
 * Validate a Discord bot token format.
 *
 * Discord tokens are base64-encoded strings with dots separating sections.
 *
 * @param {string} token - Token to validate
 * @returns {{ valid: boolean, error?: string }}
 */
function validateDiscordToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token is required' };
  }

  const trimmed = token.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Discord token must have 3 dot-separated parts' };
  }

  if (parts[0].length < 20 || parts[2].length < 20) {
    return { valid: false, error: 'Token parts are too short - check you copied the full token' };
  }

  return { valid: true };
}

/**
 * Get the step-by-step guide for Discord bot setup.
 *
 * @returns {string[]} Array of instruction steps
 */
function getDiscordSetupGuide() {
  return [
    '1. Go to discord.com/developers/applications',
    '2. Click "New Application" and name it',
    '3. Go to the "Bot" section in the left sidebar',
    '4. Click "Reset Token" to generate a new token',
    '5. Copy the token',
    '6. Under "Privileged Gateway Intents", enable "Message Content Intent"',
    '7. Go to OAuth2 > URL Generator, select "bot" scope',
    '8. Use the generated URL to invite the bot to your server',
  ];
}

/**
 * Set up a Discord channel end-to-end.
 *
 * @param {string} rootDir - Project root
 * @param {string} token - Discord bot token
 * @param {object} [options] - Options
 * @param {string} [options.trustLevel] - Trust level (default: 'observe')
 * @param {string} [options.name] - Custom channel name (default: 'discord')
 * @returns {{ ok: boolean, error?: string, guide?: string[] }}
 */
function setupDiscordChannel(rootDir, token, options = {}) {
  const name = options.name || 'discord';
  const trustLevel = options.trustLevel || 'observe';

  // Validate token
  const validation = validateDiscordToken(token);
  if (!validation.valid) {
    return { ok: false, error: validation.error, guide: getDiscordSetupGuide() };
  }

  // Store token securely
  const credStore = getCredentialStore();
  const storeResult = credStore.setCredential(name, 'bot-token', token.trim());
  if (!storeResult.ok) {
    return { ok: false, error: `Failed to store token: ${storeResult.error}` };
  }

  // Register channel
  const adapter = getChannelAdapter();
  const regResult = adapter.registerChannel(rootDir, name, {
    source: 'discord',
    trustLevel,
    platform: 'discord',
  });

  if (!regResult.ok) {
    return { ok: false, error: `Failed to register channel: ${regResult.error}` };
  }

  return {
    ok: true,
    securityReminders: [
      'Ensure your Discord bot is only in servers you trust',
      'Consider using a private channel for sensitive notifications',
      `Token stored securely at ${credStore.CREDENTIALS_PATH}`,
    ],
  };
}

// ============================================================================
// CHANNEL LIST DISPLAY
// ============================================================================

/**
 * Format channel status for display.
 *
 * @param {string} rootDir - Project root
 * @returns {{ ok: boolean, display?: string, channels?: object[] }}
 */
function formatChannelList(rootDir) {
  const adapter = getChannelAdapter();
  const status = adapter.getChannelStatus(rootDir);

  if (!status.ok) {
    return { ok: false, display: `Error reading channels: ${status.error}` };
  }

  const channels = Object.entries(status.channels || {});
  if (channels.length === 0) {
    return {
      ok: true,
      display: [
        'No channels configured.',
        '',
        'Get started:',
        '  /channels add ci        - Auto-detect CI and generate integration snippet',
        '  /channels add telegram   - Set up Telegram bot for mobile interaction',
        '  /channels add discord    - Set up Discord bot notifications',
        '  /channels add webhook    - Create a webhook endpoint',
      ].join('\n'),
      channels: [],
    };
  }

  const rows = channels.map(([name, config]) => ({
    name,
    source: config.source || 'unknown',
    trustLevel: config.trustLevel || 'observe',
    enabled: config.enabled !== false ? 'active' : 'paused',
    registeredAt: config.registeredAt
      ? new Date(config.registeredAt).toLocaleDateString()
      : 'unknown',
  }));

  const header = '| Name | Source | Trust | Status | Registered |';
  const separator = '|------|--------|-------|--------|------------|';
  const tableRows = rows.map(
    r => `| ${r.name} | ${r.source} | ${r.trustLevel} | ${r.enabled} | ${r.registeredAt} |`
  );

  return {
    ok: true,
    display: [header, separator, ...tableRows].join('\n'),
    channels: rows,
  };
}

module.exports = {
  // Telegram
  validateTelegramToken,
  getTelegramSetupGuide,
  setupTelegramChannel,

  // Discord
  validateDiscordToken,
  getDiscordSetupGuide,
  setupDiscordChannel,

  // Display
  formatChannelList,
};
