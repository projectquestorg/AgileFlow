'use strict';

/**
 * Tests for TUI App component
 *
 * Note: These tests verify the module structure and exports.
 * Full Ink component rendering tests require ink-testing-library
 * which may be added in a future story.
 */

const path = require('path');
const fs = require('fs');

// Helper to check if error is due to ink/React not being available
function isInkUnavailableError(e) {
  if (e.code === 'MODULE_NOT_FOUND' && e.message.includes('ink')) return true;
  if (e.message && e.message.includes('ReactCurrentOwner')) return true;
  if (e.message && e.message.includes('React')) return true;
  return false;
}

describe('TUI App Component', () => {
  const tuiDir = path.join(__dirname, '../../../scripts/tui');

  describe('File Structure', () => {
    test('App.js exists', () => {
      expect(fs.existsSync(path.join(tuiDir, 'App.js'))).toBe(true);
    });

    test('index.js exists', () => {
      expect(fs.existsSync(path.join(tuiDir, 'index.js'))).toBe(true);
    });

    test('panels directory exists', () => {
      expect(fs.existsSync(path.join(tuiDir, 'panels'))).toBe(true);
    });

    test('lib directory exists', () => {
      expect(fs.existsSync(path.join(tuiDir, 'lib'))).toBe(true);
    });
  });

  describe('Module Exports', () => {
    test('App.js exports App component', () => {
      // Skip if ink is not installed yet
      try {
        const { App } = require('../../../scripts/tui/App');
        expect(typeof App).toBe('function');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          // Skip test if ink not installed
          console.log('Skipping: ink not installed');
          return;
        }
        throw e;
      }
    });

    test('index.js exports main function', () => {
      // Skip if ink is not installed yet
      try {
        const { main } = require('../../../scripts/tui/index');
        expect(typeof main).toBe('function');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          // Skip test if ink not installed
          console.log('Skipping: ink not installed');
          return;
        }
        throw e;
      }
    });
  });

  describe('App Component Structure', () => {
    test('App.js contains required elements', () => {
      const content = fs.readFileSync(path.join(tuiDir, 'App.js'), 'utf8');

      // Check for key imports
      expect(content).toContain("require('react')");
      expect(content).toContain("require('ink')");
      expect(content).toContain("require('./lib/keyboard')");

      // Check for key features
      expect(content).toContain('useInput');
      expect(content).toContain('useApp');
      expect(content).toContain('exit');
      expect(content).toContain('KeyboardHandler');

      // Check for key bindings
      expect(content).toContain('DEFAULT_BINDINGS');
      expect(content).toContain('formatBindings');
    });

    test('App.js exports HelpPanel', () => {
      try {
        const { HelpPanel } = require('../../../scripts/tui/App');
        expect(typeof HelpPanel).toBe('function');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          console.log('Skipping: ink/React not available');
          return;
        }
        throw e;
      }
    });

    test('index.js contains required elements', () => {
      const content = fs.readFileSync(path.join(tuiDir, 'index.js'), 'utf8');

      // Check for simple-tui import (pure Node.js implementation)
      expect(content).toContain("require('./simple-tui')");

      // Check for main function export
      expect(content).toContain('main');
      expect(content).toContain('module.exports');
    });
  });
});

describe('TUI CLI Command', () => {
  test('tui.js CLI command file exists', () => {
    const cmdPath = path.join(__dirname, '../../../tools/cli/commands/tui.js');
    expect(fs.existsSync(cmdPath)).toBe(true);
  });

  test('tui.js has correct structure', () => {
    const cmdPath = path.join(__dirname, '../../../tools/cli/commands/tui.js');
    const content = fs.readFileSync(cmdPath, 'utf8');

    // Check command structure
    expect(content).toContain("name: 'tui'");
    expect(content).toContain('description:');
    expect(content).toContain('action:');
  });

  test('tui.js references the TUI script', () => {
    const cmdPath = path.join(__dirname, '../../../tools/cli/commands/tui.js');
    const content = fs.readFileSync(cmdPath, 'utf8');

    // Uses path.join to construct the path
    expect(content).toContain("'scripts'");
    expect(content).toContain("'tui'");
    expect(content).toContain("'index.js'");
  });
});
