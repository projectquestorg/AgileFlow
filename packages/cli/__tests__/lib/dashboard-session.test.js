/**
 * DashboardSession Tests
 *
 * Tests for the DashboardSession class extracted from dashboard-server.js.
 * Covers constructor defaults, expiry, rate limiting, send, addMessage, setState.
 */

'use strict';

jest.mock('../../lib/dashboard-protocol', () => ({
  serializeMessage: jest.fn(msg => JSON.stringify(msg)),
  createSessionState: jest.fn((id, state, meta) => ({
    type: 'session_state',
    sessionId: id,
    state,
    ...meta,
  })),
}));

jest.mock('../../lib/dashboard-websocket', () => ({
  encodeWebSocketFrame: jest.fn(data => Buffer.from(data)),
}));

const {
  DashboardSession,
  SESSION_TIMEOUT_MS,
  RATE_LIMIT_TOKENS,
} = require('../../lib/dashboard-session');

describe('DashboardSession', () => {
  let session;
  let mockWs;

  beforeEach(() => {
    mockWs = {
      writable: true,
      write: jest.fn(),
    };
    session = new DashboardSession('test-id', mockWs, '/test/project');
  });

  describe('constructor', () => {
    test('sets default properties', () => {
      expect(session.id).toBe('test-id');
      expect(session.ws).toBe(mockWs);
      expect(session.projectRoot).toBe('/test/project');
      expect(session.messages).toEqual([]);
      expect(session.state).toBe('connected');
      expect(session.metadata).toEqual({});
      expect(session.lastActivity).toBeInstanceOf(Date);
      expect(session.createdAt).toBeInstanceOf(Date);
    });

    test('initializes rate limiter tokens', () => {
      expect(session._rateTokens).toBe(RATE_LIMIT_TOKENS);
    });
  });

  describe('isExpired', () => {
    test('returns false for fresh session', () => {
      expect(session.isExpired()).toBe(false);
    });

    test('returns true when session exceeds timeout', () => {
      session.lastActivity = new Date(Date.now() - SESSION_TIMEOUT_MS - 1);
      expect(session.isExpired()).toBe(true);
    });

    test('returns false when session is just under timeout', () => {
      session.lastActivity = new Date(Date.now() - SESSION_TIMEOUT_MS + 1000);
      expect(session.isExpired()).toBe(false);
    });
  });

  describe('checkRateLimit', () => {
    test('allows messages within limit', () => {
      for (let i = 0; i < RATE_LIMIT_TOKENS; i++) {
        expect(session.checkRateLimit()).toBe(true);
      }
    });

    test('blocks when tokens exhausted', () => {
      for (let i = 0; i < RATE_LIMIT_TOKENS; i++) {
        session.checkRateLimit();
      }
      expect(session.checkRateLimit()).toBe(false);
    });

    test('refills tokens after interval', () => {
      // Exhaust all tokens
      for (let i = 0; i < RATE_LIMIT_TOKENS; i++) {
        session.checkRateLimit();
      }
      expect(session.checkRateLimit()).toBe(false);

      // Simulate time passing beyond refill interval
      session._rateLastRefill = Date.now() - 1001;

      expect(session.checkRateLimit()).toBe(true);
      // Tokens should be refilled (minus the one we just consumed)
      expect(session._rateTokens).toBe(RATE_LIMIT_TOKENS - 1);
    });
  });

  describe('send', () => {
    test('writes frame to writable socket', () => {
      const message = { type: 'test' };
      session.send(message);

      expect(mockWs.write).toHaveBeenCalled();
    });

    test('updates lastActivity on successful send', () => {
      const before = session.lastActivity;
      session.send({ type: 'test' });
      expect(session.lastActivity.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    test('does not write to non-writable socket', () => {
      mockWs.writable = false;
      session.send({ type: 'test' });
      expect(mockWs.write).not.toHaveBeenCalled();
    });

    test('does not write when ws is null', () => {
      session.ws = null;
      session.send({ type: 'test' });
      // No error thrown
    });

    test('handles write errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockWs.write.mockImplementation(() => {
        throw new Error('Write failed');
      });

      session.send({ type: 'test' });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Send error'),
        'Write failed'
      );
      consoleSpy.mockRestore();
    });
  });

  describe('addMessage', () => {
    test('adds message to history', () => {
      session.addMessage('user', 'hello');
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0].role).toBe('user');
      expect(session.messages[0].content).toBe('hello');
      expect(session.messages[0].timestamp).toBeDefined();
    });

    test('updates lastActivity', () => {
      const before = session.lastActivity;
      session.addMessage('assistant', 'world');
      expect(session.lastActivity.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    test('accumulates multiple messages', () => {
      session.addMessage('user', 'hello');
      session.addMessage('assistant', 'hi');
      session.addMessage('user', 'how are you');
      expect(session.messages).toHaveLength(3);
    });
  });

  describe('getHistory', () => {
    test('returns empty array for new session', () => {
      expect(session.getHistory()).toEqual([]);
    });

    test('returns accumulated messages', () => {
      session.addMessage('user', 'hello');
      session.addMessage('assistant', 'hi');
      const history = session.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].role).toBe('user');
      expect(history[1].role).toBe('assistant');
    });
  });

  describe('setState', () => {
    test('updates state property', () => {
      session.setState('thinking');
      expect(session.state).toBe('thinking');
    });

    test('sends state message via websocket', () => {
      session.setState('idle');
      expect(mockWs.write).toHaveBeenCalled();
    });
  });
});
