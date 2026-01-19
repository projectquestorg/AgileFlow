'use strict';

const blessed = require('blessed');

/**
 * Create the status bar at the bottom with always-visible key hints
 * nano-style: users can always see what keys are available
 */
module.exports = function createStatusBar(screen, state) {
  const statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: {
      fg: 'white',
      bg: 'blue'
    }
  });

  // Always-visible key hints (nano-style for user-friendliness)
  const hints = [
    '{bold}1-3{/bold}:Tab',
    '{bold}Tab{/bold}:Next',
    '{bold}j/k{/bold}:Nav',
    '{bold}r{/bold}:Refresh',
    '{bold}?{/bold}:Help',
    '{bold}q{/bold}:Quit'
  ];

  const hintText = ' ' + hints.join('  ');
  statusBar.setContent(hintText);

  return {
    element: statusBar,
    setStatus(text) {
      // Show custom status with key hints
      const shortHints = [
        '{bold}r{/bold}:Refresh',
        '{bold}?{/bold}:Help',
        '{bold}q{/bold}:Quit'
      ];
      statusBar.setContent(` ${text}  |  ${shortHints.join('  ')}`);
    },
    resetHints() {
      statusBar.setContent(hintText);
    }
  };
};
