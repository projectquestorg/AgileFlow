/**
 * Closed-window FIFO log for `agileflow launch`.
 *
 * Backs the `Alt+T → reopen last closed tab` keybind. When the user
 * closes a window via `Alt+w`, the `__close-window` subcommand
 * captures `#W` (name) + `#{pane_current_path}` (cwd) and pushes them
 * here BEFORE issuing `kill-window`. `__restore-window` pops the most
 * recent entry and runs `new-window -c <cwd> -n <name>`.
 *
 * On-disk shape (`~/.agileflow/launch-closed-windows.json`):
 *   {
 *     "version": 1,
 *     "sessions": {
 *       "claude-myapp": [
 *         { "id": "ab12cd", "name": "src", "cwd": "/...", "closedAt": "..." }
 *       ]
 *     }
 *   }
 *
 * Per-session stacks are isolated so closing a tab in session A
 * doesn't pollute session B's restore history. Each stack is capped
 * at MAX_PER_SESSION entries (oldest evicted on push).
 *
 * Concurrency: same O_EXCL lock pattern as session-registry.js — two
 * sessions running `__close-window` simultaneously won't lose each
 * other's entries.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const FILENAME = "launch-closed-windows.json";
const LOCK_SUFFIX = ".lock";
const LOCK_STALE_MS = 5000;
const LOCK_MAX_ATTEMPTS = 100;
const LOCK_RETRY_MS = 10;
const MAX_PER_SESSION = 20;

/**
 * @typedef {Object} ClosedEntry
 * @property {string} id          - short random id for log/debug, not used for lookup
 * @property {string} name        - tmux window name (#W) at close time
 * @property {string} cwd         - pane's working directory at close time
 * @property {string} closedAt    - ISO timestamp
 *
 * @typedef {Object} ClosedLogShape
 * @property {1} version
 * @property {Record<string, ClosedEntry[]>} sessions
 */

/** @param {number} ms */
function busyWait(ms) {
  const target = Date.now() + ms;
  while (Date.now() < target) {
    /* spin */
  }
}

/**
 * @param {string} [home]
 * @returns {string}
 */
function logPath(home) {
  return path.join(home || os.homedir(), ".agileflow", FILENAME);
}

/** @returns {ClosedLogShape} */
function emptyLog() {
  return { version: 1, sessions: {} };
}

/**
 * O_EXCL lock around `fn`. Same retry / stale-takeover policy as
 * session-registry's withRegistryLock. Lock file lives next to the
 * log file with a `.lock` suffix so the two registries' locks don't
 * collide.
 *
 * @template T
 * @param {string | undefined} home
 * @param {() => T} fn
 * @returns {T}
 */
function withLock(home, fn) {
  const lockFile = logPath(home) + LOCK_SUFFIX;
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  /** @type {number | null} */
  let lockFd = null;
  for (let attempt = 0; attempt < LOCK_MAX_ATTEMPTS; attempt++) {
    try {
      lockFd = fs.openSync(lockFile, "wx");
      break;
    } catch (err) {
      if (!err || err.code !== "EEXIST") throw err;
      try {
        const stat = fs.statSync(lockFile);
        if (Date.now() - (stat.mtimeMs || 0) > LOCK_STALE_MS) {
          try {
            fs.unlinkSync(lockFile);
          } catch {
            /* swallow */
          }
          continue;
        }
      } catch {
        /* lockfile vanished between EEXIST and stat — loop */
      }
      busyWait(LOCK_RETRY_MS);
    }
  }
  if (lockFd === null) {
    throw new Error(
      `could not acquire launch-closed-windows lock after ${LOCK_MAX_ATTEMPTS} attempts`,
    );
  }
  try {
    return fn();
  } finally {
    try {
      fs.closeSync(lockFd);
    } catch {
      /* swallow */
    }
    try {
      fs.unlinkSync(lockFile);
    } catch {
      /* swallow */
    }
  }
}

/**
 * Read the log, forgiving on any I/O or JSON failure (same posture as
 * session-registry). Malformed file = empty log; the user shouldn't be
 * blocked from closing or restoring tabs because of corruption.
 *
 * @param {string} [home]
 * @returns {ClosedLogShape}
 */
function loadLog(home) {
  const file = logPath(home);
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") return emptyLog();
    return emptyLog();
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyLog();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return emptyLog();
  }
  const sessions =
    parsed.sessions && typeof parsed.sessions === "object"
      ? parsed.sessions
      : {};
  /** @type {Record<string, ClosedEntry[]>} */
  const sane = {};
  for (const [sessionName, list] of Object.entries(sessions)) {
    if (!Array.isArray(list)) continue;
    /** @type {ClosedEntry[]} */
    const cleaned = [];
    for (const e of list) {
      if (!e || typeof e !== "object") continue;
      if (typeof e.name !== "string") continue;
      if (typeof e.cwd !== "string" || !e.cwd) continue;
      cleaned.push({
        id: typeof e.id === "string" ? e.id : shortId(),
        name: e.name,
        cwd: e.cwd,
        closedAt: typeof e.closedAt === "string" ? e.closedAt : "",
      });
    }
    if (cleaned.length > 0) sane[sessionName] = cleaned;
  }
  return { version: 1, sessions: sane };
}

/**
 * Atomic write via tmp + rename. Mirrors session-registry's pattern.
 *
 * @param {ClosedLogShape} log
 * @param {string} [home]
 * @returns {string}
 */
function writeLog(log, home) {
  const file = logPath(home);
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.${FILENAME}.tmp-${process.pid}`);
  const content = JSON.stringify(log, null, 2) + "\n";
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(tmp, content, "utf8");
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* swallow */
    }
    throw err;
  }
  return file;
}

/** @returns {string} */
function shortId() {
  return crypto.randomBytes(3).toString("hex");
}

/**
 * Push a closed window onto the FIFO for `sessionName`. Returns the
 * pushed entry (so callers can log/inspect it). Caps the per-session
 * stack at MAX_PER_SESSION; the oldest entry is evicted when over.
 *
 * @param {{ sessionName: string, name: string, cwd: string }} args
 * @param {string} [home]
 * @returns {ClosedEntry}
 */
function pushClosed(args, home) {
  if (!args || typeof args !== "object") {
    throw new TypeError("pushClosed: args required");
  }
  if (typeof args.sessionName !== "string" || !args.sessionName) {
    throw new TypeError("pushClosed: sessionName must be a non-empty string");
  }
  if (typeof args.name !== "string") {
    throw new TypeError("pushClosed: name must be a string");
  }
  if (typeof args.cwd !== "string" || !args.cwd) {
    throw new TypeError("pushClosed: cwd must be a non-empty string");
  }
  /** @type {ClosedEntry} */
  const entry = {
    id: shortId(),
    name: args.name,
    cwd: args.cwd,
    closedAt: new Date().toISOString(),
  };
  withLock(home, () => {
    const log = loadLog(home);
    const list = log.sessions[args.sessionName] || [];
    list.push(entry);
    while (list.length > MAX_PER_SESSION) list.shift();
    log.sessions[args.sessionName] = list;
    writeLog(log, home);
  });
  return entry;
}

/**
 * Pop the most recent closed entry for `sessionName`. Returns null
 * when the stack is empty (or the session never had any). Done under
 * the lock so two concurrent `__restore-window` processes don't both
 * resurrect the same entry.
 *
 * @param {string} sessionName
 * @param {string} [home]
 * @returns {ClosedEntry | null}
 */
function popClosed(sessionName, home) {
  if (typeof sessionName !== "string" || !sessionName) return null;
  return withLock(home, () => {
    const log = loadLog(home);
    const list = log.sessions[sessionName];
    if (!list || list.length === 0) return null;
    const entry = list.pop();
    if (list.length === 0) delete log.sessions[sessionName];
    else log.sessions[sessionName] = list;
    writeLog(log, home);
    return entry || null;
  });
}

/**
 * Look at the most recent entry without removing it. Cheap read —
 * no lock taken; readers tolerate a brief inconsistency window with
 * concurrent writers.
 *
 * @param {string} sessionName
 * @param {string} [home]
 * @returns {ClosedEntry | null}
 */
function peekClosed(sessionName, home) {
  if (typeof sessionName !== "string" || !sessionName) return null;
  const log = loadLog(home);
  const list = log.sessions[sessionName];
  if (!list || list.length === 0) return null;
  return list[list.length - 1];
}

/**
 * Sweep entries older than `maxAgeMs` across all sessions. Returns the
 * number of entries removed. Intended for a future doctor/prune
 * integration; safe to call from anywhere.
 *
 * @param {number} maxAgeMs
 * @param {string} [home]
 * @returns {number}
 */
function clearOlderThan(maxAgeMs, home) {
  if (typeof maxAgeMs !== "number" || maxAgeMs < 0) return 0;
  return withLock(home, () => {
    const log = loadLog(home);
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;
    // Collect keys to delete in a separate pass — mutating an object
    // during Object.entries iteration works in current V8 (entries
    // returns a snapshot of keys) but is fragile and silently breaks
    // if a maintainer swaps to `for (const k in log.sessions)`.
    /** @type {string[]} */
    const toDelete = [];
    for (const [sessionName, list] of Object.entries(log.sessions)) {
      const kept = list.filter((e) => {
        const t = Date.parse(e.closedAt || "");
        if (Number.isNaN(t)) return true; // keep entries with no parseable timestamp
        return t >= cutoff;
      });
      removed += list.length - kept.length;
      if (kept.length === 0) {
        toDelete.push(sessionName);
      } else {
        log.sessions[sessionName] = kept;
      }
    }
    for (const k of toDelete) delete log.sessions[k];
    if (removed > 0) writeLog(log, home);
    return removed;
  });
}

module.exports = {
  FILENAME,
  MAX_PER_SESSION,
  logPath,
  emptyLog,
  loadLog,
  writeLog,
  pushClosed,
  popClosed,
  peekClosed,
  clearOlderThan,
};
