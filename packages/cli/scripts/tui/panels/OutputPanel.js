'use strict';

/**
 * Agent Output Panel - Live updates from agent event stream
 *
 * Displays real-time agent messages with timestamps and agent names.
 * Auto-scrolls to bottom, limits display to configurable message count.
 */

const React = require('react');
const { Box, Text, Newline } = require('ink');
const { EventStream, formatEvent } = require('../lib/eventStream');

/**
 * Get color for agent type
 */
function getAgentColor(agent) {
  const colors = {
    'agileflow-api': 'cyan',
    'agileflow-ui': 'magenta',
    'agileflow-testing': 'yellow',
    'agileflow-ci': 'green',
    'agileflow-security': 'red',
    'agileflow-devops': 'blue',
    'agileflow-database': 'white',
    'agileflow-performance': 'cyan',
    'agileflow-documentation': 'gray'
  };

  // Check for partial matches
  for (const [key, color] of Object.entries(colors)) {
    if (agent && agent.includes(key.replace('agileflow-', ''))) {
      return color;
    }
  }

  return 'gray';
}

/**
 * Get status indicator for event type
 */
function getStatusIndicator(eventType) {
  switch (eventType) {
    case 'init':
      return { symbol: '▶', color: 'blue' };
    case 'iteration':
      return { symbol: '↻', color: 'cyan' };
    case 'passed':
      return { symbol: '✓', color: 'green' };
    case 'failed':
      return { symbol: '✗', color: 'red' };
    case 'abort':
      return { symbol: '⊘', color: 'yellow' };
    default:
      return { symbol: '•', color: 'gray' };
  }
}

/**
 * Single output row component
 */
function OutputRow({ event, showTimestamp = true }) {
  const formatted = formatEvent(event);
  const agentColor = getAgentColor(formatted.agent);
  const status = getStatusIndicator(formatted.eventType);

  return React.createElement(
    Box,
    { flexDirection: 'row' },
    // Timestamp
    showTimestamp && formatted.timestamp && React.createElement(
      Text,
      { dimColor: true },
      `[${formatted.timestamp}] `
    ),
    // Status indicator
    React.createElement(
      Text,
      { color: status.color },
      `${status.symbol} `
    ),
    // Agent name
    React.createElement(
      Text,
      { color: agentColor, bold: true },
      `[${formatted.agent}] `
    ),
    // Message
    React.createElement(
      Text,
      null,
      formatted.message
    )
  );
}

/**
 * Main Output Panel component
 */
function OutputPanel({
  maxMessages = 100,
  showTimestamp = true,
  logPath = null,
  title = 'AGENT OUTPUT'
}) {
  const [messages, setMessages] = React.useState([]);
  const [isConnected, setIsConnected] = React.useState(false);
  const [error, setError] = React.useState(null);
  const streamRef = React.useRef(null);

  React.useEffect(() => {
    // Create event stream
    const options = logPath ? { logPath, emitHistory: true, historyLimit: 10 } : { emitHistory: true, historyLimit: 10 };
    const stream = new EventStream(options);
    streamRef.current = stream;

    // Handle events
    stream.on('event', (event) => {
      setMessages((prev) => {
        const newMessages = [...prev, event];
        // Limit to maxMessages
        if (newMessages.length > maxMessages) {
          return newMessages.slice(-maxMessages);
        }
        return newMessages;
      });
    });

    stream.on('started', () => {
      setIsConnected(true);
      setError(null);
    });

    stream.on('stopped', () => {
      setIsConnected(false);
    });

    stream.on('error', (err) => {
      setError(err.message);
    });

    stream.on('truncated', () => {
      // Clear messages on log rotation
      setMessages([]);
    });

    // Start watching
    stream.start();

    // Cleanup
    return () => {
      if (streamRef.current) {
        streamRef.current.stop();
      }
    };
  }, [logPath, maxMessages]);

  // Render panel
  return React.createElement(
    Box,
    {
      flexDirection: 'column',
      borderStyle: 'single',
      borderColor: isConnected ? 'green' : 'gray',
      padding: 1,
      flexGrow: 1
    },
    // Header
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(
        Text,
        { bold: true, color: 'cyan' },
        title
      ),
      React.createElement(
        Text,
        { dimColor: true },
        ` (${messages.length}/${maxMessages})`
      ),
      isConnected && React.createElement(
        Text,
        { color: 'green' },
        ' ●'
      ),
      !isConnected && !error && React.createElement(
        Text,
        { color: 'yellow' },
        ' ○'
      ),
      error && React.createElement(
        Text,
        { color: 'red' },
        ' ✗'
      )
    ),
    // Messages or placeholder
    messages.length === 0
      ? React.createElement(
          Text,
          { dimColor: true, italic: true },
          error ? `Error: ${error}` : 'Waiting for agent activity...'
        )
      : messages.map((event, index) =>
          React.createElement(OutputRow, {
            key: `msg-${index}`,
            event,
            showTimestamp
          })
        )
  );
}

/**
 * Compact output view (for split panels)
 */
function CompactOutput({ maxLines = 5, logPath = null }) {
  const [messages, setMessages] = React.useState([]);
  const streamRef = React.useRef(null);

  React.useEffect(() => {
    const options = logPath ? { logPath } : {};
    const stream = new EventStream(options);
    streamRef.current = stream;

    stream.on('event', (event) => {
      setMessages((prev) => {
        const newMessages = [...prev, event];
        return newMessages.slice(-maxLines);
      });
    });

    stream.start();

    return () => {
      if (streamRef.current) {
        streamRef.current.stop();
      }
    };
  }, [logPath, maxLines]);

  if (messages.length === 0) {
    return React.createElement(
      Text,
      { dimColor: true },
      'No recent activity'
    );
  }

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    messages.map((event, index) => {
      const formatted = formatEvent(event);
      const status = getStatusIndicator(formatted.eventType);
      return React.createElement(
        Text,
        { key: `compact-${index}` },
        React.createElement(Text, { color: status.color }, status.symbol),
        ' ',
        React.createElement(Text, { dimColor: true }, `[${formatted.agent}]`),
        ' ',
        formatted.message.substring(0, 50),
        formatted.message.length > 50 ? '...' : ''
      );
    })
  );
}

module.exports = {
  OutputPanel,
  OutputRow,
  CompactOutput,
  getAgentColor,
  getStatusIndicator
};
