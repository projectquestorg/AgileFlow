/**
 * Unit tests for the tmux orchestration module.
 *
 * Every code path uses an injected runner stub so no real tmux daemon
 * is touched. `runSync` is faked to whatever the test wants the next
 * `tmux <subcommand>` call to return; `runAttach` resolves to a chosen
 * exit code.
 */
import { describe, it, expect, vi } from "vitest";

import tmuxModule from "../../../../src/runtime/launch/tmux.js";

const {
  isInsideTmux,
  tmuxAvailable,
  baseSessionName,
  nextFreeSessionName,
  sessionExists,
  createSession,
  attachSession,
  launchInTmux,
  listSessionsForCli,
  killSession,
} = tmuxModule;

// Pass to launchInTmux tests so narration doesn't pollute test output.
const noopLog = () => {};

/**
 * Build a runner where `runSync` calls a queued handler per invocation.
 * Tests push handlers in the order they expect the tmux subcommands.
 */
function queuedRunner(handlers, attachExit = 0) {
  const calls = [];
  const queue = [...handlers];
  return {
    calls,
    runSync(args) {
      calls.push(args);
      const handler = queue.shift();
      if (!handler)
        return { status: 1, stdout: "", stderr: "no handler", error: null };
      const raw = typeof handler === "function" ? handler(args) : handler;
      // Default `error: null` for tests that pre-date the shape change.
      return { error: null, ...raw };
    },
    runAttach: vi.fn(async (args) => {
      calls.push(["__attach__", ...args]);
      return { exitCode: attachExit, signal: null };
    }),
  };
}

describe("isInsideTmux", () => {
  it("returns true when TMUX env var is set", () => {
    expect(isInsideTmux({ TMUX: "/tmp/tmux-1000/default,123,4" })).toBe(true);
  });
  it("returns false for empty / missing TMUX", () => {
    expect(isInsideTmux({})).toBe(false);
    expect(isInsideTmux({ TMUX: "" })).toBe(false);
  });
});

describe("tmuxAvailable", () => {
  it("delegates to the injected commandExists", () => {
    expect(tmuxAvailable(() => true)).toBe(true);
    expect(tmuxAvailable(() => false)).toBe(false);
  });
});

describe("baseSessionName", () => {
  it("joins cli and sanitized basename", () => {
    expect(baseSessionName("claude", "/home/me/projects/cool-app")).toBe(
      "claude-cool-app",
    );
  });
  it("replaces shell-noisy characters with underscores", () => {
    expect(baseSessionName("codex", "/tmp/has spaces & dots.v2")).toBe(
      "codex-has_spaces_dots_v2",
    );
  });
  it("falls back to 'root' for an empty basename", () => {
    expect(baseSessionName("claude", "/")).toBe("claude-root");
  });
});

describe("nextFreeSessionName", () => {
  it("returns base when it is free", () => {
    expect(nextFreeSessionName("claude-app", () => false)).toBe("claude-app");
  });
  it("appends -2 when base is taken", () => {
    const taken = new Set(["claude-app"]);
    expect(nextFreeSessionName("claude-app", (n) => taken.has(n))).toBe(
      "claude-app-2",
    );
  });
  it("walks up to find the next free slot", () => {
    const taken = new Set(["claude-app", "claude-app-2", "claude-app-3"]);
    expect(nextFreeSessionName("claude-app", (n) => taken.has(n))).toBe(
      "claude-app-4",
    );
  });
  it("returns base after the safety bound to surface the collision", () => {
    expect(nextFreeSessionName("claude-app", () => true, 2)).toBe("claude-app");
  });
});

describe("sessionExists", () => {
  it("returns true when tmux has-session exits 0", () => {
    const runner = queuedRunner([{ status: 0, stdout: "", stderr: "" }]);
    expect(sessionExists("claude-app", runner)).toBe(true);
    expect(runner.calls[0]).toEqual(["has-session", "-t", "=claude-app"]);
  });
  it("returns false when tmux has-session exits non-zero", () => {
    const runner = queuedRunner([
      { status: 1, stdout: "", stderr: "session not found" },
    ]);
    expect(sessionExists("claude-app", runner)).toBe(false);
  });
});

describe("createSession", () => {
  it("issues new-session with the bin + args, then sets status-position", () => {
    const runner = queuedRunner([
      { status: 0, stdout: "", stderr: "" },
      { status: 0, stdout: "", stderr: "" },
    ]);
    const result = createSession(
      {
        name: "claude-app",
        bin: "claude",
        args: [],
        cwd: "/home/me/app",
        statusPosition: "top",
      },
      runner,
    );
    expect(result.status).toBe(0);
    expect(runner.calls[0]).toEqual([
      "new-session",
      "-d",
      "-s",
      "claude-app",
      "-c",
      "/home/me/app",
      "claude",
    ]);
    expect(runner.calls[1]).toEqual([
      "set-option",
      "-t",
      "claude-app",
      "status-position",
      "top",
    ]);
  });
  it("skips set-option when statusPosition is unset", () => {
    const runner = queuedRunner([{ status: 0, stdout: "", stderr: "" }]);
    createSession({ name: "claude-app", bin: "claude", args: [] }, runner);
    expect(runner.calls.length).toBe(1); // only new-session
  });
  it("forwards create failures without retrying set-option", () => {
    const runner = queuedRunner([
      { status: 1, stdout: "", stderr: "duplicate session" },
    ]);
    const result = createSession(
      { name: "claude-app", bin: "claude", args: [], statusPosition: "top" },
      runner,
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("duplicate session");
    expect(runner.calls.length).toBe(1); // set-option never ran
  });
});

describe("attachSession", () => {
  it("delegates to runner.runAttach with attach-session", async () => {
    const runner = queuedRunner([], 42);
    const result = await attachSession("claude-app", runner);
    expect(result.exitCode).toBe(42);
    expect(runner.runAttach).toHaveBeenCalledWith([
      "attach-session",
      "-t",
      "claude-app",
    ]);
  });
});

describe("launchInTmux", () => {
  it("attaches to an existing session and re-applies status-position", async () => {
    const runner = queuedRunner(
      [
        { status: 0, stdout: "", stderr: "" }, // has-session: yes
        { status: 0, stdout: "", stderr: "" }, // set-option
      ],
      0,
    );
    const result = await launchInTmux({
      bin: "claude",
      cwd: "/home/me/app",
      statusPosition: "top",
      runner,
      log: noopLog,
    });
    expect(result.exitCode).toBe(0);
    // First call: existence probe; second: set-option on the existing session;
    // then attach.
    expect(runner.calls[0]).toEqual(["has-session", "-t", "=claude-app"]);
    expect(runner.calls[1]).toEqual([
      "set-option",
      "-t",
      "claude-app",
      "status-position",
      "top",
    ]);
    expect(runner.runAttach).toHaveBeenCalled();
  });

  it("creates a new session when none exists, then attaches", async () => {
    const runner = queuedRunner(
      [
        { status: 1, stdout: "", stderr: "" }, // has-session probe: nope
        { status: 0, stdout: "", stderr: "" }, // new-session
        { status: 0, stdout: "", stderr: "" }, // set-option after create
      ],
      0,
    );
    await launchInTmux({
      bin: "claude",
      cwd: "/home/me/app",
      statusPosition: "bottom",
      runner,
      log: noopLog,
    });
    expect(runner.calls[0]).toEqual(["has-session", "-t", "=claude-app"]);
    expect(runner.calls[1].slice(0, 5)).toEqual([
      "new-session",
      "-d",
      "-s",
      "claude-app",
      "-c",
    ]);
    expect(runner.runAttach).toHaveBeenCalledWith([
      "attach-session",
      "-t",
      "claude-app",
    ]);
  });

  it("throws ETMUX_CREATE when new-session fails", async () => {
    const runner = queuedRunner([
      { status: 1, stdout: "", stderr: "" }, // probe: nope
      { status: 1, stdout: "", stderr: "no server" }, // new-session fails
      { status: 1, stdout: "", stderr: "" }, // race-recheck: still nope
    ]);
    await expect(
      launchInTmux({
        bin: "claude",
        cwd: "/home/me/app",
        runner,
        log: noopLog,
      }),
    ).rejects.toMatchObject({ code: "ETMUX_CREATE" });
    expect(runner.runAttach).not.toHaveBeenCalled();
  });

  it("re-throws the spawn error from runSync (TOCTOU: tmux removed after availability check)", async () => {
    const enoent = Object.assign(new Error("spawn tmux ENOENT"), {
      code: "ENOENT",
    });
    const runner = queuedRunner(
      [
        { status: 1, stdout: "", stderr: "", error: null }, // probe miss
        { status: 1, stdout: "", stderr: "", error: enoent }, // spawn failed
      ],
      0,
    );
    await expect(
      launchInTmux({
        bin: "claude",
        cwd: "/home/me/app",
        runner,
        log: noopLog,
      }),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(runner.runAttach).not.toHaveBeenCalled();
  });

  it("recovers from the concurrent-launch race by attaching to the session another process just created", async () => {
    const runner = queuedRunner(
      [
        { status: 1, stdout: "", stderr: "" }, // initial probe: not yet
        { status: 1, stdout: "", stderr: "duplicate session: claude-app" }, // new-session loses the race
        { status: 0, stdout: "", stderr: "" }, // re-probe: session exists now
      ],
      0,
    );
    const result = await launchInTmux({
      bin: "claude",
      cwd: "/home/me/app",
      runner,
      log: noopLog,
    });
    expect(result.exitCode).toBe(0);
    expect(runner.runAttach).toHaveBeenCalledWith([
      "attach-session",
      "-t",
      "claude-app",
    ]);
  });

  it("attachSession includes the signal field for parent-side handling", async () => {
    const runner = {
      runSync: () => ({ status: 0, stdout: "", stderr: "", error: null }),
      runAttach: vi.fn().mockResolvedValue({ exitCode: 130, signal: "SIGINT" }),
    };
    const result = await attachSession("claude-app", runner);
    expect(result).toEqual({ exitCode: 130, signal: "SIGINT" });
  });

  it("narrates 'resuming session' when an existing session is found", async () => {
    const runner = queuedRunner(
      [
        { status: 0, stdout: "", stderr: "" }, // exists
        { status: 0, stdout: "", stderr: "" }, // set-option
      ],
      0,
    );
    const logs = [];
    await launchInTmux({
      bin: "claude",
      cwd: "/home/me/app",
      statusPosition: "top",
      runner,
      log: (msg) => logs.push(msg),
    });
    expect(logs).toEqual(["agileflow launch: resuming session claude-app"]);
  });

  it("narrates 'starting new session' when creating fresh", async () => {
    const runner = queuedRunner(
      [
        { status: 1, stdout: "", stderr: "" }, // probe: nope
        { status: 0, stdout: "", stderr: "" }, // new-session
        { status: 0, stdout: "", stderr: "" }, // set-option
      ],
      0,
    );
    const logs = [];
    await launchInTmux({
      bin: "claude",
      cwd: "/home/me/app",
      statusPosition: "bottom",
      runner,
      log: (msg) => logs.push(msg),
    });
    expect(logs).toEqual(["agileflow launch: starting new session claude-app"]);
  });

  it("narrates 'race-recovered' when the create-fails-but-exists path fires", async () => {
    const runner = queuedRunner(
      [
        { status: 1, stdout: "", stderr: "" }, // probe miss
        { status: 1, stdout: "", stderr: "duplicate session" }, // create loses race
        { status: 0, stdout: "", stderr: "" }, // re-probe: exists now
      ],
      0,
    );
    const logs = [];
    await launchInTmux({
      bin: "claude",
      cwd: "/home/me/app",
      runner,
      log: (msg) => logs.push(msg),
    });
    expect(logs).toEqual([
      "agileflow launch: resuming session claude-app (race-recovered)",
    ]);
  });
});

describe("listSessionsForCli", () => {
  it("filters tmux ls output to sessions for the given cli", () => {
    const runner = {
      runSync: () => ({
        status: 0,
        stdout: "claude-app\nclaude-blog\ncodex-api\nother\n",
        stderr: "",
        error: null,
      }),
      runAttach: vi.fn(),
    };
    expect(listSessionsForCli("claude", runner)).toEqual([
      "claude-app",
      "claude-blog",
    ]);
  });

  it("returns [] when tmux ls fails (e.g., no server running)", () => {
    const runner = {
      runSync: () => ({
        status: 1,
        stdout: "",
        stderr: "no server running",
        error: null,
      }),
      runAttach: vi.fn(),
    };
    expect(listSessionsForCli("claude", runner)).toEqual([]);
  });

  it("returns [] when no sessions match", () => {
    const runner = {
      runSync: () => ({
        status: 0,
        stdout: "codex-api\nother\n",
        stderr: "",
        error: null,
      }),
      runAttach: vi.fn(),
    };
    expect(listSessionsForCli("claude", runner)).toEqual([]);
  });
});

describe("killSession", () => {
  it("calls tmux kill-session with the =name target", () => {
    const calls = [];
    const runner = {
      runSync: (args) => {
        calls.push(args);
        return { status: 0, stdout: "", stderr: "", error: null };
      },
      runAttach: vi.fn(),
    };
    expect(killSession("claude-app", runner)).toBe(true);
    expect(calls[0]).toEqual(["kill-session", "-t", "=claude-app"]);
  });

  it("returns false on failure", () => {
    const runner = {
      runSync: () => ({
        status: 1,
        stdout: "",
        stderr: "no such session",
        error: null,
      }),
      runAttach: vi.fn(),
    };
    expect(killSession("missing", runner)).toBe(false);
  });
});
