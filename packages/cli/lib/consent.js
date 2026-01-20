/**
 * consent.js
 *
 * GDPR consent handling for AgileFlow (US-0149)
 *
 * Manages privacy consent during setup:
 * - Prompts user to acknowledge privacy policy
 * - Stores consent timestamp in .agileflow/config/consent.json
 * - Supports --accept-privacy flag for CI environments
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Consent configuration
 */
const CONSENT_FILE = '.agileflow/config/consent.json';
const PRIVACY_POLICY_URL =
  'https://github.com/projectquestorg/AgileFlow/blob/main/packages/cli/PRIVACY.md';

/**
 * Consent status types
 */
const ConsentStatus = {
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  PENDING: 'pending',
};

/**
 * Check if consent has been given
 * @returns {{ hasConsent: boolean, consent: Object | null }}
 */
function checkConsent() {
  const consentPath = path.resolve(process.cwd(), CONSENT_FILE);

  try {
    if (fs.existsSync(consentPath)) {
      const consent = JSON.parse(fs.readFileSync(consentPath, 'utf8'));
      return {
        hasConsent: consent.status === ConsentStatus.ACCEPTED,
        consent,
      };
    }
  } catch {
    // Ignore errors, treat as no consent
  }

  return { hasConsent: false, consent: null };
}

/**
 * Record consent
 * @param {string} status - 'accepted' or 'declined'
 * @param {Object} options - Additional options
 * @param {string} options.method - How consent was given ('interactive', 'flag', 'api')
 * @param {string} options.version - Privacy policy version
 * @returns {{ ok: boolean, path: string }}
 */
function recordConsent(status, options = {}) {
  const { method = 'interactive', version = '1.0.0' } = options;

  const consentPath = path.resolve(process.cwd(), CONSENT_FILE);
  const consentDir = path.dirname(consentPath);

  // Ensure directory exists
  if (!fs.existsSync(consentDir)) {
    fs.mkdirSync(consentDir, { recursive: true });
  }

  const consent = {
    status,
    timestamp: new Date().toISOString(),
    method,
    policy_version: version,
    policy_url: PRIVACY_POLICY_URL,
  };

  try {
    fs.writeFileSync(consentPath, JSON.stringify(consent, null, 2));
    return { ok: true, path: consentPath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Prompt user for consent interactively
 * @param {Object} options - Prompt options
 * @param {WritableStream} options.output - Output stream (default: process.stdout)
 * @param {ReadableStream} options.input - Input stream (default: process.stdin)
 * @returns {Promise<{ accepted: boolean }>}
 */
async function promptConsent(options = {}) {
  const { output = process.stdout, input = process.stdin } = options;

  const rl = readline.createInterface({
    input,
    output,
    terminal: false,
  });

  // Display privacy notice
  const notice = `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                    Privacy Notice                             ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

AgileFlow respects your privacy:

• All data is stored locally on your machine
• No telemetry, analytics, or tracking
• No data is transmitted to external servers
• You can delete all data at any time

For details, see: ${PRIVACY_POLICY_URL}

`;

  output.write(notice);

  return new Promise(resolve => {
    const question = 'Do you accept the privacy policy? (yes/no): ';
    output.write(question);

    rl.once('line', answer => {
      rl.close();
      const normalized = answer.toLowerCase().trim();
      const accepted = normalized === 'yes' || normalized === 'y';
      resolve({ accepted });
    });
  });
}

/**
 * Handle consent during setup
 * @param {Object} options - Setup options
 * @param {boolean} options.acceptPrivacy - --accept-privacy flag was passed
 * @param {boolean} options.silent - Silent mode (no prompts)
 * @param {WritableStream} options.output - Output stream
 * @param {ReadableStream} options.input - Input stream
 * @returns {Promise<{ ok: boolean, status: string, skipped: boolean }>}
 */
async function handleSetupConsent(options = {}) {
  const {
    acceptPrivacy = false,
    silent = false,
    output = process.stdout,
    input = process.stdin,
  } = options;

  // Check if consent already given
  const { hasConsent, consent } = checkConsent();
  if (hasConsent) {
    return { ok: true, status: 'already_consented', skipped: false, consent };
  }

  // If --accept-privacy flag provided
  if (acceptPrivacy) {
    const result = recordConsent(ConsentStatus.ACCEPTED, { method: 'flag' });
    return { ok: result.ok, status: 'accepted_via_flag', skipped: false };
  }

  // If silent mode (CI without flag)
  if (silent) {
    return { ok: false, status: 'consent_required', skipped: true };
  }

  // Interactive prompt
  const { accepted } = await promptConsent({ output, input });

  if (accepted) {
    const result = recordConsent(ConsentStatus.ACCEPTED, { method: 'interactive' });
    return { ok: result.ok, status: 'accepted_interactive', skipped: false };
  } else {
    const result = recordConsent(ConsentStatus.DECLINED, { method: 'interactive' });
    return { ok: false, status: 'declined', skipped: false };
  }
}

/**
 * Get consent status for display
 * @returns {{ status: string, timestamp: string | null, method: string | null }}
 */
function getConsentStatus() {
  const { hasConsent, consent } = checkConsent();

  if (!consent) {
    return { status: ConsentStatus.PENDING, timestamp: null, method: null };
  }

  return {
    status: consent.status,
    timestamp: consent.timestamp,
    method: consent.method,
    policyVersion: consent.policy_version,
  };
}

/**
 * Revoke consent (delete consent file)
 * @returns {{ ok: boolean }}
 */
function revokeConsent() {
  const consentPath = path.resolve(process.cwd(), CONSENT_FILE);

  try {
    if (fs.existsSync(consentPath)) {
      fs.unlinkSync(consentPath);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  // Constants
  CONSENT_FILE,
  PRIVACY_POLICY_URL,
  ConsentStatus,

  // Functions
  checkConsent,
  recordConsent,
  promptConsent,
  handleSetupConsent,
  getConsentStatus,
  revokeConsent,
};
