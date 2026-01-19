'use strict';

const blessed = require('blessed');

/**
 * Create the main blessed screen with flicker-free rendering
 *
 * Key settings:
 * - smartCSR: Enable differential rendering (only update changed cells)
 * - fullUnicode: Support Unicode characters like box drawing
 */
module.exports = function createScreen() {
  const screen = blessed.screen({
    smartCSR: true,      // Key for flicker-free differential rendering
    fullUnicode: true,   // Support Unicode characters
    title: 'AgileFlow TUI',
    cursor: {
      artificial: true,
      blink: true,
      shape: 'line'
    },
    debug: false,
    warnings: false,
    autoPadding: true,
    dockBorders: true
  });

  // Enable synchronized output mode for atomic updates
  // This batches all screen updates and flushes them at once
  // Note: Not all terminals support this, but it gracefully degrades
  try {
    process.stdout.write('\x1b[?2026h');
  } catch (e) {
    // Ignore if terminal doesn't support
  }

  // Disable synchronized output on exit
  process.on('exit', () => {
    try {
      process.stdout.write('\x1b[?2026l');
    } catch (e) {
      // Ignore
    }
  });

  // Handle resize gracefully
  screen.on('resize', () => {
    screen.render();
  });

  return screen;
};
