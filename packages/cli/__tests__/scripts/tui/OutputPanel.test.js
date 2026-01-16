'use strict';

/**
 * Tests for TUI Output Panel component
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

describe('TUI Output Panel', () => {
  const panelPath = path.join(__dirname, '../../../scripts/tui/panels/OutputPanel.js');

  describe('File Structure', () => {
    test('OutputPanel.js exists', () => {
      expect(fs.existsSync(panelPath)).toBe(true);
    });
  });

  describe('Module Exports', () => {
    test('exports OutputPanel component', () => {
      try {
        const { OutputPanel } = require('../../../scripts/tui/panels/OutputPanel');
        expect(typeof OutputPanel).toBe('function');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          console.log('Skipping: ink/React not available');
          return;
        }
        throw e;
      }
    });

    test('exports OutputRow component', () => {
      try {
        const { OutputRow } = require('../../../scripts/tui/panels/OutputPanel');
        expect(typeof OutputRow).toBe('function');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          console.log('Skipping: ink/React not available');
          return;
        }
        throw e;
      }
    });

    test('exports CompactOutput component', () => {
      try {
        const { CompactOutput } = require('../../../scripts/tui/panels/OutputPanel');
        expect(typeof CompactOutput).toBe('function');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          console.log('Skipping: ink/React not available');
          return;
        }
        throw e;
      }
    });

    test('exports getAgentColor function', () => {
      try {
        const { getAgentColor } = require('../../../scripts/tui/panels/OutputPanel');
        expect(typeof getAgentColor).toBe('function');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          console.log('Skipping: ink/React not available');
          return;
        }
        throw e;
      }
    });

    test('exports getStatusIndicator function', () => {
      try {
        const { getStatusIndicator } = require('../../../scripts/tui/panels/OutputPanel');
        expect(typeof getStatusIndicator).toBe('function');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          console.log('Skipping: ink/React not available');
          return;
        }
        throw e;
      }
    });
  });

  describe('getAgentColor Function', () => {
    let getAgentColor;

    beforeAll(() => {
      try {
        getAgentColor = require('../../../scripts/tui/panels/OutputPanel').getAgentColor;
      } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND' && e.message.includes('ink')) {
          getAgentColor = null;
        } else {
          throw e;
        }
      }
    });

    test('returns cyan for api agents', () => {
      if (!getAgentColor) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(getAgentColor('agileflow-api')).toBe('cyan');
    });

    test('returns magenta for ui agents', () => {
      if (!getAgentColor) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(getAgentColor('agileflow-ui')).toBe('magenta');
    });

    test('returns yellow for testing agents', () => {
      if (!getAgentColor) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(getAgentColor('agileflow-testing')).toBe('yellow');
    });

    test('returns green for ci agents', () => {
      if (!getAgentColor) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(getAgentColor('agileflow-ci')).toBe('green');
    });

    test('returns gray for unknown agents', () => {
      if (!getAgentColor) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(getAgentColor('unknown-agent')).toBe('gray');
      expect(getAgentColor(null)).toBe('gray');
      expect(getAgentColor(undefined)).toBe('gray');
    });
  });

  describe('getStatusIndicator Function', () => {
    let getStatusIndicator;

    beforeAll(() => {
      try {
        getStatusIndicator = require('../../../scripts/tui/panels/OutputPanel').getStatusIndicator;
      } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND' && e.message.includes('ink')) {
          getStatusIndicator = null;
        } else {
          throw e;
        }
      }
    });

    test('returns blue play symbol for init', () => {
      if (!getStatusIndicator) {
        console.log('Skipping: ink not installed');
        return;
      }
      const result = getStatusIndicator('init');
      expect(result.symbol).toBe('▶');
      expect(result.color).toBe('blue');
    });

    test('returns cyan rotate symbol for iteration', () => {
      if (!getStatusIndicator) {
        console.log('Skipping: ink not installed');
        return;
      }
      const result = getStatusIndicator('iteration');
      expect(result.symbol).toBe('↻');
      expect(result.color).toBe('cyan');
    });

    test('returns green check for passed', () => {
      if (!getStatusIndicator) {
        console.log('Skipping: ink not installed');
        return;
      }
      const result = getStatusIndicator('passed');
      expect(result.symbol).toBe('✓');
      expect(result.color).toBe('green');
    });

    test('returns red X for failed', () => {
      if (!getStatusIndicator) {
        console.log('Skipping: ink not installed');
        return;
      }
      const result = getStatusIndicator('failed');
      expect(result.symbol).toBe('✗');
      expect(result.color).toBe('red');
    });

    test('returns yellow null for abort', () => {
      if (!getStatusIndicator) {
        console.log('Skipping: ink not installed');
        return;
      }
      const result = getStatusIndicator('abort');
      expect(result.symbol).toBe('⊘');
      expect(result.color).toBe('yellow');
    });

    test('returns gray bullet for unknown', () => {
      if (!getStatusIndicator) {
        console.log('Skipping: ink not installed');
        return;
      }
      const result = getStatusIndicator('unknown');
      expect(result.symbol).toBe('•');
      expect(result.color).toBe('gray');
    });
  });

  describe('Component Structure', () => {
    test('OutputPanel.js contains required elements', () => {
      const content = fs.readFileSync(panelPath, 'utf8');

      // Check for key imports
      expect(content).toContain("require('react')");
      expect(content).toContain("require('ink')");
      expect(content).toContain("require('../lib/eventStream')");

      // Check for EventStream integration
      expect(content).toContain('EventStream');
      expect(content).toContain('formatEvent');

      // Check for React hooks
      expect(content).toContain('useState');
      expect(content).toContain('useEffect');
      expect(content).toContain('useRef');

      // Check for event handling
      expect(content).toContain("on('event'");
      expect(content).toContain('stream.start()');
      expect(content).toContain('.stop()');

      // Check for message limit
      expect(content).toContain('maxMessages');
      expect(content).toContain('slice(-maxMessages)');

      // Check for color coding
      expect(content).toContain('getAgentColor');
      expect(content).toContain('getStatusIndicator');
    });

    test('OutputPanel handles cleanup on unmount', () => {
      const content = fs.readFileSync(panelPath, 'utf8');

      // Check for cleanup in useEffect
      expect(content).toContain('return () =>');
      expect(content).toContain('streamRef.current');
    });
  });
});

describe('index.js Integration', () => {
  test('index.js imports OutputPanel', () => {
    const indexPath = path.join(__dirname, '../../../scripts/tui/index.js');
    const content = fs.readFileSync(indexPath, 'utf8');

    expect(content).toContain("require('./panels/OutputPanel')");
    expect(content).toContain('OutputPanel');
  });
});
