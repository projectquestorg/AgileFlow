/**
 * Cross-reboot session registry for `agileflow launch`.
 *
 * Lives at `~/.agileflow/launch-sessions.json`. Tracks every tmux
 * session we create so we can resurrect them after the tmux server
 * dies (machine reboot, manual `tmux kill-server`, etc.). For each
 * session we keep:
 *   - name        — the tmux session name (claude-myproject, ...)
 *   - cli         — the AI CLI it wraps (claude, codex, ...)
 *   - cwd         — directory the session was created in (or the
 *                   worktree path for Alt+n sessions)
 *   - uuid        — last-known conversation UUID for resume (captured
 *                   from claude's `~/.claude/projects/<dir>/*.jsonl`
 *                   or codex's session index)
 *   - lastSeen    — ISO timestamp of the last __exec invocation
 *   - worktree    — optional `{path, branch, base}` from createWorktree
 *
 * Atomic writes via tmp+rename — same pattern the prefs file uses.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const FILENAME = "launch-sessions.json";
const LOCK_SUFFIX = ".lock";
const LOCK_STALE_MS = 5000;
const LOCK_MAX_ATTEMPTS = 100;
const LOCK_RETRY_MS = 10;

/**
 * Busy-wait sleep for `ms` milliseconds. Used inside the lock-acquire
 * retry loop to back off briefly between attempts without bringing in
 * any async / Atomics machinery (the rest of the registry API is sync,
 * so async sleep would force every caller through Promise plumbing).
 *
 * @param {number} ms
 */
function busyWait(ms) {
  const target = Date.now() + ms;
  while (Date.now() < target) {
    /* spin */
  }
}

/**
 * Acquire an exclusive write lock on the registry via an O_EXCL lock
 * file, run `fn`, then release. Used by recordSession / updateSession /
 * forgetSession so two concurrent `__exec` processes finishing claude
 * at the same time don't lose each other's UUID updates (read-modify-
 * write race).
 *
 * @template T
 * @param {string | undefined} home
 * @param {() => T} fn
 * @returns {T}
 */
function withRegistryLock(home, fn) {
  const lockFile = registryPath(home) + LOCK_SUFFIX;
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });

  /** @type {number | null} */
  let lockFd = null;
  for (let attempt = 0; attempt < LOCK_MAX_ATTEMPTS; attempt++) {
    try {
      // `wx` is the Node.js shorthand for O_CREAT | O_EXCL — fails with
      // EEXIST when someone else already holds the lock.
      lockFd = fs.openSync(lockFile, "wx");
      break;
    } catch (err) {
      if (!err || err.code !== "EEXIST") throw err;
      // Stale-lock detection: if the lockfile's mtime is older than
      // LOCK_STALE_MS the holder probably crashed without unlinking.
      // Best-effort takeover. The race here is benign: even if two
      // processes both decide it's stale, only one O_EXCL open will
      // succeed and the other loops again.
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
        /* lockfile vanished between EEXIST and stat — loop and retry */
      }
      busyWait(LOCK_RETRY_MS);
    }
  }
  if (lockFd === null) {
    throw new Error(
      `could not acquire launch-sessions registry lock after ${LOCK_MAX_ATTEMPTS} attempts`,
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
 * @typedef {Object} WorktreeMeta
 * @property {string} path
 * @property {string} branch
 * @property {string} base
 *
 * @typedef {Object} SessionEntry
 * @property {string} name
 * @property {string} cli
 * @property {string} cwd
 * @property {string | null} uuid          - null until the first __exec capture
 * @property {string} lastSeen             - ISO timestamp
 * @property {WorktreeMeta} [worktree]
 *
 * @typedef {Object} RegistryShape
 * @property {1} version
 * @property {SessionEntry[]} sessions
 */

/**
 * @param {string} [home]
 * @returns {string}
 */
function registryPath(home) {
  return path.join(home || os.homedir(), ".agileflow", FILENAME);
}

/** @returns {RegistryShape} */
function emptyRegistry() {
  return { version: 1, sessions: [] };
}

/**
 * Read the registry from disk; returns an empty registry if the file
 * is missing or malformed (corrupted files shouldn't break `launch`).
 * Unknown extras are dropped. Invalid entries (missing required keys)
 * are filtered out.
 *
 * @param {string} [home]
 * @returns {RegistryShape}
 */
function loadRegistry(home) {
  const file = registryPath(home);
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") return emptyRegistry();
    // Permission / I/O errors should NOT silently become an empty
    // registry — that would tell a subsequent write to wipe out the
    // user's whole session list. Surface a warning on stderr (so it
    // shows up next to other launch chatter) and still return empty so
    // the rest of the launch flow keeps working.
    // eslint-disable-next-line no-console
    console.error(
      `agileflow launch: could not read ${file} (${err && err.code ? err.code : err && err.message ? err.message : "I/O error"}). ` +
        "Saved sessions may not appear in `agileflow launch restore` until the file is readable.",
    );
    return emptyRegistry();
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyRegistry();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return emptyRegistry();
  }
  const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
  /** @type {SessionEntry[]} */
  const sane = [];
  for (const s of sessions) {
    if (!s || typeof s !== "object") continue;
    if (typeof s.name !== "string" || !s.name) continue;
    if (typeof s.cli !== "string" || !s.cli) continue;
    if (typeof s.cwd !== "string" || !s.cwd) continue;
    sane.push({
      name: s.name,
      cli: s.cli,
      cwd: s.cwd,
      uuid: typeof s.uuid === "string" ? s.uuid : null,
      lastSeen: typeof s.lastSeen === "string" ? s.lastSeen : "",
      worktree:
        s.worktree && typeof s.worktree === "object"
          ? {
              path: String(s.worktree.path || ""),
              branch: String(s.worktree.branch || ""),
              base: String(s.worktree.base || ""),
            }
          : undefined,
    });
  }
  return { version: 1, sessions: sane };
}

/**
 * Atomically write the registry to disk. Ensures `~/.agileflow/` exists.
 *
 * @param {RegistryShape} reg
 * @param {string} [home]
 * @returns {string}
 */
function writeRegistry(reg, home) {
  const file = registryPath(home);
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.${FILENAME}.tmp-${process.pid}`);
  const payload = {
    version: 1,
    sessions: reg.sessions,
  };
  const content = JSON.stringify(payload, null, 2) + "\n";
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

/**
 * Record a newly-created session. If an entry with the same name
 * exists, it's replaced — same name = same logical session being
 * re-created, which is what the restore flow does.
 *
 * @param {Omit<SessionEntry, "lastSeen"> & { lastSeen?: string }} entry
 * @param {string} [home]
 */
/**
 * Reject entries that loadRegistry would silently drop on the next
 * read. Validates the same required-string fields the load-side filter
 * checks, so writes and reads agree.
 *
 * @param {Partial<SessionEntry>} entry
 */
function validateEntry(entry) {
  if (!entry || typeof entry !== "object") {
    throw new TypeError("recordSession: entry must be an object");
  }
  if (typeof entry.name !== "string" || !entry.name) {
    throw new TypeError("recordSession: entry.name must be a non-empty string");
  }
  if (typeof entry.cli !== "string" || !entry.cli) {
    throw new TypeError("recordSession: entry.cli must be a non-empty string");
  }
  if (typeof entry.cwd !== "string" || !entry.cwd) {
    throw new TypeError("recordSession: entry.cwd must be a non-empty string");
  }
}

function recordSession(entry, home) {
  validateEntry(entry);
  withRegistryLock(home, () => {
    const reg = loadRegistry(home);
    const filtered = reg.sessions.filter((s) => s.name !== entry.name);
    filtered.push({
      name: entry.name,
      cli: entry.cli,
      cwd: entry.cwd,
      uuid: entry.uuid || null,
      lastSeen: entry.lastSeen || new Date().toISOString(),
      worktree: entry.worktree,
    });
    writeRegistry({ version: 1, sessions: filtered }, home);
  });
}

/**
 * Patch an existing entry by name. Used by the __exec wrapper after
 * the CLI exits to refresh the UUID + lastSeen. No-op if the entry
 * doesn't exist.
 *
 * @param {string} name
 * @param {Partial<SessionEntry>} patch
 * @param {string} [home]
 * @returns {boolean} - true if a row was updated
 */
function updateSession(name, patch, home) {
  return withRegistryLock(home, () => {
    // Re-read under the lock so concurrent __exec processes finishing
    // claude at the same time don't lose each other's UUID updates.
    // Without the lock: A loads, B loads, A writes, B writes → A's
    // change clobbered.
    const reg = loadRegistry(home);
    let updated = false;
    for (const s of reg.sessions) {
      if (s.name === name) {
        if (patch.uuid !== undefined) {
          // Accept string-or-null only; coerce anything else to null
          // to keep the on-disk shape consistent with what the load
          // side validates.
          s.uuid = typeof patch.uuid === "string" ? patch.uuid : null;
        }
        if (patch.lastSeen !== undefined) s.lastSeen = patch.lastSeen;
        if (patch.cwd !== undefined) s.cwd = patch.cwd;
        if (patch.worktree !== undefined) s.worktree = patch.worktree;
        updated = true;
      }
    }
    if (updated) writeRegistry(reg, home);
    return updated;
  });
}

/**
 * Look up a single entry by name.
 *
 * @param {string} name
 * @param {string} [home]
 * @returns {SessionEntry | null}
 */
function findSession(name, home) {
  const reg = loadRegistry(home);
  return reg.sessions.find((s) => s.name === name) || null;
}

/**
 * Drop an entry by name (e.g., user killed the worktree session and
 * doesn't want it auto-restored next time).
 *
 * @param {string} name
 * @param {string} [home]
 * @returns {boolean}
 */
function forgetSession(name, home) {
  return withRegistryLock(home, () => {
    const reg = loadRegistry(home);
    const before = reg.sessions.length;
    reg.sessions = reg.sessions.filter((s) => s.name !== name);
    if (reg.sessions.length !== before) {
      writeRegistry(reg, home);
      return true;
    }
    return false;
  });
}

module.exports = {
  FILENAME,
  registryPath,
  emptyRegistry,
  loadRegistry,
  writeRegistry,
  recordSession,
  updateSession,
  findSession,
  forgetSession,
};
