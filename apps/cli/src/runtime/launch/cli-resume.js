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
  // Strip a leading `/` and convert remaining `/` to `-`. Claude itself
  // produces names like `-home-user-myproject` for `/home/user/myproject`.
  const normalized = cwd.replace(/^\/+/, "");
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
    // `codex resume --last` continues the most recently recorded codex
    // session. Codex tracks sessions globally (not per-cwd) so this is
    // close-enough for parallel-session reboot scenarios — when you
    // restore session N in cwd X, it picks up whatever you were last
    // doing in codex which is usually the right thing. UUID-targeted
    // resume is a follow-up.
    resumeArgs: (uuid) => {
      if (uuid) return ["resume", uuid];
      return ["resume", "--last"];
    },
    captureUuid: () => null, // codex UUID parsing deferred
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
  encodeClaudeProjectDir,
};
