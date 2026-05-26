/**
 * Per-CLI resume strategy table.
 *
 * Each entry tells the __exec wrapper:
 *   - `resumeArgs(uuid)`        — argv to append for "resume this conversation"
 *   - `captureUuid(cwd, opts)`  — after the CLI exits, return the UUID of the
 *                                 newest conversation associated with this cwd
 *                                 so we can store it back in the registry
 *
 * Strategies covered:
 *   - claude:        UUID-based; conversations are jsonl files under
 *                    `~/.claude/projects/<encoded-cwd>/`. Mirrors v3
 *                    `claude-smart.sh`.
 *   - codex:         `codex resume --last` resumes the most-recent
 *                    session. Codex doesn't (yet) take a UUID positionally
 *                    in a stable way per-cwd, so MVP uses `--last`. Better:
 *                    parse jsonl files under ~/.codex/sessions/ and target by id (deferred).
 *   - cursor-agent:  no published resume convention. Restart fresh.
 *   - aider:         auto-restores from `.aider.chat.history.md` in cwd.
 *                    No flag needed.
 *
 * All filesystem reads are injectable via `opts.fs` for tests.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Encode a cwd into Claude's project directory naming convention.
 * Claude stores conversations under `~/.claude/projects/<encoded>/`
 * where `<encoded>` is the absolute path with `/` replaced by `-`
 * (and a leading `-` for the root).
 *
 * @param {string} cwd
 * @returns {string}
 */
function encodeClaudeProjectDir(cwd) {
  // Normalize backslashes to forward slashes first so Windows paths
  // (`C:\Users\me\app`) and POSIX paths (`/home/me/app`) hit the same
  // encoding path. Then strip leading slashes and convert any remaining
  // separator to `-`. Claude itself produces names like
  // `-home-user-myproject` for `/home/user/myproject`.
  const slashed = cwd.replace(/\\/g, "/");
  const normalized = slashed.replace(/^\/+/, "");
  return "-" + normalized.replace(/\//g, "-");
}

/**
 * Find the newest non-agent .jsonl file in a Claude project directory
 * and return its UUID (filename minus `.jsonl`). Returns null when no
 * conversation has been recorded yet.
 *
 * @param {string} cwd
 * @param {{
 *   home?: string,
 *   readdirSync?: typeof fs.readdirSync,
 *   statSync?: typeof fs.statSync,
 * }} [opts]
 * @returns {string | null}
 */
function captureClaudeUuid(cwd, opts = {}) {
  const home = opts.home || os.homedir();
  const readdirSync = opts.readdirSync || fs.readdirSync;
  const statSync = opts.statSync || fs.statSync;
  const projectDir = path.join(
    home,
    ".claude",
    "projects",
    encodeClaudeProjectDir(cwd),
  );
  /** @type {string[]} */
  let entries;
  try {
    entries = readdirSync(projectDir);
  } catch {
    return null;
  }
  let bestUuid = null;
  let bestMtime = -Infinity;
  for (const entry of entries) {
    if (!entry.endsWith(".jsonl")) continue;
    // Skip agent transcripts — those are sub-conversations spawned by
    // a parent claude session, not the main conversation we want to
    // resume. v3 used the same `agent-` prefix filter.
    if (entry.startsWith("agent-")) continue;
    const full = path.join(projectDir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    const mtime = stat.mtimeMs || 0;
    if (mtime > bestMtime) {
      bestMtime = mtime;
      bestUuid = entry.slice(0, -".jsonl".length);
    }
  }
  return bestUuid;
}

/**
 * Find the newest codex session whose first-line `payload.cwd` matches
 * the given working directory.
 *
 * Codex stores sessions under
 * `~/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-<timestamp>-<UUID>.jsonl`.
 * The first JSONL line is a `session_meta` record containing
 * `payload.cwd` and `payload.id`. Walking that tree once per launch
 * isn't free, but it's still a few dozen files even for active users
 * and only runs after a session exits — so the cost is amortized.
 *
 * @param {string} cwd
 * @param {{
 *   home?: string,
 *   readdirSync?: typeof fs.readdirSync,
 *   statSync?: typeof fs.statSync,
 *   readFileSync?: typeof fs.readFileSync,
 * }} [opts]
 * @returns {string | null}
 */
function captureCodexUuid(cwd, opts = {}) {
  const home = opts.home || os.homedir();
  const readdirSync = opts.readdirSync || fs.readdirSync;
  const statSync = opts.statSync || fs.statSync;
  const readFileSync = opts.readFileSync || fs.readFileSync;

  const sessionsRoot = path.join(home, ".codex", "sessions");
  /** @type {string[]} */
  const jsonlFiles = [];

  // Recurse year → month → day → files. Tree depth is fixed at 3.
  /** @param {string} dir */
  function collect(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        collect(full);
      } else if (ent.isFile() && ent.name.endsWith(".jsonl")) {
        jsonlFiles.push(full);
      }
    }
  }
  collect(sessionsRoot);

  let bestUuid = null;
  let bestMtime = -Infinity;
  for (const file of jsonlFiles) {
    let stat;
    try {
      stat = statSync(file);
    } catch {
      continue;
    }
    const mtime = typeof stat.mtimeMs === "number" ? stat.mtimeMs : 0;
    if (mtime <= bestMtime) continue;
    // Cheap match: read just the first line.
    let head;
    try {
      head = readFileSync(file, "utf8").split("\n", 1)[0];
    } catch {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(head);
    } catch {
      continue;
    }
    const payload = parsed && parsed.payload;
    if (!payload || typeof payload !== "object") continue;
    if (payload.cwd !== cwd) continue;
    if (typeof payload.id !== "string" || !payload.id) continue;
    bestUuid = payload.id;
    bestMtime = mtime;
  }
  return bestUuid;
}

/**
 * @typedef {Object} ResumeStrategy
 * @property {(uuid: string | null) => string[]} resumeArgs
 * @property {(cwd: string, opts?: any) => string | null} captureUuid
 */

/** @type {Record<string, ResumeStrategy>} */
const RESUME_STRATEGIES = {
  claude: {
    resumeArgs: (uuid) => (uuid ? ["--resume", uuid] : []),
    captureUuid: captureClaudeUuid,
  },
  codex: {
    // With a stored UUID we resume that specific session, which is
    // critical when the user has multiple parallel codex sessions
    // across different cwds — `resume --last` would pick whichever
    // they touched most recently, not the one tied to THIS session.
    // Without a UUID (first launch in a cwd, or capture failed) we
    // fall back to `--last`.
    resumeArgs: (uuid) => {
      if (uuid) return ["resume", uuid];
      return ["resume", "--last"];
    },
    captureUuid: captureCodexUuid,
  },
  "cursor-agent": {
    resumeArgs: () => [],
    captureUuid: () => null,
  },
  aider: {
    // aider auto-restores the cwd's chat history from
    // `.aider.chat.history.md` on every invocation. No flag needed.
    resumeArgs: () => [],
    captureUuid: () => null,
  },
};

/**
 * Pick a strategy by CLI id; unknown CLIs get the "spawn fresh" no-op.
 *
 * @param {string} cli
 * @returns {ResumeStrategy}
 */
function getResumeStrategy(cli) {
  return (
    RESUME_STRATEGIES[cli] || {
      resumeArgs: () => [],
      captureUuid: () => null,
    }
  );
}

module.exports = {
  RESUME_STRATEGIES,
  getResumeStrategy,
  captureClaudeUuid,
  captureCodexUuid,
  encodeClaudeProjectDir,
};
