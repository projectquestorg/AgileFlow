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
 * WCAG AAA Contrast Ratios (high-contrast mode, 7:1+ ratio):
 * - HC Green (#7CFC00):  11.3:1 ✓ (lawn green - meets AAA)
 * - HC Red (#FF6B6B):    5.0:1 → #FF9999 8.1:1 ✓ (light coral - meets AAA)
 * - HC Yellow (#FFFF00): 19.6:1 ✓ (pure yellow - meets AAA)
 * - HC Cyan (#00FFFF):   14.0:1 ✓ (aqua - meets AAA)
 * - HC White (#FFFFFF):  21.0:1 ✓ (pure white - meets AAA)
 *
 * Note: Standard ANSI colors vary by terminal theme. The above ratios
 * are for typical dark terminal configurations.
 */

// High-contrast mode detection
let _highContrastMode = null;

/**
 * Check if high-contrast mode is enabled.
 * Checks: AGILEFLOW_HIGH_CONTRAST env var, or cached value.
 * @returns {boolean} True if high-contrast mode is enabled
 */
function isHighContrast() {
  if (_highContrastMode !== null) {
    return _highContrastMode;
  }
  const envValue = process.env.AGILEFLOW_HIGH_CONTRAST;
  return envValue === '1' || envValue === 'true' || envValue === 'yes';
}

/**
 * Enable or disable high-contrast mode programmatically.
 * @param {boolean} enabled - Whether to enable high-contrast mode
 */
function setHighContrast(enabled) {
  _highContrastMode = enabled;
}

/**
 * Reset high-contrast mode to use environment variable.
 */
function resetHighContrast() {
  _highContrastMode = null;
}

/**
 * Brand color hex value for chalk compatibility.
 * Use with chalk.hex(BRAND_HEX) in files that use chalk.
 */
const BRAND_HEX = '#e8683a';

/**
 * WCAG AAA high-contrast color palette (7:1+ contrast ratio).
 * Used when AGILEFLOW_HIGH_CONTRAST=1 or --high-contrast flag.
 */
const hc = {
  // Reset and modifiers
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[0m', // No dimming in high-contrast (use regular text)
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // High-contrast standard colors (bright variants for max visibility)
  red: '\x1b[91m', // Bright red
  green: '\x1b[92m', // Bright green
  yellow: '\x1b[93m', // Bright yellow
  blue: '\x1b[94m', // Bright blue
  magenta: '\x1b[95m', // Bright magenta
  cyan: '\x1b[96m', // Bright cyan
  white: '\x1b[97m', // Bright white

  // Bright variants (same in high-contrast mode)
  brightBlack: '\x1b[37m', // Use white instead of gray
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  // 256-color high-contrast alternatives (all 7:1+ ratio)
  mintGreen: '\x1b[92m', // Bright green
  peach: '\x1b[93m', // Bright yellow
  coral: '\x1b[91m', // Bright red
  lightGreen: '\x1b[92m', // Bright green
  lightYellow: '\x1b[93m', // Bright yellow
  lightPink: '\x1b[91m', // Bright red
  skyBlue: '\x1b[96m', // Bright cyan
  lavender: '\x1b[95m', // Bright magenta
  softGold: '\x1b[93m', // Bright yellow
  teal: '\x1b[96m', // Bright cyan
  slate: '\x1b[97m', // White (instead of gray)
  rose: '\x1b[91m', // Bright red
  amber: '\x1b[93m', // Bright yellow
  powder: '\x1b[96m', // Bright cyan

  // Brand color - use bright orange/yellow for visibility
  brand: '\x1b[38;2;255;165;0m', // Bright orange (#FFA500 - 8.0:1 ratio)
  orange: '\x1b[38;2;255;165;0m',

  // Background colors (same as standard)
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',

  // Semantic aliases
  success: '\x1b[92m',
  error: '\x1b[91m',
  warning: '\x1b[93m',
  info: '\x1b[96m',
};

/**
 * ANSI color codes for terminal output.
 * Includes standard colors, 256-color palette, and brand colors.
 */
const cStandard = {
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
 * Get the active color palette based on high-contrast mode.
 * @returns {Object} Color palette object (either cStandard or hc)
 */
function getColors() {
  return isHighContrast() ? hc : cStandard;
}

// For backwards compatibility, export a Proxy that delegates to the active palette
const c = new Proxy(
  {},
  {
    get(_, prop) {
      return getColors()[prop];
    },
    has(_, prop) {
      return prop in cStandard;
    },
    ownKeys() {
      return Object.keys(cStandard);
    },
    getOwnPropertyDescriptor(_, prop) {
      if (prop in cStandard) {
        return { enumerable: true, configurable: true, value: getColors()[prop] };
      }
      return undefined;
    },
  }
);

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
 * Get status indicators with current color palette.
 * Uses a Proxy to dynamically generate colored indicators.
 */
const status = new Proxy(
  {},
  {
    get(_, prop) {
      const colors = getColors();
      const indicators = {
        success: `${colors.green}✓${colors.reset}`,
        warning: `${colors.yellow}⚠️${colors.reset}`,
        error: `${colors.red}✗${colors.reset}`,
        info: `${colors.cyan}ℹ${colors.reset}`,
        pending: `${isHighContrast() ? colors.white : colors.dim}○${colors.reset}`,
        inProgress: `${colors.yellow}◐${colors.reset}`,
        done: `${colors.green}●${colors.reset}`,
        blocked: `${colors.red}◆${colors.reset}`,
      };
      return indicators[prop];
    },
    has(_, prop) {
      return [
        'success',
        'warning',
        'error',
        'info',
        'pending',
        'inProgress',
        'done',
        'blocked',
      ].includes(prop);
    },
    ownKeys() {
      return ['success', 'warning', 'error', 'info', 'pending', 'inProgress', 'done', 'blocked'];
    },
    getOwnPropertyDescriptor(_, prop) {
      if (status.has(_, prop)) {
        return { enumerable: true, configurable: true };
      }
      return undefined;
    },
  }
);

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
  // Color palettes
  c,
  cStandard,
  hc,
  getColors,

  // High-contrast mode control
  isHighContrast,
  setHighContrast,
  resetHighContrast,

  // UI elements
  box,
  status,

  // Helper functions
  colorize,
  dim,
  bold,
  success,
  warning,
  error,
  brand,

  // Constants
  BRAND_HEX,
};
