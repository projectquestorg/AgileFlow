#!/usr/bin/env node
/**
 * Core hook: damage-control-bash (PreToolUse, matcher: Bash).
 *
 * Reads damage-control-patterns.yaml and rejects Bash commands that
 * match an `error`-severity pattern of kind `bash`. `warn`-severity
 * patterns log but do not block.
 *
 * Stdin payload (Claude Code-shaped):
 *   { tool_name: "Bash", tool_input: { command: "...", description: "..." } }
 *
 * Exit codes:
 *   0  allow (default)
 *   2  block (Claude Code surfaces stderr to the user)
 */
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const patternsPath = path.join(
  projectDir,
  ".agileflow/plugins/core/hooks/damage-control-patterns.yaml",
);

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0); // No payload, nothing to gate.
  }
  const command =
    payload &&
    payload.tool_input &&
    typeof payload.tool_input.command === "string"
      ? payload.tool_input.command
      : "";
  if (!command) process.exit(0);

  let patterns = [];
  try {
    const parsed = yaml.load(fs.readFileSync(patternsPath, "utf8"));
    patterns = Array.isArray(parsed && parsed.patterns) ? parsed.patterns : [];
  } catch {
    process.exit(0); // No patterns file, fail open.
  }

  for (const p of patterns) {
    if (p.kind !== "bash") continue;
    let re;
    try {
      re = new RegExp(p.regex, "i");
    } catch {
      continue;
    }
    if (re.test(command)) {
      if (p.severity === "error") {
        process.stderr.write(
          `agileflow damage-control: BLOCKED — ${p.reason}\n  pattern: ${p.regex}\n  command: ${command.slice(0, 200)}\n`,
        );
        process.exit(2);
      }
      // severity: warn — log, do not block
      process.stderr.write(`agileflow damage-control: WARN — ${p.reason}\n`);
    }
  }
  process.exit(0);
}

main().catch(() => process.exit(0));
