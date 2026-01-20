/**
 * Tests for consent.js - GDPR consent handling
 */

const fs = require('fs');
const path = require('path');
const { Readable, Writable } = require('stream');

jest.mock('fs');

const {
  CONSENT_FILE,
  PRIVACY_POLICY_URL,
  ConsentStatus,
  checkConsent,
  recordConsent,
  promptConsent,
  handleSetupConsent,
  getConsentStatus,
  revokeConsent,
} = require('../../lib/consent');

describe('consent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockReturnValue(undefined);
    fs.writeFileSync.mockReturnValue(undefined);
    fs.unlinkSync.mockReturnValue(undefined);
  });

  describe('constants', () => {
    it('exports CONSENT_FILE path', () => {
      expect(CONSENT_FILE).toBe('.agileflow/config/consent.json');
    });

    it('exports PRIVACY_POLICY_URL', () => {
      expect(PRIVACY_POLICY_URL).toContain('PRIVACY.md');
    });

    it('exports ConsentStatus enum', () => {
      expect(ConsentStatus.ACCEPTED).toBe('accepted');
      expect(ConsentStatus.DECLINED).toBe('declined');
      expect(ConsentStatus.PENDING).toBe('pending');
    });
  });

  describe('checkConsent', () => {
    it('returns hasConsent=false when file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      const result = checkConsent();
      expect(result.hasConsent).toBe(false);
      expect(result.consent).toBeNull();
    });

    it('returns hasConsent=true when consent was accepted', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({ status: 'accepted', timestamp: '2026-01-19T00:00:00Z' })
      );
      const result = checkConsent();
      expect(result.hasConsent).toBe(true);
      expect(result.consent.status).toBe('accepted');
    });

    it('returns hasConsent=false when consent was declined', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ status: 'declined' }));
      const result = checkConsent();
      expect(result.hasConsent).toBe(false);
    });

    it('returns hasConsent=false on file read error', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });
      const result = checkConsent();
      expect(result.hasConsent).toBe(false);
    });

    it('returns hasConsent=false on invalid JSON', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('not json');
      const result = checkConsent();
      expect(result.hasConsent).toBe(false);
    });
  });

  describe('recordConsent', () => {
    it('creates consent file with accepted status', () => {
      const result = recordConsent('accepted');
      expect(result.ok).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
      const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(written.status).toBe('accepted');
      expect(written.timestamp).toBeDefined();
    });

    it('creates consent file with declined status', () => {
      const result = recordConsent('declined');
      expect(result.ok).toBe(true);
      const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(written.status).toBe('declined');
    });

    it('includes method in consent record', () => {
      recordConsent('accepted', { method: 'flag' });
      const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(written.method).toBe('flag');
    });

    it('includes policy version in consent record', () => {
      recordConsent('accepted', { version: '2.0.0' });
      const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(written.policy_version).toBe('2.0.0');
    });

    it('includes policy URL in consent record', () => {
      recordConsent('accepted');
      const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(written.policy_url).toBe(PRIVACY_POLICY_URL);
    });

    it('creates directory if it does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      recordConsent('accepted');
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('returns error on write failure', () => {
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });
      const result = recordConsent('accepted');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Write failed');
    });
  });

  describe('promptConsent', () => {
    function createMockStreams(inputData) {
      const input = new Readable({
        read() {
          this.push(inputData + '\n');
          this.push(null);
        },
      });
      let outputData = '';
      const output = new Writable({
        write(chunk, encoding, callback) {
          outputData += chunk.toString();
          callback();
        },
      });
      return { input, output, getOutput: () => outputData };
    }

    it('returns accepted=true for "yes" answer', async () => {
      const { input, output } = createMockStreams('yes');
      const result = await promptConsent({ input, output });
      expect(result.accepted).toBe(true);
    });

    it('returns accepted=true for "y" answer', async () => {
      const { input, output } = createMockStreams('y');
      const result = await promptConsent({ input, output });
      expect(result.accepted).toBe(true);
    });

    it('returns accepted=true for "YES" (case insensitive)', async () => {
      const { input, output } = createMockStreams('YES');
      const result = await promptConsent({ input, output });
      expect(result.accepted).toBe(true);
    });

    it('returns accepted=false for "no" answer', async () => {
      const { input, output } = createMockStreams('no');
      const result = await promptConsent({ input, output });
      expect(result.accepted).toBe(false);
    });

    it('returns accepted=false for "n" answer', async () => {
      const { input, output } = createMockStreams('n');
      const result = await promptConsent({ input, output });
      expect(result.accepted).toBe(false);
    });

    it('returns accepted=false for any other answer', async () => {
      const { input, output } = createMockStreams('maybe');
      const result = await promptConsent({ input, output });
      expect(result.accepted).toBe(false);
    });

    it('displays privacy notice', async () => {
      const { input, output, getOutput } = createMockStreams('yes');
      await promptConsent({ input, output });
      const outputText = getOutput();
      expect(outputText).toContain('Privacy Notice');
      expect(outputText).toContain('stored locally');
      expect(outputText).toContain('No telemetry');
    });
  });

  describe('handleSetupConsent', () => {
    it('skips if consent already given', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ status: 'accepted' }));

      const result = await handleSetupConsent();
      expect(result.ok).toBe(true);
      expect(result.status).toBe('already_consented');
      expect(result.skipped).toBe(false);
    });

    it('accepts via flag when --accept-privacy provided', async () => {
      const result = await handleSetupConsent({ acceptPrivacy: true });
      expect(result.ok).toBe(true);
      expect(result.status).toBe('accepted_via_flag');
      const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(written.method).toBe('flag');
    });

    it('returns consent_required in silent mode without flag', async () => {
      const result = await handleSetupConsent({ silent: true });
      expect(result.ok).toBe(false);
      expect(result.status).toBe('consent_required');
      expect(result.skipped).toBe(true);
    });

    it('prompts interactively when not silent', async () => {
      function createMockStreams(inputData) {
        const input = new Readable({
          read() {
            this.push(inputData + '\n');
            this.push(null);
          },
        });
        const output = new Writable({
          write(chunk, encoding, callback) {
            callback();
          },
        });
        return { input, output };
      }

      const { input, output } = createMockStreams('yes');
      const result = await handleSetupConsent({ input, output });
      expect(result.ok).toBe(true);
      expect(result.status).toBe('accepted_interactive');
    });

    it('records declined when user says no', async () => {
      function createMockStreams(inputData) {
        const input = new Readable({
          read() {
            this.push(inputData + '\n');
            this.push(null);
          },
        });
        const output = new Writable({
          write(chunk, encoding, callback) {
            callback();
          },
        });
        return { input, output };
      }

      const { input, output } = createMockStreams('no');
      const result = await handleSetupConsent({ input, output });
      expect(result.ok).toBe(false);
      expect(result.status).toBe('declined');
    });
  });

  describe('getConsentStatus', () => {
    it('returns pending when no consent file', () => {
      fs.existsSync.mockReturnValue(false);
      const status = getConsentStatus();
      expect(status.status).toBe('pending');
      expect(status.timestamp).toBeNull();
    });

    it('returns accepted status with details', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          status: 'accepted',
          timestamp: '2026-01-19T12:00:00Z',
          method: 'interactive',
          policy_version: '1.0.0',
        })
      );
      const status = getConsentStatus();
      expect(status.status).toBe('accepted');
      expect(status.timestamp).toBe('2026-01-19T12:00:00Z');
      expect(status.method).toBe('interactive');
      expect(status.policyVersion).toBe('1.0.0');
    });
  });

  describe('revokeConsent', () => {
    it('deletes consent file', () => {
      fs.existsSync.mockReturnValue(true);
      const result = revokeConsent();
      expect(result.ok).toBe(true);
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('succeeds even when file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      const result = revokeConsent();
      expect(result.ok).toBe(true);
    });

    it('returns error on delete failure', () => {
      fs.existsSync.mockReturnValue(true);
      fs.unlinkSync.mockImplementation(() => {
        throw new Error('Delete failed');
      });
      const result = revokeConsent();
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Delete failed');
    });
  });
});
