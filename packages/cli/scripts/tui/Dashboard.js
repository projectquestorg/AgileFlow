'use strict';

/**
 * AgileFlow TUI Dashboard
 *
 * Main layout component using Ink's Flexbox for responsive design.
 * Adapts to terminal size automatically.
 *
 * Layout:
 * ┌────────────────────────────────────────────────────────────────┐
 * │                     AgileFlow TUI v2.x                         │
 * ├──────────────────┬─────────────────────────────────────────────┤
 * │ SESSIONS         │ AGENT OUTPUT                                │
 * │ ────────         │ ────────────                                │
 * │ ▶ Session 1      │ [10:30] [api] Running tests...              │
 * │   Branch: main   │ [10:31] [api] ✓ 47 tests passed             │
 * │   Story: US-0115 │ [10:32] [ci] Building project...            │
 * │                  │                                             │
 * │ Session 2        │                                             │
 * │   Branch: feat   │                                             │
 * ├──────────────────┴─────────────────────────────────────────────┤
 * │ Loop: EP-0020 US-0115 | ████████░░░░ 65% | Q S P R T 1-9       │
 * └────────────────────────────────────────────────────────────────┘
 */

const React = require('react');
const { Box, Text, useInput, useApp, useStdout } = require('ink');
const { SessionPanel } = require('./panels/SessionPanel');
const { OutputPanel } = require('./panels/OutputPanel');
const { TracePanel } = require('./panels/TracePanel');
const { getLoopStatus } = require('./lib/loopControl');

/**
 * Version display
 */
const VERSION = '2.90.2';

/**
 * Status bar showing loop progress and key bindings
 */
function StatusBar({ loopStatus, showTrace }) {
  const progress = loopStatus?.progress || 0;
  const epic = loopStatus?.epic || '';
  const story = loopStatus?.story || '';
  const state = loopStatus?.state || 'idle';

  // Build progress bar
  const barWidth = 15;
  const filled = Math.round((progress / 100) * barWidth);
  const empty = barWidth - filled;
  const progressBar = '█'.repeat(filled) + '░'.repeat(empty);

  // Progress color
  let progressColor = 'red';
  if (progress >= 80) progressColor = 'green';
  else if (progress >= 50) progressColor = 'yellow';
  else if (progress >= 20) progressColor = 'cyan';

  // State indicator
  const stateColors = {
    running: 'green',
    paused: 'yellow',
    idle: 'gray',
    error: 'red',
  };

  return React.createElement(
    Box,
    {
      borderStyle: 'single',
      borderColor: 'gray',
      paddingX: 1,
      justifyContent: 'space-between',
      flexShrink: 0,
    },
    // Left: Loop info
    React.createElement(
      Box,
      { flexDirection: 'row' },
      React.createElement(Text, { color: stateColors[state] || 'gray' }, '● '),
      epic && React.createElement(Text, { bold: true }, `${epic} `),
      story && React.createElement(Text, { color: 'yellow' }, story),
      !epic && !story && React.createElement(Text, { dimColor: true }, 'No active loop')
    ),
    // Center: Progress bar
    React.createElement(
      Box,
      { flexDirection: 'row' },
      React.createElement(Text, { color: progressColor }, progressBar),
      React.createElement(Text, null, ` ${progress}%`)
    ),
    // Right: Key bindings
    React.createElement(
      Box,
      { flexDirection: 'row' },
      React.createElement(Text, { dimColor: true }, '['),
      React.createElement(Text, { color: 'cyan' }, 'Q'),
      React.createElement(Text, { dimColor: true }, ']uit ['),
      React.createElement(Text, { color: 'green' }, 'S'),
      React.createElement(Text, { dimColor: true }, ']tart ['),
      React.createElement(Text, { color: 'yellow' }, 'P'),
      React.createElement(Text, { dimColor: true }, ']ause ['),
      React.createElement(Text, { color: 'cyan' }, 'R'),
      React.createElement(Text, { dimColor: true }, ']esume ['),
      React.createElement(Text, { color: showTrace ? 'green' : 'gray' }, 'T'),
      React.createElement(Text, { dimColor: true }, ']race'),
      React.createElement(Text, { dimColor: true }, ' | '),
      React.createElement(Text, { color: 'blue' }, `v${VERSION}`)
    )
  );
}

/**
 * Main Dashboard component
 */
function Dashboard({ onAction = null }) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Terminal dimensions
  const [dimensions, setDimensions] = React.useState({
    width: stdout?.columns || 80,
    height: stdout?.rows || 24,
  });

  // UI state
  const [showTrace, setShowTrace] = React.useState(false);
  const [loopStatus, setLoopStatus] = React.useState(null);
  const [selectedSession, setSelectedSession] = React.useState(1);

  // Handle terminal resize
  React.useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: stdout?.columns || 80,
        height: stdout?.rows || 24,
      });
    };

    stdout?.on('resize', handleResize);
    return () => stdout?.off('resize', handleResize);
  }, [stdout]);

  // Load loop status periodically
  React.useEffect(() => {
    const loadStatus = () => {
      try {
        const status = getLoopStatus();
        setLoopStatus(status);
      } catch (e) {
        // Silently ignore errors
      }
    };

    loadStatus();
    const interval = setInterval(loadStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  // Handle keyboard input
  useInput((input, key) => {
    const lowerInput = input.toLowerCase();

    // Quit
    if (lowerInput === 'q' || (key.ctrl && lowerInput === 'c')) {
      exit();
      return;
    }

    // Toggle trace
    if (lowerInput === 't') {
      setShowTrace(prev => !prev);
      return;
    }

    // Session selection (1-9)
    if (input >= '1' && input <= '9') {
      setSelectedSession(parseInt(input, 10));
      return;
    }

    // Forward actions to parent
    if (onAction) {
      if (lowerInput === 's') onAction({ action: 'start' });
      if (lowerInput === 'p') onAction({ action: 'pause' });
      if (lowerInput === 'r') onAction({ action: 'resume' });
    }
  });

  // Calculate panel widths based on terminal size
  const isNarrow = dimensions.width < 100;
  const sessionPanelWidth = isNarrow ? 25 : 30;

  // Main content height (subtract header + status bar)
  const contentHeight = Math.max(10, dimensions.height - 6);

  return React.createElement(
    Box,
    {
      flexDirection: 'column',
      width: dimensions.width,
      height: dimensions.height,
    },
    // Header
    React.createElement(
      Box,
      {
        borderStyle: 'double',
        borderColor: 'cyan',
        justifyContent: 'center',
        paddingX: 1,
        flexShrink: 0,
      },
      React.createElement(Text, { bold: true, color: 'cyan' }, 'AgileFlow TUI'),
      React.createElement(Text, { dimColor: true }, ` v${VERSION}`)
    ),

    // Main content area (sessions + output + optional trace)
    React.createElement(
      Box,
      {
        flexDirection: 'row',
        flexGrow: 1,
        height: contentHeight,
      },
      // Session panel (left sidebar)
      React.createElement(
        Box,
        {
          width: sessionPanelWidth,
          flexShrink: 0,
          borderStyle: 'single',
          borderColor: 'gray',
          flexDirection: 'column',
          overflow: 'hidden',
        },
        React.createElement(SessionPanel, { refreshInterval: 3000 })
      ),

      // Output panel (center, grows to fill)
      React.createElement(
        Box,
        {
          flexGrow: 1,
          flexDirection: 'column',
          borderStyle: 'single',
          borderColor: 'green',
          overflow: 'hidden',
        },
        React.createElement(OutputPanel, {
          maxMessages: 50,
          showTimestamp: !isNarrow,
        })
      ),

      // Trace panel (right, optional)
      showTrace &&
        React.createElement(
          Box,
          {
            width: isNarrow ? 25 : 35,
            flexShrink: 0,
            borderStyle: 'single',
            borderColor: 'magenta',
            flexDirection: 'column',
            overflow: 'hidden',
          },
          React.createElement(TracePanel, null)
        )
    ),

    // Status bar (bottom)
    React.createElement(StatusBar, { loopStatus, showTrace })
  );
}

module.exports = { Dashboard, StatusBar };
