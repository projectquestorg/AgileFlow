/**
 * Tests for progress indicator module.
 */

const {
  Spinner,
  ProgressBar,
  createSpinner,
  createProgressBar,
  withSpinner,
  formatDuration,
  DOHERTY_THRESHOLD_MS,
  SPINNER_FRAMES,
} = require('../../lib/progress');

describe('progress', () => {
  // Store original process.stdout methods
  let originalClearLine;
  let originalCursorTo;
  let originalWrite;
  let originalIsTTY;
  let consoleOutput;

  beforeEach(() => {
    // Capture console output
    consoleOutput = [];
    jest.spyOn(console, 'log').mockImplementation((...args) => {
      consoleOutput.push(args.join(' '));
    });

    // Store originals
    originalClearLine = process.stdout.clearLine;
    originalCursorTo = process.stdout.cursorTo;
    originalWrite = process.stdout.write;
    originalIsTTY = process.stdout.isTTY;

    // Mock TTY methods
    process.stdout.clearLine = jest.fn();
    process.stdout.cursorTo = jest.fn();
    process.stdout.write = jest.fn();
  });

  afterEach(() => {
    // Restore console
    jest.restoreAllMocks();

    // Restore stdout methods
    process.stdout.clearLine = originalClearLine;
    process.stdout.cursorTo = originalCursorTo;
    process.stdout.write = originalWrite;
    process.stdout.isTTY = originalIsTTY;
  });

  describe('constants', () => {
    it('has correct Doherty threshold', () => {
      expect(DOHERTY_THRESHOLD_MS).toBe(400);
    });

    it('has spinner frames array', () => {
      expect(SPINNER_FRAMES).toBeInstanceOf(Array);
      expect(SPINNER_FRAMES.length).toBeGreaterThan(0);
    });
  });

  describe('formatDuration', () => {
    it('formats milliseconds for small values', () => {
      expect(formatDuration(50)).toBe('50ms');
      expect(formatDuration(350)).toBe('350ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('formats seconds for larger values', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(1500)).toBe('1.5s');
      expect(formatDuration(10000)).toBe('10.0s');
    });
  });

  describe('Spinner', () => {
    describe('in non-TTY mode', () => {
      beforeEach(() => {
        process.stdout.isTTY = false;
      });

      it('prints message once on start', () => {
        const spinner = new Spinner('Loading');
        spinner.start();
        expect(consoleOutput.length).toBe(1);
        expect(consoleOutput[0]).toContain('Loading');
      });

      it('does not animate', () => {
        const spinner = new Spinner('Loading');
        spinner.start();
        expect(process.stdout.write).not.toHaveBeenCalled();
      });

      it('prints final message on succeed', () => {
        const spinner = new Spinner('Loading');
        spinner.start();
        spinner.succeed('Done!');
        expect(consoleOutput).toContainEqual(expect.stringContaining('Done!'));
      });
    });

    describe('in TTY mode', () => {
      beforeEach(() => {
        process.stdout.isTTY = true;
      });

      it('starts animation timer', () => {
        jest.useFakeTimers();
        const spinner = new Spinner('Loading');
        spinner.start();
        expect(spinner.timer).not.toBeNull();
        spinner.stop('✓', 'Done');
        jest.useRealTimers();
      });

      it('renders spinner frame', () => {
        const spinner = new Spinner('Loading');
        spinner.enabled = true;
        spinner.render();
        expect(process.stdout.clearLine).toHaveBeenCalled();
        expect(process.stdout.cursorTo).toHaveBeenCalled();
        expect(process.stdout.write).toHaveBeenCalled();
      });

      it('updates message', () => {
        const spinner = new Spinner('Loading');
        spinner.enabled = true;
        spinner.timer = setInterval(() => {}, 1000); // Fake timer
        spinner.update('New message');
        expect(spinner.message).toBe('New message');
        clearInterval(spinner.timer);
      });

      it('tracks progress', () => {
        const spinner = new Spinner('Processing');
        spinner.enabled = true;
        spinner.timer = setInterval(() => {}, 1000);
        spinner.progress(5, 10, 'Archiving');
        expect(spinner.current).toBe(5);
        expect(spinner.total).toBe(10);
        expect(spinner.message).toContain('5/10');
        clearInterval(spinner.timer);
      });

      it('clears interval on stop', () => {
        jest.useFakeTimers();
        const spinner = new Spinner('Loading');
        spinner.start();
        expect(spinner.timer).not.toBeNull();
        spinner.stop('✓', 'Done');
        expect(spinner.timer).toBeNull();
        jest.useRealTimers();
      });
    });

    describe('completion methods', () => {
      beforeEach(() => {
        process.stdout.isTTY = false;
      });

      it('succeed() shows checkmark', () => {
        const spinner = new Spinner('Loading');
        spinner.start();
        spinner.succeed('Success!');
        expect(consoleOutput).toContainEqual(expect.stringContaining('✓'));
        expect(consoleOutput).toContainEqual(expect.stringContaining('Success!'));
      });

      it('fail() shows X', () => {
        const spinner = new Spinner('Loading');
        spinner.start();
        spinner.fail('Failed!');
        expect(consoleOutput).toContainEqual(expect.stringContaining('✗'));
        expect(consoleOutput).toContainEqual(expect.stringContaining('Failed!'));
      });

      it('warn() shows warning symbol', () => {
        const spinner = new Spinner('Loading');
        spinner.start();
        spinner.warn('Warning!');
        expect(consoleOutput).toContainEqual(expect.stringContaining('⚠'));
      });

      it('info() shows info symbol', () => {
        const spinner = new Spinner('Loading');
        spinner.start();
        spinner.info('Info!');
        expect(consoleOutput).toContainEqual(expect.stringContaining('ℹ'));
      });
    });

    describe('timing', () => {
      it('wasFast() returns true for quick operations', () => {
        const spinner = new Spinner('Loading');
        spinner.startTime = Date.now();
        expect(spinner.wasFast()).toBe(true);
      });

      it('wasFast() returns false for slow operations', () => {
        const spinner = new Spinner('Loading');
        spinner.startTime = Date.now() - 500; // 500ms ago
        expect(spinner.wasFast()).toBe(false);
      });
    });
  });

  describe('ProgressBar', () => {
    describe('in non-TTY mode', () => {
      beforeEach(() => {
        process.stdout.isTTY = false;
      });

      it('prints progress at intervals', () => {
        const bar = new ProgressBar('Processing', 100);
        bar.update(10);
        bar.update(20);
        bar.update(30);
        // Should print at 10%, 20%, 30%
        expect(consoleOutput.length).toBe(3);
      });

      it('prints completion message', () => {
        const bar = new ProgressBar('Processing', 10);
        bar.complete('All done');
        expect(consoleOutput).toContainEqual(expect.stringContaining('All done'));
        expect(consoleOutput).toContainEqual(expect.stringContaining('10 items'));
      });
    });

    describe('in TTY mode', () => {
      beforeEach(() => {
        process.stdout.isTTY = true;
      });

      it('renders progress bar', () => {
        const bar = new ProgressBar('Test', 10);
        bar.update(5);
        expect(process.stdout.clearLine).toHaveBeenCalled();
        expect(process.stdout.write).toHaveBeenCalled();
      });

      it('increment() advances by 1', () => {
        const bar = new ProgressBar('Test', 10);
        bar.increment();
        expect(bar.current).toBe(1);
        bar.increment();
        expect(bar.current).toBe(2);
      });

      it('complete() clears line and prints message', () => {
        const bar = new ProgressBar('Test', 5);
        bar.update(5);
        bar.complete();
        expect(process.stdout.clearLine).toHaveBeenCalled();
      });
    });
  });

  describe('createSpinner', () => {
    beforeEach(() => {
      process.stdout.isTTY = false;
    });

    it('creates and starts spinner', () => {
      const spinner = createSpinner('Loading');
      expect(spinner).toBeInstanceOf(Spinner);
      spinner.stop('✓', 'Done');
    });
  });

  describe('createProgressBar', () => {
    it('creates progress bar with options', () => {
      const bar = createProgressBar('Test', 100, { width: 20 });
      expect(bar).toBeInstanceOf(ProgressBar);
      expect(bar.width).toBe(20);
    });
  });

  describe('withSpinner', () => {
    beforeEach(() => {
      process.stdout.isTTY = false;
    });

    it('runs async function with spinner', async () => {
      const result = await withSpinner('Processing', async () => {
        return 'result';
      });
      expect(result).toBe('result');
      expect(consoleOutput).toContainEqual(expect.stringContaining('✓'));
    });

    it('shows failure on error', async () => {
      await expect(
        withSpinner('Processing', async () => {
          throw new Error('Failed!');
        })
      ).rejects.toThrow('Failed!');
      expect(consoleOutput).toContainEqual(expect.stringContaining('✗'));
    });

    it('passes spinner to function', async () => {
      let capturedSpinner = null;
      await withSpinner('Processing', async spinner => {
        capturedSpinner = spinner;
        spinner.update('Updated');
        return 'done';
      });
      expect(capturedSpinner).toBeInstanceOf(Spinner);
    });
  });
});
