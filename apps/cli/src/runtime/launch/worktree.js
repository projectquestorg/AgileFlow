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
    throw makeWorktreeError(
      `git worktree add failed: ${wt.stderr.trim() || "unknown error"}`,
      "EWT_CREATE",
    );
  }

  return { path: wtPath, branch: safe, base };
}

module.exports = {
  createWorktree,
  sanitizeName,
  defaultGitExec,
  makeWorktreeError,
};
