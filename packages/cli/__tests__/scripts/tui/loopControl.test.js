'use strict';

/**
 * Tests for TUI Loop Control module
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

describe('TUI Loop Control', () => {
  const modulePath = path.join(__dirname, '../../../scripts/tui/lib/loopControl.js');

  describe('File Structure', () => {
    test('loopControl.js exists', () => {
      expect(fs.existsSync(modulePath)).toBe(true);
    });
  });

  describe('Module Exports', () => {
    let module;

    beforeAll(() => {
      module = require('../../../scripts/tui/lib/loopControl');
    });

    test('exports isPaused function', () => {
      expect(typeof module.isPaused).toBe('function');
    });

    test('exports pause function', () => {
      expect(typeof module.pause).toBe('function');
    });

    test('exports resume function', () => {
      expect(typeof module.resume).toBe('function');
    });

    test('exports getLoopStatus function', () => {
      expect(typeof module.getLoopStatus).toBe('function');
    });

    test('exports stopLoop function', () => {
      expect(typeof module.stopLoop).toBe('function');
    });

    test('exports getPauseFilePath function', () => {
      expect(typeof module.getPauseFilePath).toBe('function');
    });

    test('exports LoopController class', () => {
      expect(typeof module.LoopController).toBe('function');
    });

    test('exports getDefaultController function', () => {
      expect(typeof module.getDefaultController).toBe('function');
    });
  });

  describe('getPauseFilePath Function', () => {
    let getPauseFilePath;

    beforeAll(() => {
      getPauseFilePath = require('../../../scripts/tui/lib/loopControl').getPauseFilePath;
    });

    test('returns path with default session id', () => {
      const pausePath = getPauseFilePath();
      expect(pausePath).toContain('.agileflow');
      expect(pausePath).toContain('sessions');
      expect(pausePath).toContain('default.pause');
    });

    test('returns path with custom session id', () => {
      const pausePath = getPauseFilePath('session-2');
      expect(pausePath).toContain('session-2.pause');
    });
  });

  describe('LoopController Class', () => {
    let LoopController;
    let tempDir;
    let origCwd;

    beforeAll(() => {
      LoopController = require('../../../scripts/tui/lib/loopControl').LoopController;
    });

    beforeEach(() => {
      // Create temp directory for test
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopcontrol-test-'));

      // Create .agileflow/sessions directory
      fs.mkdirSync(path.join(tempDir, '.agileflow', 'sessions'), { recursive: true });

      // Create docs/09-agents directory
      fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });

      // Create session state
      fs.writeFileSync(
        path.join(tempDir, 'docs', '09-agents', 'session-state.json'),
        JSON.stringify({ ralph_loop: { enabled: true, epic: 'EP-0001', current_story: 'US-0001' } })
      );

      // Mock cwd
      origCwd = process.cwd;
      process.cwd = () => tempDir;
    });

    afterEach(() => {
      // Restore cwd
      process.cwd = origCwd;

      // Clean up temp files
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    test('can create instance', () => {
      const controller = new LoopController();
      expect(controller).toBeInstanceOf(LoopController);
    });

    test('can create instance with custom options', () => {
      const controller = new LoopController({
        sessionId: 'test-session',
        pollInterval: 500,
      });
      expect(controller.sessionId).toBe('test-session');
      expect(controller.pollInterval).toBe(500);
    });

    test('getStatus returns status object', () => {
      const controller = new LoopController();
      const status = controller.getStatus();
      expect(typeof status).toBe('object');
      expect(status).toHaveProperty('active');
      expect(status).toHaveProperty('paused');
    });

    test('starts and stops watching', () => {
      const controller = new LoopController({ pollInterval: 100 });

      expect(controller.isWatching).toBe(false);

      controller.startWatching();
      expect(controller.isWatching).toBe(true);

      controller.stopWatching();
      expect(controller.isWatching).toBe(false);
    });

    test('emits started event when watching starts', done => {
      const controller = new LoopController({ pollInterval: 100 });

      controller.on('started', () => {
        controller.stopWatching();
        done();
      });

      controller.startWatching();
    });

    test('emits stopped event when watching stops', done => {
      const controller = new LoopController({ pollInterval: 100 });

      controller.startWatching();

      controller.on('stopped', () => {
        done();
      });

      controller.stopWatching();
    });
  });

  describe('Pause/Resume Integration', () => {
    let module;
    let tempDir;
    let origCwd;

    beforeAll(() => {
      module = require('../../../scripts/tui/lib/loopControl');
    });

    beforeEach(() => {
      // Create temp directory
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopcontrol-int-'));

      // Create directories
      fs.mkdirSync(path.join(tempDir, '.agileflow', 'sessions'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });

      // Create session state
      fs.writeFileSync(
        path.join(tempDir, 'docs', '09-agents', 'session-state.json'),
        JSON.stringify({
          ralph_loop: {
            enabled: true,
            epic: 'EP-0001',
            current_story: 'US-0001',
            iteration: 3,
            max_iterations: 10,
          },
        })
      );

      origCwd = process.cwd;
      process.cwd = () => tempDir;
    });

    afterEach(() => {
      process.cwd = origCwd;
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    });

    test('isPaused returns false when not paused', () => {
      expect(module.isPaused()).toBe(false);
    });

    test('pause creates pause file', () => {
      const result = module.pause('default', 'test_pause');

      expect(result).toHaveProperty('paused_at');
      expect(result.reason).toBe('test_pause');
      expect(module.isPaused()).toBe(true);
    });

    test('resume removes pause file', () => {
      // First pause
      module.pause();
      expect(module.isPaused()).toBe(true);

      // Then resume
      const result = module.resume();
      expect(result.was_paused).toBe(true);
      expect(module.isPaused()).toBe(false);
    });

    test('getLoopStatus returns active status', () => {
      const status = module.getLoopStatus();

      expect(status.active).toBe(true);
      expect(status.epic).toBe('EP-0001');
      expect(status.currentStory).toBe('US-0001');
      expect(status.iteration).toBe(3);
      expect(status.maxIterations).toBe(10);
    });

    test('getLoopStatus returns paused state', () => {
      module.pause('default', 'test_reason');
      const status = module.getLoopStatus();

      expect(status.paused).toBe(true);
    });

    test('stopLoop disables the loop', () => {
      const result = module.stopLoop('test_stop');

      expect(result.stopped).toBe(true);
      expect(result.reason).toBe('test_stop');

      const status = module.getLoopStatus();
      expect(status.active).toBe(false);
    });
  });

  describe('Module Structure', () => {
    test('loopControl.js contains required elements', () => {
      const content = fs.readFileSync(modulePath, 'utf8');

      // Check for key imports
      expect(content).toContain("require('fs')");
      expect(content).toContain("require('path')");
      expect(content).toContain("require('events')");

      // Check for class and methods
      expect(content).toContain('class LoopController');
      expect(content).toContain('extends EventEmitter');
      expect(content).toContain('pause(');
      expect(content).toContain('resume(');
      expect(content).toContain('isPaused');

      // Check for file mechanism
      expect(content).toContain('.pause');
      expect(content).toContain('sessions');

      // Check for session state integration
      expect(content).toContain('session-state.json');
      expect(content).toContain('ralph_loop');
    });
  });
});
