/**
 * tmux-group-colors.js - Color palette for tmux tab groups
 *
 * Provides a curated palette of 8 colors optimized for dark terminal
 * backgrounds (Tokyo Night compatible). Supports color assignment by
 * audit type and random selection with avoidance of in-use colors.
 *
 * Usage:
 *   const { getColorForAudit, pickGroupColor } = require('./tmux-group-colors');
 *   const color = getColorForAudit('security');  // '#f7768e'
 *   const random = pickGroupColor(['#f7768e']);   // random excluding coral
 */

/**
 * Curated palette for dark backgrounds.
 * Each color has sufficient contrast against #1a1b26 (Tokyo Night bg)
 * and #2d2f3a (tab bg).
 */
const GROUP_PALETTE = [
  { name: 'coral', hex: '#f7768e', audit: 'security' },
  { name: 'sky', hex: '#7aa2f7', audit: 'logic' },
  { name: 'mint', hex: '#73daca', audit: 'performance' },
  { name: 'amber', hex: '#e0af68', audit: 'test' },
  { name: 'violet', hex: '#bb9af7', audit: 'completeness' },
  { name: 'lime', hex: '#9ece6a', audit: 'legal' },
  { name: 'rose', hex: '#ff9e64', audit: null },
  { name: 'ice', hex: '#89ddff', audit: null },
];

/**
 * Map audit type to its assigned color.
 */
const AUDIT_COLOR_MAP = {};
for (const entry of GROUP_PALETTE) {
  if (entry.audit) {
    AUDIT_COLOR_MAP[entry.audit] = entry.hex;
  }
}

/**
 * Get the assigned color for an audit type.
 *
 * @param {string} auditType - Audit type key (security, logic, etc.)
 * @returns {string} Hex color string
 */
function getColorForAudit(auditType) {
  return AUDIT_COLOR_MAP[auditType] || pickGroupColor([]);
}

/**
 * Pick a group color, avoiding colors currently in use.
 *
 * @param {string[]} [inUseColors] - Array of hex colors currently in use
 * @returns {string} Hex color string not in the in-use list
 */
function pickGroupColor(inUseColors) {
  const avoid = new Set((inUseColors || []).map(c => c.toLowerCase()));
  const available = GROUP_PALETTE.filter(entry => !avoid.has(entry.hex.toLowerCase()));

  if (available.length === 0) {
    // All colors in use, pick first from full palette
    return GROUP_PALETTE[0].hex;
  }

  // Deterministic pick: first available for consistency
  return available[0].hex;
}

/**
 * Get a palette entry by name.
 *
 * @param {string} name - Color name (e.g. 'coral', 'sky')
 * @returns {object|null} Palette entry or null
 */
function getColorByName(name) {
  return GROUP_PALETTE.find(entry => entry.name === name) || null;
}

/**
 * Build tmux window format string with group color.
 *
 * @param {string} groupColor - Hex color for the group
 * @param {string} prefix - Short prefix (e.g. 'Sec', 'Logic')
 * @param {boolean} [isActive=false] - Whether this is the active window
 * @returns {string} tmux format string
 */
function buildGroupWindowFormat(groupColor, prefix, isActive) {
  if (isActive) {
    // Active: colored bg for index, dark bg for name
    return `#[fg=#1a1b26 bg=${groupColor} bold] #I #[fg=${groupColor} bg=#2d2f3a]#[fg=#e0e0e0] ${prefix}:#{window_name} #[bg=#1a1b26 fg=#2d2f3a]`;
  }
  // Inactive: colored dot prefix + gray text
  return `#[fg=${groupColor}]#[fg=#8a8a8a] #I:${prefix}:#{window_name} `;
}

/**
 * Get all palette colors.
 *
 * @returns {Array<{ name: string, hex: string, audit: string|null }>}
 */
function getAllColors() {
  return [...GROUP_PALETTE];
}

module.exports = {
  GROUP_PALETTE,
  AUDIT_COLOR_MAP,
  getColorForAudit,
  pickGroupColor,
  getColorByName,
  buildGroupWindowFormat,
  getAllColors,
};
