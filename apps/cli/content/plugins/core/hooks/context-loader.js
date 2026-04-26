#!/usr/bin/env node
/**
 * Core hook: context-loader (SessionStart).
 *
 * Prints a compact project snapshot to stdout so Claude Code includes
 * it in the session prompt. Lean v4 implementation (~200 lines, vs.
 * v3's 79KB welcome banner). Output is pure text — no ANSI colors.
 *
 * Sections (ordered by load-bearing-ness for Claude):
 *   1. Project header (cwd, agileflow version, ide)
 *   2. Active story / epic (from docs/09-agents/status.json if present)
 *   3. Ready stories (top 5 by priority)
 *   4. Git state (branch, dirty files)
 *   5. Recent commits (last 5)
 *   6. Hook health (last 3 entries from hook-execution.jsonl)
 *
 * Fail-open: any read error becomes a one-line "(unavailable)" note.
 * The hook always exits 0; orchestrator-side `skipOnError: true` is
 * defensive belt-and-suspenders.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const agileflowDir = path.join(projectDir, ".agileflow");

/** Read JSON file, returning null on any error. */
function readJSON(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/** Run a git command; return its stdout trimmed, or null on error. */
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

/** Tail the last N JSONL entries from a file. */
function tailJSONL(p, n) {
  try {
    const lines = fs.readFileSync(p, "utf8").trim().split("\n");
    return lines
      .slice(-n)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

const lines = [];
const out = (s = "") => lines.push(s);

out("## AgileFlow project context");
out("");

// 1. Project header
const config = readJSON(path.join(projectDir, "agileflow.config.json")) || {};
const enabledPlugins = Object.entries(config.plugins || {})
  .filter(([, v]) => v && v.enabled)
  .map(([id]) => id);
out(`cwd:      ${projectDir}`);
out(`ide:      ${(config.ide && config.ide.primary) || "claude-code"}`);
out(`plugins:  ${enabledPlugins.join(", ") || "(none)"}`);
out(
  `tone:     ${(config.personalization && config.personalization.tone) || "concise"}`,
);
out("");

// 2. Active story / epic
const status = readJSON(path.join(projectDir, "docs/09-agents/status.json"));
if (!status) {
  // Fresh project — no story tracker yet. Tell Claude explicitly so it
  // knows the section was reached, not silently skipped due to error.
  out("## Stories");
  out("  (no story tracker yet — docs/09-agents/status.json not found)");
  out("");
} else if (status.stories) {
  const inProgress = Object.entries(status.stories)
    .filter(([, s]) => s && s.status === "in_progress")
    .map(([id, s]) => ({ id, ...s }));
  if (inProgress.length) {
    out("## In progress");
    for (const s of inProgress) {
      out(
        `  ${s.id} ${s.title || ""} (owner: ${s.owner || "?"}, est: ${s.estimate || "?"})`,
      );
    }
    out("");
  }

  // 3. Ready stories — top 5 by priority then estimate
  const ready = Object.entries(status.stories)
    .filter(([, s]) => s && s.status === "ready")
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => {
      const pa = parseInt(String(a.priority || "P9").replace("P", ""), 10);
      const pb = parseInt(String(b.priority || "P9").replace("P", ""), 10);
      if (pa !== pb) return pa - pb;
      return (a.estimate || 99) - (b.estimate || 99);
    })
    .slice(0, 5);
  if (ready.length) {
    out("## Ready (top 5)");
    for (const s of ready) {
      out(
        `  ${s.id} [${s.priority || "P?"} · ${s.estimate || "?"}pts] ${s.title || ""}`,
      );
    }
    out("");
  }

  if (!inProgress.length && !ready.length) {
    out("## Stories");
    out("  (none in progress, none ready)");
    out("");
  }
}

// 4. Git state
const branch = git("rev-parse --abbrev-ref HEAD");
const dirty = git("status --short");
if (branch) {
  out("## Git");
  out(`  branch:   ${branch}`);
  if (dirty) {
    const lines2 = dirty.split("\n").slice(0, 10);
    out(
      `  changes:  ${lines2.length} file(s)${dirty.split("\n").length > 10 ? " (showing first 10)" : ""}`,
    );
    for (const l of lines2) out(`    ${l}`);
  } else {
    out("  changes:  (clean)");
  }
  out("");
}

// 5. Recent commits
const log = git("log --oneline -5");
if (log) {
  out("## Recent commits");
  for (const l of log.split("\n")) out(`  ${l}`);
  out("");
}

// 6. Hook health
const hookLog = tailJSONL(
  path.join(agileflowDir, "logs/hook-execution.jsonl"),
  3,
);
if (hookLog.length) {
  out("## Recent hook runs");
  for (const e of hookLog) {
    const status = e.status === "ok" ? "OK" : e.status.toUpperCase();
    out(
      `  ${e.timestamp || "?"} [${status}] ${e.event}/${e.hookId} (${e.durationMs || 0}ms)`,
    );
  }
  out("");
}

process.stdout.write(lines.join("\n") + "\n");
process.exit(0);
