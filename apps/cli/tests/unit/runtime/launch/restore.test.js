/**
 * Unit tests for the bulk-restore orchestrator. Uses an injected tmux
 * runner + fs stub so no real tmux daemon or filesystem is touched.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import restoreModule from "../../../../src/runtime/launch/restore.js";
import registryModule from "../../../../src/runtime/launch/session-registry.js";

const { runRestore } = restoreModule;
const { recordSession } = registryModule;

const basePrefs = {
  version: /** @type {1} */ (1),
  cli: { preferred: "claude", fallbackOrder: ["claude"] },
  tmux: { enabled: true, statusPosition: "bottom" },
  keybinds: { preset: "none" },
  aliases: { af: { enabled: false } },
  pinned: [],
};

function queuedRunner() {
  const calls = [];
  // Track has-session probes per name so each name gets a determined
  // answer rather than burning through a queue. Default to "not alive"
  // (status 1) — restore.js calls sessionExists once per registry
  // entry to decide whether to skip it.
  const aliveSet = new Set();
  return {
    calls,
    setAlive(name) {
      aliveSet.add(name);
    },
    runSync(args) {
      calls.push(args);
      if (args[0] === "has-session") {
        // -t =<name>
        const target = args[2] || "";
        const name = target.startsWith("=") ? target.slice(1) : target;
        return {
          status: aliveSet.has(name) ? 0 : 1,
          stdout: "",
          stderr: "",
          error: null,
        };
      }
      // new-session and set-option both succeed in the default runner.
      return { status: 0, stdout: "", stderr: "", error: null };
    },
    runAttach: vi.fn(),
  };
}

describe("runRestore", () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "af-restore-"));
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("creates one tmux session per registry entry, invoking the agileflow __exec wrapper", () => {
    recordSession(
      { name: "claude-app", cli: "claude", cwd: "/cwd-a", uuid: null },
      scratch,
    );
    recordSession(
      { name: "codex-blog", cli: "codex", cwd: "/cwd-b", uuid: null },
      scratch,
    );
    const runner = queuedRunner();
    const result = runRestore({
      prefs: basePrefs,
      runner,
      home: scratch,
      agileflowBin: "/usr/bin/agileflow",
      existsSync: () => true,
      log: () => {},
    });
    expect(result.restored).toBe(2);
    expect(result.alreadyAlive).toBe(0);
    expect(result.failed).toBe(0);

    // Each new-session call must spawn the wrapper, not the raw CLI.
    const news = runner.calls.filter((c) => c[0] === "new-session");
    expect(news).toHaveLength(2);
    for (const c of news) {
      // tmux args: new-session -d -s <name> -c <cwd> <bin> launch __exec <name>
      const binIdx = c.indexOf("-c") + 2;
      expect(c[binIdx]).toBe("/usr/bin/agileflow");
      expect(c[binIdx + 1]).toBe("launch");
      expect(c[binIdx + 2]).toBe("__exec");
      // Last positional should be the session name.
      expect(c[binIdx + 3]).toBe(c[3]); // c[3] is the -s name
    }
  });

  it("skips sessions that are already alive on the server", () => {
    recordSession(
      { name: "claude-app", cli: "claude", cwd: "/cwd-a", uuid: null },
      scratch,
    );
    const runner = queuedRunner();
    runner.setAlive("claude-app");
    const result = runRestore({
      prefs: basePrefs,
      runner,
      home: scratch,
      agileflowBin: "/usr/bin/agileflow",
      existsSync: () => true,
      log: () => {},
    });
    expect(result.restored).toBe(0);
    expect(result.alreadyAlive).toBe(1);
    expect(runner.calls.find((c) => c[0] === "new-session")).toBeUndefined();
  });

  it("skips sessions whose cwd no longer exists", () => {
    recordSession(
      { name: "claude-gone", cli: "claude", cwd: "/missing", uuid: null },
      scratch,
    );
    const runner = queuedRunner();
    const result = runRestore({
      prefs: basePrefs,
      runner,
      home: scratch,
      agileflowBin: "/usr/bin/agileflow",
      existsSync: (p) => p !== "/missing",
      log: () => {},
    });
    expect(result.restored).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.notes[0].reason).toMatch(/cwd no longer exists/);
  });

  it("counts failures when tmux new-session returns non-zero", () => {
    recordSession(
      { name: "claude-app", cli: "claude", cwd: "/cwd-a", uuid: null },
      scratch,
    );
    const calls = [];
    const runner = {
      calls,
      runSync(args) {
        calls.push(args);
        if (args[0] === "has-session")
          return { status: 1, stdout: "", stderr: "", error: null };
        // new-session fails
        return {
          status: 1,
          stdout: "",
          stderr: "no server running",
          error: null,
        };
      },
      runAttach: vi.fn(),
    };
    const result = runRestore({
      prefs: basePrefs,
      runner,
      home: scratch,
      agileflowBin: "/usr/bin/agileflow",
      existsSync: () => true,
      log: () => {},
    });
    expect(result.failed).toBe(1);
    expect(result.restored).toBe(0);
    expect(result.notes[0].reason).toMatch(/no server running/);
  });

  it("onlyNames restores a subset of entries by name in one call", () => {
    recordSession(
      { name: "claude-a", cli: "claude", cwd: "/a", uuid: null },
      scratch,
    );
    recordSession(
      { name: "claude-b", cli: "claude", cwd: "/b", uuid: null },
      scratch,
    );
    recordSession(
      { name: "claude-c", cli: "claude", cwd: "/c", uuid: null },
      scratch,
    );
    const runner = queuedRunner();
    const result = runRestore({
      prefs: basePrefs,
      runner,
      home: scratch,
      agileflowBin: "/usr/bin/agileflow",
      existsSync: () => true,
      log: () => {},
      onlyNames: ["claude-a", "claude-c"],
    });
    expect(result.restored).toBe(2);
    const news = runner.calls
      .filter((c) => c[0] === "new-session")
      .map((c) => c[3])
      .sort();
    expect(news).toEqual(["claude-a", "claude-c"]);
  });

  it("onlyNames with an empty array restores nothing", () => {
    recordSession(
      { name: "claude-a", cli: "claude", cwd: "/a", uuid: null },
      scratch,
    );
    const runner = queuedRunner();
    const result = runRestore({
      prefs: basePrefs,
      runner,
      home: scratch,
      agileflowBin: "/usr/bin/agileflow",
      existsSync: () => true,
      log: () => {},
      onlyNames: [],
    });
    expect(result.restored).toBe(0);
    expect(runner.calls.find((c) => c[0] === "new-session")).toBeUndefined();
  });

  it("onlyName restores a single entry from a multi-entry registry", () => {
    recordSession(
      { name: "claude-a", cli: "claude", cwd: "/a", uuid: null },
      scratch,
    );
    recordSession(
      { name: "claude-b", cli: "claude", cwd: "/b", uuid: null },
      scratch,
    );
    const runner = queuedRunner();
    const result = runRestore({
      prefs: basePrefs,
      runner,
      home: scratch,
      agileflowBin: "/usr/bin/agileflow",
      existsSync: () => true,
      log: () => {},
      onlyName: "claude-b",
    });
    expect(result.restored).toBe(1);
    const news = runner.calls.filter((c) => c[0] === "new-session");
    expect(news).toHaveLength(1);
    expect(news[0][3]).toBe("claude-b");
  });

  it("returns zeros when the registry is empty", () => {
    const runner = queuedRunner();
    const result = runRestore({
      prefs: basePrefs,
      runner,
      home: scratch,
      agileflowBin: "/usr/bin/agileflow",
      existsSync: () => true,
      log: () => {},
    });
    expect(result).toMatchObject({
      restored: 0,
      alreadyAlive: 0,
      skipped: 0,
      failed: 0,
    });
  });
});
