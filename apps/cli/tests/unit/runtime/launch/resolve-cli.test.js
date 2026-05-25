/**
 * Unit tests for resolving the AI CLI to launch from prefs.
 *
 * Uses a stub `exists` predicate so tests don't depend on the host's
 * installed binaries.
 */
import { describe, it, expect } from "vitest";

import resolveModule from "../../../../src/runtime/launch/resolve-cli.js";

const { resolveCli, buildLookupOrder } = resolveModule;

const prefs = (preferred, fallbackOrder) => ({
  cli: { preferred, fallbackOrder },
});

describe("buildLookupOrder", () => {
  it("puts preferred first, then dedup'd fallback", () => {
    expect(
      buildLookupOrder({
        preferred: "codex",
        fallbackOrder: ["claude", "codex", "aider"],
      }),
    ).toEqual(["codex", "claude", "aider"]);
  });

  it("handles empty fallback", () => {
    expect(
      buildLookupOrder({ preferred: "claude", fallbackOrder: [] }),
    ).toEqual(["claude"]);
  });

  it("skips falsy / non-string ids defensively", () => {
    expect(
      buildLookupOrder({
        preferred: "claude",
        // @ts-expect-error intentional bad input
        fallbackOrder: ["", null, "codex", undefined],
      }),
    ).toEqual(["claude", "codex"]);
  });
});

describe("resolveCli", () => {
  it("returns the preferred CLI when it resolves", () => {
    const { resolved, tried } = resolveCli(
      prefs("claude", ["claude", "codex"]),
      (name) => name === "claude",
    );
    expect(resolved && resolved.id).toBe("claude");
    expect(tried).toEqual(["claude", "codex"]);
  });

  it("falls through to the next CLI when preferred is missing", () => {
    const { resolved } = resolveCli(
      prefs("claude", ["claude", "codex", "aider"]),
      (name) => name === "codex",
    );
    expect(resolved && resolved.id).toBe("codex");
  });

  it("returns null when no configured CLI resolves", () => {
    const { resolved, tried } = resolveCli(
      prefs("claude", ["claude", "codex"]),
      () => false,
    );
    expect(resolved).toBeNull();
    expect(tried).toEqual(["claude", "codex"]);
  });

  it("ignores unknown CLI ids in the lookup order", () => {
    const { resolved } = resolveCli(
      // @ts-expect-error intentional bad input
      prefs("emacs", ["emacs", "claude"]),
      (name) => name === "claude",
    );
    expect(resolved && resolved.id).toBe("claude");
  });
});
