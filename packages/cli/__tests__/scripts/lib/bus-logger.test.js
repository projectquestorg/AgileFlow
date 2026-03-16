/**
 * Tests for bus-logger.js - Agent-level traceability event logger
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  AGENT_EVENT_TYPES,
  FINDING_SEVERITY,
  appendEvent,
  createBaseEvent,
  logFinding,
  logChange,
  logGateCheck,
  createBusLogger,
  queryEvents,
} = require('../../../scripts/lib/bus-logger');

describe('bus-logger', () => {
  let tmpDir;
  let logPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bus-logger-test-'));
    logPath = path.join(tmpDir, 'bus', 'log.jsonl');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ========================================================================
  // Constants
  // ========================================================================

  describe('AGENT_EVENT_TYPES', () => {
    it('defines all required event types', () => {
      expect(AGENT_EVENT_TYPES.FINDING).toBe('agent_finding');
      expect(AGENT_EVENT_TYPES.CHANGE).toBe('agent_change');
      expect(AGENT_EVENT_TYPES.GATE_CHECK).toBe('agent_gate_check');
    });
  });

  describe('FINDING_SEVERITY', () => {
    it('defines severity levels', () => {
      expect(FINDING_SEVERITY.CRITICAL).toBe('critical');
      expect(FINDING_SEVERITY.HIGH).toBe('high');
      expect(FINDING_SEVERITY.MEDIUM).toBe('medium');
      expect(FINDING_SEVERITY.LOW).toBe('low');
      expect(FINDING_SEVERITY.INFO).toBe('info');
    });
  });

  // ========================================================================
  // Core Functions
  // ========================================================================

  describe('appendEvent', () => {
    it('creates directory and file if not exists', () => {
      const event = { type: 'test', ts: new Date().toISOString() };
      const result = appendEvent(logPath, event);

      expect(result.ok).toBe(true);
      expect(fs.existsSync(logPath)).toBe(true);
    });

    it('appends JSON line to file', () => {
      appendEvent(logPath, { type: 'event1' });
      appendEvent(logPath, { type: 'event2' });

      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).type).toBe('event1');
      expect(JSON.parse(lines[1]).type).toBe('event2');
    });
  });

  describe('createBaseEvent', () => {
    it('creates event with timestamp and type', () => {
      const event = createBaseEvent('test_type', { agent: 'test-agent' });

      expect(event.ts).toBeDefined();
      expect(event.type).toBe('test_type');
      expect(event.agent).toBe('test-agent');
    });

    it('sets story_id from storyId', () => {
      const event = createBaseEvent('test', { agent: 'a', storyId: 'US-0001' });
      expect(event.story_id).toBe('US-0001');
    });

    it('defaults agent to unknown', () => {
      const event = createBaseEvent('test', {});
      expect(event.agent).toBe('unknown');
    });
  });

  // ========================================================================
  // Typed Loggers
  // ========================================================================

  describe('logFinding', () => {
    it('logs a finding event', () => {
      const result = logFinding(logPath, {
        agent: 'security-analyzer',
        storyId: 'US-0123',
        finding: 'SQL injection in query builder',
        severity: 'critical',
        file: 'src/db.js',
        line: 42,
        category: 'security',
      });

      expect(result.ok).toBe(true);
      expect(result.event.type).toBe('agent_finding');
      expect(result.event.agent).toBe('security-analyzer');
      expect(result.event.finding).toBe('SQL injection in query builder');
      expect(result.event.severity).toBe('critical');
      expect(result.event.file).toBe('src/db.js');
      expect(result.event.line).toBe(42);
    });

    it('defaults severity to medium', () => {
      const result = logFinding(logPath, {
        agent: 'lint',
        finding: 'Unused variable',
      });

      expect(result.event.severity).toBe('medium');
    });

    it('persists to file', () => {
      logFinding(logPath, { agent: 'test', finding: 'test finding' });

      const content = fs.readFileSync(logPath, 'utf8');
      const event = JSON.parse(content.trim());
      expect(event.type).toBe('agent_finding');
      expect(event.finding).toBe('test finding');
    });
  });

  describe('logChange', () => {
    it('logs a change event', () => {
      const result = logChange(logPath, {
        agent: 'agileflow-api',
        storyId: 'US-0456',
        action: 'edit',
        file: 'src/routes.js',
        summary: 'Added authentication middleware',
        linesAdded: 15,
        linesRemoved: 3,
      });

      expect(result.ok).toBe(true);
      expect(result.event.type).toBe('agent_change');
      expect(result.event.action).toBe('edit');
      expect(result.event.file).toBe('src/routes.js');
      expect(result.event.lines_added).toBe(15);
      expect(result.event.lines_removed).toBe(3);
    });

    it('defaults line counts to 0', () => {
      const result = logChange(logPath, {
        agent: 'test',
        action: 'create',
        file: 'new.js',
      });

      expect(result.event.lines_added).toBe(0);
      expect(result.event.lines_removed).toBe(0);
    });
  });

  describe('logGateCheck', () => {
    it('logs a gate check event', () => {
      const result = logGateCheck(logPath, {
        agent: 'agileflow-ci',
        storyId: 'US-0789',
        gate: 'Unit Tests',
        result: 'passed',
        message: 'All 64 tests pass',
        durationMs: 1500,
      });

      expect(result.ok).toBe(true);
      expect(result.event.type).toBe('agent_gate_check');
      expect(result.event.gate).toBe('Unit Tests');
      expect(result.event.result).toBe('passed');
      expect(result.event.duration_ms).toBe(1500);
    });

    it('logs failed gate check', () => {
      const result = logGateCheck(logPath, {
        agent: 'agileflow-ci',
        gate: 'Lint',
        result: 'failed',
        message: '3 lint errors',
      });

      expect(result.event.result).toBe('failed');
    });
  });

  // ========================================================================
  // Bus Logger Factory
  // ========================================================================

  describe('createBusLogger', () => {
    it('creates logger bound to log path', () => {
      const logger = createBusLogger({ logPath });

      expect(logger.logPath).toBe(logPath);
      expect(typeof logger.logFinding).toBe('function');
      expect(typeof logger.logChange).toBe('function');
      expect(typeof logger.logGateCheck).toBe('function');
      expect(typeof logger.logRaw).toBe('function');
    });

    it('uses default log path from projectRoot', () => {
      const logger = createBusLogger({ projectRoot: tmpDir });
      expect(logger.logPath).toContain('docs');
      expect(logger.logPath).toContain('log.jsonl');
    });

    it('logs via factory methods', () => {
      const logger = createBusLogger({ logPath });

      logger.logFinding({ agent: 'test', finding: 'issue found' });
      logger.logChange({ agent: 'test', action: 'edit', file: 'a.js' });
      logger.logGateCheck({ agent: 'test', gate: 'Tests', result: 'passed' });

      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);
    });

    it('logRaw appends arbitrary event', () => {
      const logger = createBusLogger({ logPath });
      logger.logRaw({ type: 'custom', data: 'test' });

      const content = fs.readFileSync(logPath, 'utf8');
      const event = JSON.parse(content.trim());
      expect(event.type).toBe('custom');
      expect(event.ts).toBeDefined();
    });
  });

  // ========================================================================
  // Query
  // ========================================================================

  describe('queryEvents', () => {
    beforeEach(() => {
      const logger = createBusLogger({ logPath });
      logger.logFinding({ agent: 'security', storyId: 'US-001', finding: 'XSS' });
      logger.logChange({ agent: 'api', storyId: 'US-001', action: 'edit', file: 'a.js' });
      logger.logGateCheck({ agent: 'ci', storyId: 'US-002', gate: 'Tests', result: 'passed' });
    });

    it('returns all events with no filter', () => {
      const result = queryEvents(logPath);
      expect(result.ok).toBe(true);
      expect(result.events).toHaveLength(3);
    });

    it('filters by type', () => {
      const result = queryEvents(logPath, { type: 'agent_finding' });
      expect(result.events).toHaveLength(1);
      expect(result.events[0].finding).toBe('XSS');
    });

    it('filters by agent', () => {
      const result = queryEvents(logPath, { agent: 'api' });
      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe('agent_change');
    });

    it('filters by storyId', () => {
      const result = queryEvents(logPath, { storyId: 'US-001' });
      expect(result.events).toHaveLength(2);
    });

    it('returns error for invalid since date', () => {
      const result = queryEvents(logPath, { since: 'not-a-date' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Invalid filter.since date');
    });

    it('returns empty for non-existent file', () => {
      const result = queryEvents('/nonexistent/path.jsonl');
      expect(result.ok).toBe(true);
      expect(result.events).toEqual([]);
    });
  });
});
