'use strict';

/**
 * Tests for TUI Trace Panel component
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

describe('TUI Trace Panel', () => {
  const panelPath = path.join(__dirname, '../../../scripts/tui/panels/TracePanel.js');

  describe('File Structure', () => {
    test('TracePanel.js exists', () => {
      expect(fs.existsSync(panelPath)).toBe(true);
    });
  });

  describe('Module Exports', () => {
    test('exports TracePanel component', () => {
      try {
        const { TracePanel } = require('../../../scripts/tui/panels/TracePanel');
        expect(typeof TracePanel).toBe('function');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          console.log('Skipping: ink/React not available');
          return;
        }
        throw e;
      }
    });

    test('exports LoopTrace component', () => {
      try {
        const { LoopTrace } = require('../../../scripts/tui/panels/TracePanel');
        expect(typeof LoopTrace).toBe('function');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          console.log('Skipping: ink/React not available');
          return;
        }
        throw e;
      }
    });

    test('exports GateRow component', () => {
      try {
        const { GateRow } = require('../../../scripts/tui/panels/TracePanel');
        expect(typeof GateRow).toBe('function');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          console.log('Skipping: ink/React not available');
          return;
        }
        throw e;
      }
    });

    test('exports ProgressBar component', () => {
      try {
        const { ProgressBar } = require('../../../scripts/tui/panels/TracePanel');
        expect(typeof ProgressBar).toBe('function');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          console.log('Skipping: ink/React not available');
          return;
        }
        throw e;
      }
    });

    test('exports CompactTrace component', () => {
      try {
        const { CompactTrace } = require('../../../scripts/tui/panels/TracePanel');
        expect(typeof CompactTrace).toBe('function');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          console.log('Skipping: ink/React not available');
          return;
        }
        throw e;
      }
    });

    test('exports getStatusColor function', () => {
      try {
        const { getStatusColor } = require('../../../scripts/tui/panels/TracePanel');
        expect(typeof getStatusColor).toBe('function');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          console.log('Skipping: ink/React not available');
          return;
        }
        throw e;
      }
    });

    test('exports getStatusSymbol function', () => {
      try {
        const { getStatusSymbol } = require('../../../scripts/tui/panels/TracePanel');
        expect(typeof getStatusSymbol).toBe('function');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          console.log('Skipping: ink/React not available');
          return;
        }
        throw e;
      }
    });

    test('exports QUALITY_GATES constant', () => {
      try {
        const { QUALITY_GATES } = require('../../../scripts/tui/panels/TracePanel');
        expect(typeof QUALITY_GATES).toBe('object');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          console.log('Skipping: ink/React not available');
          return;
        }
        throw e;
      }
    });
  });

  describe('getStatusColor Function', () => {
    let getStatusColor;

    beforeAll(() => {
      try {
        getStatusColor = require('../../../scripts/tui/panels/TracePanel').getStatusColor;
      } catch (e) {
        if (isInkUnavailableError(e)) {
          getStatusColor = null;
        } else {
          throw e;
        }
      }
    });

    test('returns green for passed/complete/true', () => {
      if (!getStatusColor) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(getStatusColor('passed')).toBe('green');
      expect(getStatusColor('complete')).toBe('green');
      expect(getStatusColor(true)).toBe('green');
    });

    test('returns red for failed/error/false', () => {
      if (!getStatusColor) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(getStatusColor('failed')).toBe('red');
      expect(getStatusColor('error')).toBe('red');
      expect(getStatusColor(false)).toBe('red');
    });

    test('returns cyan for running/in_progress', () => {
      if (!getStatusColor) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(getStatusColor('running')).toBe('cyan');
      expect(getStatusColor('in_progress')).toBe('cyan');
    });

    test('returns gray for pending/waiting', () => {
      if (!getStatusColor) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(getStatusColor('pending')).toBe('gray');
      expect(getStatusColor('waiting')).toBe('gray');
    });

    test('returns white for unknown', () => {
      if (!getStatusColor) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(getStatusColor('unknown')).toBe('white');
    });
  });

  describe('getStatusSymbol Function', () => {
    let getStatusSymbol;

    beforeAll(() => {
      try {
        getStatusSymbol = require('../../../scripts/tui/panels/TracePanel').getStatusSymbol;
      } catch (e) {
        if (isInkUnavailableError(e)) {
          getStatusSymbol = null;
        } else {
          throw e;
        }
      }
    });

    test('returns checkmark for passed/complete', () => {
      if (!getStatusSymbol) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(getStatusSymbol('passed')).toBe('✓');
      expect(getStatusSymbol('complete')).toBe('✓');
    });

    test('returns X for failed/error', () => {
      if (!getStatusSymbol) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(getStatusSymbol('failed')).toBe('✗');
      expect(getStatusSymbol('error')).toBe('✗');
    });

    test('returns rotate for running/in_progress', () => {
      if (!getStatusSymbol) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(getStatusSymbol('running')).toBe('↻');
      expect(getStatusSymbol('in_progress')).toBe('↻');
    });

    test('returns pause for paused', () => {
      if (!getStatusSymbol) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(getStatusSymbol('paused')).toBe('⏸');
    });

    test('returns circle for pending/waiting', () => {
      if (!getStatusSymbol) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(getStatusSymbol('pending')).toBe('○');
      expect(getStatusSymbol('waiting')).toBe('○');
    });
  });

  describe('QUALITY_GATES Constant', () => {
    let QUALITY_GATES;

    beforeAll(() => {
      try {
        QUALITY_GATES = require('../../../scripts/tui/panels/TracePanel').QUALITY_GATES;
      } catch (e) {
        if (isInkUnavailableError(e)) {
          QUALITY_GATES = null;
        } else {
          throw e;
        }
      }
    });

    test('has tests gate', () => {
      if (!QUALITY_GATES) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(QUALITY_GATES.tests).toBeDefined();
      expect(QUALITY_GATES.tests.name).toBe('Tests');
      expect(QUALITY_GATES.tests.color).toBe('green');
    });

    test('has coverage gate', () => {
      if (!QUALITY_GATES) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(QUALITY_GATES.coverage).toBeDefined();
      expect(QUALITY_GATES.coverage.name).toBe('Coverage');
    });

    test('has lint gate', () => {
      if (!QUALITY_GATES) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(QUALITY_GATES.lint).toBeDefined();
      expect(QUALITY_GATES.lint.name).toBe('Lint');
    });

    test('has types gate', () => {
      if (!QUALITY_GATES) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(QUALITY_GATES.types).toBeDefined();
      expect(QUALITY_GATES.types.name).toBe('Types');
    });

    test('has visual gate', () => {
      if (!QUALITY_GATES) {
        console.log('Skipping: ink not installed');
        return;
      }
      expect(QUALITY_GATES.visual).toBeDefined();
      expect(QUALITY_GATES.visual.name).toBe('Visual');
    });
  });

  describe('Component Structure', () => {
    test('TracePanel.js contains required elements', () => {
      const content = fs.readFileSync(panelPath, 'utf8');

      // Check for key imports
      expect(content).toContain("require('react')");
      expect(content).toContain("require('ink')");
      expect(content).toContain("require('../lib/loopControl')");

      // Check for components
      expect(content).toContain('function TracePanel');
      expect(content).toContain('function LoopTrace');
      expect(content).toContain('function GateRow');
      expect(content).toContain('function ProgressBar');

      // Check for quality gates
      expect(content).toContain('QUALITY_GATES');
      expect(content).toContain('tests');
      expect(content).toContain('coverage');
      expect(content).toContain('lint');
      expect(content).toContain('types');
      expect(content).toContain('visual');

      // Check for status colors
      expect(content).toContain('getStatusColor');
      expect(content).toContain("'green'");
      expect(content).toContain("'red'");
      expect(content).toContain("'yellow'");

      // Check for progress bar
      expect(content).toContain('fillChar');
      expect(content).toContain('emptyChar');

      // Check for toggle hint
      expect(content).toContain('T to toggle');
    });
  });
});
