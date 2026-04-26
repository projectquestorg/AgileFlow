#!/usr/bin/env node
/**
 * Core hook: pre-compact-state (PreCompact).
 *
 * Captures the state Claude needs to know AFTER the compaction summary
 * replaces most of the conversation: the active story, the active
 * command, recent decisions, and the dirty git state. Without this,
 * compaction often loses thread on multi-turn implementation work.
 *
 * Output is plain markdown printed to stdout — Claude Code includes
 * the hook's stdout in the prompt context after compaction.
 *
 * Exits 0 always (must not block compaction).
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function readJSON(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function git(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: projectDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

const out = [];
out.push("## Pre-compaction state preservation");
out.push("");

const status = readJSON(path.join(projectDir, "docs/09-agents/status.json"));
if (!status) {
  // Fresh project — no story tracker yet. Say so explicitly so the
  // post-compaction prompt knows the section was reached, not silently
  // skipped due to an error.
  out.push("Active stories: (none yet — docs/09-agents/status.json not found)");
  out.push("");
} else if (status.stories) {
  const inProgress = Object.entries(status.stories)
    .filter(([, s]) => s && s.status === "in_progress")
    .map(([id, s]) => `${id} ${s.title || ""}`);
  if (inProgress.length) {
    out.push("Active stories:");
    for (const s of inProgress) out.push(`  - ${s}`);
    out.push("");
  } else {
    out.push("Active stories: (none in progress)");
    out.push("");
  }
}

// Active command from session-state if it exists
const sessionState = readJSON(
  path.join(projectDir, "docs/09-agents/session-state.json"),
);
if (sessionState && sessionState.active_command) {
  out.push(
    `Active command: ${sessionState.active_command.name || "(unknown)"}`,
  );
  out.push("");
}

const branch = git("rev-parse --abbrev-ref HEAD");
const dirty = git("status --short");
if (branch || dirty) {
  out.push("Git:");
  if (branch) out.push(`  branch: ${branch}`);
  if (dirty) {
    const lines = dirty.split("\n").slice(0, 8);
    out.push(`  dirty:  ${lines.length} file(s)`);
    for (const l of lines) out.push(`    ${l}`);
  }
  out.push("");
}

const log = git("log --oneline -3");
if (log) {
  out.push("Recent commits:");
  for (const l of log.split("\n")) out.push(`  ${l}`);
  out.push("");
}

out.push("After compaction, resume from this state.");
process.stdout.write(out.join("\n") + "\n");
process.exit(0);
