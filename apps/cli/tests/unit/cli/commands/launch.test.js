/**
 * Unit tests for `agileflow launch` — limited to the pure helpers
 * extracted from the command. The interactive wizard flow is exercised
 * manually as part of slice-1 smoke verification (see plan doc).
 */
import { describe, it, expect } from "vitest";

import launch from "../../../../src/cli/commands/launch.js";

const { decideFlow, shouldOfferOrphanCleanup } = launch;

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

describe("launch.shouldOfferOrphanCleanup", () => {
  it("returns true when preferred CLI changes, tmux is available, and prefs were loaded from file", () => {
    expect(
      shouldOfferOrphanCleanup({
        oldPreferred: "claude",
        newPreferred: "codex",
        tmuxAvailable: true,
        existingSource: "file",
      }),
    ).toBe(true);
  });

  it("returns false when preferred CLI is unchanged", () => {
    expect(
      shouldOfferOrphanCleanup({
        oldPreferred: "claude",
        newPreferred: "claude",
        tmuxAvailable: true,
        existingSource: "file",
      }),
    ).toBe(false);
  });

  it("returns false on first-time setup (no prior prefs file)", () => {
    expect(
      shouldOfferOrphanCleanup({
        oldPreferred: "claude",
        newPreferred: "codex",
        tmuxAvailable: true,
        existingSource: "defaults",
      }),
    ).toBe(false);
  });

  it("returns false when tmux is not available", () => {
    expect(
      shouldOfferOrphanCleanup({
        oldPreferred: "claude",
        newPreferred: "codex",
        tmuxAvailable: false,
        existingSource: "file",
      }),
    ).toBe(false);
  });

  it("returns false when the old preferred is missing (defensive)", () => {
    expect(
      shouldOfferOrphanCleanup({
        oldPreferred: undefined,
        newPreferred: "codex",
        tmuxAvailable: true,
        existingSource: "file",
      }),
    ).toBe(false);
  });
});
