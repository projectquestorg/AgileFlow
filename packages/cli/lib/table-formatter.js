/**
 * table-formatter.js - Unified Table and List Formatting
 *
 * Provides consistent, TTY-aware formatting for tables, key-value pairs,
 * and lists across all CLI commands.
 *
 * Features:
 * - TTY detection for smart formatting
 * - Unicode box-drawing for borders
 * - Auto-width calculation
 * - Column alignment
 * - Safe for piping (plain text when not TTY)
 *
 * Usage:
 *   const { formatTable, formatKeyValue, formatList } = require('./table-formatter');
 *
 *   // Table with headers
 *   console.log(formatTable(
 *     ['Name', 'Status', 'Count'],
 *     [['Story 1', 'Done', '5'], ['Story 2', 'In Progress', '3']]
 *   ));
 *
 *   // Key-value pairs
 *   console.log(formatKeyValue({ Version: '1.0.0', Status: 'Active' }));
 *
 *   // Simple list
 *   console.log(formatList(['Item 1', 'Item 2', 'Item 3']));
 */

const { c } = require('./colors');

// Box-drawing characters for different styles
const BOX_CHARS = {
  // Single-line box
  single: {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│',
    cross: '┼',
    topT: '┬',
    bottomT: '┴',
    leftT: '├',
    rightT: '┤',
  },
  // Double-line box
  double: {
    topLeft: '╔',
    topRight: '╗',
    bottomLeft: '╚',
    bottomRight: '╝',
    horizontal: '═',
    vertical: '║',
    cross: '╬',
    topT: '╦',
    bottomT: '╩',
    leftT: '╠',
    rightT: '╣',
  },
  // Rounded corners
  rounded: {
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    horizontal: '─',
    vertical: '│',
    cross: '┼',
    topT: '┬',
    bottomT: '┴',
    leftT: '├',
    rightT: '┤',
  },
  // ASCII fallback
  ascii: {
    topLeft: '+',
    topRight: '+',
    bottomLeft: '+',
    bottomRight: '+',
    horizontal: '-',
    vertical: '|',
    cross: '+',
    topT: '+',
    bottomT: '+',
    leftT: '+',
    rightT: '+',
  },
};

// List bullet styles
const BULLETS = {
  disc: '•',
  circle: '○',
  square: '■',
  dash: '-',
  arrow: '→',
  check: '✓',
  cross: '✗',
  star: '★',
};

/**
 * Strip ANSI escape codes from a string
 * @param {string} str - String potentially containing ANSI codes
 * @returns {string} Plain text without ANSI codes
 */
function stripAnsi(str) {
  if (typeof str !== 'string') return String(str);
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

/**
 * Get visible width of a string (excluding ANSI codes)
 * @param {string} str - String to measure
 * @returns {number} Visible character count
 */
function visibleWidth(str) {
  return stripAnsi(str).length;
}

/**
 * Pad a string to a specified width (accounting for ANSI codes)
 * @param {string} str - String to pad
 * @param {number} width - Target width
 * @param {string} align - Alignment ('left', 'right', 'center')
 * @returns {string} Padded string
 */
function padString(str, width, align = 'left') {
  const visible = visibleWidth(str);
  const padding = Math.max(0, width - visible);

  if (align === 'right') {
    return ' '.repeat(padding) + str;
  }
  if (align === 'center') {
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
  }
  // Default: left
  return str + ' '.repeat(padding);
}

/**
 * Check if output is going to a TTY
 * @returns {boolean}
 */
function isTTY() {
  return process.stdout.isTTY === true;
}

/**
 * Format data as a table
 *
 * @param {string[]} headers - Column headers
 * @param {(string|number)[][]} rows - Table rows (array of arrays)
 * @param {Object} [options={}] - Formatting options
 * @param {string} [options.style='rounded'] - Box style ('single', 'double', 'rounded', 'ascii', 'none')
 * @param {string[]} [options.align] - Column alignments ('left', 'right', 'center')
 * @param {number} [options.maxWidth] - Maximum table width
 * @param {boolean} [options.compact=false] - Compact mode (no borders)
 * @param {string} [options.indent=''] - Prefix each line with this string
 * @returns {string} Formatted table
 *
 * @example
 * formatTable(
 *   ['Name', 'Status'],
 *   [['US-0001', 'Done'], ['US-0002', 'In Progress']],
 *   { style: 'rounded' }
 * );
 */
function formatTable(headers, rows, options = {}) {
  const {
    style = 'rounded',
    align = [],
    maxWidth = process.stdout.columns || 80,
    compact = false,
    indent = '',
  } = options;

  // Convert all values to strings
  const stringHeaders = headers.map(h => String(h ?? ''));
  const stringRows = rows.map(row => row.map(cell => String(cell ?? '')));

  // Calculate column widths
  const colWidths = stringHeaders.map((h, i) => {
    const headerWidth = visibleWidth(h);
    const maxCellWidth = stringRows.reduce((max, row) => {
      const cellWidth = visibleWidth(row[i] || '');
      return Math.max(max, cellWidth);
    }, 0);
    return Math.max(headerWidth, maxCellWidth);
  });

  // Use compact/no-border for non-TTY
  const useCompact = compact || !isTTY();
  const box = useCompact ? null : BOX_CHARS[style] || BOX_CHARS.ascii;

  const lines = [];

  if (useCompact) {
    // Compact mode: tab-separated or space-padded
    if (isTTY()) {
      // Padded columns
      const headerLine = stringHeaders
        .map((h, i) => padString(h, colWidths[i], align[i] || 'left'))
        .join('  ');
      lines.push(indent + c.bold + headerLine + c.reset);

      for (const row of stringRows) {
        const rowLine = row.map((cell, i) => padString(cell, colWidths[i], align[i] || 'left')).join('  ');
        lines.push(indent + rowLine);
      }
    } else {
      // Tab-separated for piping (still respect indent)
      lines.push(indent + stringHeaders.join('\t'));
      for (const row of stringRows) {
        lines.push(indent + row.join('\t'));
      }
    }
  } else {
    // Bordered table
    const padding = 1;
    const paddedWidths = colWidths.map(w => w + padding * 2);

    // Top border
    const topBorder =
      box.topLeft +
      paddedWidths.map(w => box.horizontal.repeat(w)).join(box.topT) +
      box.topRight;
    lines.push(indent + c.dim + topBorder + c.reset);

    // Header row
    const headerCells = stringHeaders.map((h, i) => {
      const padded = padString(h, colWidths[i], align[i] || 'left');
      return ' ' + c.bold + padded + c.reset + ' ';
    });
    lines.push(indent + c.dim + box.vertical + c.reset + headerCells.join(c.dim + box.vertical + c.reset) + c.dim + box.vertical + c.reset);

    // Header separator
    const headerSep =
      box.leftT +
      paddedWidths.map(w => box.horizontal.repeat(w)).join(box.cross) +
      box.rightT;
    lines.push(indent + c.dim + headerSep + c.reset);

    // Data rows
    for (const row of stringRows) {
      const cells = row.map((cell, i) => {
        const padded = padString(cell, colWidths[i], align[i] || 'left');
        return ' ' + padded + ' ';
      });
      lines.push(indent + c.dim + box.vertical + c.reset + cells.join(c.dim + box.vertical + c.reset) + c.dim + box.vertical + c.reset);
    }

    // Bottom border
    const bottomBorder =
      box.bottomLeft +
      paddedWidths.map(w => box.horizontal.repeat(w)).join(box.bottomT) +
      box.bottomRight;
    lines.push(indent + c.dim + bottomBorder + c.reset);
  }

  return lines.join('\n');
}

/**
 * Format key-value pairs
 *
 * @param {Object|Map|Array<[string,any]>} data - Key-value data
 * @param {Object} [options={}] - Formatting options
 * @param {string} [options.separator=':'] - Key-value separator
 * @param {boolean} [options.alignValues=true] - Align all values to same column
 * @param {string} [options.indent=''] - Prefix each line
 * @param {string} [options.keyColor] - Color code for keys
 * @param {string} [options.valueColor] - Color code for values
 * @returns {string} Formatted key-value pairs
 *
 * @example
 * formatKeyValue({
 *   Version: '2.0.0',
 *   Status: 'Active',
 *   'Last Update': '2024-01-15'
 * });
 */
function formatKeyValue(data, options = {}) {
  const {
    separator = ':',
    alignValues = true,
    indent = '',
    keyColor = c.bold,
    valueColor = '',
  } = options;

  // Convert to array of [key, value] pairs
  let pairs;
  if (data instanceof Map) {
    pairs = Array.from(data.entries());
  } else if (Array.isArray(data)) {
    pairs = data;
  } else {
    pairs = Object.entries(data);
  }

  // Convert values to strings
  pairs = pairs.map(([k, v]) => [String(k), String(v ?? '')]);

  if (!isTTY()) {
    // Plain text for piping (still respect indent)
    return pairs.map(([k, v]) => `${indent}${k}${separator} ${v}`).join('\n');
  }

  // Calculate key width for alignment
  const maxKeyWidth = alignValues
    ? Math.max(...pairs.map(([k]) => visibleWidth(k)))
    : 0;

  const lines = pairs.map(([key, value]) => {
    const paddedKey = alignValues ? padString(key, maxKeyWidth, 'left') : key;
    return `${indent}${keyColor}${paddedKey}${c.reset}${separator} ${valueColor}${value}${valueColor ? c.reset : ''}`;
  });

  return lines.join('\n');
}

/**
 * Format a list of items
 *
 * @param {(string|{text:string,status?:string})[]} items - List items
 * @param {Object} [options={}] - Formatting options
 * @param {string} [options.bullet='disc'] - Bullet style ('disc', 'circle', 'square', 'dash', 'arrow', 'check', 'cross', 'star', 'number')
 * @param {string} [options.indent=''] - Prefix each line
 * @param {boolean} [options.numbered=false] - Use numbers instead of bullets
 * @param {number} [options.startNumber=1] - Starting number for numbered lists
 * @param {string} [options.itemColor] - Color code for items
 * @returns {string} Formatted list
 *
 * @example
 * formatList(['Item 1', 'Item 2', 'Item 3'], { bullet: 'check' });
 *
 * // With status indicators
 * formatList([
 *   { text: 'Task 1', status: 'done' },
 *   { text: 'Task 2', status: 'pending' }
 * ]);
 */
function formatList(items, options = {}) {
  const {
    bullet = 'disc',
    indent = '',
    numbered = false,
    startNumber = 1,
    itemColor = '',
  } = options;

  if (!isTTY()) {
    // Plain text for piping
    return items
      .map((item, i) => {
        const text = typeof item === 'object' ? item.text : item;
        const prefix = numbered ? `${startNumber + i}.` : '-';
        return `${prefix} ${text}`;
      })
      .join('\n');
  }

  const bulletChar = BULLETS[bullet] || BULLETS.disc;
  const numWidth = numbered ? String(startNumber + items.length - 1).length : 0;

  const lines = items.map((item, i) => {
    const text = typeof item === 'object' ? item.text : String(item);
    const status = typeof item === 'object' ? item.status : null;

    let prefix;
    if (numbered) {
      prefix = `${String(startNumber + i).padStart(numWidth)}.`;
    } else if (status) {
      // Status-based bullet
      switch (status) {
        case 'done':
        case 'completed':
        case 'success':
          prefix = c.green + BULLETS.check + c.reset;
          break;
        case 'error':
        case 'failed':
          prefix = c.red + BULLETS.cross + c.reset;
          break;
        case 'pending':
        case 'waiting':
          prefix = c.yellow + BULLETS.circle + c.reset;
          break;
        case 'active':
        case 'in_progress':
          prefix = c.cyan + BULLETS.disc + c.reset;
          break;
        default:
          prefix = c.dim + bulletChar + c.reset;
      }
    } else {
      prefix = c.dim + bulletChar + c.reset;
    }

    const coloredText = itemColor ? `${itemColor}${text}${c.reset}` : text;
    return `${indent}${prefix} ${coloredText}`;
  });

  return lines.join('\n');
}

/**
 * Format a horizontal divider
 *
 * @param {Object} [options={}] - Formatting options
 * @param {number} [options.width] - Divider width (default: terminal width)
 * @param {string} [options.char='─'] - Character to use
 * @param {string} [options.style] - Style ('single', 'double', 'dotted', 'bold')
 * @returns {string} Formatted divider
 */
function formatDivider(options = {}) {
  const { width = process.stdout.columns || 80, char, style = 'single' } = options;

  if (!isTTY()) {
    return '-'.repeat(Math.min(width, 80));
  }

  const chars = {
    single: '─',
    double: '═',
    dotted: '┄',
    bold: '━',
  };

  const divChar = char || chars[style] || chars.single;
  return c.dim + divChar.repeat(width) + c.reset;
}

/**
 * Format a section header
 *
 * @param {string} title - Section title
 * @param {Object} [options={}] - Formatting options
 * @param {string} [options.subtitle] - Optional subtitle
 * @param {string} [options.indent=''] - Prefix
 * @returns {string} Formatted header
 */
function formatHeader(title, options = {}) {
  const { subtitle, indent = '' } = options;

  if (!isTTY()) {
    let header = `\n${title}`;
    if (subtitle) header += ` - ${subtitle}`;
    header += '\n' + '='.repeat(Math.min(visibleWidth(title) + (subtitle ? subtitle.length + 3 : 0), 40));
    return header;
  }

  let header = `\n${indent}${c.bold}${title}${c.reset}`;
  if (subtitle) {
    header += ` ${c.dim}${subtitle}${c.reset}`;
  }

  return header;
}

/**
 * Truncate a string to fit within a width
 *
 * @param {string} str - String to truncate
 * @param {number} maxWidth - Maximum width
 * @param {string} [suffix='…'] - Suffix to add when truncated
 * @returns {string} Truncated string
 */
function truncate(str, maxWidth, suffix = '…') {
  if (typeof str !== 'string') str = String(str);
  const width = visibleWidth(str);
  if (width <= maxWidth) return str;

  const suffixWidth = visibleWidth(suffix);
  const targetWidth = maxWidth - suffixWidth;

  // Need to handle ANSI codes carefully
  const plain = stripAnsi(str);
  if (plain.length <= maxWidth) return str;

  return plain.slice(0, targetWidth) + suffix;
}

module.exports = {
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
};
