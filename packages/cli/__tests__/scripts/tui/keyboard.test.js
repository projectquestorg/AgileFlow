'use strict';

/**
 * Tests for TUI Keyboard Handler module
 */

const path = require('path');
const fs = require('fs');

describe('TUI Keyboard Handler', () => {
  const modulePath = path.join(
    __dirname,
    '../../../scripts/tui/lib/keyboard.js'
  );

  describe('File Structure', () => {
    test('keyboard.js exists', () => {
      expect(fs.existsSync(modulePath)).toBe(true);
    });
  });

  describe('Module Exports', () => {
    let module;

    beforeAll(() => {
      module = require('../../../scripts/tui/lib/keyboard');
    });

    test('exports KeyboardHandler class', () => {
      expect(typeof module.KeyboardHandler).toBe('function');
    });

    test('exports DEFAULT_BINDINGS constant', () => {
      expect(typeof module.DEFAULT_BINDINGS).toBe('object');
    });

    test('exports formatBindings function', () => {
      expect(typeof module.formatBindings).toBe('function');
    });

    test('exports formatHelp function', () => {
      expect(typeof module.formatHelp).toBe('function');
    });

    test('exports getDefaultHandler function', () => {
      expect(typeof module.getDefaultHandler).toBe('function');
    });

    test('exports createKeyHandler function', () => {
      expect(typeof module.createKeyHandler).toBe('function');
    });
  });

  describe('DEFAULT_BINDINGS', () => {
    let DEFAULT_BINDINGS;

    beforeAll(() => {
      DEFAULT_BINDINGS = require('../../../scripts/tui/lib/keyboard').DEFAULT_BINDINGS;
    });

    test('has quit binding', () => {
      expect(DEFAULT_BINDINGS.quit).toBeDefined();
      expect(DEFAULT_BINDINGS.quit.key).toBe('q');
    });

    test('has start binding', () => {
      expect(DEFAULT_BINDINGS.start).toBeDefined();
      expect(DEFAULT_BINDINGS.start.key).toBe('s');
    });

    test('has pause binding', () => {
      expect(DEFAULT_BINDINGS.pause).toBeDefined();
      expect(DEFAULT_BINDINGS.pause.key).toBe('p');
    });

    test('has resume binding', () => {
      expect(DEFAULT_BINDINGS.resume).toBeDefined();
      expect(DEFAULT_BINDINGS.resume.key).toBe('r');
    });

    test('has trace binding', () => {
      expect(DEFAULT_BINDINGS.trace).toBeDefined();
      expect(DEFAULT_BINDINGS.trace.key).toBe('t');
    });

    test('has help binding', () => {
      expect(DEFAULT_BINDINGS.help).toBeDefined();
      expect(DEFAULT_BINDINGS.help.key).toBe('?');
    });

    test('has session 1-9 bindings', () => {
      for (let i = 1; i <= 9; i++) {
        expect(DEFAULT_BINDINGS[`session${i}`]).toBeDefined();
        expect(DEFAULT_BINDINGS[`session${i}`].key).toBe(String(i));
      }
    });
  });

  describe('KeyboardHandler Class', () => {
    let KeyboardHandler;

    beforeAll(() => {
      KeyboardHandler = require('../../../scripts/tui/lib/keyboard').KeyboardHandler;
    });

    test('can create instance', () => {
      const handler = new KeyboardHandler();
      expect(handler).toBeInstanceOf(KeyboardHandler);
    });

    test('processes quit key', () => {
      const handler = new KeyboardHandler();
      let quitCalled = false;
      handler.on('quit', () => { quitCalled = true; });

      const result = handler.processKey('q');
      expect(result).toEqual({ action: 'quit', key: 'q' });
      expect(quitCalled).toBe(true);
    });

    test('processes Ctrl+C as quit', () => {
      const handler = new KeyboardHandler();
      let quitCalled = false;
      handler.on('quit', () => { quitCalled = true; });

      const result = handler.processKey('c', { ctrl: true });
      expect(result.action).toBe('quit');
      expect(quitCalled).toBe(true);
    });

    test('processes start key', () => {
      const handler = new KeyboardHandler();
      let startCalled = false;
      handler.on('start', () => { startCalled = true; });

      const result = handler.processKey('s');
      expect(result.action).toBe('start');
      expect(startCalled).toBe(true);
    });

    test('processes pause key', () => {
      const handler = new KeyboardHandler();
      let pauseCalled = false;
      handler.on('pause', () => { pauseCalled = true; });

      const result = handler.processKey('p');
      expect(result.action).toBe('pause');
      expect(pauseCalled).toBe(true);
    });

    test('processes resume key', () => {
      const handler = new KeyboardHandler();
      let resumeCalled = false;
      handler.on('resume', () => { resumeCalled = true; });

      const result = handler.processKey('r');
      expect(result.action).toBe('resume');
      expect(resumeCalled).toBe(true);
    });

    test('processes trace key', () => {
      const handler = new KeyboardHandler();
      let traceCalled = false;
      handler.on('trace', () => { traceCalled = true; });

      const result = handler.processKey('t');
      expect(result.action).toBe('trace');
      expect(traceCalled).toBe(true);
    });

    test('processes session switching keys', () => {
      const handler = new KeyboardHandler();
      let switchedSession = null;
      handler.on('sessionSwitch', ({ session }) => { switchedSession = session; });

      const result = handler.processKey('3');
      expect(result.action).toBe('session3');
      expect(switchedSession).toBe(3);
    });

    test('emits action event for all keys', () => {
      const handler = new KeyboardHandler();
      const actions = [];
      handler.on('action', (action) => { actions.push(action); });

      handler.processKey('s');
      handler.processKey('p');
      handler.processKey('r');

      expect(actions.length).toBe(3);
      expect(actions.map(a => a.action)).toEqual(['start', 'pause', 'resume']);
    });

    test('returns null for unknown keys', () => {
      const handler = new KeyboardHandler();
      let unknownKey = null;
      handler.on('unknownKey', ({ key }) => { unknownKey = key; });

      const result = handler.processKey('x');
      expect(result).toBeNull();
      expect(unknownKey).toBe('x');
    });

    test('can be disabled', () => {
      const handler = new KeyboardHandler();
      handler.disable();

      const result = handler.processKey('q');
      expect(result).toBeNull();
    });

    test('can be re-enabled', () => {
      const handler = new KeyboardHandler();
      handler.disable();
      handler.enable();

      const result = handler.processKey('q');
      expect(result.action).toBe('quit');
    });

    test('tracks key history', () => {
      const handler = new KeyboardHandler();

      handler.processKey('s');
      handler.processKey('p');
      handler.processKey('r');

      const history = handler.getHistory();
      expect(history.length).toBe(3);
      expect(history[0].input).toBe('s');
      expect(history[2].input).toBe('r');
    });

    test('clears key history', () => {
      const handler = new KeyboardHandler();
      handler.processKey('s');
      handler.processKey('p');

      handler.clearHistory();
      expect(handler.getHistory().length).toBe(0);
    });

    test('limits history size', () => {
      const handler = new KeyboardHandler({ historyLimit: 3 });

      handler.processKey('a');
      handler.processKey('b');
      handler.processKey('c');
      handler.processKey('d');
      handler.processKey('e');

      const history = handler.getHistory();
      expect(history.length).toBe(3);
      expect(history[0].input).toBe('c');
    });

    test('isBound returns true for bound keys', () => {
      const handler = new KeyboardHandler();
      expect(handler.isBound('q')).toBe(true);
      expect(handler.isBound('s')).toBe(true);
      expect(handler.isBound('x')).toBe(false);
    });

    test('getBinding returns binding info', () => {
      const handler = new KeyboardHandler();
      const binding = handler.getBinding('quit');
      expect(binding.key).toBe('q');
      expect(binding.description).toBe('Quit TUI');
    });

    test('setBinding allows custom bindings', () => {
      const handler = new KeyboardHandler();
      handler.setBinding('custom', 'z', 'Custom action');

      const result = handler.processKey('z');
      expect(result.action).toBe('custom');
    });
  });

  describe('formatBindings Function', () => {
    let formatBindings, DEFAULT_BINDINGS;

    beforeAll(() => {
      const module = require('../../../scripts/tui/lib/keyboard');
      formatBindings = module.formatBindings;
      DEFAULT_BINDINGS = module.DEFAULT_BINDINGS;
    });

    test('returns array of formatted strings', () => {
      const result = formatBindings(DEFAULT_BINDINGS);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    test('includes primary bindings', () => {
      const result = formatBindings(DEFAULT_BINDINGS);
      const joined = result.join(' ');
      expect(joined).toContain('Q:');
      expect(joined).toContain('S:');
      expect(joined).toContain('P:');
    });

    test('excludes session bindings from footer', () => {
      const result = formatBindings(DEFAULT_BINDINGS);
      const joined = result.join(' ');
      expect(joined).not.toContain('1:Session');
    });
  });

  describe('formatHelp Function', () => {
    let formatHelp;

    beforeAll(() => {
      formatHelp = require('../../../scripts/tui/lib/keyboard').formatHelp;
    });

    test('returns multi-line string', () => {
      const result = formatHelp();
      expect(typeof result).toBe('string');
      expect(result).toContain('\n');
    });

    test('includes section headers', () => {
      const result = formatHelp();
      expect(result).toContain('Loop Control:');
      expect(result).toContain('View:');
      expect(result).toContain('Sessions:');
    });

    test('includes all key descriptions', () => {
      const result = formatHelp();
      expect(result).toContain('Quit TUI');
      expect(result).toContain('Start loop');
      expect(result).toContain('Pause loop');
    });
  });

  describe('Module Structure', () => {
    test('keyboard.js contains required elements', () => {
      const content = fs.readFileSync(modulePath, 'utf8');

      // Check for key imports
      expect(content).toContain("require('events')");

      // Check for class and methods
      expect(content).toContain('class KeyboardHandler');
      expect(content).toContain('extends EventEmitter');
      expect(content).toContain('processKey(');
      expect(content).toContain('emit(');

      // Check for default bindings
      expect(content).toContain('DEFAULT_BINDINGS');
      expect(content).toContain('quit');
      expect(content).toContain('start');
      expect(content).toContain('pause');
      expect(content).toContain('resume');
      expect(content).toContain('trace');

      // Check for session handling
      expect(content).toContain('sessionSwitch');
      expect(content).toContain('session1');
    });
  });
});
