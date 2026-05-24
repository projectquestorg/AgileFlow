/**
 * Unit tests for the PATH-resolution probe used by `agileflow launch`.
 *
 * We don't want these tests to spawn subprocesses for every nonexistent
 * binary, so we check three things:
 *   - the safe-name regex rejects shell metachars before any spawn,
 *   - `node` (always present in CI) resolves true,
 *   - an unambiguously-fake name resolves false.
 */
import { describe, it, expect } from "vitest";

import pathCheckModule from "../../../src/lib/path-check.js";

const { commandExists, SAFE_NAME } = pathCheckModule;

describe("path-check.commandExists", () => {
  it("rejects names containing shell metacharacters without spawning", () => {
    expect(commandExists("ls; rm -rf /")).toBe(false);
    expect(commandExists("$(whoami)")).toBe(false);
    expect(commandExists("`id`")).toBe(false);
    expect(commandExists("a b")).toBe(false);
  });

  it("rejects non-string input", () => {
    // @ts-expect-error intentional bad input
    expect(commandExists(null)).toBe(false);
    // @ts-expect-error intentional bad input
    expect(commandExists(undefined)).toBe(false);
    // @ts-expect-error intentional bad input
    expect(commandExists(42)).toBe(false);
  });

  it("returns true for `node` (always available in CI)", () => {
    expect(commandExists("node")).toBe(true);
  });

  it("returns false for a definitely-not-installed binary", () => {
    expect(commandExists("agileflow-definitely-not-real-xyz")).toBe(false);
  });

  it("SAFE_NAME accepts hyphenated CLI names", () => {
    expect(SAFE_NAME.test("cursor-agent")).toBe(true);
    expect(SAFE_NAME.test("claude")).toBe(true);
    expect(SAFE_NAME.test("aider")).toBe(true);
  });
});
