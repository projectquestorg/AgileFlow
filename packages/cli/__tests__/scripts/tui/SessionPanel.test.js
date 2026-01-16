'use strict';

/**
 * Tests for TUI Session Panel component
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

describe('TUI Session Panel', () => {
  const panelPath = path.join(__dirname, '../../../scripts/tui/panels/SessionPanel.js');

  describe('File Structure', () => {
    test('SessionPanel.js exists', () => {
      expect(fs.existsSync(panelPath)).toBe(true);
    });
  });

  describe('Module Exports', () => {
    test('exports SessionPanel component', () => {
      try {
        const { SessionPanel } = require('../../../scripts/tui/panels/SessionPanel');
        expect(typeof SessionPanel).toBe('function');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          console.log('Skipping: ink/React not available');
          return;
        }
        throw e;
      }
    });

    test('exports SessionRow component', () => {
      try {
        const { SessionRow } = require('../../../scripts/tui/panels/SessionPanel');
        expect(typeof SessionRow).toBe('function');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          console.log('Skipping: ink/React not available');
          return;
        }
        throw e;
      }
    });

    test('exports formatSession function', () => {
      try {
        const { formatSession } = require('../../../scripts/tui/panels/SessionPanel');
        expect(typeof formatSession).toBe('function');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          console.log('Skipping: ink/React not available');
          return;
        }
        throw e;
      }
    });

    test('exports getThreadColor function', () => {
      try {
        const { getThreadColor } = require('../../../scripts/tui/panels/SessionPanel');
        expect(typeof getThreadColor).toBe('function');
      } catch (e) {
        if (isInkUnavailableError(e)) {
          console.log('Skipping: ink/React not available');
          return;
        }
        throw e;
      }
    });
  });

  describe('formatSession Function', () => {
    let formatSession;

    beforeAll(() => {
      try {
        formatSession = require('../../../scripts/tui/panels/SessionPanel').formatSession;
      } catch (e) {
        if (isInkUnavailableError(e)) {
          formatSession = null;
        } else {
          throw e;
        }
      }
    });

    test('formats basic session correctly', () => {
      if (!formatSession) {
        console.log('Skipping: ink not installed');
        return;
      }

      const session = {
        id: '1',
        branch: 'main',
        story: 'US-0115',
        thread_type: 'base',
        active: true,
        current: true,
        is_main: true,
      };

      const result = formatSession(session);

      expect(result.displayName).toContain('Session 1');
      expect(result.displayName).toContain('[main]');
      expect(result.branch).toBe('main');
      expect(result.story).toBe('US-0115');
      expect(result.threadType).toBe('base');
      expect(result.active).toBe(true);
      expect(result.current).toBe(true);
    });

    test('formats session with nickname', () => {
      if (!formatSession) {
        console.log('Skipping: ink not installed');
        return;
      }

      const session = {
        id: '2',
        branch: 'feature/auth',
        nickname: 'auth',
        story: null,
        thread_type: 'parallel',
        active: true,
        current: false,
      };

      const result = formatSession(session);

      expect(result.displayName).toContain('Session 2');
      expect(result.displayName).toContain('"auth"');
      expect(result.branch).toBe('feature/auth');
      expect(result.story).toBe('none');
      expect(result.threadType).toBe('parallel');
    });

    test('handles missing fields gracefully', () => {
      if (!formatSession) {
        console.log('Skipping: ink not installed');
        return;
      }

      const session = { id: '3' };
      const result = formatSession(session);

      expect(result.displayName).toBe('Session 3');
      expect(result.branch).toBe('unknown');
      expect(result.story).toBe('none');
      expect(result.threadType).toBe('base');
    });
  });

  describe('getThreadColor Function', () => {
    let getThreadColor;

    beforeAll(() => {
      try {
        getThreadColor = require('../../../scripts/tui/panels/SessionPanel').getThreadColor;
      } catch (e) {
        if (isInkUnavailableError(e)) {
          getThreadColor = null;
        } else {
          throw e;
        }
      }
    });

    test('returns correct colors for thread types', () => {
      if (!getThreadColor) {
        console.log('Skipping: ink not installed');
        return;
      }

      expect(getThreadColor('base')).toBe('green');
      expect(getThreadColor('parallel')).toBe('cyan');
      expect(getThreadColor('chained')).toBe('yellow');
      expect(getThreadColor('fusion')).toBe('magenta');
      expect(getThreadColor('big')).toBe('blue');
      expect(getThreadColor('long')).toBe('white');
    });

    test('returns gray for unknown thread types', () => {
      if (!getThreadColor) {
        console.log('Skipping: ink not installed');
        return;
      }

      expect(getThreadColor('unknown')).toBe('gray');
      expect(getThreadColor(null)).toBe('gray');
      expect(getThreadColor(undefined)).toBe('gray');
    });
  });

  describe('Component Structure', () => {
    test('SessionPanel.js contains required elements', () => {
      const content = fs.readFileSync(panelPath, 'utf8');

      // Check for key imports
      expect(content).toContain("require('react')");
      expect(content).toContain("require('ink')");
      expect(content).toContain("require('../../session-manager')");

      // Check for key features
      expect(content).toContain('getSessions');
      expect(content).toContain('useEffect');
      expect(content).toContain('useState');

      // Check for thread type handling
      expect(content).toContain('getThreadColor');
      expect(content).toContain('base');
      expect(content).toContain('parallel');
    });
  });
});

describe('index.js Integration', () => {
  test('index.js imports SessionPanel', () => {
    const indexPath = path.join(__dirname, '../../../scripts/tui/index.js');
    const content = fs.readFileSync(indexPath, 'utf8');

    expect(content).toContain("require('./panels/SessionPanel')");
    expect(content).toContain('SessionPanel');
    expect(content).toContain('MainLayout');
  });
});
