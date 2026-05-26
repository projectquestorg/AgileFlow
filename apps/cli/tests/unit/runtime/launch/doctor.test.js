/**
 * Unit tests for `doctor.js`. Every check is exercised in isolation with
 * injected deps so no tmux process, prefs file, or registry file is
 * touched on disk.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import doctor from "../../../../src/runtime/launch/doctor.js";
import registry from "../../../../src/runtime/launch/session-registry.js";

const {
  parseTmuxVersion,
  compareVersions,
  checkTmuxInstalled,
  checkTmuxVersion,
  checkPrefsLoad,
  checkFallbackClisOnPath,
  checkRegistryLoads,
  checkStaleLockfile,
  checkOrphanWorktrees,
  runDoctorChecks,
  anyFailed,
  MIN_TMUX_VERSION,
} = doctor;

const { recordSession, registryPath } = registry;

describe("parseTmuxVersion", () => {
  it("parses standard releases like 'tmux 3.3a'", () => {
    expect(parseTmuxVersion("tmux 3.3a\n")).toEqual({ major: 3, minor: 3 });
  });
  it("parses two-digit minors", () => {
    expect(parseTmuxVersion("tmux 2.10")).toEqual({ major: 2, minor: 10 });
  });
  it("parses 'tmux next-3.4' style devs", () => {
    expect(parseTmuxVersion("tmux next-3.4")).toEqual({ major: 3, minor: 4 });
  });
  it("returns null when the shape doesn't match", () => {
    expect(parseTmuxVersion("")).toBeNull();
    expect(parseTmuxVersion("nope")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("orders by major then minor", () => {
    expect(
      compareVersions({ major: 1, minor: 0 }, { major: 2, minor: 0 }),
    ).toBeLessThan(0);
    expect(
      compareVersions({ major: 2, minor: 1 }, { major: 2, minor: 1 }),
    ).toBe(0);
    expect(
      compareVersions({ major: 3, minor: 0 }, { major: 2, minor: 9 }),
    ).toBeGreaterThan(0);
  });
});

describe("checkTmuxInstalled", () => {
  it("passes when commandExists returns true", () => {
    const r = checkTmuxInstalled({ commandExists: () => true });
    expect(r.status).toBe("pass");
  });
  it("fails with a fix hint when tmux is missing", () => {
    const r = checkTmuxInstalled({ commandExists: () => false });
    expect(r.status).toBe("fail");
    expect(r.fix).toMatch(/install tmux/i);
  });
});

describe("checkTmuxVersion", () => {
  function runnerFor(stdout) {
    return {
      runSync: vi.fn(() => ({ status: 0, stdout, stderr: "", error: null })),
      runAttach: vi.fn(),
    };
  }
  it("skips with warn when tmux is not installed", () => {
    const r = checkTmuxVersion({ commandExists: () => false });
    expect(r.status).toBe("warn");
  });
  it("fails when the version is below the minimum", () => {
    const r = checkTmuxVersion({
      commandExists: () => true,
      runner: runnerFor("tmux 1.8"),
    });
    expect(r.status).toBe("fail");
    expect(r.message).toMatch(/older than/i);
  });
  it("passes at the minimum version", () => {
    const r = checkTmuxVersion({
      commandExists: () => true,
      runner: runnerFor(
        `tmux ${MIN_TMUX_VERSION.major}.${MIN_TMUX_VERSION.minor}`,
      ),
    });
    expect(r.status).toBe("pass");
  });
  it("warns when output is unparseable", () => {
    const r = checkTmuxVersion({
      commandExists: () => true,
      runner: runnerFor(""),
    });
    expect(r.status).toBe("warn");
  });
});

describe("checkPrefsLoad", () => {
  it("warns when prefs come from defaults (no file yet)", async () => {
    const loadImpl = async () => ({
      prefs: {},
      source: "defaults",
      path: "/x",
    });
    const r = await checkPrefsLoad({ loadPrefsImpl: loadImpl });
    expect(r.status).toBe("warn");
    expect(r.fix).toMatch(/run `agileflow launch setup`/);
  });
  it("passes when prefs are loaded from a file", async () => {
    const loadImpl = async () => ({
      prefs: {},
      source: "file",
      path: "/some/path",
    });
    const r = await checkPrefsLoad({ loadPrefsImpl: loadImpl });
    expect(r.status).toBe("pass");
    expect(r.message).toContain("/some/path");
  });
  it("fails when prefs load throws", async () => {
    const loadImpl = async () => {
      throw new Error("malformed JSON");
    };
    const r = await checkPrefsLoad({ loadPrefsImpl: loadImpl });
    expect(r.status).toBe("fail");
    expect(r.message).toMatch(/malformed JSON/);
  });
});

describe("checkFallbackClisOnPath", () => {
  const prefsWithOrder = (preferred, order) => async () => ({
    prefs: {
      cli: { preferred, fallbackOrder: order },
    },
    source: "file",
    path: "/x",
  });
  it("passes when every fallback CLI exists", async () => {
    const r = await checkFallbackClisOnPath({
      loadPrefsImpl: prefsWithOrder("claude", ["claude", "codex"]),
      commandExists: () => true,
    });
    expect(r.status).toBe("pass");
  });
  it("warns when only non-preferred CLIs are missing", async () => {
    const r = await checkFallbackClisOnPath({
      loadPrefsImpl: prefsWithOrder("claude", ["claude", "codex"]),
      commandExists: (n) => n === "claude",
    });
    expect(r.status).toBe("warn");
    expect(r.message).toMatch(/codex/);
  });
  it("fails when the preferred CLI is missing", async () => {
    const r = await checkFallbackClisOnPath({
      loadPrefsImpl: prefsWithOrder("claude", ["claude", "codex"]),
      commandExists: (n) => n === "codex",
    });
    expect(r.status).toBe("fail");
    expect(r.message).toMatch(/claude/);
  });
  it("warns (skipped) when prefs are unreadable", async () => {
    const r = await checkFallbackClisOnPath({
      loadPrefsImpl: async () => {
        throw new Error("boom");
      },
      commandExists: () => true,
    });
    expect(r.status).toBe("warn");
    expect(r.message).toMatch(/skipped/i);
  });
});

describe("checkRegistryLoads", () => {
  /** @type {string} */
  let scratch;
  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "af-doctor-"));
  });
  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("passes when no registry file exists", () => {
    const r = checkRegistryLoads({ home: scratch });
    expect(r.status).toBe("pass");
    expect(r.message).toMatch(/no registry yet/);
  });
  it("passes for a clean registry", () => {
    recordSession({ name: "a", cli: "claude", cwd: "/a", uuid: null }, scratch);
    const r = checkRegistryLoads({ home: scratch });
    expect(r.status).toBe("pass");
    expect(r.message).toMatch(/1 session/);
  });
  it("fails when the file is not valid JSON", () => {
    const file = registryPath(scratch);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ not json");
    const r = checkRegistryLoads({ home: scratch });
    expect(r.status).toBe("fail");
    expect(r.fix).toMatch(/fix the JSON/);
  });
  it("warns when entries are silently filtered as malformed", () => {
    const file = registryPath(scratch);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        sessions: [
          { name: "good", cli: "claude", cwd: "/a" },
          { name: "bad-no-cli", cwd: "/b" },
        ],
      }),
    );
    const r = checkRegistryLoads({ home: scratch });
    expect(r.status).toBe("warn");
    expect(r.message).toMatch(/rejected as malformed/);
  });
});

describe("checkStaleLockfile", () => {
  /** @type {string} */
  let scratch;
  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "af-lock-"));
  });
  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("passes when no lockfile exists", () => {
    const r = checkStaleLockfile({ home: scratch });
    expect(r.status).toBe("pass");
  });
  it("passes for a fresh lockfile", () => {
    const lock = registryPath(scratch) + ".lock";
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    fs.writeFileSync(lock, "");
    const r = checkStaleLockfile({
      home: scratch,
      now: () => Date.now(),
    });
    expect(r.status).toBe("pass");
  });
  it("warns for a stale lockfile", () => {
    const lock = registryPath(scratch) + ".lock";
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    fs.writeFileSync(lock, "");
    const realMtime = fs.statSync(lock).mtimeMs;
    const r = checkStaleLockfile({
      home: scratch,
      now: () => realMtime + 60_000,
    });
    expect(r.status).toBe("warn");
    expect(r.message).toMatch(/stale/);
  });
});

describe("checkOrphanWorktrees", () => {
  /** @type {string} */
  let scratch;
  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "af-orphan-"));
  });
  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("passes when no entries have worktrees", () => {
    recordSession({ name: "a", cli: "claude", cwd: "/a", uuid: null }, scratch);
    const r = checkOrphanWorktrees({ home: scratch, existsSync: () => true });
    expect(r.status).toBe("pass");
  });
  it("warns when a registered worktree path is missing", () => {
    recordSession(
      {
        name: "a",
        cli: "claude",
        cwd: "/a",
        uuid: null,
        worktree: { path: "/gone", branch: "feat", base: "main" },
      },
      scratch,
    );
    const r = checkOrphanWorktrees({
      home: scratch,
      existsSync: (p) => p !== "/gone",
    });
    expect(r.status).toBe("warn");
    expect(r.fix).toMatch(/prune/);
  });
});

describe("runDoctorChecks", () => {
  it("returns the seven checks in stable order", async () => {
    const deps = {
      commandExists: () => true,
      runner: {
        runSync: () => ({
          status: 0,
          stdout: "tmux 3.3a",
          stderr: "",
          error: null,
        }),
        runAttach: vi.fn(),
      },
      loadPrefsImpl: async () => ({
        prefs: { cli: { preferred: "claude", fallbackOrder: ["claude"] } },
        source: "file",
        path: "/x",
      }),
      existsSync: () => false,
      home: fs.mkdtempSync(path.join(os.tmpdir(), "af-doc-")),
    };
    const report = await runDoctorChecks(deps);
    const ids = report.checks.map((c) => c.id);
    expect(ids).toEqual([
      "tmux-installed",
      "tmux-version",
      "prefs-load",
      "cli-on-path",
      "registry-load",
      "stale-lockfile",
      "orphan-worktrees",
    ]);
    fs.rmSync(deps.home, { recursive: true, force: true });
  });
});

describe("anyFailed", () => {
  it("returns true when any check failed", () => {
    expect(
      anyFailed({
        checks: [
          { id: "x", status: "pass", message: "" },
          { id: "y", status: "fail", message: "" },
        ],
      }),
    ).toBe(true);
  });
  it("returns false on all-pass", () => {
    expect(
      anyFailed({
        checks: [{ id: "x", status: "pass", message: "" }],
      }),
    ).toBe(false);
  });
  it("returns false when only warnings are present", () => {
    expect(
      anyFailed({
        checks: [{ id: "x", status: "warn", message: "" }],
      }),
    ).toBe(false);
  });
});
