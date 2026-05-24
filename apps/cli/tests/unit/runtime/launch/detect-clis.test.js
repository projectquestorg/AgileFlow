/**
 * Unit tests for AI CLI detection. The real PATH probe is bypassed via
 * the injectable `exists` argument so tests don't depend on what's
 * installed in the CI image.
 */
import { describe, it, expect } from "vitest";

import detectModule from "../../../../src/runtime/launch/detect-clis.js";

const { KNOWN_CLIS, availableClis, findCli } = detectModule;

describe("detect-clis", () => {
  it("KNOWN_CLIS includes the four launch-supported CLIs", () => {
    const ids = KNOWN_CLIS.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining(["claude", "codex", "cursor-agent", "aider"]),
    );
  });

  it("availableClis filters by the injected predicate", () => {
    const stub = (name) => name === "claude" || name === "aider";
    const got = availableClis(stub).map((c) => c.id);
    expect(got).toEqual(["claude", "aider"]);
  });

  it("availableClis returns empty array when nothing resolves", () => {
    const got = availableClis(() => false);
    expect(got).toEqual([]);
  });

  it("findCli returns the descriptor for a known id", () => {
    const c = findCli("claude");
    expect(c).not.toBeNull();
    expect(c.bin).toBe("claude");
  });

  it("findCli returns null for an unknown id", () => {
    expect(findCli("emacs-mode")).toBeNull();
  });
});
