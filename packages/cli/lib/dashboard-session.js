'use strict';

/**
 * dashboard-session.js - Dashboard Session Management
 *
 * Manages individual client sessions with rate limiting,
 * message history, and state tracking.
 * Extracted from dashboard-server.js for testability.
 */

const { encodeWebSocketFrame } = require('./dashboard-websocket');

// Session lifecycle
const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
const SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Rate limiting (token bucket)
const RATE_LIMIT_TOKENS = 100; // max messages per second
const RATE_LIMIT_REFILL_MS = 1000; // refill interval

// Lazy-loaded protocol
let _protocol;
function getProtocol() {
  if (!_protocol) _protocol = require('./dashboard-protocol');
  return _protocol;
}

/**
 * Session state for a connected dashboard
 */
class DashboardSession {
  constructor(id, ws, projectRoot) {
    this.id = id;
    this.ws = ws;
    this.projectRoot = projectRoot;
    this.messages = [];
    this.state = 'connected';
    this.lastActivity = new Date();
    this.createdAt = new Date();
    this.metadata = {};

    // Token bucket rate limiter
    this._rateTokens = RATE_LIMIT_TOKENS;
    this._rateLastRefill = Date.now();
  }

  /**
   * Check if session has expired
   * @returns {boolean}
   */
  isExpired() {
    return Date.now() - this.lastActivity.getTime() > SESSION_TIMEOUT_MS;
  }

  /**
   * Rate-limit incoming messages (token bucket)
   * @returns {boolean} true if allowed, false if rate-limited
   */
  checkRateLimit() {
    const now = Date.now();
    const elapsed = now - this._rateLastRefill;

    // Refill tokens based on elapsed time
    if (elapsed >= RATE_LIMIT_REFILL_MS) {
      this._rateTokens = RATE_LIMIT_TOKENS;
      this._rateLastRefill = now;
    }

    if (this._rateTokens <= 0) {
      return false;
    }

    this._rateTokens--;
    return true;
  }

  /**
   * Send a message to the dashboard
   * @param {Object} message - Message object
   */
  send(message) {
    if (this.ws && this.ws.writable) {
      try {
        const frame = encodeWebSocketFrame(getProtocol().serializeMessage(message));
        this.ws.write(frame);
        this.lastActivity = new Date();
      } catch (error) {
        console.error(`[Session ${this.id}] Send error:`, error.message);
      }
    }
  }

  /**
   * Add a message to conversation history
   * @param {string} role - 'user' or 'assistant'
   * @param {string} content - Message content
   */
  addMessage(role, content) {
    this.messages.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });
    this.lastActivity = new Date();
  }

  /**
   * Get conversation history
   * @returns {Array}
   */
  getHistory() {
    return this.messages;
  }

  /**
   * Update session state
   * @param {string} state - New state (connected, thinking, idle, error)
   */
  setState(state) {
    this.state = state;
    this.send(
      getProtocol().createSessionState(this.id, state, {
        messageCount: this.messages.length,
        lastActivity: this.lastActivity.toISOString(),
      })
    );
  }
}

module.exports = {
  DashboardSession,
  SESSION_TIMEOUT_MS,
  SESSION_CLEANUP_INTERVAL_MS,
  RATE_LIMIT_TOKENS,
  RATE_LIMIT_REFILL_MS,
};
