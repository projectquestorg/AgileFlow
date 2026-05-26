/**
 * Health checks behind `agileflow launch doctor`.
 *
 * Read-only diagnostics. Every check returns a structured result so the
 * CLI wrapper can render a consistent table AND a test can assert on each
 * check in isolation. No auto-remediation here — surfacing fixes is a
 * later slice.
 *
 * Result shape:
 *   { id, status: 'pass' | 'warn' | 'fail', message: string, fix?: string }
 *
 *   - pass: everything is fine
 *   - warn: degraded but launch will still work (e.g., one fallback CLI
 *           missing from PATH)
 *   - fail: launch will fail or behave wrong (e.g., tmux not installed,
 *           preferred CLI not on PATH, orphan worktree references)
 *
 * The CLI exits non-zero iff ANY check returns 'fail'. Warnings don't
 * fail the doctor — they're for the user to triage.
 */
const fs = require("fs");

const { commandExists: realCommandExists } = require("../../lib/path-check.js");
const { defaultRunner } = require("./tmux.js");
const { loadPrefs } = require("./prefs.js");
const { loadRegistry, registryPath } = require("./session-registry.js");
const { findCli } = require("./detect-clis.js");

/**
 * @typedef {Object} DoctorCheck
 * @property {string} id
 * @property {'pass' | 'warn' | 'fail'} status
 * @property {string} message
 * @property {string} [fix]
 */

/** Minimum tmux version required by `status-position` (used by prefs). */
const MIN_TMUX_VERSION = { major: 2, minor: 1 };
/** Lockfile is considered stuck after this many ms (matches registry's LOCK_STALE_MS). */
const STALE_LOCK_MS = 5000;

/**
 * Parse the output of `tmux -V` into { major, minor }. Returns null when
 * the string doesn't match the expected `tmux <major>.<minor>...` shape.
 *
 * tmux versions look like: "tmux 3.3a", "tmux next-3.4", "tmux 2.1".
 * We extract the first M.N pair and ignore any suffix.
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
 * Check #1: tmux installed.
 *
 * @param {{ commandExists?: typeof realCommandExists }} [deps]
 * @returns {DoctorCheck}
 */
function checkTmuxInstalled(deps = {}) {
  const exists = deps.commandExists || realCommandExists;
  if (exists("tmux")) {
    return { id: "tmux-installed", status: "pass", message: "tmux is on PATH" };
  }
  return {
    id: "tmux-installed",
    status: "fail",
    message: "tmux is not on PATH",
    fix: "install tmux (e.g., `brew install tmux` / `apt install tmux`) and re-run",
  };
}

/**
 * Check #2: tmux version supports the features prefs depend on
 * (`status-position` landed in tmux 2.1).
 *
 * Skipped (returns 'warn') when tmux isn't installed — the install check
 * already failed, so emitting a second fail here would be noise.
 *
 * @param {{
 *   commandExists?: typeof realCommandExists,
 *   runner?: import("./tmux.js").TmuxRunner,
 * }} [deps]
 * @returns {DoctorCheck}
 */
function checkTmuxVersion(deps = {}) {
  const exists = deps.commandExists || realCommandExists;
  if (!exists("tmux")) {
    return {
      id: "tmux-version",
      status: "warn",
      message: "tmux not installed — version check skipped",
    };
  }
  const runner = deps.runner || defaultRunner();
  const res = runner.runSync(["-V"]);
  const parsed = parseTmuxVersion(res.stdout);
  if (!parsed) {
    return {
      id: "tmux-version",
      status: "warn",
      message: `could not parse tmux version (output: ${(res.stdout || "").trim() || "<empty>"})`,
    };
  }
  if (compareVersions(parsed, MIN_TMUX_VERSION) < 0) {
    return {
      id: "tmux-version",
      status: "fail",
      message: `tmux ${parsed.major}.${parsed.minor} is older than required ${MIN_TMUX_VERSION.major}.${MIN_TMUX_VERSION.minor}`,
      fix: "upgrade tmux — status-position requires 2.1+",
    };
  }
  return {
    id: "tmux-version",
    status: "pass",
    message: `tmux ${parsed.major}.${parsed.minor} (>= ${MIN_TMUX_VERSION.major}.${MIN_TMUX_VERSION.minor})`,
  };
}

/**
 * Check #3: prefs file loads cleanly (or is absent → warn, not fail —
 * `agileflow launch` walks the user through setup on first run).
 *
 * @param {{ loadPrefsImpl?: typeof loadPrefs, home?: string }} [deps]
 * @returns {Promise<DoctorCheck>}
 */
async function checkPrefsLoad(deps = {}) {
  const impl = deps.loadPrefsImpl || loadPrefs;
  try {
    const { source, path: file } = await impl(deps.home);
    if (source === "defaults") {
      return {
        id: "prefs-load",
        status: "warn",
        message: "no prefs file yet (running with defaults)",
        fix: "run `agileflow launch setup` to lock in your preferences",
      };
    }
    return {
      id: "prefs-load",
      status: "pass",
      message: `prefs load cleanly from ${file}`,
    };
  } catch (err) {
    return {
      id: "prefs-load",
      status: "fail",
      message: err && err.message ? err.message : String(err),
      fix: "fix or delete the prefs file and re-run `agileflow launch setup`",
    };
  }
}

/**
 * Check #4: every CLI in prefs.cli.fallbackOrder is resolvable on PATH.
 * 'warn' if some are missing but the preferred is present (launch still
 * works). 'fail' if the preferred itself is missing — launch will error
 * out.
 *
 * Returns 'warn' (skipped) if prefs aren't loadable, because the prefs
 * check above will already have failed and we'd just be re-shouting.
 *
 * @param {{
 *   loadPrefsImpl?: typeof loadPrefs,
 *   commandExists?: typeof realCommandExists,
 *   home?: string,
 * }} [deps]
 * @returns {Promise<DoctorCheck>}
 */
async function checkFallbackClisOnPath(deps = {}) {
  const impl = deps.loadPrefsImpl || loadPrefs;
  const exists = deps.commandExists || realCommandExists;
  let prefs;
  try {
    const loaded = await impl(deps.home);
    prefs = loaded.prefs;
  } catch {
    return {
      id: "cli-on-path",
      status: "warn",
      message: "prefs unreadable — cli check skipped",
    };
  }
  const order = prefs.cli.fallbackOrder || [];
  const missing = [];
  for (const id of order) {
    const desc = findCli(id);
    const bin = desc ? desc.bin : id;
    if (!exists(bin)) missing.push(id);
  }
  if (missing.length === 0) {
    return {
      id: "cli-on-path",
      status: "pass",
      message: `all ${order.length} configured CLI(s) on PATH`,
    };
  }
  const preferredMissing = missing.includes(prefs.cli.preferred);
  if (preferredMissing) {
    return {
      id: "cli-on-path",
      status: "fail",
      message: `preferred CLI "${prefs.cli.preferred}" is not on PATH (also missing: ${missing.filter((m) => m !== prefs.cli.preferred).join(", ") || "none"})`,
      fix: "install the CLI, or run `agileflow launch setup` to switch preferred",
    };
  }
  return {
    id: "cli-on-path",
    status: "warn",
    message: `${missing.length} fallback CLI(s) not on PATH: ${missing.join(", ")}`,
    fix: "install them or remove from fallbackOrder via `agileflow launch setup`",
  };
}

/**
 * Check #5: registry file loads cleanly. `loadRegistry` is resilient
 * (returns empty on malformed JSON instead of throwing) but it also
 * emits a stderr warning on I/O errors — that warning is the signal
 * we want to surface here. We re-read the file directly to distinguish
 * "absent" (fine) from "present but unreadable" (fail).
 *
 * @param {{
 *   home?: string,
 *   readFileSync?: typeof fs.readFileSync,
 *   existsSync?: typeof fs.existsSync,
 *   loadRegistryImpl?: typeof loadRegistry,
 * }} [deps]
 * @returns {DoctorCheck}
 */
function checkRegistryLoads(deps = {}) {
  const readFileSync = deps.readFileSync || fs.readFileSync;
  const existsSync = deps.existsSync || fs.existsSync;
  const loadImpl = deps.loadRegistryImpl || loadRegistry;
  const file = registryPath(deps.home);
  if (!existsSync(file)) {
    return {
      id: "registry-load",
      status: "pass",
      message: "no registry yet (0 sessions tracked)",
    };
  }
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    return {
      id: "registry-load",
      status: "fail",
      message: `cannot read ${file}: ${err && err.message ? err.message : err}`,
      fix: "check file permissions, or delete the file to start fresh",
    };
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      id: "registry-load",
      status: "fail",
      message: `${file} is not valid JSON`,
      fix: "fix the JSON by hand, or delete the file (you'll lose saved sessions)",
    };
  }
  // Count malformed entries within the SAME parsed snapshot so a
  // concurrent write between reads can't produce a false positive.
  // (We replicate loadRegistry's filter inline rather than re-reading.)
  const rawSessions =
    parsed && typeof parsed === "object" && Array.isArray(parsed.sessions)
      ? parsed.sessions
      : [];
  let saneCount = 0;
  for (const s of rawSessions) {
    if (!s || typeof s !== "object") continue;
    if (typeof s.name !== "string" || !s.name) continue;
    if (typeof s.cli !== "string" || !s.cli) continue;
    if (typeof s.cwd !== "string" || !s.cwd) continue;
    saneCount++;
  }
  const rejected = rawSessions.length - saneCount;
  if (rejected > 0) {
    return {
      id: "registry-load",
      status: "warn",
      message: `${rejected} registry entry(ies) rejected as malformed (kept ${saneCount})`,
      fix: "inspect the registry file; malformed entries are silently filtered on load",
    };
  }
  // loadRegistry-side sanity check: surface the count the rest of the
  // launch flow will actually see. Reads the file again but only to
  // produce the message — any race only affects the displayed count, not
  // the pass/warn/fail verdict above.
  const sane = loadImpl(deps.home).sessions;
  return {
    id: "registry-load",
    status: "pass",
    message: `registry loads cleanly (${sane.length} session(s))`,
  };
}

/**
 * Check #6: the registry lockfile isn't stuck. A lockfile older than
 * STALE_LOCK_MS that hasn't been cleaned up suggests an `__exec` /
 * `recordSession` process crashed mid-write. The lock helper takes
 * over stale locks automatically, but reporting it here helps the user
 * understand intermittent registry weirdness.
 *
 * @param {{
 *   home?: string,
 *   statSync?: typeof fs.statSync,
 *   existsSync?: typeof fs.existsSync,
 *   now?: () => number,
 * }} [deps]
 * @returns {DoctorCheck}
 */
function checkStaleLockfile(deps = {}) {
  const statSync = deps.statSync || fs.statSync;
  const existsSync = deps.existsSync || fs.existsSync;
  const now = deps.now || (() => Date.now());
  const lock = registryPath(deps.home) + ".lock";
  if (!existsSync(lock)) {
    return {
      id: "stale-lockfile",
      status: "pass",
      message: "no registry lockfile present",
    };
  }
  let stat;
  try {
    stat = statSync(lock);
  } catch {
    return {
      id: "stale-lockfile",
      status: "pass",
      message: "lockfile vanished mid-check (benign)",
    };
  }
  const age = now() - (stat.mtimeMs || 0);
  if (age > STALE_LOCK_MS) {
    return {
      id: "stale-lockfile",
      status: "warn",
      message: `registry lockfile is ${Math.round(age / 1000)}s old (stale; will be auto-recovered)`,
      fix: `remove ${lock} if the warning persists`,
    };
  }
  return {
    id: "stale-lockfile",
    status: "pass",
    message: `lockfile fresh (${age}ms old)`,
  };
}

/**
 * Check #7: every registered worktree's path still exists on disk.
 * Mismatches mean someone `git worktree remove`'d the dir behind our
 * back, or the project itself was deleted. Surfacing them lets the user
 * `agileflow launch kill <name>` or `agileflow launch prune` to tidy up.
 *
 * @param {{
 *   home?: string,
 *   existsSync?: typeof fs.existsSync,
 *   loadRegistryImpl?: typeof loadRegistry,
 * }} [deps]
 * @returns {DoctorCheck}
 */
function checkOrphanWorktrees(deps = {}) {
  const existsSync = deps.existsSync || fs.existsSync;
  const loadImpl = deps.loadRegistryImpl || loadRegistry;
  const reg = loadImpl(deps.home);
  /** @type {Array<{ name: string, path: string }>} */
  const orphans = [];
  for (const entry of reg.sessions) {
    if (!entry.worktree || !entry.worktree.path) continue;
    if (!existsSync(entry.worktree.path)) {
      orphans.push({ name: entry.name, path: entry.worktree.path });
    }
  }
  if (orphans.length === 0) {
    return {
      id: "orphan-worktrees",
      status: "pass",
      message: "no orphan worktrees",
    };
  }
  const list = orphans.map((o) => `${o.name} → ${o.path}`).join("; ");
  return {
    id: "orphan-worktrees",
    status: "warn",
    message: `${orphans.length} registered worktree path(s) missing: ${list}`,
    fix: "run `agileflow launch prune` to forget orphan entries",
  };
}

/**
 * Run every check and return a structured report. The CLI wrapper renders
 * the result; this helper does no I/O of its own beyond the deps.
 *
 * @param {{
 *   home?: string,
 *   runner?: import("./tmux.js").TmuxRunner,
 *   commandExists?: typeof realCommandExists,
 *   loadPrefsImpl?: typeof loadPrefs,
 *   loadRegistryImpl?: typeof loadRegistry,
 *   existsSync?: typeof fs.existsSync,
 *   statSync?: typeof fs.statSync,
 *   readFileSync?: typeof fs.readFileSync,
 *   now?: () => number,
 * }} [deps]
 * @returns {Promise<{ checks: DoctorCheck[] }>}
 */
async function runDoctorChecks(deps = {}) {
  const checks = [
    checkTmuxInstalled(deps),
    checkTmuxVersion(deps),
    await checkPrefsLoad(deps),
    await checkFallbackClisOnPath(deps),
    checkRegistryLoads(deps),
    checkStaleLockfile(deps),
    checkOrphanWorktrees(deps),
  ];
  return { checks };
}

/**
 * Convenience for the CLI wrapper: any check with status === 'fail'?
 *
 * @param {{ checks: DoctorCheck[] }} report
 * @returns {boolean}
 */
function anyFailed(report) {
  return report.checks.some((c) => c.status === "fail");
}

module.exports = {
  MIN_TMUX_VERSION,
  STALE_LOCK_MS,
  parseTmuxVersion,
  compareVersions,
  checkTmuxInstalled,
  checkTmuxVersion,
  checkPrefsLoad,
  checkFallbackClisOnPath,
  checkRegistryLoads,
  checkStaleLockfile,
  checkOrphanWorktrees,
  runDoctorChecks,
  anyFailed,
};
