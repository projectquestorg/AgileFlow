'use strict';

/**
 * Tests for UiManager - Unified Progress Feedback System
 */

const path = require('path');
const fs = require('fs');
const { Writable } = require('stream');

describe('UiManager', () => {
  const modulePath = path.join(__dirname, '../../lib/ui-manager.js');

  describe('File Structure', () => {
    test('ui-manager.js exists', () => {
      expect(fs.existsSync(modulePath)).toBe(true);
    });
  });

  describe('Module Exports', () => {
    let module;

    beforeAll(() => {
      module = require('../../lib/ui-manager');
    });

    test('exports UiManager class', () => {
      expect(typeof module.UiManager).toBe('function');
    });

    test('exports Spinner class', () => {
      expect(typeof module.Spinner).toBe('function');
    });

    test('exports ProgressBar class', () => {
      expect(typeof module.ProgressBar).toBe('function');
    });

    test('exports TimingTracker class', () => {
      expect(typeof module.TimingTracker).toBe('function');
    });

    test('exports getUiManager function', () => {
      expect(typeof module.getUiManager).toBe('function');
    });

    test('exports resetUiManager function', () => {
      expect(typeof module.resetUiManager).toBe('function');
    });

    test('exports formatTime function', () => {
      expect(typeof module.formatTime).toBe('function');
    });

    test('exports formatBytes function', () => {
      expect(typeof module.formatBytes).toBe('function');
    });

    test('exports calculateETA function', () => {
      expect(typeof module.calculateETA).toBe('function');
    });

    test('exports SPINNER_FRAMES constant', () => {
      expect(Array.isArray(module.SPINNER_FRAMES)).toBe(true);
      expect(module.SPINNER_FRAMES.length).toBeGreaterThan(0);
    });

    test('exports SPINNER_INTERVAL constant', () => {
      expect(typeof module.SPINNER_INTERVAL).toBe('number');
    });
  });

  describe('formatTime Function', () => {
    let formatTime;

    beforeAll(() => {
      formatTime = require('../../lib/ui-manager').formatTime;
    });

    test('formats milliseconds', () => {
      expect(formatTime(500)).toBe('500ms');
      expect(formatTime(0)).toBe('0ms');
      expect(formatTime(999)).toBe('999ms');
    });

    test('formats seconds', () => {
      expect(formatTime(1000)).toBe('1.0s');
      expect(formatTime(5500)).toBe('5.5s');
      expect(formatTime(59999)).toBe('60.0s');
    });

    test('formats minutes', () => {
      expect(formatTime(60000)).toBe('1m 0s');
      expect(formatTime(90000)).toBe('1m 30s');
      expect(formatTime(125000)).toBe('2m 5s');
    });
  });

  describe('formatBytes Function', () => {
    let formatBytes;

    beforeAll(() => {
      formatBytes = require('../../lib/ui-manager').formatBytes;
    });

    test('formats bytes', () => {
      expect(formatBytes(500)).toBe('500B');
      expect(formatBytes(1023)).toBe('1023B');
    });

    test('formats kilobytes', () => {
      expect(formatBytes(1024)).toBe('1.0KB');
      expect(formatBytes(1536)).toBe('1.5KB');
    });

    test('formats megabytes', () => {
      expect(formatBytes(1024 * 1024)).toBe('1.0MB');
      expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5MB');
    });
  });

  describe('calculateETA Function', () => {
    let calculateETA;

    beforeAll(() => {
      calculateETA = require('../../lib/ui-manager').calculateETA;
    });

    test('returns calculating for zero progress', () => {
      const startTime = Date.now() - 1000;
      expect(calculateETA(0, 100, startTime)).toBe('calculating...');
    });

    test('returns complete when done', () => {
      const startTime = Date.now() - 1000;
      expect(calculateETA(100, 100, startTime)).toBe('complete');
      expect(calculateETA(150, 100, startTime)).toBe('complete');
    });

    test('calculates ETA for partial progress', () => {
      const startTime = Date.now() - 1000; // 1 second ago
      const eta = calculateETA(50, 100, startTime);
      // Should be about 1 second (50 items in 1s, 50 more to go)
      expect(eta).toMatch(/\d/); // Contains a number
    });
  });

  describe('Spinner Class', () => {
    let Spinner;
    let mockStream;
    let output;

    beforeAll(() => {
      Spinner = require('../../lib/ui-manager').Spinner;
    });

    beforeEach(() => {
      output = '';
      mockStream = new Writable({
        write(chunk, encoding, callback) {
          output += chunk.toString();
          callback();
        },
      });
      mockStream.isTTY = true;
      mockStream.clearLine = jest.fn();
      mockStream.cursorTo = jest.fn();
    });

    test('creates spinner with default options', () => {
      const spinner = new Spinner();
      expect(spinner.text).toBe('Loading...');
    });

    test('creates spinner with custom text', () => {
      const spinner = new Spinner({ text: 'Processing...' });
      expect(spinner.text).toBe('Processing...');
    });

    test('start begins spinning', () => {
      const spinner = new Spinner({ stream: mockStream, interval: 50 });
      spinner.start('Testing');

      expect(spinner._isSpinning).toBe(true);
      expect(spinner._timer).not.toBeNull();

      spinner.stop();
    });

    test('stop ends spinning', () => {
      const spinner = new Spinner({ stream: mockStream, interval: 50 });
      spinner.start();
      spinner.stop();

      expect(spinner._isSpinning).toBe(false);
      expect(spinner._timer).toBeNull();
    });

    test('update changes text', () => {
      const spinner = new Spinner({ stream: mockStream });
      spinner.update('New text');
      expect(spinner.text).toBe('New text');
    });

    test('setProgress enables progress display', () => {
      const spinner = new Spinner({ stream: mockStream });
      spinner.setProgress(5, 10);

      expect(spinner._current).toBe(5);
      expect(spinner._total).toBe(10);
      expect(spinner._showProgress).toBe(true);
    });

    test('succeed stops with success', () => {
      const spinner = new Spinner({ stream: mockStream });
      spinner.start();
      spinner.succeed('Done!');

      expect(spinner._isSpinning).toBe(false);
      expect(output).toContain('Done!');
    });

    test('fail stops with failure', () => {
      const spinner = new Spinner({ stream: mockStream });
      spinner.start();
      spinner.fail('Failed!');

      expect(spinner._isSpinning).toBe(false);
      expect(output).toContain('Failed!');
    });
  });

  describe('ProgressBar Class', () => {
    let ProgressBar;
    let mockStream;
    let output;

    beforeAll(() => {
      ProgressBar = require('../../lib/ui-manager').ProgressBar;
    });

    beforeEach(() => {
      output = '';
      mockStream = new Writable({
        write(chunk, encoding, callback) {
          output += chunk.toString();
          callback();
        },
      });
      mockStream.isTTY = true;
      mockStream.clearLine = jest.fn();
      mockStream.cursorTo = jest.fn();
    });

    test('creates progress bar with default options', () => {
      const bar = new ProgressBar();
      expect(bar.total).toBe(100);
      expect(bar.width).toBe(30);
    });

    test('creates progress bar with custom total', () => {
      const bar = new ProgressBar({ total: 50 });
      expect(bar.total).toBe(50);
    });

    test('start initializes progress', () => {
      const bar = new ProgressBar({ stream: mockStream });
      bar.start(10);

      expect(bar.total).toBe(10);
      expect(bar._current).toBe(0);
      expect(bar._startTime).not.toBeNull();
    });

    test('update changes current progress', () => {
      const bar = new ProgressBar({ stream: mockStream });
      bar.start(10);
      bar.update(5);

      expect(bar._current).toBe(5);
    });

    test('increment adds to current progress', () => {
      const bar = new ProgressBar({ stream: mockStream });
      bar.start(10);
      bar.increment();
      bar.increment(2);

      expect(bar._current).toBe(3);
    });

    test('complete sets progress to total', () => {
      const bar = new ProgressBar({ stream: mockStream });
      bar.start(10);
      bar.complete();

      expect(bar._current).toBe(10);
    });
  });

  describe('TimingTracker Class', () => {
    let TimingTracker;

    beforeAll(() => {
      TimingTracker = require('../../lib/ui-manager').TimingTracker;
    });

    test('creates tracker with default name', () => {
      const tracker = new TimingTracker();
      expect(tracker.name).toBe('operation');
    });

    test('creates tracker with custom name', () => {
      const tracker = new TimingTracker({ name: 'test-operation' });
      expect(tracker.name).toBe('test-operation');
    });

    test('start records start time', () => {
      const tracker = new TimingTracker();
      tracker.start();

      expect(tracker._startTime).not.toBeNull();
    });

    test('startPhase creates phase entry', () => {
      const tracker = new TimingTracker();
      tracker.start();
      tracker.startPhase('init');

      expect(tracker.phases.init).toBeDefined();
      expect(tracker.phases.init.start).not.toBeNull();
      expect(tracker._currentPhase).toBe('init');
    });

    test('endPhase records duration', () => {
      const tracker = new TimingTracker();
      tracker.start();
      tracker.startPhase('init');

      // Wait a bit for measurable duration
      const waitStart = Date.now();
      while (Date.now() - waitStart < 10) {
        // Busy wait
      }

      tracker.endPhase();

      expect(tracker.phases.init.end).not.toBeNull();
      expect(tracker.phases.init.duration).toBeGreaterThanOrEqual(0);
      expect(tracker._currentPhase).toBeNull();
    });

    test('startPhase ends previous phase', () => {
      const tracker = new TimingTracker();
      tracker.start();
      tracker.startPhase('phase1');
      tracker.startPhase('phase2');

      expect(tracker.phases.phase1.end).not.toBeNull();
      expect(tracker._currentPhase).toBe('phase2');
    });

    test('getElapsed returns total time', () => {
      const tracker = new TimingTracker();
      tracker.start();

      // Wait a bit
      const waitStart = Date.now();
      while (Date.now() - waitStart < 10) {
        // Busy wait
      }

      const elapsed = tracker.getElapsed();
      expect(elapsed).toBeGreaterThanOrEqual(10);
    });

    test('getSummary returns timing data', () => {
      const tracker = new TimingTracker({ name: 'test' });
      tracker.start();
      tracker.startPhase('phase1');
      tracker.endPhase();

      const summary = tracker.getSummary();

      expect(summary.name).toBe('test');
      expect(summary.totalMs).toBeGreaterThanOrEqual(0);
      expect(summary.totalFormatted).toBeDefined();
      expect(summary.phases.phase1).toBeDefined();
    });

    test('formatSummary returns string', () => {
      const tracker = new TimingTracker({ name: 'test' });
      tracker.start();
      tracker.startPhase('phase1');
      tracker.endPhase();

      const formatted = tracker.formatSummary();

      expect(typeof formatted).toBe('string');
      expect(formatted).toContain('test');
      expect(formatted).toContain('phase1');
    });

    test('toJSON returns JSON string', () => {
      const tracker = new TimingTracker({ name: 'test' });
      tracker.start();

      const json = tracker.toJSON();
      const parsed = JSON.parse(json);

      expect(parsed.name).toBe('test');
    });
  });

  describe('UiManager Class', () => {
    let UiManager;
    let mockStream;
    let output;

    beforeAll(() => {
      UiManager = require('../../lib/ui-manager').UiManager;
    });

    beforeEach(() => {
      output = '';
      mockStream = new Writable({
        write(chunk, encoding, callback) {
          output += chunk.toString();
          callback();
        },
      });
    });

    test('creates UiManager with default options', () => {
      const ui = new UiManager();
      expect(ui.verbose).toBe(false);
      expect(ui.timing).toBe(false);
      expect(ui.quiet).toBe(false);
    });

    test('creates UiManager with custom options', () => {
      const ui = new UiManager({ verbose: true, timing: true });
      expect(ui.verbose).toBe(true);
      expect(ui.timing).toBe(true);
    });

    test('spinner creates Spinner instance', () => {
      const ui = new UiManager({ stream: mockStream });
      const spinner = ui.spinner({ text: 'test' });

      expect(spinner.text).toBe('test');
    });

    test('progressBar creates ProgressBar instance', () => {
      const ui = new UiManager({ stream: mockStream });
      const bar = ui.progressBar({ total: 50 });

      expect(bar.total).toBe(50);
    });

    test('tracker creates TimingTracker instance', () => {
      const ui = new UiManager();
      const tracker = ui.tracker('test-op');

      expect(tracker.name).toBe('test-op');
    });

    test('log outputs message', () => {
      const ui = new UiManager({ stream: mockStream });
      ui.log('Test message');

      expect(output).toContain('Test message');
    });

    test('log respects quiet mode', () => {
      const ui = new UiManager({ stream: mockStream, quiet: true });
      ui.log('Test message');

      expect(output).toBe('');
    });

    test('debug outputs only in verbose mode', () => {
      const ui1 = new UiManager({ stream: mockStream, verbose: false });
      ui1.debug('Debug 1');
      expect(output).toBe('');

      output = '';
      const ui2 = new UiManager({ stream: mockStream, verbose: true });
      ui2.debug('Debug 2');
      expect(output).toContain('Debug 2');
    });

    test('success outputs success message', () => {
      const ui = new UiManager({ stream: mockStream });
      ui.success('Done!');

      expect(output).toContain('✓');
      expect(output).toContain('Done!');
    });

    test('error outputs error message', () => {
      const ui = new UiManager({ stream: mockStream });
      ui.error('Failed!');

      expect(output).toContain('✗');
      expect(output).toContain('Failed!');
    });

    test('error ignores quiet mode', () => {
      const ui = new UiManager({ stream: mockStream, quiet: true });
      ui.error('Failed!');

      expect(output).toContain('Failed!');
    });

    test('warn outputs warning message', () => {
      const ui = new UiManager({ stream: mockStream });
      ui.warn('Warning!');

      expect(output).toContain('⚠');
      expect(output).toContain('Warning!');
    });

    test('info outputs info message', () => {
      const ui = new UiManager({ stream: mockStream });
      ui.info('Info');

      expect(output).toContain('ℹ');
      expect(output).toContain('Info');
    });

    test('section outputs header', () => {
      const ui = new UiManager({ stream: mockStream });
      ui.section('Test Section');

      expect(output).toContain('Test Section');
      expect(output).toContain('─');
    });

    test('list outputs items with progress', () => {
      const ui = new UiManager({ stream: mockStream });
      ui.list(['a', 'b', 'c']);

      expect(output).toContain('[1/3]');
      expect(output).toContain('[2/3]');
      expect(output).toContain('[3/3]');
      expect(output).toContain('a');
      expect(output).toContain('b');
      expect(output).toContain('c');
    });

    test('list respects quiet mode', () => {
      const ui = new UiManager({ stream: mockStream, quiet: true });
      ui.list(['a', 'b', 'c']);

      expect(output).toBe('');
    });
  });

  describe('Singleton Pattern', () => {
    let getUiManager, resetUiManager;

    beforeAll(() => {
      const mod = require('../../lib/ui-manager');
      getUiManager = mod.getUiManager;
      resetUiManager = mod.resetUiManager;
    });

    beforeEach(() => {
      resetUiManager();
    });

    test('getUiManager returns same instance', () => {
      const ui1 = getUiManager();
      const ui2 = getUiManager();

      expect(ui1).toBe(ui2);
    });

    test('getUiManager with forceNew creates new instance', () => {
      const ui1 = getUiManager();
      const ui2 = getUiManager({ forceNew: true });

      expect(ui1).not.toBe(ui2);
    });

    test('resetUiManager clears singleton', () => {
      const ui1 = getUiManager();
      resetUiManager();
      const ui2 = getUiManager();

      expect(ui1).not.toBe(ui2);
    });
  });

  describe('Module Structure', () => {
    test('ui-manager.js contains required elements', () => {
      const content = fs.readFileSync(modulePath, 'utf8');

      // Check for classes
      expect(content).toContain('class UiManager');
      expect(content).toContain('class Spinner');
      expect(content).toContain('class ProgressBar');
      expect(content).toContain('class TimingTracker');

      // Check for spinner methods
      expect(content).toContain('start(');
      expect(content).toContain('stop(');
      expect(content).toContain('update(');
      expect(content).toContain('succeed(');
      expect(content).toContain('fail(');

      // Check for progress bar methods
      expect(content).toContain('increment(');
      expect(content).toContain('complete(');

      // Check for timing methods
      expect(content).toContain('startPhase(');
      expect(content).toContain('endPhase(');
      expect(content).toContain('getSummary(');
      expect(content).toContain('formatSummary(');

      // Check for UiManager methods
      expect(content).toContain('spinner(');
      expect(content).toContain('progressBar(');
      expect(content).toContain('tracker(');
      expect(content).toContain('log(');
      expect(content).toContain('debug(');
      expect(content).toContain('success(');
      expect(content).toContain('error(');
      expect(content).toContain('warn(');
      expect(content).toContain('info(');
      expect(content).toContain('section(');
      expect(content).toContain('list(');

      // Check for utility functions
      expect(content).toContain('formatTime(');
      expect(content).toContain('formatBytes(');
      expect(content).toContain('calculateETA(');
    });
  });
});
