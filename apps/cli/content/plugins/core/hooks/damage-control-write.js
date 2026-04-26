#!/usr/bin/env node
/**
 * Core hook: damage-control-write (PreToolUse, matcher: Write).
 *
 * Mirror of damage-control-edit.js for the Write tool. Same patterns
 * file (kind: write entries). Blocks writing system credential files,
 * warns on writes to .ssh/ and .env*.
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
  } catch {
    process.exit(0);
  }

  for (const p of patterns) {
    if (p.kind !== "write") continue;
    let re;
    try {
      re = new RegExp(p.regex, "i");
    } catch {
      continue;
    }
    if (re.test(filePath)) {
      if (p.severity === "error") {
        process.stderr.write(
          `agileflow damage-control: BLOCKED write — ${p.reason}\n  path: ${filePath}\n`,
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
