#!/usr/bin/env node
/**
 * Core hook: damage-control-edit (PreToolUse, matcher: Edit).
 *
 * Reads damage-control-patterns.yaml and rejects Edit operations whose
 * file_path matches an `error`-severity pattern of kind `edit`.
 *
 * Stdin payload:
 *   { tool_name: "Edit", tool_input: { file_path: "...", old_string, new_string } }
 *
 * Exit codes: 0 allow, 2 block.
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
    process.exit(0);
  }
  const filePath =
    payload &&
    payload.tool_input &&
    typeof payload.tool_input.file_path === "string"
      ? payload.tool_input.file_path
      : "";
  if (!filePath) process.exit(0);

  let patterns = [];
  try {
    const parsed = yaml.load(fs.readFileSync(patternsPath, "utf8"));
    patterns = Array.isArray(parsed && parsed.patterns) ? parsed.patterns : [];
  } catch (err) {
    process.stderr.write(
      `agileflow damage-control: WARNING — patterns file unreadable (${err.code || err.name}: ${patternsPath}). Edit safety guards are DISABLED until this is fixed.\n`,
    );
    process.exit(0);
  }

  for (const p of patterns) {
    if (p.kind !== "edit") continue;
    let re;
    try {
      re = new RegExp(p.regex, "i");
    } catch {
      continue;
    }
    if (re.test(filePath)) {
      if (p.severity === "error") {
        process.stderr.write(
          `agileflow damage-control: BLOCKED edit — ${p.reason}\n  path: ${filePath}\n`,
        );
        process.exit(2);
      }
      process.stderr.write(
        `agileflow damage-control: WARN — ${p.reason} (path: ${filePath})\n`,
      );
    }
  }
  process.exit(0);
}

main().catch(() => process.exit(0));
