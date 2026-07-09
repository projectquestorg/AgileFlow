/**
 * Integration tests for the `agileflow hook <event>` dispatcher.
 *
 * The dispatcher calls `process.exit()`, so it is exercised as a real
 * child process. Each test builds a scratch project with a hook-manifest
 * that points at a tiny hook script, spawns the CLI with
 * CLAUDE_PROJECT_DIR set to the scratch dir, and inspects the
 * dispatcher's OWN stdout — which must carry the Claude Code context
 * envelope for context-capable events and nothing for others.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const cliBin = path.join(here, "..", "..", "bin", "agileflow.js");

/**
 * Spawn the dispatcher and capture its stdout/stderr/exit code.
 * @param {string[]} args
 * @param {{ cwd: string, projectDir: string, stdin?: string }} opts
 * @returns {Promise<{ code: number|null, stdout: string, stderr: string }>}
 */
function runDispatcher(args, opts) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliBin, ...args], {
      cwd: opts.cwd,
      env: { ...process.env, CLAUDE_PROJECT_DIR: opts.projectDir },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(opts.stdin ?? "{}");
  });
}

/**
 * Write a manifest + hook scripts into a scratch project.
 * @param {string} scratch
 * @param {object} manifest
 * @param {Record<string, string>} scripts - relative path -> file body
 */
function seedProject(scratch, manifest, scripts) {
  const agileflowDir = path.join(scratch, ".agileflow");
  fs.mkdirSync(agileflowDir, { recursive: true });
  fs.writeFileSync(
    path.join(agileflowDir, "hook-manifest.yaml"),
    yaml.dump(manifest),
    "utf8",
  );
  for (const [rel, body] of Object.entries(scripts)) {
    const abs = path.join(scratch, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, "utf8");
  }
}

describe("hook dispatcher context envelope", () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "af-hook-disp-"));
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("emits a single JSON context line for SessionStart carrying the hooks' stdout", async () => {
    seedProject(
      scratch,
      {
        version: 1,
        hooks: [
          {
            id: "ctx-a",
            event: "SessionStart",
            script: "hooks/a.js",
            timeout: 5000,
          },
          {
            id: "ctx-b",
            event: "SessionStart",
            script: "hooks/b.js",
            timeout: 5000,
            runAfter: ["ctx-a"],
          },
        ],
      },
      {
        "hooks/a.js": 'process.stdout.write("first block\\n");\n',
        "hooks/b.js": 'process.stdout.write("second block\\n");\n',
      },
    );

    const res = await runDispatcher(["hook", "SessionStart"], {
      cwd: scratch,
      projectDir: scratch,
    });

    expect(res.code).toBe(0);

    const lines = res.stdout.split("\n").filter((l) => l.trim() !== "");
    expect(lines).toHaveLength(1);

    const envelope = JSON.parse(lines[0]);
    expect(envelope.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(envelope.hookSpecificOutput.additionalContext).toBe(
      "first block\n\nsecond block",
    );
  });

  it("emits nothing to stdout for a non-context event (PreToolUse)", async () => {
    seedProject(
      scratch,
      {
        version: 1,
        hooks: [
          {
            id: "guard",
            event: "PreToolUse",
            matcher: "Bash",
            script: "hooks/guard.js",
            timeout: 5000,
            skipOnError: true,
          },
        ],
      },
      {
        // The hook itself writes to stdout — the dispatcher must NOT
        // forward it for a non-context event.
        "hooks/guard.js": 'process.stdout.write("should not leak\\n");\n',
      },
    );

    const res = await runDispatcher(
      ["hook", "PreToolUse", "--matcher", "Bash"],
      {
        cwd: scratch,
        projectDir: scratch,
      },
    );

    expect(res.code).toBe(0);
    expect(res.stdout).toBe("");
  });
});
