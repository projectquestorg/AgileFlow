/**
 * Unit tests for `agileflow launch` — limited to the pure helpers
 * extracted from the command. The interactive wizard flow is exercised
 * manually as part of slice-1 smoke verification (see plan doc).
 */
import { describe, it, expect } from "vitest";

import launch from "../../../../src/cli/commands/launch.js";

const { decideFlow } = launch;

describe("launch.decideFlow", () => {
  it("explicit 'setup' subcommand always runs setup", () => {
    expect(decideFlow({ sub: "setup", hasPrefs: false })).toBe("setup");
    expect(decideFlow({ sub: "setup", hasPrefs: true })).toBe("setup");
  });

  it("bare launch with no prefs triggers first-run setup", () => {
    expect(decideFlow({ sub: undefined, hasPrefs: false })).toBe(
      "first-run-setup",
    );
  });

  it("bare launch with prefs routes to the engine", () => {
    expect(decideFlow({ sub: undefined, hasPrefs: true })).toBe("engine");
  });
});
