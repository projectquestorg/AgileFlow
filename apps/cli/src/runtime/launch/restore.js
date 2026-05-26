/**
 * Bulk-restore tmux sessions from the registry after the tmux server
 * died (typical cause: PC reboot). Walks every entry and re-creates
 * the corresponding tmux session in the original cwd, wired to invoke
 * `agileflow launch __exec <name>` so the per-CLI resume strategy
 * fires automatically.
 *
 * Sessions that already exist on the running tmux server are skipped —
 * restore is idempotent. Sessions whose original cwd no longer exists
 * are skipped with a warning (e.g., user deleted the project dir).
 *
 * Returns counts so the caller can show a "restored N of M" summary.
 */
const fs = require("fs");
const path = require("path");

const {
  defaultRunner,
  sessionExists,
  createSession,
  applyKeybindPreset,
} = require("./tmux.js");
const { loadRegistry } = require("./session-registry.js");
const { resolveAgileflowBin } = require("./alias-installer.js");

/**
 * @typedef {Object} RestoreResult
 * @property {number} restored
 * @property {number} alreadyAlive
 * @property {number} skipped       - cwd missing or other unrecoverable state
 * @property {number} failed
 * @property {Array<{ name: string, reason: string }>} notes
 */

/**
 * @param {{
 *   prefs: import("./defaults.js").LaunchPrefs,
 *   runner?: ReturnType<typeof defaultRunner>,
 *   home?: string,
 *   agileflowBin?: string,
 *   existsSync?: (p: string) => boolean,
 *   log?: (msg: string) => void,
 *   onlyName?: string,
 *   onlyNames?: string[],
 * }} opts
 * @returns {RestoreResult}
 */
function runRestore(opts) {
  const runner = opts.runner || defaultRunner();
  const existsSync = opts.existsSync || ((p) => fs.existsSync(p));
  const log =
    typeof opts.log === "function"
      ? opts.log
      : (msg) => {
          // eslint-disable-next-line no-console
          console.error(msg);
        };
  const agileflowBin = opts.agileflowBin || resolveAgileflowBin();

  const reg = loadRegistry(opts.home);
  /** @type {RestoreResult} */
  const result = {
    restored: 0,
    alreadyAlive: 0,
    skipped: 0,
    failed: 0,
    notes: [],
  };

  /** @type {import("./session-registry.js").SessionEntry[]} */
  let entries;
  if (opts.onlyName) {
    entries = reg.sessions.filter((s) => s.name === opts.onlyName);
  } else if (Array.isArray(opts.onlyNames)) {
    // Use a Set for O(1) lookup so a 100-entry registry restoring a
    // 20-entry subset stays linear, not quadratic.
    const wanted = new Set(opts.onlyNames);
    entries = reg.sessions.filter((s) => wanted.has(s.name));
  } else {
    entries = reg.sessions.slice();
  }

  for (const entry of entries) {
    if (sessionExists(entry.name, runner)) {
      result.alreadyAlive++;
      continue;
    }
    if (!existsSync(entry.cwd)) {
      result.skipped++;
      result.notes.push({
        name: entry.name,
        reason: `cwd no longer exists: ${entry.cwd}`,
      });
      log(
        `agileflow launch: skipping ${entry.name} — cwd missing (${entry.cwd})`,
      );
      continue;
    }

    // Tmux session command: invoke our own wrapper. tmux passes argv
    // as separate words via the new-session args we hand it.
    const wrapperArgs = [agileflowBin, "launch", "__exec", entry.name];
    const create = createSession(
      {
        name: entry.name,
        bin: wrapperArgs[0],
        args: wrapperArgs.slice(1),
        cwd: entry.cwd,
        statusPosition: opts.prefs.tmux.statusPosition,
      },
      runner,
    );
    if (create.status !== 0) {
      result.failed++;
      const stderr = (create.stderr || "").trim() || "tmux new-session failed";
      result.notes.push({ name: entry.name, reason: stderr });
      log(`agileflow launch: failed to restore ${entry.name} — ${stderr}`);
      continue;
    }
    result.restored++;
    log(`agileflow launch: restored session ${entry.name} (${entry.cwd})`);
  }

  // Apply keybinds once after the bulk restore so the user's preset is
  // active across all the new sessions (tmux bind-key is server-wide).
  if (
    result.restored > 0 &&
    opts.prefs.keybinds &&
    opts.prefs.keybinds.preset
  ) {
    const kr = applyKeybindPreset(opts.prefs.keybinds.preset, runner, {
      agileflowBin,
    });
    for (const f of kr.failures) {
      log(`agileflow launch: keybind skipped during restore — ${f.hint}`);
    }
  }

  return result;
}

module.exports = { runRestore };
