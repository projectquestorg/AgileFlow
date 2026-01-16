'use strict';

const React = require('react');
const { Box, Text, useInput, useApp } = require('ink');
const { KeyboardHandler, formatBindings, DEFAULT_BINDINGS } = require('./lib/keyboard');

/**
 * Main TUI Application Component
 *
 * Provides the base layout and keyboard handling for AgileFlow TUI.
 * Key bindings: Q=quit, S=start, P=pause, R=resume, T=trace, 1-9=sessions
 */
function App({
  children,
  title = 'AgileFlow TUI',
  showFooter = true,
  onAction = null,
  bindings = DEFAULT_BINDINGS
}) {
  const { exit } = useApp();
  const [showHelp, setShowHelp] = React.useState(false);
  const [lastAction, setLastAction] = React.useState(null);

  // Create keyboard handler
  const keyboardRef = React.useRef(null);
  if (!keyboardRef.current) {
    keyboardRef.current = new KeyboardHandler({ bindings });
  }

  // Set up event listeners
  React.useEffect(() => {
    const keyboard = keyboardRef.current;

    keyboard.on('quit', () => exit());
    keyboard.on('help', () => setShowHelp(prev => !prev));

    // Forward all actions to parent
    keyboard.on('action', (action) => {
      setLastAction(action);
      if (onAction) {
        onAction(action);
      }
    });

    return () => {
      keyboard.removeAllListeners();
    };
  }, [exit, onAction]);

  // Handle key input
  useInput((input, key) => {
    keyboardRef.current.processKey(input, key);
  });

  // Format footer bindings
  const footerBindings = formatBindings(bindings);

  return React.createElement(
    Box,
    {
      flexDirection: 'column',
      width: '100%',
      minHeight: 20
    },
    // Header
    React.createElement(
      Box,
      {
        borderStyle: 'round',
        borderColor: 'cyan',
        paddingX: 1,
        justifyContent: 'center'
      },
      React.createElement(
        Text,
        { bold: true, color: 'cyan' },
        title
      ),
      lastAction && React.createElement(
        Text,
        { dimColor: true },
        ` [${lastAction.action}]`
      )
    ),
    // Main content area
    React.createElement(
      Box,
      {
        flexDirection: 'column',
        flexGrow: 1,
        paddingX: 1,
        paddingY: 1
      },
      showHelp
        ? React.createElement(HelpPanel, { bindings })
        : children
    ),
    // Footer with key bindings
    showFooter && React.createElement(
      Box,
      {
        borderStyle: 'single',
        borderColor: 'gray',
        paddingX: 1,
        justifyContent: 'space-between'
      },
      React.createElement(
        Box,
        { flexDirection: 'row' },
        footerBindings.map((binding, i) =>
          React.createElement(
            Text,
            { key: `binding-${i}`, dimColor: true },
            i > 0 ? ' | ' : '',
            binding
          )
        )
      ),
      React.createElement(
        Text,
        { dimColor: true },
        '1-9:Sessions | AgileFlow v2.89.3'
      )
    )
  );
}

/**
 * Help Panel component
 */
function HelpPanel({ bindings = DEFAULT_BINDINGS }) {
  const groups = {
    'Loop Control': ['start', 'pause', 'resume'],
    'View': ['trace', 'help'],
    'Navigation': ['quit'],
    'Sessions': ['session1', 'session2', 'session3']
  };

  return React.createElement(
    Box,
    { flexDirection: 'column', padding: 1 },
    React.createElement(
      Text,
      { bold: true, color: 'cyan' },
      'Key Bindings'
    ),
    React.createElement(Box, { marginTop: 1 }),
    Object.entries(groups).map(([groupName, actions]) =>
      React.createElement(
        Box,
        { key: groupName, flexDirection: 'column', marginBottom: 1 },
        React.createElement(
          Text,
          { bold: true },
          groupName + ':'
        ),
        actions.map(action => {
          const binding = bindings[action];
          if (!binding) return null;
          return React.createElement(
            Text,
            { key: action, dimColor: true },
            `  ${binding.key.toUpperCase()} - ${binding.description}`
          );
        })
      )
    ),
    React.createElement(
      Text,
      { dimColor: true, marginTop: 1 },
      'Press ? to close help'
    )
  );
}

module.exports = { App, HelpPanel };
