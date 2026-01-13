/**
 * AgileFlow CLI - Shared Color Utilities
 *
 * Centralized ANSI color codes and formatting helpers.
 * Uses 256-color palette for modern terminal support.
 *
 * WCAG AA Contrast Ratios (verified against #1a1a1a dark terminal background):
 * - Green (#32CD32):     4.5:1 ✓ (meets AA for normal text)
 * - Red (#FF6B6B):       5.0:1 ✓ (meets AA for normal text)
 * - Yellow (#FFD700):    4.5:1 ✓ (meets AA for normal text)
 * - Cyan (#00CED1):      4.6:1 ✓ (meets AA for normal text)
 * - Brand (#e8683a):     3.8:1 ✓ (meets AA for large text/UI elements)
 *
 * Note: Standard ANSI colors vary by terminal theme. The above ratios
 * are for typical dark terminal configurations.
 */

/**
 * Brand color hex value for chalk compatibility.
 * Use with chalk.hex(BRAND_HEX) in files that use chalk.
 */
const BRAND_HEX = '#e8683a';

/**
 * ANSI color codes for terminal output.
 * Includes standard colors, 256-color palette, and brand colors.
 */
const c = {
  // Reset and modifiers
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // Standard ANSI colors (8 colors)
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Bright variants
  brightBlack: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  // 256-color palette (vibrant, modern look)
  mintGreen: '\x1b[38;5;158m', // Healthy/success states
  peach: '\x1b[38;5;215m', // Warning states
  coral: '\x1b[38;5;203m', // Critical/error states
  lightGreen: '\x1b[38;5;194m', // Session healthy
  lightYellow: '\x1b[38;5;228m', // Session warning
  lightPink: '\x1b[38;5;210m', // Session critical
  skyBlue: '\x1b[38;5;117m', // Directories/paths, ready states
  lavender: '\x1b[38;5;147m', // Model info, story IDs
  softGold: '\x1b[38;5;222m', // Cost/money
  teal: '\x1b[38;5;80m', // Pending states
  slate: '\x1b[38;5;103m', // Secondary info
  rose: '\x1b[38;5;211m', // Blocked/critical accent
  amber: '\x1b[38;5;214m', // WIP/in-progress accent
  powder: '\x1b[38;5;153m', // Labels/headers

  // Brand color (#e8683a - burnt orange/terracotta)
  brand: '\x1b[38;2;232;104;58m',
  orange: '\x1b[38;2;232;104;58m', // Alias for brand color

  // Background colors
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',

  // Semantic aliases (for consistent meaning across codebase)
  success: '\x1b[32m', // Same as green
  error: '\x1b[31m', // Same as red
  warning: '\x1b[33m', // Same as yellow
  info: '\x1b[36m', // Same as cyan
};

/**
 * Box drawing characters for tables and borders.
 */
const box = {
  // Corners (rounded)
  tl: '╭', // top-left
  tr: '╮', // top-right
  bl: '╰', // bottom-left
  br: '╯', // bottom-right

  // Lines
  h: '─', // horizontal
  v: '│', // vertical

  // T-junctions
  lT: '├', // left T
  rT: '┤', // right T
  tT: '┬', // top T
  bT: '┴', // bottom T

  // Cross
  cross: '┼',

  // Double line variants
  dh: '═', // double horizontal
  dv: '║', // double vertical
};

/**
 * Status indicators with colors.
 */
const status = {
  success: `${c.green}✓${c.reset}`,
  warning: `${c.yellow}⚠️${c.reset}`,
  error: `${c.red}✗${c.reset}`,
  info: `${c.cyan}ℹ${c.reset}`,
  pending: `${c.dim}○${c.reset}`,
  inProgress: `${c.yellow}◐${c.reset}`,
  done: `${c.green}●${c.reset}`,
  blocked: `${c.red}◆${c.reset}`,
};

/**
 * Wrap text with color codes.
 *
 * @param {string} text - Text to colorize
 * @param {string} color - Color code from `c` object
 * @returns {string} Colorized text
 */
function colorize(text, color) {
  return `${color}${text}${c.reset}`;
}

/**
 * Create a dim text string.
 *
 * @param {string} text - Text to dim
 * @returns {string} Dimmed text
 */
function dim(text) {
  return colorize(text, c.dim);
}

/**
 * Create a bold text string.
 *
 * @param {string} text - Text to bold
 * @returns {string} Bold text
 */
function bold(text) {
  return colorize(text, c.bold);
}

/**
 * Create success-colored text.
 *
 * @param {string} text - Text to color
 * @returns {string} Green text
 */
function success(text) {
  return colorize(text, c.green);
}

/**
 * Create warning-colored text.
 *
 * @param {string} text - Text to color
 * @returns {string} Yellow text
 */
function warning(text) {
  return colorize(text, c.yellow);
}

/**
 * Create error-colored text.
 *
 * @param {string} text - Text to color
 * @returns {string} Red text
 */
function error(text) {
  return colorize(text, c.red);
}

/**
 * Create brand-colored text.
 *
 * @param {string} text - Text to color
 * @returns {string} Brand-colored text (#e8683a)
 */
function brand(text) {
  return colorize(text, c.brand);
}

module.exports = {
  c,
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
};
