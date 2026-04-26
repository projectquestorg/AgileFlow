/**
 * Unit tests for behaviors-picker pure helpers.
 *
 * The interactive `pickBehaviors` runs Clack and needs a TTY — same
 * pattern as plugin-picker: business logic is factored out so it's
 * unit-testable.
 */
import { describe, it, expect } from "vitest";

import behaviorsPicker from "../../../src/cli/wizard/behaviors-picker.js";

const { buildBehaviorsMap, initialSelectedKeys, BEHAVIOR_OPTIONS } =
  behaviorsPicker;

describe("buildBehaviorsMap", () => {
  it("returns all-false when no keys are selected", () => {
    expect(buildBehaviorsMap([])).toEqual({
      loadContext: false,
      babysitDefault: false,
      damageControl: false,
      preCompactState: false,
    });
  });

  it("enables only the keys present in the selection set", () => {
    expect(buildBehaviorsMap(["loadContext", "damageControl"])).toEqual({
      loadContext: true,
      babysitDefault: false,
      damageControl: true,
      preCompactState: false,
    });
  });

  it("returns all-true when every key is selected", () => {
    expect(
      buildBehaviorsMap([
        "loadContext",
        "babysitDefault",
        "damageControl",
        "preCompactState",
      ]),
    ).toEqual({
      loadContext: true,
      babysitDefault: true,
      damageControl: true,
      preCompactState: true,
    });
  });

  it("ignores unknown keys silently (defensive)", () => {
    expect(buildBehaviorsMap(["loadContext", "unknownKey"])).toEqual({
      loadContext: true,
      babysitDefault: false,
      damageControl: false,
      preCompactState: false,
    });
  });

  it("always returns a Behaviors-shaped object, even when fed an iterable", () => {
    const result = buildBehaviorsMap(new Set(["loadContext"]));
    expect(Object.keys(result).sort()).toEqual([
      "babysitDefault",
      "damageControl",
      "loadContext",
      "preCompactState",
    ]);
  });
});

describe("initialSelectedKeys", () => {
  it("returns every option when no current behaviors are passed", () => {
    expect(initialSelectedKeys()).toEqual(BEHAVIOR_OPTIONS.map((o) => o.key));
  });

  it("returns every option when current is an empty object (treats missing as enabled)", () => {
    // Missing key is undefined → undefined !== false → counted as enabled.
    // This matches the aggregator's "missing means included" semantics.
    expect(initialSelectedKeys({})).toEqual(BEHAVIOR_OPTIONS.map((o) => o.key));
  });

  it("omits keys that are explicitly disabled", () => {
    const result = initialSelectedKeys({
      loadContext: true,
      babysitDefault: false,
      damageControl: true,
      preCompactState: false,
    });
    expect(result).toEqual(["loadContext", "damageControl"]);
  });

  it("preserves option order (display order, not config-key order)", () => {
    const result = initialSelectedKeys({
      preCompactState: true,
      loadContext: true,
      babysitDefault: true,
      damageControl: true,
    });
    expect(result).toEqual(BEHAVIOR_OPTIONS.map((o) => o.key));
  });
});

describe("BEHAVIOR_OPTIONS", () => {
  it("exposes exactly the four documented behavior keys in order", () => {
    expect(BEHAVIOR_OPTIONS.map((o) => o.key)).toEqual([
      "loadContext",
      "babysitDefault",
      "damageControl",
      "preCompactState",
    ]);
  });

  it("every entry has a label and a hint string", () => {
    for (const o of BEHAVIOR_OPTIONS) {
      expect(typeof o.label).toBe("string");
      expect(o.label.length).toBeGreaterThan(0);
      expect(typeof o.hint).toBe("string");
      expect(o.hint.length).toBeGreaterThan(0);
    }
  });
});
