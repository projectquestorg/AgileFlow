/**
 * Tests for Unified Progress Feedback System
 */

const {
  Feedback,
  FeedbackSpinner,
  FeedbackTask,
  FeedbackProgressBar,
  feedback,
  SYMBOLS,
  SPINNER_FRAMES,
  DOHERTY_THRESHOLD_MS,
  formatDuration,
} = require('../../lib/feedback');

describe('feedback', () => {
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
    jest.restoreAllMocks();
    process.stdout.clearLine = originalClearLine;
    process.stdout.cursorTo = originalCursorTo;
    process.stdout.write = originalWrite;
    process.stdout.isTTY = originalIsTTY;
  });

  describe('constants', () => {
    it('exports SYMBOLS object', () => {
      expect(SYMBOLS.success).toBe('✓');
      expect(SYMBOLS.error).toBe('✗');
      expect(SYMBOLS.warning).toBe('⚠');
      expect(SYMBOLS.info).toBe('ℹ');
    });

    it('exports SPINNER_FRAMES', () => {
      expect(SPINNER_FRAMES).toBeInstanceOf(Array);
      expect(SPINNER_FRAMES.length).toBeGreaterThan(0);
    });

    it('exports DOHERTY_THRESHOLD_MS', () => {
      expect(DOHERTY_THRESHOLD_MS).toBe(400);
    });
  });

  describe('formatDuration', () => {
    it('formats milliseconds', () => {
      expect(formatDuration(50)).toBe('50ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('formats seconds', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(1500)).toBe('1.5s');
    });
  });

  describe('Feedback class', () => {
    describe('message methods', () => {
      let fb;

      beforeEach(() => {
        fb = new Feedback({ isTTY: false });
      });

      it('success() prints with checkmark', () => {
        fb.success('Task done');
        expect(consoleOutput.join('')).toContain('✓');
        expect(consoleOutput.join('')).toContain('Task done');
      });

      it('error() prints with X', () => {
        fb.error('Failed');
        expect(consoleOutput.join('')).toContain('✗');
        expect(consoleOutput.join('')).toContain('Failed');
      });

      it('warning() prints with warning symbol', () => {
        fb.warning('Caution');
        expect(consoleOutput.join('')).toContain('⚠');
        expect(consoleOutput.join('')).toContain('Caution');
      });

      it('info() prints with info symbol', () => {
        fb.info('Note');
        expect(consoleOutput.join('')).toContain('ℹ');
        expect(consoleOutput.join('')).toContain('Note');
      });

      it('dim() prints dimmed message', () => {
        fb.dim('Subtle');
        expect(consoleOutput.join('')).toContain('Subtle');
      });

      it('bullet() prints bullet point', () => {
        fb.bullet('Item');
        expect(consoleOutput.join('')).toContain('•');
        expect(consoleOutput.join('')).toContain('Item');
      });

      it('newline() prints empty line', () => {
        fb.newline();
        expect(consoleOutput.length).toBe(1);
        expect(consoleOutput[0]).toBe('');
      });

      it('methods chain', () => {
        const result = fb.success('A').warning('B').info('C');
        expect(result).toBe(fb);
        expect(consoleOutput.length).toBe(3);
      });
    });

    describe('quiet mode', () => {
      it('suppresses output when quiet=true', () => {
        const fb = new Feedback({ quiet: true });
        fb.success('Hidden');
        fb.error('Hidden');
        fb.warning('Hidden');
        expect(consoleOutput.length).toBe(0);
      });
    });

    describe('verbose mode', () => {
      it('debug() prints only when verbose=true', () => {
        const fb = new Feedback({ verbose: false });
        fb.debug('Hidden');
        expect(consoleOutput.length).toBe(0);

        const verboseFb = new Feedback({ verbose: true });
        verboseFb.debug('Visible');
        expect(consoleOutput.length).toBe(1);
      });
    });

    describe('indentation', () => {
      it('indents output based on indent level', () => {
        const fb = new Feedback({ indent: 2, isTTY: false });
        fb.success('Indented');
        // Should have 4 spaces (2 indents * 2 spaces)
        expect(consoleOutput[0]).toMatch(/^ {4}/);
      });
    });

    describe('child()', () => {
      it('creates child with increased indentation', () => {
        const parent = new Feedback({ indent: 0, isTTY: false });
        const child = parent.child();
        expect(child.indent).toBe(1);

        const grandchild = child.child();
        expect(grandchild.indent).toBe(2);
      });

      it('inherits options', () => {
        const parent = new Feedback({ quiet: true, verbose: true });
        const child = parent.child();
        expect(child.quiet).toBe(true);
        expect(child.verbose).toBe(true);
      });
    });

    describe('spinner()', () => {
      it('creates FeedbackSpinner', () => {
        const fb = new Feedback({ isTTY: false });
        const spinner = fb.spinner('Loading');
        expect(spinner).toBeInstanceOf(FeedbackSpinner);
      });
    });

    describe('task()', () => {
      it('creates FeedbackTask', () => {
        const fb = new Feedback({ isTTY: false });
        const task = fb.task('Installing', 3);
        expect(task).toBeInstanceOf(FeedbackTask);
        expect(task.totalSteps).toBe(3);
      });
    });

    describe('progressBar()', () => {
      it('creates FeedbackProgressBar', () => {
        const fb = new Feedback({ isTTY: false });
        const bar = fb.progressBar('Processing', 100);
        expect(bar).toBeInstanceOf(FeedbackProgressBar);
        expect(bar.total).toBe(100);
      });
    });

    describe('withSpinner()', () => {
      it('runs async function with spinner', async () => {
        const fb = new Feedback({ isTTY: false });
        const result = await fb.withSpinner('Processing', async () => 'result');
        expect(result).toBe('result');
        expect(consoleOutput.join('')).toContain('✓');
      });

      it('shows failure on error', async () => {
        const fb = new Feedback({ isTTY: false });
        await expect(
          fb.withSpinner('Processing', async () => {
            throw new Error('Failed!');
          })
        ).rejects.toThrow('Failed!');
        expect(consoleOutput.join('')).toContain('✗');
      });

      it('passes spinner to function', async () => {
        const fb = new Feedback({ isTTY: false });
        let capturedSpinner = null;
        await fb.withSpinner('Processing', async spinner => {
          capturedSpinner = spinner;
          return 'done';
        });
        expect(capturedSpinner).toBeInstanceOf(FeedbackSpinner);
      });
    });
  });

  describe('FeedbackSpinner', () => {
    describe('non-TTY mode', () => {
      it('prints message on start', () => {
        const spinner = new FeedbackSpinner('Loading', { isTTY: false });
        spinner.start();
        expect(consoleOutput.length).toBe(1);
        expect(consoleOutput[0]).toContain('Loading');
      });

      it('does not animate', () => {
        const spinner = new FeedbackSpinner('Loading', { isTTY: false });
        spinner.start();
        expect(process.stdout.write).not.toHaveBeenCalled();
      });
    });

    describe('TTY mode', () => {
      it('starts animation timer', () => {
        jest.useFakeTimers();
        const spinner = new FeedbackSpinner('Loading', { isTTY: true });
        spinner.start();
        expect(spinner.timer).not.toBeNull();
        spinner.stop('✓', 'Done');
        jest.useRealTimers();
      });

      it('clears timer on stop', () => {
        jest.useFakeTimers();
        const spinner = new FeedbackSpinner('Loading', { isTTY: true });
        spinner.start();
        spinner.stop('✓', 'Done');
        expect(spinner.timer).toBeNull();
        jest.useRealTimers();
      });

      it('renders spinner frames', () => {
        const spinner = new FeedbackSpinner('Loading', { isTTY: true });
        spinner.start();
        expect(process.stdout.clearLine).toHaveBeenCalled();
        expect(process.stdout.cursorTo).toHaveBeenCalled();
        expect(process.stdout.write).toHaveBeenCalled();
        if (spinner.timer) clearInterval(spinner.timer);
      });
    });

    describe('completion methods', () => {
      beforeEach(() => {
        process.stdout.isTTY = false;
      });

      it('succeed() shows checkmark', () => {
        const spinner = new FeedbackSpinner('Loading', { isTTY: false });
        spinner.start();
        spinner.succeed('Success!');
        expect(consoleOutput.join('')).toContain('✓');
        expect(consoleOutput.join('')).toContain('Success!');
      });

      it('fail() shows X', () => {
        const spinner = new FeedbackSpinner('Loading', { isTTY: false });
        spinner.start();
        spinner.fail('Failed!');
        expect(consoleOutput.join('')).toContain('✗');
      });

      it('warn() shows warning symbol', () => {
        const spinner = new FeedbackSpinner('Loading', { isTTY: false });
        spinner.start();
        spinner.warn('Warning!');
        expect(consoleOutput.join('')).toContain('⚠');
      });

      it('info() shows info symbol', () => {
        const spinner = new FeedbackSpinner('Loading', { isTTY: false });
        spinner.start();
        spinner.info('Info!');
        expect(consoleOutput.join('')).toContain('ℹ');
      });
    });

    describe('update()', () => {
      it('updates message', () => {
        const spinner = new FeedbackSpinner('Original', { isTTY: false });
        spinner.update('New message');
        expect(spinner.message).toBe('New message');
      });
    });
  });

  describe('FeedbackTask', () => {
    it('tracks steps', () => {
      const task = new FeedbackTask('Installing', 3, { isTTY: false });
      task.start();
      task.step('Step 1');
      task.step('Step 2');
      task.step('Step 3');
      task.complete();

      expect(task.currentStep).toBe(3);
      expect(task.steps).toHaveLength(3);
      expect(consoleOutput.join('')).toContain('Step 1');
      expect(consoleOutput.join('')).toContain('[1/3]');
      expect(consoleOutput.join('')).toContain('[2/3]');
      expect(consoleOutput.join('')).toContain('[3/3]');
    });

    it('item() adds sub-items', () => {
      const task = new FeedbackTask('Installing', null, { isTTY: false });
      task.step('Main step');
      task.item('Sub-item 1');
      task.item('Sub-item 2');

      expect(consoleOutput.join('')).toContain('•');
      expect(consoleOutput.join('')).toContain('Sub-item 1');
    });

    it('complete() shows success', () => {
      const task = new FeedbackTask('Installing', null, { isTTY: false });
      task.complete('All done');

      expect(consoleOutput.join('')).toContain('✓');
      expect(consoleOutput.join('')).toContain('All done');
    });

    it('fail() shows failure', () => {
      const task = new FeedbackTask('Installing', null, { isTTY: false });
      task.fail('Something broke');

      expect(consoleOutput.join('')).toContain('✗');
      expect(consoleOutput.join('')).toContain('Something broke');
    });

    it('respects indentation', () => {
      const task = new FeedbackTask('Installing', null, { indent: 1, isTTY: false });
      task.complete('Done');
      expect(consoleOutput[0]).toMatch(/^ {2}/);
    });
  });

  describe('FeedbackProgressBar', () => {
    describe('non-TTY mode', () => {
      it('prints at intervals', () => {
        const bar = new FeedbackProgressBar('Processing', 100, { isTTY: false });
        bar.update(10);
        bar.update(20);
        bar.update(30);

        // Should print at 10%, 20%, 30%
        expect(consoleOutput.length).toBe(3);
      });

      it('complete() prints summary', () => {
        const bar = new FeedbackProgressBar('Processing', 10, { isTTY: false });
        bar.complete('All done');

        expect(consoleOutput.join('')).toContain('✓');
        expect(consoleOutput.join('')).toContain('10 items');
      });
    });

    describe('TTY mode', () => {
      it('renders progress bar', () => {
        const bar = new FeedbackProgressBar('Test', 10, { isTTY: true });
        bar.update(5);

        expect(process.stdout.clearLine).toHaveBeenCalled();
        expect(process.stdout.write).toHaveBeenCalled();
      });

      it('increment() advances by 1', () => {
        const bar = new FeedbackProgressBar('Test', 10, { isTTY: true });
        bar.increment();
        expect(bar.current).toBe(1);
        bar.increment();
        expect(bar.current).toBe(2);
      });
    });

    it('respects width option', () => {
      const bar = new FeedbackProgressBar('Test', 100, { width: 20 });
      expect(bar.width).toBe(20);
    });
  });

  describe('singleton feedback instance', () => {
    it('exports singleton instance', () => {
      expect(feedback).toBeInstanceOf(Feedback);
    });

    it('has all methods', () => {
      expect(typeof feedback.success).toBe('function');
      expect(typeof feedback.error).toBe('function');
      expect(typeof feedback.warning).toBe('function');
      expect(typeof feedback.info).toBe('function');
      expect(typeof feedback.spinner).toBe('function');
      expect(typeof feedback.task).toBe('function');
      expect(typeof feedback.progressBar).toBe('function');
    });
  });
});
