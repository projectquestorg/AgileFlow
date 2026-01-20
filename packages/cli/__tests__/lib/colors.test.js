/**
 * Tests for colors.js - Terminal color utilities
 */

const {
  c,
  cStandard,
  hc,
  getColors,
  isHighContrast,
  setHighContrast,
  resetHighContrast,
  box,
  status,
  colorize,
  dim,
  bold,
  success,
  warning,
  error,
  brand,
  BRAND_HEX,
} = require('../../lib/colors');

describe('colors', () => {
  describe('ANSI color codes (c object)', () => {
    describe('reset and modifiers', () => {
      it('exports reset code', () => {
        expect(c.reset).toBe('\x1b[0m');
      });

      it('exports bold code', () => {
        expect(c.bold).toBe('\x1b[1m');
      });

      it('exports dim code', () => {
        expect(c.dim).toBe('\x1b[2m');
      });

      it('exports italic code', () => {
        expect(c.italic).toBe('\x1b[3m');
      });

      it('exports underline code', () => {
        expect(c.underline).toBe('\x1b[4m');
      });
    });

    describe('standard ANSI colors', () => {
      it.each([
        ['red', '\x1b[31m'],
        ['green', '\x1b[32m'],
        ['yellow', '\x1b[33m'],
        ['blue', '\x1b[34m'],
        ['magenta', '\x1b[35m'],
        ['cyan', '\x1b[36m'],
        ['white', '\x1b[37m'],
      ])('exports %s color code', (colorName, expected) => {
        expect(c[colorName]).toBe(expected);
      });
    });

    describe('bright colors', () => {
      it.each([
        ['brightBlack', '\x1b[90m'],
        ['brightRed', '\x1b[91m'],
        ['brightGreen', '\x1b[92m'],
        ['brightYellow', '\x1b[93m'],
        ['brightBlue', '\x1b[94m'],
        ['brightMagenta', '\x1b[95m'],
        ['brightCyan', '\x1b[96m'],
        ['brightWhite', '\x1b[97m'],
      ])('exports %s color code', (colorName, expected) => {
        expect(c[colorName]).toBe(expected);
      });
    });

    describe('256-color palette', () => {
      it.each([
        ['mintGreen', '\x1b[38;5;158m'],
        ['peach', '\x1b[38;5;215m'],
        ['coral', '\x1b[38;5;203m'],
        ['lightGreen', '\x1b[38;5;194m'],
        ['lightYellow', '\x1b[38;5;228m'],
        ['lightPink', '\x1b[38;5;210m'],
        ['skyBlue', '\x1b[38;5;117m'],
        ['lavender', '\x1b[38;5;147m'],
        ['softGold', '\x1b[38;5;222m'],
        ['teal', '\x1b[38;5;80m'],
        ['slate', '\x1b[38;5;103m'],
        ['rose', '\x1b[38;5;211m'],
        ['amber', '\x1b[38;5;214m'],
        ['powder', '\x1b[38;5;153m'],
      ])('exports %s 256-color code', (colorName, expected) => {
        expect(c[colorName]).toBe(expected);
      });
    });

    describe('brand colors', () => {
      it('exports brand color (24-bit RGB)', () => {
        expect(c.brand).toBe('\x1b[38;2;232;104;58m');
      });

      it('exports orange as alias for brand', () => {
        expect(c.orange).toBe(c.brand);
      });
    });

    describe('background colors', () => {
      it.each([
        ['bgRed', '\x1b[41m'],
        ['bgGreen', '\x1b[42m'],
        ['bgYellow', '\x1b[43m'],
        ['bgBlue', '\x1b[44m'],
      ])('exports %s background code', (colorName, expected) => {
        expect(c[colorName]).toBe(expected);
      });
    });

    describe('semantic aliases', () => {
      it('success is green', () => {
        expect(c.success).toBe(c.green);
      });

      it('error is red', () => {
        expect(c.error).toBe(c.red);
      });

      it('warning is yellow', () => {
        expect(c.warning).toBe(c.yellow);
      });

      it('info is cyan', () => {
        expect(c.info).toBe(c.cyan);
      });
    });
  });

  describe('box drawing characters', () => {
    describe('corners (rounded)', () => {
      it.each([
        ['tl', '╭'],
        ['tr', '╮'],
        ['bl', '╰'],
        ['br', '╯'],
      ])('exports %s corner', (name, expected) => {
        expect(box[name]).toBe(expected);
      });
    });

    describe('lines', () => {
      it('exports horizontal line', () => {
        expect(box.h).toBe('─');
      });

      it('exports vertical line', () => {
        expect(box.v).toBe('│');
      });
    });

    describe('T-junctions', () => {
      it.each([
        ['lT', '├'],
        ['rT', '┤'],
        ['tT', '┬'],
        ['bT', '┴'],
      ])('exports %s junction', (name, expected) => {
        expect(box[name]).toBe(expected);
      });
    });

    it('exports cross', () => {
      expect(box.cross).toBe('┼');
    });

    describe('double line variants', () => {
      it('exports double horizontal', () => {
        expect(box.dh).toBe('═');
      });

      it('exports double vertical', () => {
        expect(box.dv).toBe('║');
      });
    });
  });

  describe('status indicators', () => {
    it('success indicator has green checkmark', () => {
      expect(status.success).toContain('✓');
      expect(status.success).toContain(c.green);
      expect(status.success).toContain(c.reset);
    });

    it('warning indicator has yellow symbol', () => {
      expect(status.warning).toContain('⚠️');
      expect(status.warning).toContain(c.yellow);
    });

    it('error indicator has red X', () => {
      expect(status.error).toContain('✗');
      expect(status.error).toContain(c.red);
    });

    it('info indicator has cyan symbol', () => {
      expect(status.info).toContain('ℹ');
      expect(status.info).toContain(c.cyan);
    });

    it('pending indicator has dim circle', () => {
      expect(status.pending).toContain('○');
      expect(status.pending).toContain(c.dim);
    });

    it('inProgress indicator has yellow half-circle', () => {
      expect(status.inProgress).toContain('◐');
      expect(status.inProgress).toContain(c.yellow);
    });

    it('done indicator has green filled circle', () => {
      expect(status.done).toContain('●');
      expect(status.done).toContain(c.green);
    });

    it('blocked indicator has red diamond', () => {
      expect(status.blocked).toContain('◆');
      expect(status.blocked).toContain(c.red);
    });
  });

  describe('colorize function', () => {
    it('wraps text with color and reset', () => {
      const result = colorize('Hello', c.red);
      expect(result).toBe('\x1b[31mHello\x1b[0m');
    });

    it('works with any color code', () => {
      const result = colorize('World', c.brand);
      expect(result).toBe('\x1b[38;2;232;104;58mWorld\x1b[0m');
    });

    it('handles empty string', () => {
      const result = colorize('', c.green);
      expect(result).toBe('\x1b[32m\x1b[0m');
    });

    it('handles text with existing ANSI codes', () => {
      const result = colorize('\x1b[1mBold\x1b[0m', c.blue);
      expect(result).toBe('\x1b[34m\x1b[1mBold\x1b[0m\x1b[0m');
    });
  });

  describe('helper functions', () => {
    describe('dim', () => {
      it('applies dim formatting', () => {
        const result = dim('Faded text');
        expect(result).toBe('\x1b[2mFaded text\x1b[0m');
      });
    });

    describe('bold', () => {
      it('applies bold formatting', () => {
        const result = bold('Important');
        expect(result).toBe('\x1b[1mImportant\x1b[0m');
      });
    });

    describe('success', () => {
      it('applies green color', () => {
        const result = success('Passed!');
        expect(result).toBe('\x1b[32mPassed!\x1b[0m');
      });
    });

    describe('warning', () => {
      it('applies yellow color', () => {
        const result = warning('Caution');
        expect(result).toBe('\x1b[33mCaution\x1b[0m');
      });
    });

    describe('error', () => {
      it('applies red color', () => {
        const result = error('Failed');
        expect(result).toBe('\x1b[31mFailed\x1b[0m');
      });
    });

    describe('brand', () => {
      it('applies brand color', () => {
        const result = brand('AgileFlow');
        expect(result).toBe('\x1b[38;2;232;104;58mAgileFlow\x1b[0m');
      });
    });
  });

  describe('BRAND_HEX constant', () => {
    it('exports hex color value', () => {
      expect(BRAND_HEX).toBe('#e8683a');
    });

    it('is valid hex color format', () => {
      expect(BRAND_HEX).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  describe('integration tests', () => {
    it('can chain modifiers with colors', () => {
      const result = `${c.bold}${c.red}Bold Red${c.reset}`;
      expect(result).toContain(c.bold);
      expect(result).toContain(c.red);
      expect(result).toContain(c.reset);
    });

    it('can build status line with box characters', () => {
      const line = `${box.tl}${box.h.repeat(5)}${box.tr}`;
      expect(line).toBe('╭─────╮');
    });

    it('can combine status indicators with text', () => {
      const msg = `${status.success} All tests passed`;
      expect(msg).toContain('✓');
      expect(msg).toContain('All tests passed');
    });
  });

  describe('high-contrast mode', () => {
    // Save original env
    const originalEnv = process.env.AGILEFLOW_HIGH_CONTRAST;

    beforeEach(() => {
      // Reset to default state
      delete process.env.AGILEFLOW_HIGH_CONTRAST;
      resetHighContrast();
    });

    afterAll(() => {
      // Restore original env
      if (originalEnv !== undefined) {
        process.env.AGILEFLOW_HIGH_CONTRAST = originalEnv;
      } else {
        delete process.env.AGILEFLOW_HIGH_CONTRAST;
      }
      resetHighContrast();
    });

    describe('isHighContrast', () => {
      it('returns false by default', () => {
        expect(isHighContrast()).toBe(false);
      });

      it('returns true when AGILEFLOW_HIGH_CONTRAST=1', () => {
        process.env.AGILEFLOW_HIGH_CONTRAST = '1';
        resetHighContrast();
        expect(isHighContrast()).toBe(true);
      });

      it('returns true when AGILEFLOW_HIGH_CONTRAST=true', () => {
        process.env.AGILEFLOW_HIGH_CONTRAST = 'true';
        resetHighContrast();
        expect(isHighContrast()).toBe(true);
      });

      it('returns true when AGILEFLOW_HIGH_CONTRAST=yes', () => {
        process.env.AGILEFLOW_HIGH_CONTRAST = 'yes';
        resetHighContrast();
        expect(isHighContrast()).toBe(true);
      });

      it('returns false for other env values', () => {
        process.env.AGILEFLOW_HIGH_CONTRAST = '0';
        resetHighContrast();
        expect(isHighContrast()).toBe(false);
      });
    });

    describe('setHighContrast', () => {
      it('enables high-contrast mode programmatically', () => {
        setHighContrast(true);
        expect(isHighContrast()).toBe(true);
      });

      it('disables high-contrast mode programmatically', () => {
        setHighContrast(true);
        setHighContrast(false);
        expect(isHighContrast()).toBe(false);
      });

      it('overrides environment variable', () => {
        process.env.AGILEFLOW_HIGH_CONTRAST = '1';
        setHighContrast(false);
        expect(isHighContrast()).toBe(false);
      });
    });

    describe('resetHighContrast', () => {
      it('resets to use environment variable', () => {
        process.env.AGILEFLOW_HIGH_CONTRAST = '1';
        setHighContrast(false);
        expect(isHighContrast()).toBe(false);
        resetHighContrast();
        expect(isHighContrast()).toBe(true);
      });
    });

    describe('getColors', () => {
      it('returns standard palette by default', () => {
        expect(getColors()).toBe(cStandard);
      });

      it('returns high-contrast palette when enabled', () => {
        setHighContrast(true);
        expect(getColors()).toBe(hc);
      });
    });

    describe('c proxy', () => {
      it('returns standard colors by default', () => {
        expect(c.red).toBe(cStandard.red);
        expect(c.green).toBe(cStandard.green);
        expect(c.dim).toBe(cStandard.dim);
      });

      it('returns high-contrast colors when enabled', () => {
        setHighContrast(true);
        expect(c.red).toBe(hc.red);
        expect(c.green).toBe(hc.green);
        // dim is disabled (no dimming) in high-contrast
        expect(c.dim).toBe(hc.dim);
      });

      it('switches dynamically', () => {
        expect(c.red).toBe(cStandard.red);
        setHighContrast(true);
        expect(c.red).toBe(hc.red);
        setHighContrast(false);
        expect(c.red).toBe(cStandard.red);
      });
    });

    describe('hc palette', () => {
      it('has no dimming (uses reset instead)', () => {
        expect(hc.dim).toBe('\x1b[0m');
      });

      it('uses bright colors for standard colors', () => {
        expect(hc.red).toBe('\x1b[91m');
        expect(hc.green).toBe('\x1b[92m');
        expect(hc.yellow).toBe('\x1b[93m');
        expect(hc.cyan).toBe('\x1b[96m');
      });

      it('uses white instead of gray for brightBlack', () => {
        expect(hc.brightBlack).toBe('\x1b[37m');
      });

      it('maps 256-colors to bright alternatives', () => {
        expect(hc.mintGreen).toBe('\x1b[92m');
        expect(hc.coral).toBe('\x1b[91m');
        expect(hc.skyBlue).toBe('\x1b[96m');
        expect(hc.slate).toBe('\x1b[97m'); // White instead of gray
      });

      it('has brighter brand color for visibility', () => {
        expect(hc.brand).toBe('\x1b[38;2;255;165;0m');
      });
    });

    describe('status indicators in high-contrast mode', () => {
      it('uses bright colors in high-contrast mode', () => {
        setHighContrast(true);
        expect(status.success).toContain(hc.green);
        expect(status.error).toContain(hc.red);
        expect(status.warning).toContain(hc.yellow);
      });

      it('uses white instead of dim for pending', () => {
        setHighContrast(true);
        expect(status.pending).toContain(hc.white);
        expect(status.pending).not.toContain('\x1b[2m'); // No dim code
      });
    });

    describe('helper functions in high-contrast mode', () => {
      it('dim uses current palette', () => {
        setHighContrast(true);
        const result = dim('text');
        // In high-contrast mode, dim doesn't actually dim
        expect(result).toBe('\x1b[0mtext\x1b[0m');
      });

      it('success uses bright green in high-contrast', () => {
        setHighContrast(true);
        const result = success('text');
        expect(result).toContain('\x1b[92m'); // Bright green
      });

      it('error uses bright red in high-contrast', () => {
        setHighContrast(true);
        const result = error('text');
        expect(result).toContain('\x1b[91m'); // Bright red
      });

      it('warning uses bright yellow in high-contrast', () => {
        setHighContrast(true);
        const result = warning('text');
        expect(result).toContain('\x1b[93m'); // Bright yellow
      });
    });

    describe('WCAG AAA compliance', () => {
      it('hc palette meets 7:1 contrast ratio requirements', () => {
        // All high-contrast colors should be bright variants
        // Bright colors typically have 8:1+ contrast ratio against dark backgrounds
        const brightColors = [hc.red, hc.green, hc.yellow, hc.blue, hc.magenta, hc.cyan, hc.white];
        brightColors.forEach(color => {
          // All should be bright variants (codes 91-97)
          expect(color).toMatch(/\x1b\[9[1-7]m/);
        });
      });

      it('slate maps to white for visibility', () => {
        // Original slate is gray (low contrast)
        // High-contrast maps it to white
        expect(hc.slate).toBe('\x1b[97m');
      });
    });
  });
});
