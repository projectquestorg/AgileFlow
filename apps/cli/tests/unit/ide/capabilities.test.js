/**
 * Unit tests for the IDE capability map.
 */
import { describe, it, expect } from "vitest";

import capsModule from "../../../src/runtime/ide/capabilities.js";

const {
  IDE_CAPABILITIES,
  SUPPORTED_IDES,
  capabilitiesFor,
  supports,
  hookEventsForIdes,
} = capsModule;

describe("IDE_CAPABILITIES", () => {
  it("lists the five supported targets", () => {
    expect([...SUPPORTED_IDES].sort()).toEqual([
      "antigravity",
      "claude-code",
      "codex",
      "cursor",
      "windsurf",
    ]);
  });

  it("claude-code is the full-feature target", () => {
    const c = IDE_CAPABILITIES["claude-code"];
    expect(c.hooks).toBe(true);
    expect(c.skills).toBe(true);
    expect(c.agents).toBe(true);
    expect(c.mcp).toBeUndefined();
  });

  it("codex has hook and agent support while Cursor, Windsurf, and Antigravity do not expose hooks", () => {
    expect(IDE_CAPABILITIES.cursor.hooks).toBe(false);
    expect(IDE_CAPABILITIES.windsurf.hooks).toBe(false);
    expect(IDE_CAPABILITIES.codex.hooks).toBe(true);
    expect(IDE_CAPABILITIES.codex.agents).toBe(true);
    expect(IDE_CAPABILITIES.codex.hookEvents).toEqual([
      "SessionStart",
      "PreToolUse",
      "PermissionRequest",
      "PostToolUse",
      "UserPromptSubmit",
      "Stop",
    ]);
    expect(IDE_CAPABILITIES.antigravity.hooks).toBe(false);
    expect(IDE_CAPABILITIES.antigravity.skills).toBe(true);
    expect(IDE_CAPABILITIES.antigravity.agents).toBe(true);
  });

  it("every IDE has a settingsFile path that points inside its dotdir", () => {
    for (const id of SUPPORTED_IDES) {
      const caps = IDE_CAPABILITIES[id];
      expect(
        caps.settingsFile.startsWith(
          `.${id === "claude-code" ? "claude" : id}/`,
        ),
      ).toBe(true);
    }
  });
});

describe("capabilitiesFor", () => {
  it("returns the same object as IDE_CAPABILITIES for a known id", () => {
    expect(capabilitiesFor("claude-code")).toBe(
      IDE_CAPABILITIES["claude-code"],
    );
  });

  it("throws on an unknown id with the supported list in the message", () => {
    expect(() => capabilitiesFor("emacs")).toThrow(/Unknown IDE "emacs"/);
    expect(() => capabilitiesFor("emacs")).toThrow(/claude-code/);
  });
});

describe("supports", () => {
  it("returns the boolean value of the requested feature", () => {
    expect(supports("claude-code", "hooks")).toBe(true);
    expect(supports("cursor", "hooks")).toBe(false);
  });

  it("returns false for unknown ides without throwing", () => {
    expect(supports("emacs", "hooks")).toBe(false);
  });
});

describe("hookEventsForIdes", () => {
  it("returns the union of hook events across selected IDEs", () => {
    expect(hookEventsForIdes(["claude-code", "codex"])).toEqual(
      new Set([
        "SessionStart",
        "PreToolUse",
        "PostCompact",
        "Stop",
        "PermissionRequest",
        "PostToolUse",
        "UserPromptSubmit",
      ]),
    );
  });
});
