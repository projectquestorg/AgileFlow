'use strict';

const React = require('react');
const { Box, Text } = require('ink');
const fs = require('fs');
const path = require('path');

// Get session-manager functions
let getSessions;
try {
  const sessionManager = require('../../session-manager');
  getSessions = sessionManager.getSessions;
} catch (e) {
  // Fallback if module not found
  getSessions = () => ({ sessions: [], cleaned: 0 });
}

/**
 * Get thread type color
 */
function getThreadColor(threadType) {
  const colors = {
    base: 'green',
    parallel: 'cyan',
    chained: 'yellow',
    fusion: 'magenta',
    big: 'blue',
    long: 'white',
  };
  return colors[threadType] || 'gray';
}

/**
 * Get status color
 */
function getStatusColor(active, current) {
  if (current) return 'green';
  if (active) return 'cyan';
  return 'gray';
}

/**
 * Format session for display
 */
function formatSession(session) {
  const { id, branch, story, nickname, thread_type, active, current, is_main } = session;

  // Build display name
  let displayName = `Session ${id}`;
  if (nickname) displayName += ` "${nickname}"`;
  if (is_main) displayName += ' [main]';

  return {
    displayName,
    branch: branch || 'unknown',
    story: story || 'none',
    threadType: thread_type || 'base',
    active,
    current,
  };
}

/**
 * SessionRow component - displays a single session
 */
function SessionRow({ session }) {
  const fmt = formatSession(session);
  const statusColor = getStatusColor(fmt.active, fmt.current);
  const threadColor = getThreadColor(fmt.threadType);

  // Current session indicator
  const indicator = fmt.current ? '▶' : ' ';
  const indicatorColor = fmt.current ? 'green' : 'gray';

  return React.createElement(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    // Session name row
    React.createElement(
      Box,
      null,
      React.createElement(Text, { color: indicatorColor }, indicator + ' '),
      React.createElement(Text, { bold: true, color: statusColor }, fmt.displayName),
      React.createElement(Text, { dimColor: true }, ' ['),
      React.createElement(Text, { color: threadColor }, fmt.threadType),
      React.createElement(Text, { dimColor: true }, ']')
    ),
    // Branch and story
    React.createElement(
      Box,
      { paddingLeft: 3 },
      React.createElement(Text, { dimColor: true }, 'Branch: '),
      React.createElement(Text, { color: 'cyan' }, fmt.branch)
    ),
    React.createElement(
      Box,
      { paddingLeft: 3 },
      React.createElement(Text, { dimColor: true }, 'Story: '),
      React.createElement(Text, { color: fmt.story === 'none' ? 'gray' : 'yellow' }, fmt.story)
    )
  );
}

/**
 * SessionPanel component - displays all sessions
 */
function SessionPanel({ refreshInterval = 5000 }) {
  const [sessions, setSessions] = React.useState([]);
  const [lastUpdate, setLastUpdate] = React.useState(new Date());

  // Load sessions on mount and on interval
  React.useEffect(() => {
    function loadSessions() {
      try {
        const result = getSessions();
        setSessions(result.sessions || []);
        setLastUpdate(new Date());
      } catch (e) {
        // Silently handle errors
        setSessions([]);
      }
    }

    // Initial load
    loadSessions();

    // Refresh periodically
    const interval = setInterval(loadSessions, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval]);

  // Empty state
  if (sessions.length === 0) {
    return React.createElement(
      Box,
      { flexDirection: 'column', padding: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' }, 'SESSIONS'),
      React.createElement(Text, { dimColor: true, italic: true }, 'No active sessions')
    );
  }

  return React.createElement(
    Box,
    { flexDirection: 'column', padding: 1 },
    // Header
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' }, 'SESSIONS'),
      React.createElement(Text, { dimColor: true }, ` (${sessions.length})`)
    ),
    // Session list
    ...sessions.map((session, index) =>
      React.createElement(SessionRow, { key: session.id || index, session })
    ),
    // Footer with refresh info
    React.createElement(
      Box,
      { marginTop: 1 },
      React.createElement(
        Text,
        { dimColor: true, italic: true },
        `Updated: ${lastUpdate.toLocaleTimeString()}`
      )
    )
  );
}

module.exports = { SessionPanel, SessionRow, formatSession, getThreadColor };
