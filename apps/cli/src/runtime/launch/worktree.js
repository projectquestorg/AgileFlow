/**
 * Create a git worktree for `agileflow launch new <name>`.
 *
 * Mirrors v3 `worktree-create.sh` defaults: sibling dir at
 * `../<repo>-<sanitized-name>`, new branch `<sanitized-name>` off the
 * current HEAD (or a caller-supplied base branch). Fails cleanly on the
 * common pre-conditions: not in a repo, target dir already exists,
 * branch already exists.
 *
 * `exec` is injectable so tests don't shell out to git. The exec must
 * return `{ status: number, stdout: string, stderr: string }` (the
 * shape `child_process.spawnSync({ encoding: "utf8" })` produces).
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

/**
 * @typedef {{
 *   status: number,
 *   stdout: string,
 *   stderr: string,
 * }} GitExecResult
 *
 * @typedef {(args: string[]) => GitExecResult} GitExec
 */

const NAME_SANITIZE = /[^A-Za-z0-9._-]+/g;

/**
 * Build a typed error with a stable `code` so callers can branch on it.
 *
 * @param {string} message
 * @param {string} code
 * @returns {Error}
 */
function makeWorktreeError(message, code) {
  const err = new Error(message);
  /** @type {any} */ (err).code = code;
  return err;
}

/**
 * Default exec implementation — actually spawns `git` synchronously.
 *
 * @type {GitExec}
 */
function defaultGitExec(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

/**
 * Sanitize a user-supplied worktree name. Lets alphanumerics, dot,
 * underscore, and hyphen pass; collapses other characters to `-`.
 *
 * @param {string} name
 * @returns {string}
 */
function sanitizeName(name) {
  if (typeof name !== "string") return "";
  return name.replace(NAME_SANITIZE, "-").replace(/^-+|-+$/g, "");
}

/**
 * Create a new git worktree at `../<repo>-<name>` with branch `<name>`
 * off the current HEAD (or `baseBranch` if supplied).
 *
 * @param {{
 *   name: string,
 *   baseBranch?: string,
 *   exec?: GitExec,
 *   fsExists?: (p: string) => boolean,
 * }} opts
 * @returns {{ path: string, branch: string, base: string }}
 */
function createWorktree(opts) {
  const exec = opts.exec || defaultGitExec;
  const exists = opts.fsExists || ((p) => fs.existsSync(p));

  // 1. Must be inside a git work tree.
  const top = exec(["rev-parse", "--show-toplevel"]);
  if (top.status !== 0) {
    throw makeWorktreeError(
      `not in a git repository (${top.stderr.trim() || "rev-parse failed"})`,
      "EWT_NOT_REPO",
    );
  }
  const repoRoot = top.stdout.trim();
  if (!repoRoot) {
    throw makeWorktreeError(
      "git rev-parse --show-toplevel returned no output",
      "EWT_NOT_REPO",
    );
  }
  const repoName = path.basename(repoRoot);
  if (!repoName) {
    // path.basename("/") is "" — degenerate setup (repo at filesystem
    // root). Worktree path would resolve to "/-<name>" which is
    // never what the user wants.
    throw makeWorktreeError(
      `repository root has no name (got "${repoRoot}") — cannot derive worktree path`,
      "EWT_NOT_REPO",
    );
  }

  // 2. Sanitize.
  const safe = sanitizeName(opts.name || "");
  if (!safe) {
    throw makeWorktreeError(
      "worktree name is empty after sanitizing",
      "EWT_BAD_NAME",
    );
  }

  // 3. Compute target dir; reject if it already exists.
  const wtPath = path.resolve(repoRoot, "..", `${repoName}-${safe}`);
  if (exists(wtPath)) {
    throw makeWorktreeError(
      `worktree directory already exists: ${wtPath}`,
      "EWT_DIR_EXISTS",
    );
  }

  // 4. Determine base branch.
  let base = opts.baseBranch;
  if (!base) {
    const head = exec(["rev-parse", "--abbrev-ref", "HEAD"]);
    if (head.status !== 0) {
      throw makeWorktreeError(
        `could not determine current branch: ${head.stderr.trim()}`,
        "EWT_NO_HEAD",
      );
    }
    base = head.stdout.trim();
    if (base === "HEAD") {
      // `git rev-parse --abbrev-ref HEAD` returns the literal string
      // "HEAD" when the working tree is in a detached-HEAD state.
      // Passing that to `git worktree add -b` would fail with a less
      // helpful "fatal: invalid reference: HEAD" — fail clearly here.
      throw makeWorktreeError(
        "cannot create worktree from a detached HEAD — check out a branch first",
        "EWT_NO_HEAD",
      );
    }
  }

  // 5. New branch must not already exist (otherwise `git worktree add -b`
  // would fail with a less actionable error).
  const refCheck = exec([
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${safe}`,
  ]);
  if (refCheck.status === 0) {
    throw makeWorktreeError(
      `branch '${safe}' already exists`,
      "EWT_BRANCH_EXISTS",
    );
  }

  // 6. Create it.
  const wt = exec(["worktree", "add", "-b", safe, wtPath, base]);
  if (wt.status !== 0) {
    const stderr = wt.stderr.trim();
    // Map git's "already exists" failures back to the typed codes our
    // pre-check would have thrown — covers the TOCTOU window where
    // another process created the dir or branch between our checks
    // and `git worktree add`. The caller already has actionable hints
    // wired up for EWT_DIR_EXISTS / EWT_BRANCH_EXISTS, but only the
    // generic "re-run with DEBUG=1" for EWT_CREATE.
    if (/refs\/heads\/.*already exists/i.test(stderr)) {
      throw makeWorktreeError(
        `branch '${safe}' already exists`,
        "EWT_BRANCH_EXISTS",
      );
    }
    if (/already exists/i.test(stderr)) {
      throw makeWorktreeError(
        `worktree directory already exists: ${wtPath}`,
        "EWT_DIR_EXISTS",
      );
    }
    throw makeWorktreeError(
      `git worktree add failed: ${stderr || "unknown error"}`,
      "EWT_CREATE",
    );
  }

  return { path: wtPath, branch: safe, base };
}

/**
 * Roll back a worktree created by `createWorktree`. Removes both the
 * worktree directory (via `git worktree remove`) and the branch (via
 * `git branch -D`). Used by `parallel-session.js` to keep the repo
 * clean when a tmux session creation fails after the worktree was
 * already established.
 *
 * Best-effort: surfaces partial failures via `removed`/`branchRemoved`
 * flags so the caller can warn the user about what's left behind.
 * Doesn't throw on individual git failures — the goal is rollback,
 * not perfect cleanup.
 *
 * @param {{
 *   path: string,
 *   branch?: string,
 *   exec?: GitExec,
 * }} opts
 * @returns {{
 *   removed: boolean,
 *   branchRemoved: boolean,
 *   stderr: string,
 * }}
 */
function removeWorktree(opts) {
  const exec = opts.exec || defaultGitExec;
  let removed = false;
  let branchRemoved = false;
  const stderrParts = [];

  // `git worktree remove -f` so locked / dirty worktrees still get
  // cleaned up — rollback is a "we just created this, take it back"
  // operation so force is appropriate.
  const wt = exec(["worktree", "remove", "-f", opts.path]);
  if (wt.status === 0) {
    removed = true;
  } else if (wt.stderr) {
    stderrParts.push(`worktree remove: ${wt.stderr.trim()}`);
  }

  // Branch removal: only attempted if a branch name was supplied.
  // `git branch -D` force-deletes regardless of merge state.
  if (opts.branch) {
    const br = exec(["branch", "-D", opts.branch]);
    if (br.status === 0) {
      branchRemoved = true;
    } else if (br.stderr) {
      stderrParts.push(`branch -D: ${br.stderr.trim()}`);
    }
  }

  return { removed, branchRemoved, stderr: stderrParts.join("; ") };
}

module.exports = {
  createWorktree,
  removeWorktree,
  sanitizeName,
  defaultGitExec,
  makeWorktreeError,
};
