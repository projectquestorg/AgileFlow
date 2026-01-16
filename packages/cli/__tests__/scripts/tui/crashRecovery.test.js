'use strict';

/**
 * Tests for TUI Crash Recovery module
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

describe('TUI Crash Recovery', () => {
  const modulePath = path.join(__dirname, '../../../scripts/tui/lib/crashRecovery.js');

  describe('File Structure', () => {
    test('crashRecovery.js exists', () => {
      expect(fs.existsSync(modulePath)).toBe(true);
    });
  });

  describe('Module Exports', () => {
    let module;

    beforeAll(() => {
      module = require('../../../scripts/tui/lib/crashRecovery');
    });

    test('exports getCheckpointPath function', () => {
      expect(typeof module.getCheckpointPath).toBe('function');
    });

    test('exports createCheckpoint function', () => {
      expect(typeof module.createCheckpoint).toBe('function');
    });

    test('exports loadCheckpoint function', () => {
      expect(typeof module.loadCheckpoint).toBe('function');
    });

    test('exports checkRecoveryNeeded function', () => {
      expect(typeof module.checkRecoveryNeeded).toBe('function');
    });

    test('exports resumeFromCheckpoint function', () => {
      expect(typeof module.resumeFromCheckpoint).toBe('function');
    });

    test('exports clearCheckpoint function', () => {
      expect(typeof module.clearCheckpoint).toBe('function');
    });

    test('exports startFresh function', () => {
      expect(typeof module.startFresh).toBe('function');
    });

    test('exports getRecoveryStatus function', () => {
      expect(typeof module.getRecoveryStatus).toBe('function');
    });
  });

  describe('getCheckpointPath Function', () => {
    let getCheckpointPath;

    beforeAll(() => {
      getCheckpointPath = require('../../../scripts/tui/lib/crashRecovery').getCheckpointPath;
    });

    test('returns path with default session id', () => {
      const checkpointPath = getCheckpointPath();
      expect(checkpointPath).toContain('.agileflow');
      expect(checkpointPath).toContain('sessions');
      expect(checkpointPath).toContain('default.checkpoint');
    });

    test('returns path with custom session id', () => {
      const checkpointPath = getCheckpointPath('session-2');
      expect(checkpointPath).toContain('session-2.checkpoint');
    });
  });

  describe('Checkpoint Operations', () => {
    let module;
    let tempDir;
    let origCwd;

    beforeAll(() => {
      module = require('../../../scripts/tui/lib/crashRecovery');
    });

    beforeEach(() => {
      // Create temp directory
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crashrecovery-test-'));

      // Create directories
      fs.mkdirSync(path.join(tempDir, '.agileflow', 'sessions'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });

      // Create session state with active loop
      fs.writeFileSync(
        path.join(tempDir, 'docs', '09-agents', 'session-state.json'),
        JSON.stringify({
          ralph_loop: {
            enabled: true,
            epic: 'EP-0001',
            current_story: 'US-0001',
            iteration: 5,
            max_iterations: 20,
            started_at: new Date().toISOString(),
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

    test('createCheckpoint creates checkpoint file', () => {
      const result = module.createCheckpoint();

      expect(result.ok).toBe(true);
      expect(result.checkpoint).toBeDefined();
      expect(result.checkpoint.loop_state.epic).toBe('EP-0001');
      expect(result.checkpoint.loop_state.iteration).toBe(5);
    });

    test('createCheckpoint stores current story', () => {
      const result = module.createCheckpoint();

      expect(result.checkpoint.loop_state.current_story).toBe('US-0001');
    });

    test('loadCheckpoint returns checkpoint data', () => {
      // First create a checkpoint
      module.createCheckpoint();

      // Then load it
      const result = module.loadCheckpoint();

      expect(result.ok).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.checkpoint).toBeDefined();
    });

    test('loadCheckpoint returns not found when no checkpoint', () => {
      const result = module.loadCheckpoint();

      expect(result.ok).toBe(false);
      expect(result.exists).toBe(false);
    });

    test('clearCheckpoint removes checkpoint file', () => {
      // Create checkpoint
      module.createCheckpoint();

      // Verify it exists
      expect(module.loadCheckpoint().exists).toBe(true);

      // Clear it
      const result = module.clearCheckpoint();

      expect(result.ok).toBe(true);
      expect(result.cleared).toBe(true);

      // Verify it's gone
      expect(module.loadCheckpoint().exists).toBe(false);
    });

    test('startFresh clears checkpoint and loop state', () => {
      // Create checkpoint
      module.createCheckpoint();

      // Start fresh
      const result = module.startFresh();

      expect(result.ok).toBe(true);
      expect(result.cleared).toBe(true);

      // Verify checkpoint is gone
      expect(module.loadCheckpoint().exists).toBe(false);
    });
  });

  describe('Recovery Detection', () => {
    let module;
    let tempDir;
    let origCwd;

    beforeAll(() => {
      module = require('../../../scripts/tui/lib/crashRecovery');
    });

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crashrecovery-det-'));
      fs.mkdirSync(path.join(tempDir, '.agileflow', 'sessions'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });

      origCwd = process.cwd;
      process.cwd = () => tempDir;
    });

    afterEach(() => {
      process.cwd = origCwd;
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    });

    test('checkRecoveryNeeded returns false when no checkpoint', () => {
      const result = module.checkRecoveryNeeded();

      expect(result.needed).toBe(false);
      expect(result.reason).toBe('no_checkpoint');
    });

    test('checkRecoveryNeeded returns true for incomplete loop', () => {
      // Create session state with no active loop (simulating crash)
      fs.writeFileSync(
        path.join(tempDir, 'docs', '09-agents', 'session-state.json'),
        JSON.stringify({})
      );

      // Create checkpoint from "previous session"
      const checkpoint = {
        version: 1,
        session_id: 'default',
        created_at: new Date().toISOString(),
        loop_state: {
          epic: 'EP-0001',
          current_story: 'US-0003',
          iteration: 5,
          max_iterations: 20,
        },
        recovery_info: {
          can_resume: true,
          last_checkpoint: new Date().toISOString(),
        },
      };

      fs.writeFileSync(
        path.join(tempDir, '.agileflow', 'sessions', 'default.checkpoint'),
        JSON.stringify(checkpoint)
      );

      const result = module.checkRecoveryNeeded();

      expect(result.needed).toBe(true);
      expect(result.reason).toBe('incomplete_loop');
      expect(result.recovery_options).toBeDefined();
      expect(result.recovery_options.resume.iteration).toBe(5);
    });

    test('getRecoveryStatus returns summary', () => {
      const result = module.getRecoveryStatus();

      expect(result).toHaveProperty('recoveryNeeded');
      expect(result).toHaveProperty('hasCheckpoint');
    });
  });

  describe('Resume from Checkpoint', () => {
    let module;
    let tempDir;
    let origCwd;

    beforeAll(() => {
      module = require('../../../scripts/tui/lib/crashRecovery');
    });

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crashrecovery-res-'));
      fs.mkdirSync(path.join(tempDir, '.agileflow', 'sessions'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });

      // Empty session state
      fs.writeFileSync(
        path.join(tempDir, 'docs', '09-agents', 'session-state.json'),
        JSON.stringify({})
      );

      // Create checkpoint
      const checkpoint = {
        version: 1,
        session_id: 'default',
        created_at: new Date().toISOString(),
        loop_state: {
          epic: 'EP-0002',
          current_story: 'US-0010',
          iteration: 7,
          max_iterations: 15,
          coverage_mode: true,
          coverage_threshold: 90,
          started_at: '2026-01-14T10:00:00.000Z',
        },
        recovery_info: {
          can_resume: true,
          last_checkpoint: new Date().toISOString(),
        },
      };

      fs.writeFileSync(
        path.join(tempDir, '.agileflow', 'sessions', 'default.checkpoint'),
        JSON.stringify(checkpoint)
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

    test('resumeFromCheckpoint restores loop state', () => {
      const result = module.resumeFromCheckpoint();

      expect(result.ok).toBe(true);
      expect(result.resumed).toBe(true);
      expect(result.iteration).toBe(7);
      expect(result.story).toBe('US-0010');
      expect(result.epic).toBe('EP-0002');
    });

    test('resumeFromCheckpoint sets resumed flag', () => {
      module.resumeFromCheckpoint();

      // Read session state
      const stateFile = path.join(tempDir, 'docs', '09-agents', 'session-state.json');
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

      expect(state.ralph_loop.resumed_from_checkpoint).toBe(true);
      expect(state.ralph_loop.resumed_at).toBeDefined();
    });

    test('resumeFromCheckpoint fails without checkpoint', () => {
      // Clear checkpoint
      const checkpointPath = path.join(tempDir, '.agileflow', 'sessions', 'default.checkpoint');
      fs.unlinkSync(checkpointPath);

      const result = module.resumeFromCheckpoint();

      expect(result.ok).toBe(false);
    });
  });

  describe('Module Structure', () => {
    test('crashRecovery.js contains required elements', () => {
      const content = fs.readFileSync(modulePath, 'utf8');

      // Check for key imports
      expect(content).toContain("require('fs')");
      expect(content).toContain("require('path')");

      // Check for checkpoint functions
      expect(content).toContain('createCheckpoint');
      expect(content).toContain('loadCheckpoint');
      expect(content).toContain('clearCheckpoint');

      // Check for recovery functions
      expect(content).toContain('checkRecoveryNeeded');
      expect(content).toContain('resumeFromCheckpoint');
      expect(content).toContain('startFresh');

      // Check for state persistence
      expect(content).toContain('.checkpoint');
      expect(content).toContain('session-state.json');
      expect(content).toContain('ralph_loop');

      // Check for recovery info
      expect(content).toContain('recovery_info');
      expect(content).toContain('can_resume');
      expect(content).toContain('last_checkpoint');
    });
  });
});
