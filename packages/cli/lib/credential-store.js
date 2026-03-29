/**
 * credential-store.js - Secure credential storage for channel tokens (EP-0049)
 *
 * Stores bot tokens, webhook secrets, and other channel credentials in
 * ~/.agileflow/credentials.json with restricted file permissions (0600).
 *
 * NEVER stores credentials in .mcp.json, .claude/settings.json, or any
 * project-level file that could be committed to version control.
 *
 * Usage:
 *   const { setCredential, getCredential, deleteCredential } = require('../lib/credential-store');
 *
 *   setCredential('telegram', 'bot-token', '123456:ABC-DEF...');
 *   const token = getCredential('telegram', 'bot-token');
 *   deleteCredential('telegram', 'bot-token');
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/** Credential store location (user home, never in project) */
const CREDENTIALS_PATH = path.join(os.homedir(), '.agileflow', 'credentials.json');

/** File permissions: owner-only read/write */
const FILE_MODE = 0o600;

/**
 * Ensure the credentials file and directory exist.
 * @private
 */
function ensureCredentialsFile() {
  const dir = path.dirname(CREDENTIALS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({}, null, 2) + '\n', { mode: FILE_MODE });
  }
}

/**
 * Read the credentials store.
 * @private
 * @returns {object} Parsed credentials object
 */
function readStore() {
  ensureCredentialsFile();
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Write the credentials store with restricted permissions.
 * @private
 * @param {object} data - Credentials object to write
 */
function writeStore(data) {
  ensureCredentialsFile();
  const content = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(CREDENTIALS_PATH, content, { mode: FILE_MODE });
  // Ensure permissions are correct even if file already existed
  try {
    fs.chmodSync(CREDENTIALS_PATH, FILE_MODE);
  } catch {
    // May not be supported on all platforms (Windows)
  }
}

/**
 * Set a credential for a channel.
 *
 * @param {string} channel - Channel name (e.g., 'telegram', 'discord', 'ci-webhook')
 * @param {string} key - Credential key (e.g., 'bot-token', 'signing-secret')
 * @param {string} value - Credential value
 * @returns {{ ok: boolean, error?: string }}
 */
function setCredential(channel, key, value) {
  try {
    if (!channel || !key || value === undefined) {
      return { ok: false, error: 'channel, key, and value are required' };
    }

    const store = readStore();
    if (!store[channel]) store[channel] = {};
    store[channel][key] = {
      value: String(value),
      setAt: new Date().toISOString(),
    };
    writeStore(store);

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Get a credential for a channel.
 *
 * @param {string} channel - Channel name
 * @param {string} key - Credential key
 * @returns {string|null} Credential value, or null if not found
 */
function getCredential(channel, key) {
  try {
    const store = readStore();
    const entry = store?.[channel]?.[key];
    return entry?.value || null;
  } catch {
    return null;
  }
}

/**
 * Delete a credential for a channel.
 *
 * @param {string} channel - Channel name
 * @param {string} key - Credential key
 * @returns {{ ok: boolean, error?: string }}
 */
function deleteCredential(channel, key) {
  try {
    const store = readStore();
    if (store[channel]) {
      delete store[channel][key];
      if (Object.keys(store[channel]).length === 0) {
        delete store[channel];
      }
      writeStore(store);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * List all channels that have stored credentials.
 *
 * @returns {{ ok: boolean, channels?: string[], error?: string }}
 */
function listChannels() {
  try {
    const store = readStore();
    return { ok: true, channels: Object.keys(store) };
  } catch (e) {
    return { ok: false, error: e.message, channels: [] };
  }
}

/**
 * Check if the credential store has secure permissions.
 *
 * @returns {{ ok: boolean, path: string, exists: boolean, permissions?: string }}
 */
function checkSecurity() {
  const result = { ok: true, path: CREDENTIALS_PATH, exists: fs.existsSync(CREDENTIALS_PATH) };

  if (!result.exists) return result;

  try {
    const stats = fs.statSync(CREDENTIALS_PATH);
    const mode = (stats.mode & 0o777).toString(8);
    result.permissions = mode;

    // Warn if permissions are too open (anything beyond 600)
    if ((stats.mode & 0o077) !== 0) {
      result.ok = false;
      result.warning = `Permissions too open (${mode}). Run: chmod 600 ${CREDENTIALS_PATH}`;
    }
  } catch {
    // Can't check permissions on this platform
  }

  return result;
}

module.exports = {
  setCredential,
  getCredential,
  deleteCredential,
  listChannels,
  checkSecurity,
  CREDENTIALS_PATH,
};
