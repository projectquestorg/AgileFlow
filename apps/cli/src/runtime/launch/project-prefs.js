/**
 * Per-project launch prefs cascade.
 *
 * Layering (lowest-priority first):
 *   1. Built-in defaults from `defaults.js`
 *   2. Global user prefs   `~/.agileflow/launch-prefs.json`
 *   3. Project prefs       `<repo>/.agileflow/launch.json`
 *
 * The project file is searched by walking up from `cwd` until either:
 *   - we find a `.agileflow/launch.json`, or
 *   - we cross a `.git` boundary (the repo root — beyond it we're in a
 *     different project's territory), or
 *   - we hit the filesystem root.
 *
 * Per-key partial override: a project file can specify ONLY the keys it
 * cares about. Unspecified keys fall through to the global file's value,
 * which in turn falls through to defaults. This lets a repo flip just
 * `tmux.enabled` without having to mirror the whole prefs shape.
 *
 * Project file shape mirrors `launch-prefs.json` minus `$schema` and
 * `lastUpdated`. Hand-edited files are normal; unknown extras are
 * dropped silently (same posture as the global loader).
 */
const fs = require("fs");
const path = require("path");

const { loadPrefs } = require("./prefs.js");

const PROJECT_DIR = ".agileflow";
const PROJECT_FILENAME = "launch.json";

/**
 * Walk up from `cwd` looking for a `.agileflow/launch.json`. Stops at
 * the filesystem root, or at the first directory containing a `.git`
 * entry — beyond a repo boundary we shouldn't be inheriting another
 * project's prefs.
 *
 * @param {string} cwd
 * @param {{
 *   existsSync?: (p: string) => boolean,
 *   statSync?: typeof fs.statSync,
 * }} [opts]
 * @returns {string | null}
 */
function findProjectPrefsFile(cwd, opts = {}) {
  const existsSync = opts.existsSync || ((p) => fs.existsSync(p));
  const statSync = opts.statSync || fs.statSync;
  let dir = path.resolve(cwd);
  // Cap the walk at 64 ancestors. Filesystems hit root long before that
  // in practice; the cap exists so a pathological symlink loop can't
  // stall us.
  for (let i = 0; i < 64; i++) {
    const candidate = path.join(dir, PROJECT_DIR, PROJECT_FILENAME);
    if (existsSync(candidate)) {
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        /* swallow — vanished between exists + stat */
      }
    }
    // Repo boundary check happens AFTER the in-dir search so the repo
    // root itself can host the project prefs (the common case).
    if (existsSync(path.join(dir, ".git"))) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // hit filesystem root
    dir = parent;
  }
  return null;
}

/**
 * Read + parse a project prefs file. Returns null on missing file,
 * malformed JSON, or non-object payload — same forgiving posture as
 * `loadRegistry`. Surfacing a hard error here would block `launch` for
 * what is almost always a manual-edit typo.
 *
 * @param {string} file
 * @param {{ readFileSync?: typeof fs.readFileSync }} [opts]
 * @returns {Partial<import("./defaults.js").LaunchPrefs> | null}
 */
function readProjectPrefs(file, opts = {}) {
  const readFileSync = opts.readFileSync || fs.readFileSync;
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // eslint-disable-next-line no-console
    console.error(
      `agileflow launch: ${file} is not valid JSON — ignoring project prefs.`,
    );
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return /** @type {Partial<import("./defaults.js").LaunchPrefs>} */ (parsed);
}

/**
 * Layer a partial prefs object over an already-merged base. Mirrors the
 * shape and validation of `mergeWithDefaults` but uses `base` (the
 * global-merged prefs) as the fallback instead of the built-in defaults.
 *
 * Per-key semantics:
 *   - cli, tmux, keybinds, aliases: partial sub-object override. Any
 *     leaf that the project omits inherits from `base`.
 *   - pinned: project array (when present) REPLACES base entirely —
 *     "pinned" is conceptually a list, not a deep-merge dictionary.
 *
 * Unknown enum values fall back to the corresponding `base` value (NOT
 * defaults) so a typo in the project file degrades gracefully.
 *
 * @param {import("./defaults.js").LaunchPrefs} base
 * @param {Partial<import("./defaults.js").LaunchPrefs>} partial
 * @returns {import("./defaults.js").LaunchPrefs}
 */
function mergePartialOver(base, partial) {
  const {
    KNOWN_CLI_IDS,
    STATUS_POSITIONS,
    KEYBIND_PRESETS,
  } = require("./defaults.js");

  const cli = partial.cli || {};
  const preferred = KNOWN_CLI_IDS.includes(cli.preferred)
    ? cli.preferred
    : base.cli.preferred;
  const fallbackOrder = Array.isArray(cli.fallbackOrder)
    ? cli.fallbackOrder.filter((id) => KNOWN_CLI_IDS.includes(id))
    : base.cli.fallbackOrder;

  const tmux = partial.tmux || {};
  const tmuxEnabled =
    typeof tmux.enabled === "boolean" ? tmux.enabled : base.tmux.enabled;
  const statusPosition = STATUS_POSITIONS.includes(tmux.statusPosition)
    ? tmux.statusPosition
    : base.tmux.statusPosition;

  const keybinds = partial.keybinds || {};
  const preset = KEYBIND_PRESETS.includes(keybinds.preset)
    ? keybinds.preset
    : base.keybinds.preset;

  const aliases = partial.aliases || {};
  const afEnabled =
    aliases.af && typeof aliases.af.enabled === "boolean"
      ? aliases.af.enabled
      : base.aliases.af.enabled;

  const pinned = Array.isArray(partial.pinned)
    ? partial.pinned.filter((s) => typeof s === "string")
    : base.pinned;

  // Same invariant as the global loader: preferred must be in fallbackOrder.
  // Project-level override could break it (e.g., partial only sets
  // cli.preferred and inherits a fallbackOrder that doesn't include it).
  let resolvedFallback = fallbackOrder.length
    ? fallbackOrder
    : base.cli.fallbackOrder;
  if (!resolvedFallback.includes(preferred)) {
    resolvedFallback = [preferred, ...resolvedFallback];
  }

  return {
    version: /** @type {1} */ (1),
    cli: { preferred, fallbackOrder: resolvedFallback },
    tmux: { enabled: tmuxEnabled, statusPosition },
    keybinds: { preset },
    aliases: { af: { enabled: afEnabled } },
    pinned,
  };
}

/**
 * Load prefs with the full cascade. The returned `sources` array records
 * which files contributed (in increasing precedence), so the `launch
 * where` subcommand can show the user exactly what's being layered.
 *
 * @param {{
 *   home?: string,
 *   cwd?: string,
 *   loadGlobalPrefs?: typeof loadPrefs,
 *   findProjectFile?: typeof findProjectPrefsFile,
 *   readProjectFile?: typeof readProjectPrefs,
 * }} [opts]
 * @returns {Promise<{
 *   prefs: import("./defaults.js").LaunchPrefs,
 *   sources: Array<{ layer: 'defaults' | 'global' | 'project', path?: string }>,
 * }>}
 */
async function loadCascadedPrefs(opts = {}) {
  const loadGlobal = opts.loadGlobalPrefs || loadPrefs;
  const findProject = opts.findProjectFile || findProjectPrefsFile;
  const readProject = opts.readProjectFile || readProjectPrefs;
  const cwd = opts.cwd || process.cwd();

  /** @type {Array<{ layer: 'defaults' | 'global' | 'project', path?: string }>} */
  const sources = [{ layer: "defaults" }];

  const globalLoaded = await loadGlobal(opts.home);
  if (globalLoaded.source === "file") {
    sources.push({ layer: "global", path: globalLoaded.path });
  }

  const projectFile = findProject(cwd);
  if (!projectFile) {
    return { prefs: globalLoaded.prefs, sources };
  }
  const projectPartial = readProject(projectFile);
  if (!projectPartial) {
    // File present but unreadable / malformed — already logged by
    // readProjectPrefs. Treat as absent so launch keeps working.
    return { prefs: globalLoaded.prefs, sources };
  }

  const merged = mergePartialOver(globalLoaded.prefs, projectPartial);
  sources.push({ layer: "project", path: projectFile });
  return { prefs: merged, sources };
}

module.exports = {
  PROJECT_DIR,
  PROJECT_FILENAME,
  findProjectPrefsFile,
  readProjectPrefs,
  mergePartialOver,
  loadCascadedPrefs,
};
