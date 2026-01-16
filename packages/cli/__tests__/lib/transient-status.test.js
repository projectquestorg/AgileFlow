/**
 * Tests for transient-status.js
 */

const {
  TransientStatus,
  MultiLineStatus,
  withStatus,
  formatMs,
  isTTY,
} = require('../../lib/transient-status');
const { Writable } = require('stream');

/**
 * Create a mock stream for testing
 */
function createMockStream(options = {}) {
  const buffer = [];

  const stream = new Writable({
    write(chunk, encoding, callback) {
      buffer.push(chunk.toString());
      callback();
    },
  });

  stream.isTTY = options.isTTY !== undefined ? options.isTTY : true;
  stream.clearLine = jest.fn();
  stream.cursorTo = jest.fn();
  stream.moveCursor = jest.fn();

  stream.getBuffer = () => buffer.join('');
  stream.getBufferLines = () => buffer;

  return stream;
}

describe('transient-status', () => {
  describe('TransientStatus', () => {
    describe('TTY mode', () => {
      it('updates status in place', () => {
        const stream = createMockStream({ isTTY: true });
        const status = new TransientStatus({ stream });

        status.update('Processing...');
        status.update('Still processing...');

        expect(stream.clearLine).toHaveBeenCalled();
        expect(stream.cursorTo).toHaveBeenCalledWith(0);
      });

      it('tracks last line length', () => {
        const stream = createMockStream({ isTTY: true });
        const status = new TransientStatus({ stream });

        status.update('Hello');
        expect(status.lastLineLength).toBe(5);

        status.update('Hello World');
        expect(status.lastLineLength).toBe(11);
      });

      it('clears line on done', () => {
        const stream = createMockStream({ isTTY: true });
        const status = new TransientStatus({ stream });

        status.update('Processing...');
        status.done('Complete!');

        expect(stream.clearLine).toHaveBeenCalled();
        expect(stream.getBuffer()).toContain('Complete!');
      });

      it('shows success symbol on done', () => {
        const stream = createMockStream({ isTTY: true });
        const status = new TransientStatus({ stream });

        status.update('Working...');
        status.done('Success');

        expect(stream.getBuffer()).toContain('✓');
      });

      it('shows failure symbol on fail', () => {
        const stream = createMockStream({ isTTY: true });
        const status = new TransientStatus({ stream });

        status.update('Working...');
        status.fail('Failed');

        expect(stream.getBuffer()).toContain('✗');
      });

      it('shows warning symbol on warn', () => {
        const stream = createMockStream({ isTTY: true });
        const status = new TransientStatus({ stream });

        status.update('Working...');
        status.warn('Warning');

        expect(stream.getBuffer()).toContain('⚠');
      });
    });

    describe('non-TTY mode', () => {
      it('prints each update on a new line', () => {
        const stream = createMockStream({ isTTY: false });
        const status = new TransientStatus({ stream });

        status.update('Line 1');
        status.update('Line 2');

        const output = stream.getBuffer();
        expect(output).toContain('Line 1\n');
        expect(output).toContain('Line 2\n');
      });

      it('does not call clearLine', () => {
        const stream = createMockStream({ isTTY: false });
        const status = new TransientStatus({ stream });

        status.update('Test');
        status.done('Done');

        expect(stream.clearLine).not.toHaveBeenCalled();
      });
    });

    describe('progress', () => {
      it('shows progress with current/total', () => {
        const stream = createMockStream({ isTTY: true });
        const status = new TransientStatus({ stream });

        status.progress(5, 10, 'Processing');

        expect(stream.getBuffer()).toContain('[5/10]');
        expect(stream.getBuffer()).toContain('50%');
      });

      it('handles zero total gracefully', () => {
        const stream = createMockStream({ isTTY: true });
        const status = new TransientStatus({ stream });

        status.progress(0, 0, 'Empty');

        expect(stream.getBuffer()).toContain('[0/0] 0%');
      });
    });

    describe('options', () => {
      it('supports prefix option', () => {
        const stream = createMockStream({ isTTY: true });
        const status = new TransientStatus({ stream, prefix: '[PREFIX] ' });

        status.update('Message');

        expect(stream.getBuffer()).toContain('[PREFIX] Message');
      });

      it('supports showTimestamp option', () => {
        const stream = createMockStream({ isTTY: true });
        const status = new TransientStatus({ stream, showTimestamp: true });

        status.update('Message');

        // Should contain time in format [HH:MM:SS]
        expect(stream.getBuffer()).toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
      });
    });

    describe('clear', () => {
      it('clears without printing message', () => {
        const stream = createMockStream({ isTTY: true });
        const status = new TransientStatus({ stream });

        status.update('Test');
        status.clear();

        expect(stream.clearLine).toHaveBeenCalled();
        expect(status.isActive).toBe(false);
      });
    });

    describe('chaining', () => {
      it('allows method chaining', () => {
        const stream = createMockStream({ isTTY: true });
        const status = new TransientStatus({ stream });

        const result = status.update('Test').done('Done');

        expect(result).toBe(status);
      });
    });
  });

  describe('MultiLineStatus', () => {
    it('creates specified number of lines', () => {
      const stream = createMockStream({ isTTY: true });
      const status = new MultiLineStatus(3, { stream });

      expect(status.lineCount).toBe(3);
      expect(status.lines.length).toBe(3);
    });

    it('starts by reserving space', () => {
      const stream = createMockStream({ isTTY: true });
      const status = new MultiLineStatus(3, { stream });

      status.start();

      // Should print newlines and move cursor back
      expect(stream.moveCursor).toHaveBeenCalled();
    });

    it('updates specific lines', () => {
      const stream = createMockStream({ isTTY: true });
      const status = new MultiLineStatus(3, { stream });

      status.start();
      status.updateLine(0, 'Line 0');
      status.updateLine(1, 'Line 1');

      expect(status.lines[0]).toBe('Line 0');
      expect(status.lines[1]).toBe('Line 1');
    });

    it('ignores invalid line indices', () => {
      const stream = createMockStream({ isTTY: true });
      const status = new MultiLineStatus(3, { stream });

      status.start();
      const result = status.updateLine(-1, 'Invalid');

      expect(result).toBe(status);
    });

    it('non-TTY mode prints sequentially', () => {
      const stream = createMockStream({ isTTY: false });
      const status = new MultiLineStatus(3, { stream });

      status.start();
      status.updateLine(0, 'Line 0');
      status.updateLine(1, 'Line 1');

      const output = stream.getBuffer();
      expect(output).toContain('[1/3] Line 0');
      expect(output).toContain('[2/3] Line 1');
    });

    it('done moves cursor past all lines', () => {
      const stream = createMockStream({ isTTY: true });
      const status = new MultiLineStatus(3, { stream });

      status.start();
      status.done();

      expect(stream.moveCursor).toHaveBeenCalledWith(0, 3);
      expect(status.isActive).toBe(false);
    });

    it('clear resets all lines', () => {
      const stream = createMockStream({ isTTY: true });
      const status = new MultiLineStatus(3, { stream });

      status.start();
      status.updateLine(0, 'Test');
      status.clear();

      expect(status.lines.every(l => l === '')).toBe(true);
    });
  });

  describe('withStatus', () => {
    it('shows status during async operation', async () => {
      const stream = createMockStream({ isTTY: true });

      await withStatus(
        'Working...',
        async status => {
          status.update('Almost done...');
          return 'result';
        },
        { stream }
      );

      expect(stream.getBuffer()).toContain('Working...');
      expect(stream.getBuffer()).toContain('Almost done...');
    });

    it('returns function result', async () => {
      const stream = createMockStream({ isTTY: true });

      const result = await withStatus('Test', async () => 'expected result', { stream });

      expect(result).toBe('expected result');
    });

    it('handles errors and shows failure', async () => {
      const stream = createMockStream({ isTTY: true });

      await expect(
        withStatus(
          'Test',
          async () => {
            throw new Error('Test error');
          },
          { stream }
        )
      ).rejects.toThrow('Test error');

      expect(stream.getBuffer()).toContain('✗');
      expect(stream.getBuffer()).toContain('Test error');
    });
  });

  describe('formatMs', () => {
    it('formats milliseconds', () => {
      expect(formatMs(100)).toBe('100ms');
      expect(formatMs(500)).toBe('500ms');
    });

    it('formats seconds', () => {
      expect(formatMs(1000)).toBe('1.0s');
      expect(formatMs(2500)).toBe('2.5s');
      expect(formatMs(59999)).toBe('60.0s');
    });

    it('formats minutes and seconds', () => {
      expect(formatMs(60000)).toBe('1m 0s');
      expect(formatMs(90000)).toBe('1m 30s');
      expect(formatMs(150000)).toBe('2m 30s');
    });
  });

  describe('isTTY', () => {
    it('checks default stream', () => {
      const originalIsTTY = process.stdout.isTTY;

      process.stdout.isTTY = true;
      expect(isTTY()).toBe(true);

      process.stdout.isTTY = false;
      expect(isTTY()).toBe(false);

      process.stdout.isTTY = originalIsTTY;
    });

    it('checks custom stream', () => {
      const ttyStream = createMockStream({ isTTY: true });
      const nonTtyStream = createMockStream({ isTTY: false });

      expect(isTTY(ttyStream)).toBe(true);
      expect(isTTY(nonTtyStream)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles empty message', () => {
      const stream = createMockStream({ isTTY: true });
      const status = new TransientStatus({ stream });

      status.update('');
      status.done();

      expect(stream.getBuffer()).toBeDefined();
    });

    it('handles rapid updates', () => {
      const stream = createMockStream({ isTTY: true });
      const status = new TransientStatus({ stream });

      for (let i = 0; i < 100; i++) {
        status.update(`Update ${i}`);
      }
      status.done('Final');

      expect(stream.getBuffer()).toContain('Final');
    });

    it('handles special characters in message', () => {
      const stream = createMockStream({ isTTY: true });
      const status = new TransientStatus({ stream });

      status.update('Progress: 50% | File: test.js');
      status.done();

      expect(stream.getBuffer()).toContain('Progress: 50%');
    });

    it('handles unicode in message', () => {
      const stream = createMockStream({ isTTY: true });
      const status = new TransientStatus({ stream });

      status.update('Processing 📁 files...');
      status.done('Done! ✨');

      expect(stream.getBuffer()).toContain('📁');
      expect(stream.getBuffer()).toContain('✨');
    });
  });
});
