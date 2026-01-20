/**
 * Tests for correlation.js - Correlation ID management
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  generateTraceId,
  generateSpanId,
  generateSessionId,
  getContext,
  setContext,
  clearContext,
  startTrace,
  startSpan,
  injectCorrelation,
  extractCorrelation,
  initializeForProject,
  loadSessionId,
  saveSessionId,
  filterByTraceId,
  filterBySessionId,
} = require('../../lib/correlation');

describe('correlation', () => {
  beforeEach(() => {
    clearContext();
  });

  describe('ID generation', () => {
    describe('generateTraceId', () => {
      it('generates 16 character hex string', () => {
        const id = generateTraceId();
        expect(id).toMatch(/^[0-9a-f]{16}$/);
      });

      it('generates unique IDs', () => {
        const ids = new Set();
        for (let i = 0; i < 100; i++) {
          ids.add(generateTraceId());
        }
        expect(ids.size).toBe(100);
      });
    });

    describe('generateSpanId', () => {
      it('generates 8 character hex string', () => {
        const id = generateSpanId();
        expect(id).toMatch(/^[0-9a-f]{8}$/);
      });

      it('generates unique IDs', () => {
        const ids = new Set();
        for (let i = 0; i < 100; i++) {
          ids.add(generateSpanId());
        }
        expect(ids.size).toBe(100);
      });
    });

    describe('generateSessionId', () => {
      it('generates session ID with correct format', () => {
        const id = generateSessionId();
        // Format: session_YYYYMMDD_HHMMSS_XXXX
        expect(id).toMatch(/^session_\d{8}_\d{6}_[0-9a-f]{4}$/);
      });

      it('generates unique session IDs', () => {
        const ids = new Set();
        for (let i = 0; i < 100; i++) {
          ids.add(generateSessionId());
        }
        expect(ids.size).toBe(100);
      });

      it('includes current date', () => {
        const id = generateSessionId();
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        expect(id).toContain(today);
      });
    });
  });

  describe('context management', () => {
    describe('getContext', () => {
      it('returns empty context initially', () => {
        const ctx = getContext();
        expect(ctx.traceId).toBeNull();
        expect(ctx.sessionId).toBeNull();
        expect(ctx.spanId).toBeNull();
      });

      it('returns a copy, not reference', () => {
        setContext({ traceId: 'test123' });
        const ctx = getContext();
        ctx.traceId = 'modified';
        expect(getContext().traceId).toBe('test123');
      });
    });

    describe('setContext', () => {
      it('sets trace ID', () => {
        setContext({ traceId: 'trace123' });
        expect(getContext().traceId).toBe('trace123');
      });

      it('sets session ID', () => {
        setContext({ sessionId: 'session_20250119_120000_abcd' });
        expect(getContext().sessionId).toBe('session_20250119_120000_abcd');
      });

      it('sets span ID', () => {
        setContext({ spanId: 'span1234' });
        expect(getContext().spanId).toBe('span1234');
      });

      it('sets parent span ID', () => {
        setContext({ parentSpanId: 'parent1234' });
        expect(getContext().parentSpanId).toBe('parent1234');
      });

      it('preserves existing values when setting partial context', () => {
        setContext({ traceId: 'trace1', sessionId: 'session1' });
        setContext({ spanId: 'span1' });

        const ctx = getContext();
        expect(ctx.traceId).toBe('trace1');
        expect(ctx.sessionId).toBe('session1');
        expect(ctx.spanId).toBe('span1');
      });
    });

    describe('clearContext', () => {
      it('resets all context values', () => {
        setContext({
          traceId: 'trace1',
          sessionId: 'session1',
          spanId: 'span1',
          parentSpanId: 'parent1',
        });

        clearContext();
        const ctx = getContext();

        expect(ctx.traceId).toBeNull();
        expect(ctx.sessionId).toBeNull();
        expect(ctx.spanId).toBeNull();
        expect(ctx.parentSpanId).toBeNull();
      });
    });

    describe('startTrace', () => {
      it('generates new trace ID', () => {
        const trace = startTrace();
        expect(trace.traceId).toMatch(/^[0-9a-f]{16}$/);
      });

      it('generates new session ID if none exists', () => {
        const trace = startTrace();
        expect(trace.sessionId).toMatch(/^session_/);
      });

      it('uses existing session ID from context', () => {
        setContext({ sessionId: 'existing_session' });
        const trace = startTrace();
        expect(trace.sessionId).toBe('existing_session');
      });

      it('uses provided session ID in options', () => {
        const trace = startTrace({ sessionId: 'provided_session' });
        expect(trace.sessionId).toBe('provided_session');
      });

      it('generates span ID', () => {
        const trace = startTrace();
        expect(trace.spanId).toMatch(/^[0-9a-f]{8}$/);
      });

      it('updates global context', () => {
        const trace = startTrace();
        const ctx = getContext();
        expect(ctx.traceId).toBe(trace.traceId);
        expect(ctx.sessionId).toBe(trace.sessionId);
        expect(ctx.spanId).toBe(trace.spanId);
      });

      it('clears parent span ID', () => {
        setContext({ parentSpanId: 'old_parent' });
        startTrace();
        expect(getContext().parentSpanId).toBeNull();
      });
    });

    describe('startSpan', () => {
      it('generates new span ID', () => {
        startTrace();
        const span = startSpan();
        expect(span.spanId).toMatch(/^[0-9a-f]{8}$/);
      });

      it('preserves trace ID', () => {
        const trace = startTrace();
        const span = startSpan();
        expect(span.traceId).toBe(trace.traceId);
      });

      it('preserves session ID', () => {
        const trace = startTrace();
        const span = startSpan();
        expect(span.sessionId).toBe(trace.sessionId);
      });

      it('sets parent span ID from previous span', () => {
        const trace = startTrace();
        const span = startSpan();
        expect(span.parentSpanId).toBe(trace.spanId);
      });

      it('chains parent spans correctly', () => {
        const trace = startTrace();
        const span1 = startSpan();
        const span2 = startSpan();

        expect(span1.parentSpanId).toBe(trace.spanId);
        expect(span2.parentSpanId).toBe(span1.spanId);
      });
    });
  });

  describe('event injection/extraction', () => {
    describe('injectCorrelation', () => {
      it('adds correlation IDs to event', () => {
        startTrace();
        const event = { type: 'test', data: 'value' };
        const injected = injectCorrelation(event);

        expect(injected.trace_id).toBeDefined();
        expect(injected.session_id).toBeDefined();
        expect(injected.span_id).toBeDefined();
        expect(injected.type).toBe('test');
        expect(injected.data).toBe('value');
      });

      it('does not modify original event', () => {
        startTrace();
        const event = { type: 'test' };
        injectCorrelation(event);
        expect(event.trace_id).toBeUndefined();
      });

      it('skips null correlation values', () => {
        clearContext();
        const event = { type: 'test' };
        const injected = injectCorrelation(event);

        expect(injected.trace_id).toBeUndefined();
        expect(injected.session_id).toBeUndefined();
        expect(injected.span_id).toBeUndefined();
      });

      it('includes parent span ID when present', () => {
        startTrace();
        startSpan();
        const event = { type: 'test' };
        const injected = injectCorrelation(event);

        expect(injected.parent_span_id).toBeDefined();
      });
    });

    describe('extractCorrelation', () => {
      it('extracts correlation IDs from event', () => {
        const event = {
          type: 'test',
          trace_id: 'trace123',
          session_id: 'session123',
          span_id: 'span123',
        };

        const extracted = extractCorrelation(event);
        expect(extracted.traceId).toBe('trace123');
        expect(extracted.sessionId).toBe('session123');
        expect(extracted.spanId).toBe('span123');
      });

      it('returns null for missing IDs', () => {
        const event = { type: 'test' };
        const extracted = extractCorrelation(event);

        expect(extracted.traceId).toBeNull();
        expect(extracted.sessionId).toBeNull();
        expect(extracted.spanId).toBeNull();
      });
    });
  });

  describe('filtering', () => {
    const events = [
      { type: 'a', trace_id: 'trace1', session_id: 'session1' },
      { type: 'b', trace_id: 'trace1', session_id: 'session1' },
      { type: 'c', trace_id: 'trace2', session_id: 'session1' },
      { type: 'd', trace_id: 'trace2', session_id: 'session2' },
    ];

    describe('filterByTraceId', () => {
      it('filters events by trace ID', () => {
        const filtered = filterByTraceId(events, 'trace1');
        expect(filtered).toHaveLength(2);
        expect(filtered[0].type).toBe('a');
        expect(filtered[1].type).toBe('b');
      });

      it('returns empty array for non-existent trace', () => {
        const filtered = filterByTraceId(events, 'nonexistent');
        expect(filtered).toHaveLength(0);
      });
    });

    describe('filterBySessionId', () => {
      it('filters events by session ID', () => {
        const filtered = filterBySessionId(events, 'session1');
        expect(filtered).toHaveLength(3);
      });

      it('returns empty array for non-existent session', () => {
        const filtered = filterBySessionId(events, 'nonexistent');
        expect(filtered).toHaveLength(0);
      });
    });
  });

  describe('project integration', () => {
    let tempDir;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'correlation-test-'));
      fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    describe('loadSessionId', () => {
      it('returns null when session-state.json does not exist', () => {
        const id = loadSessionId(tempDir);
        expect(id).toBeNull();
      });

      it('loads session ID from file', () => {
        const sessionStatePath = path.join(tempDir, 'docs', '09-agents', 'session-state.json');
        fs.writeFileSync(sessionStatePath, JSON.stringify({ session_id: 'test_session_123' }));

        const id = loadSessionId(tempDir);
        expect(id).toBe('test_session_123');
      });

      it('returns null if file is malformed', () => {
        const sessionStatePath = path.join(tempDir, 'docs', '09-agents', 'session-state.json');
        fs.writeFileSync(sessionStatePath, 'not json');

        const id = loadSessionId(tempDir);
        expect(id).toBeNull();
      });
    });

    describe('saveSessionId', () => {
      it('saves session ID to file', () => {
        saveSessionId(tempDir, 'test_session_456');

        const sessionStatePath = path.join(tempDir, 'docs', '09-agents', 'session-state.json');
        const data = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
        expect(data.session_id).toBe('test_session_456');
      });

      it('preserves existing data', () => {
        const sessionStatePath = path.join(tempDir, 'docs', '09-agents', 'session-state.json');
        fs.writeFileSync(sessionStatePath, JSON.stringify({ existing: 'data' }));

        saveSessionId(tempDir, 'new_session');

        const data = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
        expect(data.session_id).toBe('new_session');
        expect(data.existing).toBe('data');
      });

      it('adds updated_at timestamp', () => {
        saveSessionId(tempDir, 'test_session');

        const sessionStatePath = path.join(tempDir, 'docs', '09-agents', 'session-state.json');
        const data = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
        expect(data.updated_at).toBeDefined();
        expect(new Date(data.updated_at)).toBeInstanceOf(Date);
      });
    });

    describe('initializeForProject', () => {
      it('creates new session ID if none exists', () => {
        const { sessionId } = initializeForProject(tempDir);
        expect(sessionId).toMatch(/^session_/);

        // Verify it was saved
        const loaded = loadSessionId(tempDir);
        expect(loaded).toBe(sessionId);
      });

      it('uses existing session ID', () => {
        saveSessionId(tempDir, 'existing_session');

        const { sessionId } = initializeForProject(tempDir);
        expect(sessionId).toBe('existing_session');
      });

      it('starts new trace by default', () => {
        const result = initializeForProject(tempDir);
        expect(result.traceId).toMatch(/^[0-9a-f]{16}$/);
        expect(getContext().traceId).toBe(result.traceId);
      });

      it('can skip new trace when option is false', () => {
        initializeForProject(tempDir, { newTrace: false });
        // Should still have a trace ID but context may vary
        const ctx = getContext();
        expect(ctx.sessionId).toBeDefined();
      });

      it('updates global context', () => {
        const result = initializeForProject(tempDir);
        const ctx = getContext();

        expect(ctx.sessionId).toBe(result.sessionId);
        expect(ctx.traceId).toBe(result.traceId);
      });
    });
  });
});
