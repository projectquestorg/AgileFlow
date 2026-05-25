/**
 * Unit tests for `runParallelSpawn` — the engine behind
 * `agileflow launch new [name]`. Uses an injected tmux runner so no real
 * tmux daemon is touched, and an injected `createWorktreeImpl` so the
 * worktree path doesn't shell out to git.
 */
import { describe, it, expect, vi } from "vitest";

import psModule from "../../../../src/runtime/launch/parallel-session.js";

const { runParallelSpawn, resolveSpawnDir } = psModule;

const basePrefs = {
  version: /** @type {1} */ (1),
  cli: { preferred: "claude", fallbackOrder: ["claude"] },
  tmux: { enabled: true, statusPosition: "bottom" },
  keybinds: { preset: "minimal" },
  aliases: { af: { enabled: false } },
  pinned: [],
};

function queuedRunner(handlers) {
  const calls = [];
  const queue = [...handlers];
  return {
    calls,
    runSync(args) {
      calls.push(args);
      const next = queue.shift();
      if (!next) return { status: 0, stdout: "", stderr: "", error: null };
      return { error: null, ...next };
    },
    runAttach: vi.fn(async () => ({ exitCode: 0, signal: null })),
  };
}

describe("resolveSpawnDir", () => {
  it("returns the input cwd when no name is supplied", () => {
    expect(resolveSpawnDir({ cwd: "/home/me/app" })).toEqual({
      cwd: "/home/me/app",
    });
  });

  it("calls createWorktree when a name is supplied and returns the worktree path", () => {
    const stub = vi.fn(() => ({
      path: "/home/me/app-feat1",
      branch: "feat1",
      base: "main",
    }));
    const result = resolveSpawnDir({
      name: "feat1",
      cwd: "/home/me/app",
      createWorktreeImpl: stub,
    });
    expect(stub).toHaveBeenCalledWith({ name: "feat1" });
    expect(result).toEqual({
      cwd: "/home/me/app-feat1",
      worktree: {
        path: "/home/me/app-feat1",
        branch: "feat1",
        base: "main",
      },
    });
  });
});

describe("runParallelSpawn — same-dir path", () => {
  it("picks a fresh session name, creates it detached, applies keybinds, switches client", async () => {
    const runner = queuedRunner([
      { status: 1, stdout: "", stderr: "" }, // has-session probe: free
      { status: 0, stdout: "", stderr: "" }, // new-session
      { status: 0, stdout: "", stderr: "" }, // set-option statusPosition
      // applyKeybindPreset issues unbinds + binds. Default queuedRunner
      // returns status 0 for unhandled calls, which is what we want.
      // (Final tmux call after applyKeybindPreset is the switch-client.)
    ]);
    const result = await runParallelSpawn({
      bin: "claude",
      prefs: basePrefs,
      cwd: "/home/me/app",
      runner,
      log: () => {},
    });
    expect(result.sessionName).toBe("claude-app");
    expect(result.cwd).toBe("/home/me/app");
    // The switch-client call must have happened.
    const sw = runner.calls.find((c) => c[0] === "switch-client");
    expect(sw).toEqual(["switch-client", "-t", "claude-app"]);
  });

  it("walks nextFreeSessionName when the canonical name is taken", async () => {
    const runner = queuedRunner([
      { status: 0, stdout: "", stderr: "" }, // probe(claude-app): TAKEN
      { status: 1, stdout: "", stderr: "" }, // probe(claude-app-2): free
      { status: 0, stdout: "", stderr: "" }, // new-session
      { status: 0, stdout: "", stderr: "" }, // set-option
      // applyKeybindPreset + switch-client land in unhandled-queue territory.
    ]);
    const result = await runParallelSpawn({
      bin: "claude",
      prefs: basePrefs,
      cwd: "/home/me/app",
      runner,
      log: () => {},
    });
    expect(result.sessionName).toBe("claude-app-2");
  });

  it("re-throws git spawn errors from createSession (TOCTOU)", async () => {
    const enoent = Object.assign(new Error("spawn tmux ENOENT"), {
      code: "ENOENT",
    });
    const runner = queuedRunner([
      { status: 1, stdout: "", stderr: "" }, // probe: free
      { status: 1, stdout: "", stderr: "", error: enoent }, // new-session: spawn failed
    ]);
    await expect(
      runParallelSpawn({
        bin: "claude",
        prefs: basePrefs,
        cwd: "/home/me/app",
        runner,
        log: () => {},
      }),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("throws ETMUX_CREATE when new-session returns non-zero AND no race-recovery is possible", async () => {
    const runner = queuedRunner([
      { status: 1, stdout: "", stderr: "" }, // nextFreeSessionName probe: free
      { status: 1, stdout: "", stderr: "tmux server died" }, // new-session fails
      { status: 1, stdout: "", stderr: "" }, // race-recovery probe: still not there
    ]);
    await expect(
      runParallelSpawn({
        bin: "claude",
        prefs: basePrefs,
        cwd: "/home/me/app",
        runner,
        log: () => {},
      }),
    ).rejects.toMatchObject({ code: "ETMUX_CREATE" });
  });

  it("throws ETMUX_SWITCH when switch-client fails (session is still alive)", async () => {
    const calls = [];
    const queue = [
      { status: 1, stdout: "", stderr: "" }, // probe
      { status: 0, stdout: "", stderr: "" }, // new-session
      { status: 0, stdout: "", stderr: "" }, // set-option
    ];
    const runner = {
      calls,
      runSync(args) {
        calls.push(args);
        if (args[0] === "switch-client") {
          return {
            status: 1,
            stdout: "",
            stderr: "no current client",
            error: null,
          };
        }
        const next = queue.shift();
        if (!next) return { status: 0, stdout: "", stderr: "", error: null };
        return { error: null, ...next };
      },
      runAttach: vi.fn(),
    };
    await expect(
      runParallelSpawn({
        bin: "claude",
        prefs: basePrefs,
        cwd: "/home/me/app",
        runner,
        log: () => {},
      }),
    ).rejects.toMatchObject({ code: "ETMUX_SWITCH" });
  });
});

describe("runParallelSpawn — worktree path", () => {
  it("creates a worktree via the injected impl and uses its path as the session cwd", async () => {
    const runner = queuedRunner([
      { status: 1, stdout: "", stderr: "" }, // probe
      { status: 0, stdout: "", stderr: "" }, // new-session
      { status: 0, stdout: "", stderr: "" }, // set-option
    ]);
    const createWorktreeImpl = vi.fn(() => ({
      path: "/home/me/app-feat1",
      branch: "feat1",
      base: "main",
    }));
    const result = await runParallelSpawn({
      bin: "claude",
      name: "feat1",
      prefs: basePrefs,
      cwd: "/home/me/app",
      runner,
      log: () => {},
      createWorktreeImpl,
    });
    expect(createWorktreeImpl).toHaveBeenCalledWith({ name: "feat1" });
    expect(result.cwd).toBe("/home/me/app-feat1");
    expect(result.worktree.branch).toBe("feat1");
    // Session name derives from the worktree dir basename, not the cwd.
    expect(result.sessionName).toBe("claude-app-feat1");
    // new-session must have been invoked with -c <worktree>.
    const create = runner.calls.find((c) => c[0] === "new-session");
    expect(create).toContain("-c");
    expect(create).toContain("/home/me/app-feat1");
  });

  it("propagates worktree errors (EWT_DIR_EXISTS etc.) without spawning anything", async () => {
    const runner = queuedRunner([]);
    const err = Object.assign(new Error("worktree already exists"), {
      code: "EWT_DIR_EXISTS",
    });
    const createWorktreeImpl = vi.fn(() => {
      throw err;
    });
    await expect(
      runParallelSpawn({
        bin: "claude",
        name: "feat1",
        prefs: basePrefs,
        cwd: "/home/me/app",
        runner,
        log: () => {},
        createWorktreeImpl,
      }),
    ).rejects.toMatchObject({ code: "EWT_DIR_EXISTS" });
    // No tmux work happened.
    expect(runner.calls).toEqual([]);
  });

  it("rolls back the worktree when tmux session creation fails", async () => {
    const runner = queuedRunner([
      { status: 1, stdout: "", stderr: "" }, // probe: free
      { status: 1, stdout: "", stderr: "tmux server died" }, // new-session fails
    ]);
    const createWorktreeImpl = vi.fn(() => ({
      path: "/home/me/app-feat1",
      branch: "feat1",
      base: "main",
    }));
    const removeWorktreeImpl = vi.fn(() => ({
      removed: true,
      branchRemoved: true,
      stderr: "",
    }));
    const logs = [];

    await expect(
      runParallelSpawn({
        bin: "claude",
        name: "feat1",
        prefs: basePrefs,
        cwd: "/home/me/app",
        runner,
        log: (msg) => logs.push(msg),
        createWorktreeImpl,
        removeWorktreeImpl,
      }),
    ).rejects.toMatchObject({ code: "ETMUX_CREATE" });

    // Rollback fired with the correct path + branch.
    expect(removeWorktreeImpl).toHaveBeenCalledWith({
      path: "/home/me/app-feat1",
      branch: "feat1",
    });
    expect(logs.some((l) => l.includes("rolled back worktree"))).toBe(true);
  });

  it("surfaces a partial-rollback warning when removeWorktree fails", async () => {
    const runner = queuedRunner([
      { status: 1, stdout: "", stderr: "" },
      { status: 1, stdout: "", stderr: "tmux died" },
    ]);
    const createWorktreeImpl = vi.fn(() => ({
      path: "/home/me/app-feat1",
      branch: "feat1",
      base: "main",
    }));
    const removeWorktreeImpl = vi.fn(() => ({
      removed: false,
      branchRemoved: false,
      stderr: "worktree remove: refused to remove dirty checkout",
    }));
    const logs = [];

    await expect(
      runParallelSpawn({
        bin: "claude",
        name: "feat1",
        prefs: basePrefs,
        cwd: "/home/me/app",
        runner,
        log: (msg) => logs.push(msg),
        createWorktreeImpl,
        removeWorktreeImpl,
      }),
    ).rejects.toMatchObject({ code: "ETMUX_CREATE" });

    expect(logs.some((l) => l.includes("worktree rollback partial"))).toBe(
      true,
    );
  });
});

describe("runParallelSpawn — race recovery for Alt+s", () => {
  it("attaches to the racing session when same-dir spawn loses the create race", async () => {
    let probeCount = 0;
    const calls = [];
    const runner = {
      calls,
      runSync(args) {
        calls.push(args);
        if (args[0] === "has-session") {
          probeCount++;
          // First probe (nextFreeSessionName): say free.
          // Second probe (post-create-failure recheck): say it exists now.
          return probeCount === 1
            ? { status: 1, stdout: "", stderr: "", error: null }
            : { status: 0, stdout: "", stderr: "", error: null };
        }
        if (args[0] === "new-session") {
          return {
            status: 1,
            stdout: "",
            stderr: "duplicate session: claude-app",
            error: null,
          };
        }
        return { status: 0, stdout: "", stderr: "", error: null };
      },
      runAttach: vi.fn(),
    };

    const result = await runParallelSpawn({
      bin: "claude",
      prefs: basePrefs,
      cwd: "/home/me/app",
      runner,
      log: () => {},
    });

    // Race-recovered → still ends in switch-client to the same name.
    const sw = calls.find((c) => c[0] === "switch-client");
    expect(sw).toEqual(["switch-client", "-t", "claude-app"]);
    expect(result.sessionName).toBe("claude-app");
  });

  it("does NOT race-recover when a worktree name is supplied (worktree dir is unique)", async () => {
    const runner = queuedRunner([
      { status: 1, stdout: "", stderr: "" }, // probe
      { status: 1, stdout: "", stderr: "duplicate" }, // new-session fails
    ]);
    const createWorktreeImpl = vi.fn(() => ({
      path: "/home/me/app-feat1",
      branch: "feat1",
      base: "main",
    }));
    const removeWorktreeImpl = vi.fn(() => ({
      removed: true,
      branchRemoved: true,
      stderr: "",
    }));

    await expect(
      runParallelSpawn({
        bin: "claude",
        name: "feat1",
        prefs: basePrefs,
        cwd: "/home/me/app",
        runner,
        log: () => {},
        createWorktreeImpl,
        removeWorktreeImpl,
      }),
    ).rejects.toMatchObject({ code: "ETMUX_CREATE" });
  });
});
