/**
 * Unit tests for the spawn wrapper. Uses an injected `spawn` stub
 * (Node's EventEmitter shape) so no actual process is forked.
 */
import { EventEmitter } from "events";
import { describe, it, expect } from "vitest";

import spawnModule from "../../../../src/runtime/launch/spawn.js";

const { runCli, signalToExitCode } = spawnModule;

/**
 * Build a minimal mock child that lets us emit `close` (and optionally
 * `error`) on a tick. Returns the EventEmitter — the caller drives it.
 */
function makeMockChild() {
  return new EventEmitter();
}

describe("signalToExitCode", () => {
  it("maps SIGINT → 130 and SIGTERM → 143", () => {
    expect(signalToExitCode("SIGINT")).toBe(130);
    expect(signalToExitCode("SIGTERM")).toBe(143);
  });

  it("returns 1 for null (no signal)", () => {
    expect(signalToExitCode(null)).toBe(1);
  });

  it("returns 1 for an unknown signal", () => {
    // @ts-expect-error intentional bad input
    expect(signalToExitCode("SIGNOTREAL")).toBe(1);
  });
});

describe("runCli", () => {
  it("resolves with the child's numeric exit code", async () => {
    const child = makeMockChild();
    const spawn = () => child;
    const promise = runCli("claude", [], { spawn });
    queueMicrotask(() => child.emit("close", 0, null));
    const result = await promise;
    expect(result).toEqual({ exitCode: 0, signal: null });
  });

  it("propagates a non-zero exit code", async () => {
    const child = makeMockChild();
    const promise = runCli("claude", [], { spawn: () => child });
    queueMicrotask(() => child.emit("close", 42, null));
    const result = await promise;
    expect(result.exitCode).toBe(42);
  });

  it("maps signal-only exits via signalToExitCode", async () => {
    const child = makeMockChild();
    const promise = runCli("claude", [], { spawn: () => child });
    queueMicrotask(() => child.emit("close", null, "SIGINT"));
    const result = await promise;
    expect(result.exitCode).toBe(130);
    expect(result.signal).toBe("SIGINT");
  });

  it("rejects when the child emits an error", async () => {
    const child = makeMockChild();
    const promise = runCli("claude", [], { spawn: () => child });
    const err = new Error("ENOENT");
    queueMicrotask(() => child.emit("error", err));
    await expect(promise).rejects.toThrow("ENOENT");
  });

  it("rejects when spawn() itself throws", async () => {
    await expect(
      runCli("claude", [], {
        spawn: () => {
          throw new Error("spawn failed synchronously");
        },
      }),
    ).rejects.toThrow("spawn failed synchronously");
  });

  it("ignores a `close` event that fires after `error` (single settlement)", async () => {
    const child = makeMockChild();
    const promise = runCli("claude", [], { spawn: () => child });
    // Both events on the same tick — Promise must keep the first settlement.
    queueMicrotask(() => {
      child.emit("error", new Error("ENOENT"));
      child.emit("close", 0, null);
    });
    await expect(promise).rejects.toThrow("ENOENT");
  });

  it("ignores a second `close` event (defensive)", async () => {
    const child = makeMockChild();
    const promise = runCli("claude", [], { spawn: () => child });
    queueMicrotask(() => {
      child.emit("close", 0, null);
      child.emit("close", 7, null); // second emit must NOT change the result
    });
    const result = await promise;
    expect(result.exitCode).toBe(0);
  });

  it("passes options.env through to spawn (including null) via nullish coalescing", async () => {
    /** @type {any} */
    let captured;
    const spawnStub = (bin, args, opts) => {
      captured = opts;
      const child = makeMockChild();
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    };

    // Undefined → process.env
    await runCli("claude", [], { spawn: spawnStub });
    expect(captured.env).toBe(process.env);

    // Empty object → preserved (not replaced with process.env).
    // This is the case `||` would have broken; `??` keeps it intact.
    await runCli("claude", [], { spawn: spawnStub, env: {} });
    expect(captured.env).toEqual({});

    // Explicit null → also goes to process.env (Node treats null and
    // undefined identically for env, so spawn would default it anyway —
    // `??` mirrors that behavior).
    await runCli("claude", [], { spawn: spawnStub, env: null });
    expect(captured.env).toBe(process.env);
  });
});
