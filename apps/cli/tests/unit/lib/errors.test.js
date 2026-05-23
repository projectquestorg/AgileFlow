/**
 * Unit tests for lib/errors.js — typed error classes, formatter, and
 * the fail() helper used by every command handler.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import errorsModule from "../../../src/lib/errors.js";

const {
  AgileflowError,
  MissingFileError,
  InvalidArgumentError,
  OperationFailedError,
  formatError,
  fail,
} = errorsModule;

// Strip ANSI escape sequences so assertions don't depend on chalk's
// color detection (which differs between TTY and CI).
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("error classes", () => {
  it("AgileflowError carries message, code, and suggestion", () => {
    const err = new AgileflowError("boom", {
      suggestion: "try again",
      code: "ERR_CUSTOM",
    });
    expect(err.message).toBe("boom");
    expect(err.code).toBe("ERR_CUSTOM");
    expect(err.suggestion).toBe("try again");
    expect(err).toBeInstanceOf(Error);
  });

  it("each subclass sets a stable default code", () => {
    expect(new MissingFileError("x").code).toBe("ERR_MISSING_FILE");
    expect(new InvalidArgumentError("x").code).toBe("ERR_INVALID_ARGUMENT");
    expect(new OperationFailedError("x").code).toBe("ERR_OPERATION_FAILED");
  });

  it("subclass options can override the default code", () => {
    const err = new MissingFileError("x", { code: "ERR_CUSTOM" });
    expect(err.code).toBe("ERR_CUSTOM");
  });

  it("preserves cause when wrapping another error", () => {
    const inner = new Error("inner");
    const err = new OperationFailedError("outer", { cause: inner });
    expect(err.cause).toBe(inner);
  });
});

describe("formatError", () => {
  it("renders message with command prefix and suggestion on second line", () => {
    const err = new InvalidArgumentError('unknown action "foo"', {
      suggestion: "agileflow plugins list",
    });
    const out = stripAnsi(formatError(err, { command: "plugins" }));
    expect(out).toContain('✗ agileflow plugins: unknown action "foo"');
    expect(out).toContain("Try: agileflow plugins list");
  });

  it("omits Try: line when AgileflowError has no suggestion", () => {
    const err = new InvalidArgumentError("bad");
    const out = stripAnsi(formatError(err, { command: "skills" }));
    expect(out).toContain("✗ agileflow skills: bad");
    expect(out).not.toContain("Try:");
  });

  it("falls back to a generic suggestion for non-AgileflowError", () => {
    const err = new Error("native blow up");
    const out = stripAnsi(formatError(err, { command: "setup" }));
    expect(out).toContain("✗ agileflow setup: native blow up");
    expect(out).toContain("Try:");
    expect(out).toContain("DEBUG=1");
  });

  it("omits command segment when no command is passed", () => {
    const err = new InvalidArgumentError("nope");
    const out = stripAnsi(formatError(err));
    expect(out).toContain("✗ agileflow: nope");
    expect(out).not.toContain("agileflow undefined");
  });

  it("ignores non-string suggestion (no [object Object] in output)", () => {
    const err = new InvalidArgumentError("bad");
    err.suggestion = { not: "a string" };
    const out = stripAnsi(formatError(err, { command: "x" }));
    expect(out).not.toContain("[object");
    expect(out).not.toContain("Try:");
  });

  it("ignores a `suggestion` property on a non-AgileflowError", () => {
    const err = new Error("native");
    err.suggestion = "this should be ignored";
    const out = stripAnsi(formatError(err, { command: "x" }));
    // non-Agileflow errors always get the generic DEBUG=1 suggestion.
    expect(out).toContain("DEBUG=1");
    expect(out).not.toContain("this should be ignored");
  });
});

describe("fail()", () => {
  /** @type {ReturnType<typeof vi.spyOn>} */
  let exitSpy;
  /** @type {ReturnType<typeof vi.spyOn>} */
  let errSpy;

  beforeEach(() => {
    // process.exit is patched to throw so the test stops at the call site
    // without actually exiting the test runner.
    exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`__exit_${code}__`);
    });
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errSpy.mockRestore();
    delete process.env.DEBUG;
  });

  it("prints formatted error to stderr and exits with code 1", () => {
    const err = new MissingFileError("no config found", {
      suggestion: "run `npx agileflow setup`",
    });
    expect(() => fail(err, { command: "update" })).toThrow("__exit_1__");
    expect(errSpy).toHaveBeenCalled();
    const written = stripAnsi(errSpy.mock.calls[0][0]);
    expect(written).toContain("✗ agileflow update: no config found");
    expect(written).toContain("Try: run `npx agileflow setup`");
  });

  it("prints stack trace only when DEBUG is set", () => {
    const err = new Error("boom");
    expect(() => fail(err)).toThrow("__exit_1__");
    expect(errSpy).toHaveBeenCalledTimes(1); // no stack
    errSpy.mockClear();

    process.env.DEBUG = "1";
    expect(() => fail(err)).toThrow("__exit_1__");
    expect(errSpy).toHaveBeenCalledTimes(2); // message + stack
  });

  it.each(["0", "false", "FALSE", "no", ""])(
    "treats DEBUG=%j as off (no stack trace)",
    (val) => {
      process.env.DEBUG = val;
      const err = new Error("boom");
      expect(() => fail(err)).toThrow("__exit_1__");
      expect(errSpy).toHaveBeenCalledTimes(1); // message only, no stack
    },
  );
});
