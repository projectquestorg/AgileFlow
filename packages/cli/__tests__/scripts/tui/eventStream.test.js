'use strict';

/**
 * Tests for TUI Event Stream module
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

describe('TUI Event Stream', () => {
  const modulePath = path.join(__dirname, '../../../scripts/tui/lib/eventStream.js');

  describe('File Structure', () => {
    test('eventStream.js exists', () => {
      expect(fs.existsSync(modulePath)).toBe(true);
    });
  });

  describe('Module Exports', () => {
    let module;

    beforeAll(() => {
      module = require('../../../scripts/tui/lib/eventStream');
    });

    test('exports EventStream class', () => {
      expect(typeof module.EventStream).toBe('function');
    });

    test('exports getDefaultStream function', () => {
      expect(typeof module.getDefaultStream).toBe('function');
    });

    test('exports formatEvent function', () => {
      expect(typeof module.formatEvent).toBe('function');
    });
  });

  describe('EventStream Class', () => {
    let EventStream;
    let tempDir;
    let logPath;

    beforeAll(() => {
      EventStream = require('../../../scripts/tui/lib/eventStream').EventStream;
    });

    beforeEach(() => {
      // Create temp directory for test log file
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventstream-test-'));
      logPath = path.join(tempDir, 'log.jsonl');
    });

    afterEach(() => {
      // Clean up temp files
      try {
        if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
        if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    test('can create instance with custom options', () => {
      const stream = new EventStream({
        logPath,
        pollInterval: 500,
        maxBufferSize: 50,
      });

      expect(stream).toBeInstanceOf(EventStream);
      expect(stream.options.logPath).toBe(logPath);
      expect(stream.options.pollInterval).toBe(500);
      expect(stream.options.maxBufferSize).toBe(50);
    });

    test('starts and stops watching', () => {
      const stream = new EventStream({ logPath });

      // Create empty log file
      fs.writeFileSync(logPath, '');

      stream.start();
      expect(stream.isWatching).toBe(true);

      stream.stop();
      expect(stream.isWatching).toBe(false);
    });

    test('emits events when new lines are added', done => {
      const stream = new EventStream({
        logPath,
        pollInterval: 100, // Fast polling for test
      });

      // Create log file with initial content
      fs.writeFileSync(logPath, '');

      const events = [];
      stream.on('event', event => {
        events.push(event);

        if (events.length === 1) {
          expect(event.type).toBe('test');
          expect(event.message).toBe('hello');
          stream.stop();
          done();
        }
      });

      stream.start();

      // Add line after short delay
      setTimeout(() => {
        fs.appendFileSync(
          logPath,
          JSON.stringify({
            type: 'test',
            message: 'hello',
            timestamp: new Date().toISOString(),
          }) + '\n'
        );
      }, 150);
    }, 5000);

    test('buffers events with size limit', () => {
      const stream = new EventStream({
        logPath,
        maxBufferSize: 3,
      });

      // Add events directly to buffer
      stream._addToBuffer({ id: 1 });
      stream._addToBuffer({ id: 2 });
      stream._addToBuffer({ id: 3 });
      stream._addToBuffer({ id: 4 });

      const buffer = stream.getBuffer();
      expect(buffer.length).toBe(3);
      expect(buffer[0].id).toBe(2);
      expect(buffer[2].id).toBe(4);
    });

    test('clears buffer', () => {
      const stream = new EventStream({ logPath });

      stream._addToBuffer({ id: 1 });
      stream._addToBuffer({ id: 2 });

      stream.clearBuffer();
      expect(stream.getBuffer().length).toBe(0);
    });

    test('filters events by type', () => {
      const stream = new EventStream({ logPath });

      stream._addToBuffer({ type: 'agent_loop', id: 1 });
      stream._addToBuffer({ type: 'other', id: 2 });
      stream._addToBuffer({ type: 'agent_loop', id: 3 });

      const filtered = stream.getEventsByType('agent_loop');
      expect(filtered.length).toBe(2);
      expect(filtered[0].id).toBe(1);
      expect(filtered[1].id).toBe(3);
    });

    test('filters events by agent', () => {
      const stream = new EventStream({ logPath });

      stream._addToBuffer({ agent: 'agileflow-api', id: 1 });
      stream._addToBuffer({ agent: 'agileflow-ui', id: 2 });
      stream._addToBuffer({ agent: 'agileflow-api', id: 3 });

      const filtered = stream.getEventsByAgent('agileflow-api');
      expect(filtered.length).toBe(2);
    });

    test('handles file truncation (rotation)', done => {
      const stream = new EventStream({
        logPath,
        pollInterval: 50, // Fast polling for test
      });

      // Create log with initial content (larger so truncation is detectable)
      fs.writeFileSync(logPath, '{"type":"old","data":"padding"}\n{"type":"old2"}\n');

      let truncated = false;
      let gotNewEvent = false;

      stream.on('truncated', () => {
        truncated = true;
      });

      stream.on('event', event => {
        if (event.type === 'new') {
          gotNewEvent = true;
        }
      });

      // Force polling mode by not using watcher
      stream._startPolling();
      stream.isWatching = true;

      // Truncate and write new content after letting it read initial position
      setTimeout(() => {
        // Write smaller content (triggers truncation detection)
        fs.writeFileSync(logPath, '{"type":"new"}\n');
      }, 100);

      // Check result after giving time for poll cycles
      setTimeout(() => {
        stream.stop();
        expect(truncated).toBe(true);
        expect(gotNewEvent).toBe(true);
        done();
      }, 300);
    }, 5000);

    test('emits error for missing file but continues', () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent.jsonl');
      const stream = new EventStream({ logPath: nonExistentPath });

      let errorEmitted = false;
      stream.on('error', () => {
        errorEmitted = true;
      });

      stream.start();
      expect(errorEmitted).toBe(true);

      stream.stop();
    });
  });

  describe('formatEvent Function', () => {
    let formatEvent;

    beforeAll(() => {
      formatEvent = require('../../../scripts/tui/lib/eventStream').formatEvent;
    });

    test('formats init event', () => {
      const event = {
        type: 'agent_loop',
        event: 'init',
        agent: 'agileflow-api',
        gate: 'tests',
        max_iterations: 5,
        timestamp: '2026-01-14T10:00:00.000Z',
      };

      const result = formatEvent(event);

      expect(result.agent).toBe('agileflow-api');
      expect(result.eventType).toBe('init');
      expect(result.message).toContain('gate=tests');
      expect(result.message).toContain('max=5');
    });

    test('formats iteration event', () => {
      const event = {
        event: 'iteration',
        agent: 'agileflow-testing',
        iter: 3,
        value: 75,
        passed: false,
      };

      const result = formatEvent(event);

      expect(result.message).toContain('Iteration 3');
      expect(result.message).toContain('value=75');
      expect(result.message).toContain('passed=false');
    });

    test('formats passed event', () => {
      const event = {
        event: 'passed',
        agent: 'agileflow-ci',
        final_value: 100,
      };

      const result = formatEvent(event);

      expect(result.message).toContain('Loop passed');
      expect(result.message).toContain('final=100');
    });

    test('formats failed event', () => {
      const event = {
        event: 'failed',
        agent: 'agileflow-testing',
        reason: 'max_iterations',
        final_value: 50,
      };

      const result = formatEvent(event);

      expect(result.message).toContain('Loop failed');
      expect(result.message).toContain('max_iterations');
    });

    test('formats abort event', () => {
      const event = {
        event: 'abort',
        agent: 'agileflow-api',
        reason: 'user_request',
      };

      const result = formatEvent(event);

      expect(result.message).toContain('Loop aborted');
      expect(result.message).toContain('user_request');
    });

    test('handles unknown event types', () => {
      const event = {
        type: 'custom',
        data: 'test',
      };

      const result = formatEvent(event);

      expect(result.agent).toBe('unknown');
      expect(result.raw).toEqual(event);
    });
  });

  describe('Module Structure', () => {
    test('eventStream.js contains required elements', () => {
      const content = fs.readFileSync(modulePath, 'utf8');

      // Check for key imports
      expect(content).toContain("require('fs')");
      expect(content).toContain("require('path')");
      expect(content).toContain("require('events')");

      // Check for class and methods
      expect(content).toContain('class EventStream');
      expect(content).toContain('extends EventEmitter');
      expect(content).toContain('start()');
      expect(content).toContain('stop()');
      expect(content).toContain('fs.watch');

      // Check for JSONL handling
      expect(content).toContain('JSON.parse');
      expect(content).toContain('log.jsonl');
    });
  });
});
