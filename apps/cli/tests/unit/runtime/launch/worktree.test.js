/**
 * Unit tests for the git-worktree helper. Uses an injected `exec` stub
 * so no real git invocations happen. The stub returns the same
 * `{ status, stdout, stderr }` shape `spawnSync({ encoding: "utf8" })`
 * produces.
 */
import { describe, it, expect } from "vitest";

import worktreeModule from "../../../../src/runtime/launch/worktree.js";

const { createWorktree, sanitizeName } = worktreeModule;

/**
 * Build an exec that returns queued responses in order, recording every
 * call. Tests push exact responses per expected git invocation.
 */
function queuedExec(handlers) {
  const calls = [];
  const queue = [...handlers];
  return {
    calls,
    exec(args) {
      calls.push(args);
      const next = queue.shift();
      if (!next) return { status: 1, stdout: "", stderr: "no handler" };
      return next;
    },
  };
}

describe("sanitizeName", () => {
  it("preserves safe characters", () => {
    expect(sanitizeName("feat-auth.v2")).toBe("feat-auth.v2");
  });
  it("collapses unsafe runs to a single hyphen", () => {
    expect(sanitizeName("my  cool  feature!!!")).toBe("my-cool-feature");
  });
  it("strips leading/trailing hyphens", () => {
    expect(sanitizeName("///feature///")).toBe("feature");
  });
  it("returns empty string for nothing-safe input", () => {
    expect(sanitizeName("???")).toBe("");
    expect(sanitizeName("")).toBe("");
  });
  it("returns empty string for non-string input", () => {
    // @ts-expect-error intentional bad input
    expect(sanitizeName(undefined)).toBe("");
    // @ts-expect-error intentional bad input
    expect(sanitizeName(null)).toBe("");
  });
});

describe("createWorktree", () => {
  it("happy path: returns the new worktree's path/branch/base and issues the right git commands", () => {
    const q = queuedExec([
      { status: 0, stdout: "/repo\n", stderr: "" }, // rev-parse --show-toplevel
      { status: 0, stdout: "main\n", stderr: "" }, // rev-parse --abbrev-ref HEAD
      { status: 1, stdout: "", stderr: "" }, // show-ref --verify (branch doesn't exist)
      { status: 0, stdout: "", stderr: "" }, // worktree add -b
    ]);
    const result = createWorktree({
      name: "feature1",
      exec: q.exec,
      fsExists: () => false,
    });
    expect(result).toEqual({
      path: "/repo-feature1",
      branch: "feature1",
      base: "main",
    });
    expect(q.calls).toEqual([
      ["rev-parse", "--show-toplevel"],
      ["rev-parse", "--abbrev-ref", "HEAD"],
      ["show-ref", "--verify", "--quiet", "refs/heads/feature1"],
      ["worktree", "add", "-b", "feature1", "/repo-feature1", "main"],
    ]);
  });

  it("respects an explicit baseBranch and skips the HEAD lookup", () => {
    const q = queuedExec([
      { status: 0, stdout: "/repo\n", stderr: "" }, // show-toplevel
      // No HEAD lookup expected.
      { status: 1, stdout: "", stderr: "" }, // show-ref: branch missing
      { status: 0, stdout: "", stderr: "" }, // worktree add
    ]);
    const result = createWorktree({
      name: "hotfix",
      baseBranch: "release/2.0",
      exec: q.exec,
      fsExists: () => false,
    });
    expect(result.base).toBe("release/2.0");
    expect(q.calls).toEqual([
      ["rev-parse", "--show-toplevel"],
      ["show-ref", "--verify", "--quiet", "refs/heads/hotfix"],
      ["worktree", "add", "-b", "hotfix", "/repo-hotfix", "release/2.0"],
    ]);
  });

  it("sanitizes the user-supplied name into both branch and path", () => {
    const q = queuedExec([
      { status: 0, stdout: "/repo\n", stderr: "" },
      { status: 0, stdout: "main\n", stderr: "" },
      { status: 1, stdout: "", stderr: "" },
      { status: 0, stdout: "", stderr: "" },
    ]);
    const result = createWorktree({
      name: "my cool feature!",
      exec: q.exec,
      fsExists: () => false,
    });
    expect(result.branch).toBe("my-cool-feature");
    expect(result.path).toBe("/repo-my-cool-feature");
  });

  it("throws EWT_NOT_REPO when not inside a git repo", () => {
    const q = queuedExec([
      { status: 128, stdout: "", stderr: "fatal: not a git repository" },
    ]);
    expect(() =>
      createWorktree({ name: "x", exec: q.exec, fsExists: () => false }),
    ).toThrow(/not in a git repository/);
  });

  it("throws EWT_BAD_NAME when the name sanitizes to empty", () => {
    const q = queuedExec([
      { status: 0, stdout: "/repo\n", stderr: "" }, // show-toplevel
    ]);
    expect(() =>
      createWorktree({ name: "???", exec: q.exec, fsExists: () => false }),
    ).toThrow(/empty after sanitizing/);
  });

  it("throws EWT_DIR_EXISTS when the worktree directory is already present", () => {
    const q = queuedExec([{ status: 0, stdout: "/repo\n", stderr: "" }]);
    expect(() =>
      createWorktree({
        name: "feature1",
        exec: q.exec,
        fsExists: () => true,
      }),
    ).toThrow(/already exists/);
  });

  it("throws EWT_BRANCH_EXISTS when the new branch already exists", () => {
    const q = queuedExec([
      { status: 0, stdout: "/repo\n", stderr: "" },
      { status: 0, stdout: "main\n", stderr: "" },
      { status: 0, stdout: "", stderr: "" }, // show-ref: branch EXISTS
    ]);
    expect(() =>
      createWorktree({
        name: "feature1",
        exec: q.exec,
        fsExists: () => false,
      }),
    ).toThrow(/branch 'feature1' already exists/);
  });

  it("wraps `git worktree add` failures as EWT_CREATE with the git stderr", () => {
    const q = queuedExec([
      { status: 0, stdout: "/repo\n", stderr: "" },
      { status: 0, stdout: "main\n", stderr: "" },
      { status: 1, stdout: "", stderr: "" },
      {
        status: 128,
        stdout: "",
        stderr: "fatal: could not create work tree dir",
      },
    ]);
    expect(() =>
      createWorktree({
        name: "feature1",
        exec: q.exec,
        fsExists: () => false,
      }),
    ).toThrow(/could not create work tree dir/);
  });

  it("attaches a stable err.code to thrown errors for caller branching", () => {
    const q = queuedExec([{ status: 0, stdout: "/repo\n", stderr: "" }]);
    try {
      createWorktree({
        name: "feature1",
        exec: q.exec,
        fsExists: () => true,
      });
      throw new Error("expected createWorktree to throw");
    } catch (err) {
      expect(err.code).toBe("EWT_DIR_EXISTS");
    }
  });
});
