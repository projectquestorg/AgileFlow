/**
 * Read / write `~/.agileflow/launch-prefs.json` — the first user-level
 * config in v4.
 *
 * Mirrors the atomic-write pattern from `runtime/config/writer.js`:
 * render to a sibling temp file, then `fs.rename()` into place so a
 * concurrent read either sees the old content or the new content,
 * never a torn half-write.
 *
 * Validation here is *shape-light* on read: missing keys are filled
 * from `defaultPrefs()`, unknown extras are dropped. The JSON schema
 * (`schema.json`) is the authoritative contract for editor tooling.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  defaultPrefs,
  KNOWN_CLI_IDS,
  STATUS_POSITIONS,
  KEYBIND_PRESETS,
} = require("./defaults.js");

const FILENAME = "launch-prefs.json";
const SCHEMA_REF = "./node_modules/agileflow/src/runtime/launch/schema.json";

/**
 * @param {string} [home] - override for tests; defaults to os.homedir()
 * @returns {string}
 */
function prefsPath(home) {
  const root = home || os.homedir();
  return path.join(root, ".agileflow", FILENAME);
}

/**
 * Merge a partial prefs object on top of defaults, sanitizing unknown
 * enum values back to their defaults. Returns a fresh object — never
 * mutates the input.
 *
 * @param {Partial<import('./defaults.js').LaunchPrefs>} [partial]
 * @returns {import('./defaults.js').LaunchPrefs}
 */
function mergeWithDefaults(partial = {}) {
  const base = defaultPrefs();

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

  // Invariant: `preferred` must appear in `fallbackOrder` (the latter is
  // documented as "order to try if preferred is missing", which only
  // makes sense if preferred itself is in the chain). Hand-edited prefs
  // can violate this — we repair it here rather than at every read site.
  let resolvedFallback = fallbackOrder.length
    ? fallbackOrder
    : base.cli.fallbackOrder;
  if (!resolvedFallback.includes(preferred)) {
    resolvedFallback = [preferred, ...resolvedFallback];
  }

  return {
    version: 1,
    cli: {
      preferred,
      fallbackOrder: resolvedFallback,
    },
    tmux: { enabled: tmuxEnabled, statusPosition },
    keybinds: { preset },
    aliases: { af: { enabled: afEnabled } },
    pinned,
  };
}

/**
 * Load prefs from disk. Returns defaults if the file is absent.
 * Throws on invalid JSON so the caller can surface an actionable error.
 *
 * @param {string} [home]
 * @returns {Promise<{
 *   prefs: import('./defaults.js').LaunchPrefs,
 *   source: 'file' | 'defaults',
 *   path: string,
 * }>}
 */
async function loadPrefs(home) {
  const file = prefsPath(home);
  let raw;
  try {
    raw = await fs.promises.readFile(file, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") {
      return { prefs: defaultPrefs(), source: "defaults", path: file };
    }
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const wrapped = new Error(`could not parse ${file}: ${err.message}`);
    wrapped.cause = err;
    throw wrapped;
  }

  // JSON.parse can return null, primitives, or arrays — any of which
  // would crash `mergeWithDefaults` at the first property access. Reject
  // them with the same "could not parse" shape so the caller's error
  // path is the only one users see.
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    const kind =
      parsed === null
        ? "null"
        : Array.isArray(parsed)
          ? "array"
          : typeof parsed;
    throw new Error(
      `could not parse ${file}: expected a JSON object, got ${kind}`,
    );
  }

  return { prefs: mergeWithDefaults(parsed), source: "file", path: file };
}

/**
 * Atomically write prefs to disk. Stamps `lastUpdated` with the current
 * ISO timestamp. Ensures `~/.agileflow/` exists.
 *
 * @param {import('./defaults.js').LaunchPrefs} next
 * @param {string} [home]
 * @returns {Promise<string>} absolute path of the written file
 */
async function writePrefs(next, home) {
  const merged = mergeWithDefaults(next);
  const file = prefsPath(home);
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.${FILENAME}.tmp-${process.pid}`);

  const payload = {
    $schema: SCHEMA_REF,
    ...merged,
    lastUpdated: new Date().toISOString(),
  };
  const content = JSON.stringify(payload, null, 2) + "\n";

  try {
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(tmp, content, "utf8");
    await fs.promises.rename(tmp, file);
  } catch (err) {
    try {
      await fs.promises.unlink(tmp);
    } catch {
      /* swallow */
    }
    throw err;
  }
  return file;
}

/**
 * Whether a prefs file exists on disk.
 * @param {string} [home]
 * @returns {Promise<boolean>}
 */
async function prefsExist(home) {
  try {
    await fs.promises.access(prefsPath(home), fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  FILENAME,
  SCHEMA_REF,
  prefsPath,
  mergeWithDefaults,
  loadPrefs,
  writePrefs,
  prefsExist,
};
