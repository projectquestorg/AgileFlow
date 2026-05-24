/**
 * Install / uninstall the `af` short alias for `agileflow launch`.
 *
 * Strategy: symlink `~/.local/bin/af` → the active `agileflow` binary.
 * `~/.local/bin` is the XDG-standard user-scoped bin directory — no
 * sudo required, no global mutation. Most modern Linux/macOS setups
 * include it on PATH (via `~/.profile` / `~/.zprofile`); if not, we
 * surface a clear warning telling the user how to add it.
 *
 * On Windows the symlink approach is fragile (requires Developer Mode
 * or admin); slice 1 reports `unsupported` and the user can copy the
 * suggested PowerShell function from the warning. Slice 4 can add a
 * proper Windows shim.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

/**
 * Resolve where the `af` symlink should live.
 *
 * @param {string} [home]
 * @returns {string}
 */
function aliasPath(home) {
  return path.join(home || os.homedir(), ".local", "bin", "af");
}

/**
 * Best-effort: locate the `agileflow` binary that should be the symlink
 * target. Prefers `process.argv[1]` (the script Node was invoked with)
 * which is what the user actually ran — falls back to "agileflow" so
 * the symlink resolves via PATH if the absolute path can't be inferred.
 *
 * @param {NodeJS.Process} [proc]
 * @returns {string}
 */
function resolveAgileflowBin(proc = process) {
  const argv1 = proc && proc.argv && proc.argv[1];
  if (argv1) {
    try {
      const resolved = fs.realpathSync(argv1);
      return resolved;
    } catch {
      /* fall through */
    }
  }
  return "agileflow";
}

/**
 * Check whether `~/.local/bin` is on the user's PATH.
 *
 * @param {string} [home]
 * @param {string} [pathEnv]
 * @returns {boolean}
 */
function localBinOnPath(home, pathEnv) {
  const target = path.join(home || os.homedir(), ".local", "bin");
  const env = typeof pathEnv === "string" ? pathEnv : process.env.PATH || "";
  const sep = process.platform === "win32" ? ";" : ":";
  return env
    .split(sep)
    .map((p) => p.replace(/[/\\]+$/, ""))
    .includes(target.replace(/[/\\]+$/, ""));
}

/**
 * @typedef {Object} AliasInstallResult
 * @property {'installed' | 'updated' | 'unchanged' | 'unsupported' | 'failed'} status
 * @property {string} path           - where the symlink was written (or attempted)
 * @property {string} [target]       - what it points at, when installed
 * @property {string} [message]      - human-readable detail (for failures / warnings)
 * @property {boolean} [onPath]      - whether the alias directory is on PATH
 */

/**
 * Create or refresh the `af` symlink.
 *
 * @param {{ home?: string, proc?: NodeJS.Process }} [opts]
 * @returns {Promise<AliasInstallResult>}
 */
async function installAfAlias(opts = {}) {
  if (process.platform === "win32") {
    return {
      status: "unsupported",
      path: aliasPath(opts.home),
      message:
        "Windows symlinks require Developer Mode or admin. Slice 4 will add a proper shim. " +
        "For now: add `function af { agileflow launch @args }` to your PowerShell profile.",
    };
  }

  const link = aliasPath(opts.home);
  const target = resolveAgileflowBin(opts.proc);
  const onPath = localBinOnPath(opts.home);

  try {
    await fs.promises.mkdir(path.dirname(link), { recursive: true });

    // If a symlink already exists, check whether it points at the same target.
    let existing = null;
    try {
      existing = await fs.promises.readlink(link);
    } catch {
      /* not a symlink or absent */
    }

    if (existing === target) {
      return { status: "unchanged", path: link, target, onPath };
    }

    // Remove anything in the way (broken symlink, old file). Don't blow
    // away a non-symlink regular file — the user may have put it there.
    let removed = false;
    try {
      const stat = await fs.promises.lstat(link);
      if (stat.isSymbolicLink()) {
        await fs.promises.unlink(link);
        removed = true;
      } else {
        return {
          status: "failed",
          path: link,
          message: `${link} exists and is not a symlink — leaving it alone. Remove it manually if you want the alias.`,
          onPath,
        };
      }
    } catch {
      /* doesn't exist — fine */
    }

    await fs.promises.symlink(target, link);
    return {
      status: removed ? "updated" : "installed",
      path: link,
      target,
      onPath,
    };
  } catch (err) {
    return {
      status: "failed",
      path: link,
      message: `could not create symlink: ${err.message}`,
      onPath,
    };
  }
}

/**
 * Remove the `af` symlink if it points at agileflow. Safe no-op otherwise.
 *
 * @param {{ home?: string }} [opts]
 * @returns {Promise<{ status: 'removed' | 'absent' | 'skipped' | 'failed', path: string, message?: string }>}
 */
async function uninstallAfAlias(opts = {}) {
  const link = aliasPath(opts.home);
  try {
    const stat = await fs.promises.lstat(link);
    if (!stat.isSymbolicLink()) {
      return {
        status: "skipped",
        path: link,
        message: `${link} is not a symlink — leaving it alone.`,
      };
    }
    const target = await fs.promises.readlink(link);
    if (!/agileflow/i.test(target)) {
      return {
        status: "skipped",
        path: link,
        message: `${link} points at ${target}; not removing.`,
      };
    }
    await fs.promises.unlink(link);
    return { status: "removed", path: link };
  } catch (err) {
    if (err && err.code === "ENOENT") {
      return { status: "absent", path: link };
    }
    return { status: "failed", path: link, message: err.message };
  }
}

module.exports = {
  aliasPath,
  resolveAgileflowBin,
  localBinOnPath,
  installAfAlias,
  uninstallAfAlias,
};
