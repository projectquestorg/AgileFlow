/**
 * Pure helpers behind `agileflow launch ls / kill / attach / prune`.
 *
 * Composes already-built primitives:
 *   - registry: load / find / forget
 *   - tmux: sessionExists / killSession / attachSession
 *   - restore: runRestore({ onlyName }) for lazy re-creation
 *   - worktree: removeWorktree for paired cleanup
 *
 * Every helper accepts a `deps` bag with injectable callables so the unit
 * tests don't have to spawn tmux or touch a real registry. The CLI
 * wrappers in `commands/launch.js` are the only place that wires in the
 * real implementations.
 */
const fs = require("fs");

const {
  loadRegistry,
  findSession,
  forgetSession,
} = require("./session-registry.js");
const {
  defaultRunner,
  sessionExists: tmuxSessionExists,
  killSession: tmuxKillSession,
  attachSession: tmuxAttachSession,
} = require("./tmux.js");
const { removeWorktree } = require("./worktree.js");
const { runRestore } = require("./restore.js");

/**
 * @typedef {import("./session-registry.js").SessionEntry & {
 *   state: 'alive' | 'dormant' | 'missing-cwd',
 * }} ClassifiedSession
 */

/**
 * Return every registered session, each tagged with its current state:
 *   - alive       → tmux has the session
 *   - dormant     → registry has it, cwd still exists, tmux doesn't
 *   - missing-cwd → registry has it but the cwd has been deleted
 *
 * Read-only — never mutates the registry. Worktree-only orphan detection
 * lives in doctor.js; this helper just exposes raw state.
 *
 * @param {{
 *   home?: string,
 *   runner?: import("./tmux.js").TmuxRunner,
 *   sessionExistsFn?: typeof tmuxSessionExists,
 *   existsSync?: (p: string) => boolean,
 * }} [deps]
 * @returns {ClassifiedSession[]}
 */
function listSessions(deps = {}) {
  const runner = deps.runner || defaultRunner();
  const sessionExistsFn = deps.sessionExistsFn || tmuxSessionExists;
  const existsSync = deps.existsSync || ((p) => fs.existsSync(p));
  const reg = loadRegistry(deps.home);
  return reg.sessions.map((entry) => {
    const alive = sessionExistsFn(entry.name, runner);
    const cwdExists = existsSync(entry.cwd);
    /** @type {'alive' | 'dormant' | 'missing-cwd'} */
    const state = alive ? "alive" : cwdExists ? "dormant" : "missing-cwd";
    return { ...entry, state };
  });
}

/**
 * Kill a tmux session (if alive) and forget the registry entry. When
 * `removeWorktree` is true and the entry has worktree metadata pointing
 * at a directory that still exists, also remove the worktree + branch.
 *
 * The worktree removal is gated on caller intent rather than auto-applied
 * so the CLI wrapper can prompt the user before destructive cleanup.
 *
 * Return shape lets the wrapper render a precise outcome without
 * re-querying state:
 *   - ok: false + reason="not in registry"  → unknown name
 *   - ok: true + wasAlive: boolean          → kill attempted
 *   - ok: true + worktree: { removed, branchRemoved, stderr }
 *                                           → worktree cleanup attempted
 *
 * @param {{
 *   name: string,
 *   removeWorktree?: boolean,
 *   home?: string,
 *   runner?: import("./tmux.js").TmuxRunner,
 *   sessionExistsFn?: typeof tmuxSessionExists,
 *   killSessionFn?: typeof tmuxKillSession,
 *   removeWorktreeFn?: typeof removeWorktree,
 *   existsSync?: (p: string) => boolean,
 * }} deps
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   wasAlive?: boolean,
 *   worktree?: ReturnType<typeof removeWorktree> | null,
 * }}
 */
function killBySessionName(deps) {
  const runner = deps.runner || defaultRunner();
  const sessionExistsFn = deps.sessionExistsFn || tmuxSessionExists;
  const killFn = deps.killSessionFn || tmuxKillSession;
  const removeWtFn = deps.removeWorktreeFn || removeWorktree;
  const existsSync = deps.existsSync || ((p) => fs.existsSync(p));

  const entry = findSession(deps.name, deps.home);
  if (!entry) return { ok: false, reason: "not in registry" };

  // Best-effort kill: ignore the return value because we proceed with
  // forget regardless. A failed kill on an alive session leaves a tmux
  // orphan, but the registry stays consistent.
  const wasAlive = sessionExistsFn(entry.name, runner);
  if (wasAlive) killFn(entry.name, runner);

  // forgetSession can throw if the lockfile can't be acquired (registry
  // contention from concurrent __exec processes). Surface that as a
  // structured failure instead of letting the exception escape — callers
  // expect this helper to honor the { ok, reason, ... } contract.
  try {
    forgetSession(deps.name, deps.home);
  } catch (err) {
    return {
      ok: false,
      reason: `could not update registry: ${err && err.message ? err.message : String(err)}`,
      wasAlive,
    };
  }

  /** @type {ReturnType<typeof removeWorktree> | null} */
  let wt = null;
  if (
    deps.removeWorktree &&
    entry.worktree &&
    entry.worktree.path &&
    existsSync(entry.worktree.path)
  ) {
    wt = removeWtFn({
      path: entry.worktree.path,
      branch: entry.worktree.branch || undefined,
    });
  }
  return { ok: true, wasAlive, worktree: wt };
}

/**
 * Attach to a registered session, lazily restoring it from the registry
 * if the tmux server doesn't currently have it. The lazy-restore step is
 * what makes this useful after a reboot — `agileflow launch attach foo`
 * Just Works whether or not foo is currently on the server.
 *
 * Failure cases (return { ok: false, reason }):
 *   - "not in registry"   → unknown name
 *   - "cwd missing"       → original directory deleted; can't restore
 *   - "could not restore" → tmux refused new-session (notes carries why)
 *
 * @param {{
 *   name: string,
 *   home?: string,
 *   prefs: import("./defaults.js").LaunchPrefs,
 *   agileflowBin?: string,
 *   runner?: import("./tmux.js").TmuxRunner,
 *   sessionExistsFn?: typeof tmuxSessionExists,
 *   attachSessionFn?: typeof tmuxAttachSession,
 *   runRestoreImpl?: typeof runRestore,
 *   existsSync?: (p: string) => boolean,
 * }} deps
 * @returns {Promise<{
 *   ok: boolean,
 *   reason?: string,
 *   restored?: boolean,
 *   attach?: Awaited<ReturnType<typeof tmuxAttachSession>>,
 *   notes?: Array<{ name: string, reason: string }>,
 * }>}
 */
async function attachByName(deps) {
  const runner = deps.runner || defaultRunner();
  const sessionExistsFn = deps.sessionExistsFn || tmuxSessionExists;
  const attachFn = deps.attachSessionFn || tmuxAttachSession;
  const restoreFn = deps.runRestoreImpl || runRestore;
  const existsSync = deps.existsSync || ((p) => fs.existsSync(p));

  const entry = findSession(deps.name, deps.home);
  if (!entry) return { ok: false, reason: "not in registry" };
  if (!existsSync(entry.cwd)) return { ok: false, reason: "cwd missing" };

  let restored = false;
  if (!sessionExistsFn(entry.name, runner)) {
    const r = restoreFn({
      prefs: deps.prefs,
      runner,
      home: deps.home,
      agileflowBin: deps.agileflowBin,
      onlyName: deps.name,
    });
    if (r.restored === 0) {
      return { ok: false, reason: "could not restore", notes: r.notes };
    }
    restored = true;
  }
  const attach = await attachFn(entry.name, runner);
  return { ok: true, restored, attach };
}

/**
 * Return the registry entries that are safe to forget in bulk:
 *   - dormant + cwd missing (project deleted)
 *   - dormant + worktree dir missing (someone `git worktree remove`'d it)
 *
 * Alive sessions are NEVER candidates. Dormant entries with a live cwd
 * stay too — the user likely just shut tmux down and intends to restore.
 *
 * Each candidate is annotated with `reason` so the CLI wrapper can show
 * the user why it's offering the cleanup.
 *
 * @param {{
 *   home?: string,
 *   runner?: import("./tmux.js").TmuxRunner,
 *   sessionExistsFn?: typeof tmuxSessionExists,
 *   existsSync?: (p: string) => boolean,
 * }} [deps]
 * @returns {Array<ClassifiedSession & { reason: string }>}
 */
function pruneCandidates(deps = {}) {
  const existsSync = deps.existsSync || ((p) => fs.existsSync(p));
  const classified = listSessions(deps);
  /** @type {Array<ClassifiedSession & { reason: string }>} */
  const out = [];
  for (const c of classified) {
    if (c.state === "alive") continue;
    if (c.state === "missing-cwd") {
      out.push({ ...c, reason: `cwd missing: ${c.cwd}` });
      continue;
    }
    if (c.worktree && c.worktree.path && !existsSync(c.worktree.path)) {
      out.push({
        ...c,
        reason: `worktree dir missing: ${c.worktree.path}`,
      });
    }
  }
  return out;
}

/**
 * Apply a prune selection: forget each named entry, optionally remove
 * its worktree (only when the path still exists — pruneCandidates
 * surfaces missing-dir cases, but we don't want to issue `git worktree
 * remove` on something the user already cleaned up manually).
 *
 * Returns counts so the CLI wrapper can print a one-line summary.
 *
 * @param {{
 *   selections: Array<{ name: string }>,
 *   removeWorktrees?: boolean,
 *   home?: string,
 *   removeWorktreeFn?: typeof removeWorktree,
 *   existsSync?: (p: string) => boolean,
 * }} deps
 * @returns {{ forgotten: number, worktreesRemoved: number, errors: Array<{ name: string, error: string }> }}
 */
function applyPrune(deps) {
  const removeWtFn = deps.removeWorktreeFn || removeWorktree;
  const existsSync = deps.existsSync || ((p) => fs.existsSync(p));
  let forgotten = 0;
  let worktreesRemoved = 0;
  /** @type {Array<{ name: string, error: string }>} */
  const errors = [];

  for (const sel of deps.selections || []) {
    const entry = findSession(sel.name, deps.home);
    if (!entry) {
      // Concurrent prune from another process? Skip; nothing to do.
      continue;
    }
    if (
      deps.removeWorktrees &&
      entry.worktree &&
      entry.worktree.path &&
      existsSync(entry.worktree.path)
    ) {
      try {
        const r = removeWtFn({
          path: entry.worktree.path,
          branch: entry.worktree.branch || undefined,
        });
        if (r.removed) worktreesRemoved++;
        if (r.stderr) errors.push({ name: sel.name, error: r.stderr });
      } catch (err) {
        errors.push({ name: sel.name, error: err.message || String(err) });
      }
    }
    try {
      forgetSession(sel.name, deps.home);
      forgotten++;
    } catch (err) {
      errors.push({ name: sel.name, error: err.message || String(err) });
    }
  }
  return { forgotten, worktreesRemoved, errors };
}

module.exports = {
  listSessions,
  killBySessionName,
  attachByName,
  pruneCandidates,
  applyPrune,
};
