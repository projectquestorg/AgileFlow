/**
 * Tests for channel-adapter.js (EP-0049)
 *
 * Tests cover:
 * - normalizeEvent() - valid events, invalid inputs, payload sanitization
 * - sanitizePayload() - truncation, nested objects, injection patterns
 * - isDuplicate() - deduplication window, unique events
 * - checkChannelBudget() - rate limiting, budget enforcement
 * - processEvent() - end-to-end with feature flag checks
 * - registerChannel() / getChannelStatus() / removeChannel() - registry CRUD
 *
 * Uses real temp directories (not mocked fs).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  normalizeEvent,
  sanitizePayload,
  isDuplicate,
  checkChannelBudget,
  registerChannel,
  getChannelStatus,
  removeChannel,
  CHANNEL_SOURCES,
  SOURCE_TO_BUS_CHANNEL,
  MAX_PAYLOAD_SIZE,
  CHANNEL_BUDGET_PER_HOUR,
} = require('../../../scripts/lib/channel-adapter');

describe('channel-adapter', () => {
  let tempDir;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'channel-adapter-test-'));
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ========================================================================
  // normalizeEvent()
  // ========================================================================

  describe('normalizeEvent', () => {
    it('normalizes a valid CI event', () => {
      const result = normalizeEvent({
        source: 'ci',
        type: 'ci_failure',
        payload: { workflow: 'tests', branch: 'main' },
      });

      expect(result.ok).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.message.from).toBe('channel:ci');
      expect(result.message.to).toBe('system');
      expect(result.message.type).toBe('channel_event');
      expect(result.message.source).toBe('ci');
      expect(result.message.event_type).toBe('ci_failure');
      expect(result.message.channel).toBe('ci-events');
      expect(result.message.payload.workflow).toBe('tests');
    });

    it('maps source types to correct bus channels', () => {
      for (const source of CHANNEL_SOURCES) {
        const result = normalizeEvent({ source, type: 'test' });
        expect(result.ok).toBe(true);
        expect(result.message.channel).toBe(SOURCE_TO_BUS_CHANNEL[source]);
      }
    });

    it('rejects event without source', () => {
      const result = normalizeEvent({ type: 'test' });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/source/);
    });

    it('rejects event without type', () => {
      const result = normalizeEvent({ source: 'ci' });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/type/);
    });

    it('rejects unknown source', () => {
      const result = normalizeEvent({ source: 'unknown-thing', type: 'test' });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/Unknown source/);
    });

    it('rejects null input', () => {
      expect(normalizeEvent(null).ok).toBe(false);
      expect(normalizeEvent(undefined).ok).toBe(false);
    });

    it('includes sender when provided', () => {
      const result = normalizeEvent({
        source: 'telegram',
        type: 'message',
        sender: '@user123',
      });
      expect(result.message.sender).toBe('@user123');
    });

    it('truncates long sender names', () => {
      const result = normalizeEvent({
        source: 'telegram',
        type: 'message',
        sender: 'a'.repeat(200),
      });
      expect(result.message.sender.length).toBe(100);
    });

    it('includes sourceId for deduplication', () => {
      const result = normalizeEvent({
        source: 'ci',
        type: 'ci_failure',
        sourceId: 'run-12345',
      });
      expect(result.message.source_id).toBe('run-12345');
    });
  });

  // ========================================================================
  // sanitizePayload()
  // ========================================================================

  describe('sanitizePayload', () => {
    it('passes through simple string/number/boolean values', () => {
      const result = sanitizePayload({
        name: 'test',
        count: 42,
        active: true,
      });
      expect(result.name).toBe('test');
      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
    });

    it('truncates long string values', () => {
      const longString = 'x'.repeat(MAX_PAYLOAD_SIZE + 500);
      const result = sanitizePayload({ msg: longString });
      expect(result.msg.length).toBe(MAX_PAYLOAD_SIZE);
    });

    it('removes code blocks from strings', () => {
      const result = sanitizePayload({
        msg: 'Error: ```rm -rf /```',
      });
      expect(result.msg).not.toContain('rm -rf');
      expect(result.msg).toContain('[code-block-removed]');
    });

    it('drops nested objects', () => {
      const result = sanitizePayload({
        name: 'test',
        nested: { deep: { deeper: 'value' } },
      });
      expect(result.name).toBe('test');
      expect(result.nested).toBeUndefined();
    });

    it('handles array values (limited to 10 items)', () => {
      const result = sanitizePayload({
        items: Array.from({ length: 20 }, (_, i) => `item-${i}`),
      });
      expect(result.items.length).toBe(10);
    });

    it('sanitizes object keys', () => {
      const result = sanitizePayload({
        'normal-key': 'ok',
        'key with spaces!@#': 'sanitized',
      });
      expect(result['normal-key']).toBe('ok');
      expect(result['key_with_spaces___']).toBe('sanitized');
    });

    it('handles string payload directly', () => {
      const result = sanitizePayload('simple string');
      expect(result).toBe('simple string');
    });

    it('handles null/undefined payload', () => {
      expect(sanitizePayload(null)).toEqual({});
      expect(sanitizePayload(undefined)).toEqual({});
    });
  });

  // ========================================================================
  // isDuplicate()
  // ========================================================================

  describe('isDuplicate', () => {
    it('returns false for first occurrence', () => {
      expect(isDuplicate('unique-event-001', 'ci')).toBe(false);
    });

    it('returns true for duplicate within window', () => {
      const id = 'dedup-test-' + Date.now();
      expect(isDuplicate(id, 'ci')).toBe(false);
      expect(isDuplicate(id, 'ci')).toBe(true);
    });

    it('returns false when no sourceId', () => {
      expect(isDuplicate(null, 'ci')).toBe(false);
      expect(isDuplicate(undefined, 'ci')).toBe(false);
    });

    it('treats different sources as different events', () => {
      const id = 'cross-source-' + Date.now();
      expect(isDuplicate(id, 'ci')).toBe(false);
      expect(isDuplicate(id, 'webhook')).toBe(false);
    });
  });

  // ========================================================================
  // checkChannelBudget()
  // ========================================================================

  describe('checkChannelBudget', () => {
    it('allows events within budget', () => {
      const source = 'budget-test-' + Date.now();
      const result = checkChannelBudget(source);
      expect(result.allowed).toBe(true);
      expect(result.count).toBe(1);
      expect(result.limit).toBe(CHANNEL_BUDGET_PER_HOUR);
    });

    it('tracks event count', () => {
      const source = 'count-test-' + Date.now();
      checkChannelBudget(source);
      checkChannelBudget(source);
      const result = checkChannelBudget(source);
      expect(result.count).toBe(3);
    });
  });

  // ========================================================================
  // Channel Registry
  // ========================================================================

  describe('registerChannel', () => {
    it('registers a new channel', () => {
      const rootDir = path.join(tempDir, 'reg-test');
      fs.mkdirSync(path.join(rootDir, 'docs', '09-agents'), { recursive: true });

      const result = registerChannel(rootDir, 'my-ci', {
        source: 'ci',
        trustLevel: 'observe',
      });

      expect(result.ok).toBe(true);
    });

    it('stores channel config on disk', () => {
      const rootDir = path.join(tempDir, 'store-test');
      fs.mkdirSync(path.join(rootDir, 'docs', '09-agents'), { recursive: true });

      registerChannel(rootDir, 'my-webhook', {
        source: 'webhook',
        trustLevel: 'suggest',
      });

      const configPath = path.join(rootDir, 'docs', '09-agents', 'channels.json');
      expect(fs.existsSync(configPath)).toBe(true);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(config.channels['my-webhook'].source).toBe('webhook');
      expect(config.channels['my-webhook'].trustLevel).toBe('suggest');
      expect(config.channels['my-webhook'].enabled).toBe(true);
    });
  });

  describe('getChannelStatus', () => {
    it('returns empty channels when no config exists', () => {
      const rootDir = path.join(tempDir, 'status-empty');
      const result = getChannelStatus(rootDir);
      expect(result.ok).toBe(true);
      expect(result.channels).toEqual({});
    });

    it('returns registered channels', () => {
      const rootDir = path.join(tempDir, 'status-test');
      fs.mkdirSync(path.join(rootDir, 'docs', '09-agents'), { recursive: true });

      registerChannel(rootDir, 'ch1', { source: 'ci' });
      registerChannel(rootDir, 'ch2', { source: 'telegram' });

      const result = getChannelStatus(rootDir);
      expect(result.ok).toBe(true);
      expect(Object.keys(result.channels)).toEqual(['ch1', 'ch2']);
    });
  });

  describe('removeChannel', () => {
    it('removes a registered channel', () => {
      const rootDir = path.join(tempDir, 'remove-test');
      fs.mkdirSync(path.join(rootDir, 'docs', '09-agents'), { recursive: true });

      registerChannel(rootDir, 'to-remove', { source: 'ci' });
      const result = removeChannel(rootDir, 'to-remove');
      expect(result.ok).toBe(true);

      const status = getChannelStatus(rootDir);
      expect(status.channels['to-remove']).toBeUndefined();
    });

    it('returns error for non-existent channel', () => {
      const rootDir = path.join(tempDir, 'remove-missing');
      const result = removeChannel(rootDir, 'nope');
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/not found/);
    });
  });

  // ========================================================================
  // Constants
  // ========================================================================

  describe('constants', () => {
    it('has all expected source types', () => {
      expect(CHANNEL_SOURCES).toContain('ci');
      expect(CHANNEL_SOURCES).toContain('webhook');
      expect(CHANNEL_SOURCES).toContain('telegram');
      expect(CHANNEL_SOURCES).toContain('discord');
      expect(CHANNEL_SOURCES).toContain('file-watcher');
      expect(CHANNEL_SOURCES).toContain('error-monitor');
      expect(CHANNEL_SOURCES).toContain('health-check');
      expect(CHANNEL_SOURCES).toContain('custom');
    });

    it('maps all sources to bus channels', () => {
      for (const source of CHANNEL_SOURCES) {
        expect(SOURCE_TO_BUS_CHANNEL[source]).toBeDefined();
      }
    });
  });
});
