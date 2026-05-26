/**
 * Unit tests for `session-lifecycle.js`. Uses a temp HOME so the real
 * registry never gets touched, and injectable deps so no tmux / git
 * process is spawned.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import lifecycle from "../../../../src/runtime/launch/session-lifecycle.js";
import registry from "../../../../src/runtime/launch/session-registry.js";

const {
  listSessions,
  killBySessionName,
  attachByName,
  pruneCandidates,
  applyPrune,
} = lifecycle;
const { recordSession, findSession, loadRegistry } = registry;

/**
 * Build a runner that records calls for assertion. Doesn't actually run
 * anything — `sessionExistsFn` is what callers inject for tmux lookups.
 */
function silentRunner() {
  return {
    calls: /** @type {Array<string[]>} */ ([]),
    runSync(args) {
      this.calls.push(args);
      return { status: 0, stdout: "", stderr: "", error: null };
    },
    runAttach: vi.fn(async () => ({ exitCode: 0, signal: null })),
  };
}

describe("session-lifecycle", () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "af-lifecycle-"));
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  describe("listSessions", () => {
    it("classifies entries as alive / dormant / missing-cwd", () => {
      recordSession(
        { name: "alive-one", cli: "claude", cwd: "/exists/a", uuid: null },
        scratch,
      );
      recordSession(
        { name: "dormant-one", cli: "claude", cwd: "/exists/b", uuid: null },
        scratch,
      );
      recordSession(
        { name: "gone-one", cli: "codex", cwd: "/gone/c", uuid: null },
        scratch,
      );
      const sessionExistsFn = (name) => name === "alive-one";
      const existsSync = (p) => p === "/exists/a" || p === "/exists/b";
      const rows = listSessions({
        home: scratch,
        runner: silentRunner(),
        sessionExistsFn,
        existsSync,
      });
      const byName = Object.fromEntries(rows.map((r) => [r.name, r.state]));
      expect(byName["alive-one"]).toBe("alive");
      expect(byName["dormant-one"]).toBe("dormant");
      expect(byName["gone-one"]).toBe("missing-cwd");
    });

    it("returns an empty array when the registry is empty", () => {
      const rows = listSessions({
        home: scratch,
        runner: silentRunner(),
        sessionExistsFn: () => false,
        existsSync: () => true,
      });
      expect(rows).toEqual([]);
    });
  });

  describe("killBySessionName", () => {
    it("returns ok:false when the session isn't in the registry", () => {
      const result = killBySessionName({
        name: "nope",
        home: scratch,
        runner: silentRunner(),
        sessionExistsFn: () => false,
        killSessionFn: () => true,
        existsSync: () => true,
      });
      expect(result).toEqual({ ok: false, reason: "not in registry" });
    });

    it("kills the alive session, forgets the entry, returns wasAlive:true", () => {
      recordSession(
        { name: "live", cli: "claude", cwd: "/exists", uuid: null },
        scratch,
      );
      const killFn = vi.fn(() => true);
      const result = killBySessionName({
        name: "live",
        home: scratch,
        runner: silentRunner(),
        sessionExistsFn: () => true,
        killSessionFn: killFn,
        existsSync: () => false,
      });
      expect(result).toEqual({
        ok: true,
        wasAlive: true,
        worktree: null,
      });
      expect(killFn).toHaveBeenCalledWith("live", expect.any(Object));
      expect(findSession("live", scratch)).toBeNull();
    });

    it("forgets dormant entries without calling killSession", () => {
      recordSession(
        { name: "dormant", cli: "claude", cwd: "/exists", uuid: null },
        scratch,
      );
      const killFn = vi.fn();
      const result = killBySessionName({
        name: "dormant",
        home: scratch,
        runner: silentRunner(),
        sessionExistsFn: () => false,
        killSessionFn: killFn,
        existsSync: () => false,
      });
      expect(result.wasAlive).toBe(false);
      expect(killFn).not.toHaveBeenCalled();
      expect(findSession("dormant", scratch)).toBeNull();
    });

    it("removes the worktree when flag set and path exists", () => {
      recordSession(
        {
          name: "wt",
          cli: "claude",
          cwd: "/wt",
          uuid: null,
          worktree: { path: "/wt", branch: "feat", base: "main" },
        },
        scratch,
      );
      const removeWt = vi.fn(() => ({
        removed: true,
        branchRemoved: true,
        stderr: "",
      }));
      const result = killBySessionName({
        name: "wt",
        removeWorktree: true,
        home: scratch,
        runner: silentRunner(),
        sessionExistsFn: () => false,
        killSessionFn: () => true,
        removeWorktreeFn: removeWt,
        existsSync: () => true,
      });
      expect(removeWt).toHaveBeenCalledWith({ path: "/wt", branch: "feat" });
      expect(result.worktree).toEqual({
        removed: true,
        branchRemoved: true,
        stderr: "",
      });
    });

    it("skips worktree removal when the path no longer exists", () => {
      recordSession(
        {
          name: "wt",
          cli: "claude",
          cwd: "/wt",
          uuid: null,
          worktree: { path: "/gone-wt", branch: "feat", base: "main" },
        },
        scratch,
      );
      const removeWt = vi.fn();
      const result = killBySessionName({
        name: "wt",
        removeWorktree: true,
        home: scratch,
        runner: silentRunner(),
        sessionExistsFn: () => false,
        killSessionFn: () => true,
        removeWorktreeFn: removeWt,
        existsSync: () => false,
      });
      expect(removeWt).not.toHaveBeenCalled();
      expect(result.worktree).toBeNull();
    });

    it("skips worktree removal when the flag is false even if the path exists", () => {
      recordSession(
        {
          name: "wt",
          cli: "claude",
          cwd: "/wt",
          uuid: null,
          worktree: { path: "/wt", branch: "feat", base: "main" },
        },
        scratch,
      );
      const removeWt = vi.fn();
      killBySessionName({
        name: "wt",
        removeWorktree: false,
        home: scratch,
        runner: silentRunner(),
        sessionExistsFn: () => false,
        killSessionFn: () => true,
        removeWorktreeFn: removeWt,
        existsSync: () => true,
      });
      expect(removeWt).not.toHaveBeenCalled();
    });
  });

  describe("attachByName", () => {
    const basePrefs = {
      version: 1,
      cli: { preferred: "claude", fallbackOrder: ["claude"] },
      tmux: { enabled: true, statusPosition: "bottom" },
      keybinds: { preset: "minimal" },
      aliases: { af: { enabled: false } },
      pinned: [],
    };

    it("returns ok:false when the session isn't in the registry", async () => {
      const result = await attachByName({
        name: "nope",
        home: scratch,
        prefs: basePrefs,
        sessionExistsFn: () => false,
        attachSessionFn: vi.fn(),
        runRestoreImpl: vi.fn(),
        existsSync: () => true,
      });
      expect(result).toEqual({ ok: false, reason: "not in registry" });
    });

    it("returns cwd-missing without attaching when the cwd is gone", async () => {
      recordSession(
        { name: "gone", cli: "claude", cwd: "/gone", uuid: null },
        scratch,
      );
      const attachFn = vi.fn();
      const restoreFn = vi.fn();
      const result = await attachByName({
        name: "gone",
        home: scratch,
        prefs: basePrefs,
        sessionExistsFn: () => false,
        attachSessionFn: attachFn,
        runRestoreImpl: restoreFn,
        existsSync: () => false,
      });
      expect(result).toEqual({ ok: false, reason: "cwd missing" });
      expect(attachFn).not.toHaveBeenCalled();
      expect(restoreFn).not.toHaveBeenCalled();
    });

    it("attaches directly when the session is already alive", async () => {
      recordSession(
        { name: "live", cli: "claude", cwd: "/exists", uuid: null },
        scratch,
      );
      const attachFn = vi.fn(async () => ({ exitCode: 0, signal: null }));
      const restoreFn = vi.fn();
      const result = await attachByName({
        name: "live",
        home: scratch,
        prefs: basePrefs,
        sessionExistsFn: () => true,
        attachSessionFn: attachFn,
        runRestoreImpl: restoreFn,
        existsSync: () => true,
      });
      expect(result.ok).toBe(true);
      expect(result.restored).toBe(false);
      expect(restoreFn).not.toHaveBeenCalled();
      expect(attachFn).toHaveBeenCalledWith("live", expect.any(Object));
    });

    it("restores then attaches when the session is dormant", async () => {
      recordSession(
        { name: "dorm", cli: "claude", cwd: "/exists", uuid: null },
        scratch,
      );
      const attachFn = vi.fn(async () => ({ exitCode: 0, signal: null }));
      const restoreFn = vi.fn(() => ({
        restored: 1,
        alreadyAlive: 0,
        skipped: 0,
        failed: 0,
        notes: [],
      }));
      const result = await attachByName({
        name: "dorm",
        home: scratch,
        prefs: basePrefs,
        sessionExistsFn: () => false,
        attachSessionFn: attachFn,
        runRestoreImpl: restoreFn,
        existsSync: () => true,
      });
      expect(restoreFn).toHaveBeenCalledWith(
        expect.objectContaining({ onlyName: "dorm" }),
      );
      expect(result.ok).toBe(true);
      expect(result.restored).toBe(true);
      expect(attachFn).toHaveBeenCalled();
    });

    it("returns could-not-restore when runRestore reports zero restored", async () => {
      recordSession(
        { name: "broken", cli: "claude", cwd: "/exists", uuid: null },
        scratch,
      );
      const restoreFn = vi.fn(() => ({
        restored: 0,
        alreadyAlive: 0,
        skipped: 0,
        failed: 1,
        notes: [{ name: "broken", reason: "tmux refused" }],
      }));
      const attachFn = vi.fn();
      const result = await attachByName({
        name: "broken",
        home: scratch,
        prefs: basePrefs,
        sessionExistsFn: () => false,
        attachSessionFn: attachFn,
        runRestoreImpl: restoreFn,
        existsSync: () => true,
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("could not restore");
      expect(result.notes).toEqual([
        { name: "broken", reason: "tmux refused" },
      ]);
      expect(attachFn).not.toHaveBeenCalled();
    });
  });

  describe("pruneCandidates", () => {
    it("returns only dormant entries with missing cwd or missing worktree dir", () => {
      recordSession(
        { name: "live", cli: "claude", cwd: "/exists/live", uuid: null },
        scratch,
      );
      recordSession(
        {
          name: "dormant-live-cwd",
          cli: "claude",
          cwd: "/exists/keep",
          uuid: null,
        },
        scratch,
      );
      recordSession(
        { name: "dormant-no-cwd", cli: "claude", cwd: "/gone", uuid: null },
        scratch,
      );
      recordSession(
        {
          name: "wt-gone",
          cli: "claude",
          cwd: "/exists/wt",
          uuid: null,
          worktree: { path: "/gone-wt", branch: "x", base: "main" },
        },
        scratch,
      );
      const exists = (p) =>
        p === "/exists/live" || p === "/exists/keep" || p === "/exists/wt";
      const sessionExistsFn = (n) => n === "live";
      const candidates = pruneCandidates({
        home: scratch,
        runner: silentRunner(),
        sessionExistsFn,
        existsSync: exists,
      });
      const names = candidates.map((c) => c.name).sort();
      expect(names).toEqual(["dormant-no-cwd", "wt-gone"]);
      // Keeps the reason field for the CLI to render.
      const map = Object.fromEntries(candidates.map((c) => [c.name, c.reason]));
      expect(map["dormant-no-cwd"]).toMatch(/cwd missing/);
      expect(map["wt-gone"]).toMatch(/worktree dir missing/);
    });

    it("never surfaces pinned sessions, even when their cwd is missing", () => {
      recordSession(
        {
          name: "pinned-no-cwd",
          cli: "claude",
          cwd: "/gone",
          uuid: null,
          pinned: true,
        },
        scratch,
      );
      recordSession(
        {
          name: "regular-no-cwd",
          cli: "claude",
          cwd: "/also-gone",
          uuid: null,
        },
        scratch,
      );
      const candidates = pruneCandidates({
        home: scratch,
        runner: silentRunner(),
        sessionExistsFn: () => false,
        existsSync: () => false,
      });
      const names = candidates.map((c) => c.name);
      expect(names).toEqual(["regular-no-cwd"]);
    });

    it("never surfaces alive sessions", () => {
      recordSession(
        {
          name: "alive-broken-wt",
          cli: "claude",
          cwd: "/exists",
          uuid: null,
          worktree: { path: "/gone", branch: "x", base: "main" },
        },
        scratch,
      );
      const candidates = pruneCandidates({
        home: scratch,
        runner: silentRunner(),
        sessionExistsFn: () => true,
        existsSync: (p) => p === "/exists",
      });
      expect(candidates).toEqual([]);
    });
  });

  describe("applyPrune", () => {
    it("forgets each selected entry; tolerates missing entries from concurrent prune", () => {
      recordSession(
        { name: "a", cli: "claude", cwd: "/a", uuid: null },
        scratch,
      );
      recordSession(
        { name: "b", cli: "claude", cwd: "/b", uuid: null },
        scratch,
      );
      const result = applyPrune({
        selections: [{ name: "a" }, { name: "ghost" }, { name: "b" }],
        home: scratch,
        existsSync: () => false,
      });
      // ghost was never in the registry; forgets a and b only.
      expect(result.forgotten).toBe(2);
      expect(result.errors).toEqual([]);
      expect(loadRegistry(scratch).sessions).toEqual([]);
    });

    it("removes the worktree when removeWorktrees=true and the dir still exists", () => {
      recordSession(
        {
          name: "wt",
          cli: "claude",
          cwd: "/wt",
          uuid: null,
          worktree: { path: "/wt", branch: "feat", base: "main" },
        },
        scratch,
      );
      const removeWt = vi.fn(() => ({
        removed: true,
        branchRemoved: true,
        stderr: "",
      }));
      const result = applyPrune({
        selections: [{ name: "wt" }],
        removeWorktrees: true,
        home: scratch,
        removeWorktreeFn: removeWt,
        existsSync: () => true,
      });
      expect(removeWt).toHaveBeenCalledWith({ path: "/wt", branch: "feat" });
      expect(result.worktreesRemoved).toBe(1);
      expect(result.forgotten).toBe(1);
    });

    it("does not call removeWorktree when removeWorktrees=false", () => {
      recordSession(
        {
          name: "wt",
          cli: "claude",
          cwd: "/wt",
          uuid: null,
          worktree: { path: "/wt", branch: "feat", base: "main" },
        },
        scratch,
      );
      const removeWt = vi.fn();
      applyPrune({
        selections: [{ name: "wt" }],
        removeWorktrees: false,
        home: scratch,
        removeWorktreeFn: removeWt,
        existsSync: () => true,
      });
      expect(removeWt).not.toHaveBeenCalled();
    });
  });
});
