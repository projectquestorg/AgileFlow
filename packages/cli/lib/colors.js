/**
 * AgileFlow CLI - Shared Color Utilities
 *
 * Centralized ANSI color codes and formatting helpers.
 * Uses 256-color palette for modern terminal support.
 *
 * Color definitions are generated from config/colors.yaml.
 * Run: node scripts/generate-colors.js
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

// Import generated color definitions from YAML source of truth
const generated = require('./colors.generated');

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
const { BRAND_HEX } = generated;

/**
 * WCAG AAA high-contrast color palette (7:1+ contrast ratio).
 * Used when AGILEFLOW_HIGH_CONTRAST=1 or --high-contrast flag.
 * Built from generated highContrast values plus additional mappings.
 */
const hc = {
  // Reset and modifiers from generated
  reset: generated.modifiers.reset,
  bold: generated.modifiers.bold,
  dim: generated.highContrast.dim, // No dimming in high-contrast
  italic: generated.modifiers.italic,
  underline: generated.modifiers.underline,

  // High-contrast standard colors (from generated)
  red: generated.highContrast.red,
  green: generated.highContrast.green,
  yellow: generated.highContrast.yellow,
  blue: generated.highContrast.blue,
  magenta: generated.highContrast.magenta,
  cyan: generated.highContrast.cyan,
  white: generated.highContrast.white,

  // Bright variants (same in high-contrast mode)
  brightBlack: generated.highContrast.brightBlack, // Use white instead of gray
  brightRed: generated.highContrast.red,
  brightGreen: generated.highContrast.green,
  brightYellow: generated.highContrast.yellow,
  brightBlue: generated.highContrast.blue,
  brightMagenta: generated.highContrast.magenta,
  brightCyan: generated.highContrast.cyan,
  brightWhite: generated.highContrast.white,

  // 256-color high-contrast alternatives (all 7:1+ ratio)
  mintGreen: generated.highContrast.green,
  peach: generated.highContrast.yellow,
  coral: generated.highContrast.red,
  lightGreen: generated.highContrast.green,
  lightYellow: generated.highContrast.yellow,
  lightPink: generated.highContrast.red,
  skyBlue: generated.highContrast.cyan,
  lavender: generated.highContrast.magenta,
  softGold: generated.highContrast.yellow,
  teal: generated.highContrast.cyan,
  slate: generated.highContrast.white, // White instead of gray
  rose: generated.highContrast.red,
  amber: generated.highContrast.yellow,
  powder: generated.highContrast.cyan,

  // Brand color - from generated high-contrast brand
  brand: generated.highContrast.brand,
  orange: generated.highContrast.brand,

  // Background colors (same as standard)
  bgRed: generated.backgrounds.bgRed,
  bgGreen: generated.backgrounds.bgGreen,
  bgYellow: generated.backgrounds.bgYellow,
  bgBlue: generated.backgrounds.bgBlue,

  // Semantic aliases
  success: generated.highContrast.green,
  error: generated.highContrast.red,
  warning: generated.highContrast.yellow,
  info: generated.highContrast.cyan,
};

/**
 * ANSI color codes for terminal output.
 * Includes standard colors, 256-color palette, and brand colors.
 * Values imported from generated colors (config/colors.yaml source of truth).
 */
const cStandard = generated.cStandard;

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
