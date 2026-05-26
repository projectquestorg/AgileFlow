/**
 * Tab (tmux window) support for `agileflow launch`.
 *
 * Ports the v3 `af` script's tab strip + window keybinds onto v4's
 * preset/runner architecture.
 *
 * Two responsibilities, kept pure:
 *
 *   1. `buildTabFormat({ theme, tmuxVersion })` — returns the string
 *      that goes into `status-format[1]`. On tmux 3.2+ this is a
 *      5-tier cascading format that dynamically compacts as more
 *      windows open. On older tmux it falls back to a single-tier
 *      themed format (the `#{e|...}` numeric operators don't exist
 *      before 3.2 and would render as literal text).
 *
 *   2. `TAB_KEYBINDS` — the keybind entries (mergeable into the
 *      `default` preset in tmux.js) that wire Alt+c / Alt+1..9 /
 *      Alt+, / Alt+w / Alt+W / Alt+T to window operations. Bindings
 *      that need to bookkeep (close + restore) call back into
 *      `agileflow launch __close-window` / `__restore-window` so the
 *      closed-windows log stays in sync.
 *
 * Out of scope here (explicitly): the auto-naming background watcher
 * v3 had for Claude task names. Users rename with Alt+, when they
 * care; tmux's default name (the running command) covers the rest.
 */

/**
 * v3-equivalent theme: Tokyo-Night-ish dark background with the
 * AgileFlow brand orange #e8683a as the active-tab accent. Held as a
 * const rather than reading from prefs so the runtime doesn't have to
 * thread the cascade through every keybind apply. A future prefs key
 * `tmux.theme = "auto"` can override at the call site.
 *
 * Color tokens follow tmux's `#[fg=...]` / `#[bg=...]` style spec.
 *
 * @typedef {Object} TabTheme
 * @property {string} activeFg      - text color in active tab number chip
 * @property {string} activeBg      - background of active tab number chip (brand)
 * @property {string} activeNameFg  - text color in active tab name segment
 * @property {string} activeNameBg  - background of active tab name segment
 * @property {string} inactiveFg    - inactive tab text
 * @property {string} inactiveDim   - extra-dim inactive (tier 4 fallback)
 * @property {string} stripBg       - tab strip background
 */

/** @type {TabTheme} */
const DEFAULT_TAB_THEME = {
  activeFg: "#1a1b26",
  activeBg: "#e8683a",
  activeNameFg: "#e0e0e0",
  activeNameBg: "#2d2f3a",
  inactiveFg: "#8a8a8a",
  inactiveDim: "#565a6e",
  stripBg: "#1a1b26",
};

/**
 * Tier table. Each entry is one branch of the cascading
 * `#{e|<=:#{e|*:session_windows,maxAvgWidth},client_width}` check —
 * the most generous tier whose `session_windows * maxAvgWidth` fits
 * the current client width wins. Pure data; consumed by
 * `buildTabFormat` to assemble the format string.
 *
 * `activeName` / `inactiveName` are character budgets passed to tmux's
 * `#{=N:window_name}` truncation. 0 means "drop the name entirely,
 * show only the index".
 *
 * Constants chosen to match v3's empirically-tuned breakpoints.
 *
 * @type {Array<{ maxAvgWidth: number, activeName: number, inactiveName: number, label: string }>}
 */
const TIERS = [
  { maxAvgWidth: 21, activeName: 15, inactiveName: 8, label: "lavish" },
  { maxAvgWidth: 14, activeName: 8, inactiveName: 6, label: "normal" },
  { maxAvgWidth: 10, activeName: 4, inactiveName: 3, label: "cramped" },
  { maxAvgWidth: 7, activeName: 0, inactiveName: 0, label: "numeric" },
  { maxAvgWidth: 0, activeName: 0, inactiveName: 0, label: "fallback" },
];

/**
 * tmux 3.2 introduced the `#{e|OP:a,b}` numeric operators that the
 * cascading tier format depends on. Older tmux would render `#{e|...}`
 * as literal text, so on those we emit the single-tier format used
 * by v3 before commit b17fb803.
 */
const COMPACTION_MIN_TMUX = { major: 3, minor: 2 };

/**
 * Parse a `tmux -V` output string like "tmux 3.3a\n" or "tmux next-3.4".
 * Returns null when the input isn't recognizable. Re-implemented here
 * (instead of imported from doctor.js) to keep tabs.js self-contained
 * for testing — both copies use the same regex and behave identically.
 *
 * @param {string} raw
 * @returns {{ major: number, minor: number } | null}
 */
function parseTmuxVersion(raw) {
  if (typeof raw !== "string") return null;
  const match = raw.match(/(\d+)\.(\d+)/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

/**
 * @param {{ major: number, minor: number }} a
 * @param {{ major: number, minor: number }} b
 * @returns {number}
 */
function compareVersions(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  return a.minor - b.minor;
}

/**
 * Whether the supplied tmux version supports the cascading compaction
 * format. Treat unknown (null) as "too old" so we degrade rather than
 * emit a broken format string.
 *
 * @param {{ major: number, minor: number } | null} v
 * @returns {boolean}
 */
function supportsCompaction(v) {
  if (!v) return false;
  return compareVersions(v, COMPACTION_MIN_TMUX) >= 0;
}

/**
 * Active-tab segment for a given tier. Pure string assembly — no tmux
 * runtime involved. Returns the full `#[...]#{=N:window_name}` chunk
 * that goes inside the active-window branch of `#{?window_active,...,...}`.
 *
 * @param {{ maxAvgWidth: number, activeName: number }} tier
 * @param {TabTheme} t
 * @returns {string}
 */
function activeSegment(tier, t) {
  if (tier.activeName === 0) {
    // Numeric only — single chip, no name segment.
    return `#[fg=${t.activeFg} bg=${t.activeBg} bold]#I#[fg=default bg=default]`;
  }
  // Two-segment chip: orange index, dark name pill, then back to strip bg.
  // Spacing widens at the lavish tier (` ${idx}  ${name} ` with two
  // leading + two trailing spaces); shrinks to a single space pair at
  // the cramped tier so we stay visually aligned with the inactive
  // tabs but don't overflow.
  const idxPad = tier.maxAvgWidth >= 21 ? "  " : " ";
  return (
    `#[fg=${t.activeFg} bg=${t.activeBg} bold]${idxPad}#I${idxPad}` +
    `#[fg=${t.activeBg} bg=${t.activeNameBg}]` +
    `#[fg=${t.activeNameFg}] #{=${tier.activeName}:window_name} ` +
    `#[bg=${t.stripBg} fg=${t.activeNameBg}]`
  );
}

/**
 * Inactive-tab segment for a given tier. Same shape as activeSegment
 * but rendered dimmer; the numeric-only fallback uses inactiveDim to
 * push it visually further back.
 *
 * @param {{ maxAvgWidth: number, inactiveName: number, label: string }} tier
 * @param {TabTheme} t
 * @returns {string}
 */
function inactiveSegment(tier, t) {
  if (tier.inactiveName === 0) {
    const fg = tier.label === "fallback" ? t.inactiveDim : t.inactiveFg;
    return `#[fg=${fg}]#I `;
  }
  const pad = tier.maxAvgWidth >= 21 ? "  " : " ";
  // `#{=|N|...:window_name}` is tmux's "truncate with ellipsis" form;
  // visually distinguishes "I shortened this" from "this name happens
  // to be N chars". Cramped tier uses plain truncation (no ellipsis)
  // because three chars + `...` would leave no actual name visible.
  const truncated =
    tier.inactiveName >= 6
      ? `#{=|${tier.inactiveName}|...:window_name}`
      : `#{=${tier.inactiveName}:window_name}`;
  return `#[fg=${t.inactiveFg}]${pad}#I:${truncated}${pad}`;
}

/**
 * Build the cascading conditional format for tmux 3.2+. Assembled as
 * nested `#{?cond,yes,no}` so each tier's body is the chunk the
 * tier picks, and the no-branch chains into the next narrower tier.
 *
 * @param {Array<string>} segments  - tier body strings (active or inactive)
 * @returns {string}
 */
function chainTiers(segments) {
  // segments[] aligns with TIERS[] one-for-one. The last segment is
  // the fallback — emitted bare (no condition wrapper). Each earlier
  // tier wraps the suffix in `#{?cond,segment,rest}`.
  let acc = segments[segments.length - 1];
  for (let i = segments.length - 2; i >= 0; i--) {
    const tier = TIERS[i];
    // `e|<=:a,b` → a <= b.  `e|*:x,y` → x * y.  Combined: tier wins
    // when session_windows * maxAvgWidth <= client_width.
    const cond = `#{e|<=:#{e|*:#{session_windows},${tier.maxAvgWidth}},#{client_width}}`;
    acc = `#{?${cond},${segments[i]},${acc}}`;
  }
  return acc;
}

/**
 * Single-tier format for tmux < 3.2 (no `#{e|...}` operators). Uses
 * the "lavish" tier's segments so a small number of tabs looks the
 * same on old and new tmux; large counts will visually overflow on
 * old tmux, but they won't break — tmux just wraps or clips.
 *
 * @param {TabTheme} t
 * @returns {string}
 */
function legacyFormat(t) {
  const a = activeSegment(TIERS[0], t);
  const i = inactiveSegment(TIERS[0], t);
  return `#[bg=${t.stripBg}]#{W:#{?window_active,${a},${i}}}`;
}

/**
 * Build the `status-format[1]` string for the tab strip.
 *
 * On tmux 3.2+: cascading 5-tier dynamic compaction (T0 lavish → T4
 * numeric fallback) selected at render time by tmux based on
 * `session_windows * maxAvgWidth <= client_width`.
 *
 * On older tmux: single-tier themed format (no `#{e|...}` operators).
 *
 * @param {{
 *   tmuxVersion?: { major: number, minor: number } | null,
 *   theme?: Partial<TabTheme>,
 * }} [opts]
 * @returns {string}
 */
function buildTabFormat(opts = {}) {
  const theme = { ...DEFAULT_TAB_THEME, ...(opts.theme || {}) };
  const version = opts.tmuxVersion === undefined ? null : opts.tmuxVersion;
  if (!supportsCompaction(version)) return legacyFormat(theme);

  const actives = TIERS.map((tier) => activeSegment(tier, theme));
  const inactives = TIERS.map((tier) => inactiveSegment(tier, theme));
  const active = chainTiers(actives);
  const inactive = chainTiers(inactives);
  return `#[bg=${theme.stripBg}]#{W:#{?window_active,${active},${inactive}}}`;
}

/**
 * Tab keybinds. Merged into the `default` preset in tmux.js. `Alt+w`
 * and `Alt+T` reach back into the agileflow binary so the
 * closed-windows log stays in sync with the tmux state — pure
 * `kill-window` would close the tab but `Alt+T` later couldn't
 * resurrect it. `%AGILEFLOW%` is substituted at apply time by
 * `substituteBinding` in tmux.js.
 *
 * Alt+1..9 are generated programmatically rather than nine copy-paste
 * entries, so adjusting the chip (e.g., adding a hint) is one edit.
 *
 * @type {Array<{ key: string, action: string[], hint: string }>}
 */
const TAB_KEYBINDS = [
  {
    key: "M-c",
    action: ["new-window"],
    hint: "Alt+c → new tab",
  },
  {
    // -I prefills the prompt with the current name so the user can
    // edit rather than retype. %% substitutes the user's final input.
    key: "M-,",
    action: ["command-prompt", "-I", "#W", "rename-window '%%'"],
    hint: "Alt+, → rename current tab",
  },
  {
    // confirm-before runs the command on `y` and does nothing on `n`.
    // We pass session+index as positional args so the callback targets
    // the exact window the user pressed Alt+w on — without this, the
    // callback would re-probe display-message and could close the
    // wrong tab if focus moved during the confirmation prompt.
    key: "M-w",
    action: [
      "confirm-before",
      "-p",
      "kill tab #W? (y/n)",
      "run-shell '%AGILEFLOW% launch __close-window #{session_name} #{window_index}'",
    ],
    hint: "Alt+w → close current tab (with confirm)",
  },
  {
    // tmux's built-in window picker. -Z zooms (full-screen the picker),
    // -w sets window-mode (vs the default session-mode tree).
    key: "M-W",
    action: ["choose-tree", "-Zw"],
    hint: "Alt+W → tab picker",
  },
  {
    // Pass session name explicitly so the callback restores into the
    // session the user actually triggered from — works even if the
    // active session shifts before run-shell fires.
    key: "M-T",
    action: [
      "run-shell",
      "%AGILEFLOW% launch __restore-window #{session_name}",
    ],
    hint: "Alt+T → reopen last closed tab",
  },
  // Numeric switchers Alt+1..Alt+9 → select-window -t :N
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
    key: `M-${n}`,
    action: ["select-window", "-t", `:${n}`],
    hint: `Alt+${n} → switch to tab ${n}`,
  })),
];

module.exports = {
  DEFAULT_TAB_THEME,
  TIERS,
  COMPACTION_MIN_TMUX,
  TAB_KEYBINDS,
  parseTmuxVersion,
  compareVersions,
  supportsCompaction,
  buildTabFormat,
};
