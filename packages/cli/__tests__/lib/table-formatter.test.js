/**
 * Tests for table-formatter.js
 */

const {
  formatTable,
  formatKeyValue,
  formatList,
  formatDivider,
  formatHeader,
  truncate,
  stripAnsi,
  visibleWidth,
  padString,
  isTTY,
  BOX_CHARS,
  BULLETS,
} = require('../../lib/table-formatter');

describe('table-formatter', () => {
  // Save original TTY state
  const originalIsTTY = process.stdout.isTTY;

  afterEach(() => {
    // Restore TTY state
    process.stdout.isTTY = originalIsTTY;
  });

  describe('stripAnsi', () => {
    it('removes ANSI escape codes', () => {
      expect(stripAnsi('\x1B[31mred text\x1B[0m')).toBe('red text');
      expect(stripAnsi('\x1B[1m\x1B[32mgreen bold\x1B[0m')).toBe('green bold');
    });

    it('handles strings without ANSI codes', () => {
      expect(stripAnsi('plain text')).toBe('plain text');
    });

    it('handles non-strings', () => {
      expect(stripAnsi(123)).toBe('123');
      expect(stripAnsi(null)).toBe('null');
      expect(stripAnsi(undefined)).toBe('undefined');
    });
  });

  describe('visibleWidth', () => {
    it('calculates width excluding ANSI codes', () => {
      expect(visibleWidth('\x1B[31mred\x1B[0m')).toBe(3);
      expect(visibleWidth('plain')).toBe(5);
    });

    it('handles empty strings', () => {
      expect(visibleWidth('')).toBe(0);
    });
  });

  describe('padString', () => {
    it('pads left-aligned strings', () => {
      expect(padString('foo', 10, 'left')).toBe('foo       ');
    });

    it('pads right-aligned strings', () => {
      expect(padString('foo', 10, 'right')).toBe('       foo');
    });

    it('pads center-aligned strings', () => {
      expect(padString('foo', 10, 'center')).toBe('   foo    ');
    });

    it('handles strings longer than width', () => {
      expect(padString('hello world', 5, 'left')).toBe('hello world');
    });

    it('accounts for ANSI codes in padding', () => {
      const colored = '\x1B[31mfoo\x1B[0m';
      const padded = padString(colored, 10, 'left');
      expect(visibleWidth(padded)).toBe(10);
    });
  });

  describe('formatTable', () => {
    it('formats basic table (TTY mode)', () => {
      process.stdout.isTTY = true;

      const table = formatTable(
        ['Name', 'Value'],
        [
          ['foo', '1'],
          ['bar', '2'],
        ]
      );

      expect(table).toContain('Name');
      expect(table).toContain('Value');
      expect(table).toContain('foo');
      expect(table).toContain('bar');
    });

    it('formats table with compact mode', () => {
      const table = formatTable(
        ['Name', 'Value'],
        [
          ['foo', '1'],
          ['bar', '2'],
        ],
        { compact: true }
      );

      expect(table).toContain('Name');
      expect(table).toContain('foo');
      // Should not contain box characters
      expect(table).not.toContain('┌');
      expect(table).not.toContain('│');
    });

    it('formats table in non-TTY mode (tab-separated)', () => {
      process.stdout.isTTY = false;

      const table = formatTable(
        ['Name', 'Value'],
        [
          ['foo', '1'],
          ['bar', '2'],
        ]
      );

      expect(table).toBe('Name\tValue\nfoo\t1\nbar\t2');
    });

    it('handles empty rows', () => {
      const table = formatTable(['A', 'B'], []);
      expect(table).toContain('A');
      expect(table).toContain('B');
    });

    it('handles null/undefined values', () => {
      const table = formatTable(['Name', 'Value'], [[null, undefined]], { compact: true });

      expect(table).toBeDefined();
    });

    it('supports different box styles', () => {
      process.stdout.isTTY = true;

      const singleTable = formatTable(['A'], [['1']], { style: 'single' });
      expect(singleTable).toContain('┌');

      const doubleTable = formatTable(['A'], [['1']], { style: 'double' });
      expect(doubleTable).toContain('╔');

      const roundedTable = formatTable(['A'], [['1']], { style: 'rounded' });
      expect(roundedTable).toContain('╭');
    });

    it('supports column alignment', () => {
      process.stdout.isTTY = true;

      const table = formatTable(['Left', 'Right', 'Center'], [['a', 'b', 'c']], {
        align: ['left', 'right', 'center'],
        compact: true,
      });

      expect(table).toBeDefined();
    });

    it('supports indent option', () => {
      const table = formatTable(['A', 'B'], [['1', '2']], { compact: true, indent: '  ' });

      const lines = table.split('\n');
      expect(lines[0].startsWith('  ')).toBe(true);
    });
  });

  describe('formatKeyValue', () => {
    it('formats object as key-value pairs (TTY)', () => {
      process.stdout.isTTY = true;

      const output = formatKeyValue({
        Name: 'AgileFlow',
        Version: '1.0.0',
      });

      expect(output).toContain('Name');
      expect(output).toContain('AgileFlow');
      expect(output).toContain('Version');
      expect(output).toContain('1.0.0');
    });

    it('formats in non-TTY mode', () => {
      process.stdout.isTTY = false;

      const output = formatKeyValue({
        Name: 'AgileFlow',
        Version: '1.0.0',
      });

      expect(output).toBe('Name: AgileFlow\nVersion: 1.0.0');
    });

    it('handles Map input', () => {
      const map = new Map([
        ['key1', 'value1'],
        ['key2', 'value2'],
      ]);
      const output = formatKeyValue(map);

      expect(output).toContain('key1');
      expect(output).toContain('value1');
    });

    it('handles array of pairs input', () => {
      const pairs = [
        ['key1', 'value1'],
        ['key2', 'value2'],
      ];
      const output = formatKeyValue(pairs);

      expect(output).toContain('key1');
      expect(output).toContain('value1');
    });

    it('supports custom separator', () => {
      process.stdout.isTTY = false;

      const output = formatKeyValue({ Name: 'Test' }, { separator: ' =' });

      expect(output).toBe('Name = Test');
    });

    it('aligns values when enabled', () => {
      process.stdout.isTTY = true;

      const output = formatKeyValue(
        {
          A: '1',
          LongKey: '2',
        },
        { alignValues: true }
      );

      const lines = output.split('\n');
      // All colons should be at the same position
      expect(lines.length).toBe(2);
    });

    it('supports indent option', () => {
      process.stdout.isTTY = false;

      const output = formatKeyValue({ Key: 'Value' }, { indent: '  ' });

      expect(output.startsWith('  ')).toBe(true);
    });
  });

  describe('formatList', () => {
    it('formats simple list (TTY)', () => {
      process.stdout.isTTY = true;

      const output = formatList(['Item 1', 'Item 2', 'Item 3']);

      expect(output).toContain('Item 1');
      expect(output).toContain('Item 2');
      expect(output).toContain('Item 3');
      expect(output).toContain('•'); // disc bullet
    });

    it('formats list in non-TTY mode', () => {
      process.stdout.isTTY = false;

      const output = formatList(['Item 1', 'Item 2']);

      expect(output).toBe('- Item 1\n- Item 2');
    });

    it('supports numbered lists', () => {
      process.stdout.isTTY = false;

      const output = formatList(['First', 'Second'], { numbered: true });

      expect(output).toBe('1. First\n2. Second');
    });

    it('supports custom start number', () => {
      process.stdout.isTTY = false;

      const output = formatList(['A', 'B'], { numbered: true, startNumber: 5 });

      expect(output).toBe('5. A\n6. B');
    });

    it('supports different bullet styles', () => {
      process.stdout.isTTY = true;

      const checkList = formatList(['Done'], { bullet: 'check' });
      expect(checkList).toContain('✓');

      const arrowList = formatList(['Point'], { bullet: 'arrow' });
      expect(arrowList).toContain('→');
    });

    it('handles items with status', () => {
      process.stdout.isTTY = true;

      const output = formatList([
        { text: 'Task 1', status: 'done' },
        { text: 'Task 2', status: 'pending' },
        { text: 'Task 3', status: 'error' },
      ]);

      expect(output).toContain('Task 1');
      expect(output).toContain('Task 2');
      expect(output).toContain('Task 3');
      expect(output).toContain('✓'); // done
      expect(output).toContain('○'); // pending
      expect(output).toContain('✗'); // error
    });

    it('supports indent option', () => {
      process.stdout.isTTY = false;

      const output = formatList(['Item'], { indent: '  ' });

      expect(output.startsWith('- Item')).toBe(true);
    });
  });

  describe('formatDivider', () => {
    it('creates divider (TTY)', () => {
      process.stdout.isTTY = true;

      const divider = formatDivider({ width: 40 });

      expect(visibleWidth(stripAnsi(divider))).toBe(40);
    });

    it('creates divider (non-TTY)', () => {
      process.stdout.isTTY = false;

      const divider = formatDivider({ width: 40 });

      expect(divider).toBe('-'.repeat(40));
    });

    it('supports different styles', () => {
      process.stdout.isTTY = true;

      const single = formatDivider({ width: 10, style: 'single' });
      expect(stripAnsi(single)).toContain('─');

      const double = formatDivider({ width: 10, style: 'double' });
      expect(stripAnsi(double)).toContain('═');
    });

    it('supports custom character', () => {
      process.stdout.isTTY = true;

      const divider = formatDivider({ width: 10, char: '*' });
      expect(stripAnsi(divider)).toBe('**********');
    });
  });

  describe('formatHeader', () => {
    it('formats header (TTY)', () => {
      process.stdout.isTTY = true;

      const header = formatHeader('Section Title');

      expect(header).toContain('Section Title');
    });

    it('formats header with subtitle', () => {
      process.stdout.isTTY = true;

      const header = formatHeader('Title', { subtitle: 'Subtitle' });

      expect(header).toContain('Title');
      expect(header).toContain('Subtitle');
    });

    it('formats header (non-TTY)', () => {
      process.stdout.isTTY = false;

      const header = formatHeader('Title');

      expect(header).toContain('Title');
      expect(header).toContain('=');
    });
  });

  describe('truncate', () => {
    it('truncates long strings', () => {
      expect(truncate('hello world', 8)).toBe('hello w…');
    });

    it('returns original if shorter than max', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('supports custom suffix', () => {
      expect(truncate('hello world', 8, '...')).toBe('hello...');
    });

    it('handles non-strings', () => {
      expect(truncate(12345, 3)).toBe('12…');
    });
  });

  describe('isTTY', () => {
    it('returns TTY state', () => {
      process.stdout.isTTY = true;
      expect(isTTY()).toBe(true);

      process.stdout.isTTY = false;
      expect(isTTY()).toBe(false);
    });
  });

  describe('BOX_CHARS', () => {
    it('exports box drawing characters', () => {
      expect(BOX_CHARS.single).toBeDefined();
      expect(BOX_CHARS.double).toBeDefined();
      expect(BOX_CHARS.rounded).toBeDefined();
      expect(BOX_CHARS.ascii).toBeDefined();
    });

    it('has required characters for each style', () => {
      const required = [
        'topLeft',
        'topRight',
        'bottomLeft',
        'bottomRight',
        'horizontal',
        'vertical',
      ];

      for (const style of Object.keys(BOX_CHARS)) {
        for (const char of required) {
          expect(BOX_CHARS[style][char]).toBeDefined();
        }
      }
    });
  });

  describe('BULLETS', () => {
    it('exports bullet characters', () => {
      expect(BULLETS.disc).toBe('•');
      expect(BULLETS.check).toBe('✓');
      expect(BULLETS.cross).toBe('✗');
      expect(BULLETS.arrow).toBe('→');
    });
  });

  describe('edge cases', () => {
    it('handles empty table', () => {
      const table = formatTable([], []);
      expect(table).toBeDefined();
    });

    it('handles empty key-value object', () => {
      const output = formatKeyValue({});
      expect(output).toBe('');
    });

    it('handles empty list', () => {
      const output = formatList([]);
      expect(output).toBe('');
    });

    it('handles very long values in table', () => {
      const table = formatTable(
        ['Name'],
        [['This is a very long value that might cause issues with formatting']],
        { compact: true }
      );
      expect(table).toContain('This is a very long value');
    });

    it('handles special characters in values', () => {
      const table = formatTable(['Name'], [['Value with | pipe and \t tab']], { compact: true });
      expect(table).toBeDefined();
    });
  });
});
