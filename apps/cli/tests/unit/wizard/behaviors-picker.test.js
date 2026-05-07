/**
 * Unit tests for behaviors-picker pure helpers.
 *
 * The interactive `pickBehaviors` runs Clack and needs a TTY — only the
 * pure pieces (`buildBehaviorsMap`, the option lists) are unit-tested.
 */
import { describe, it, expect } from "vitest";

import behaviorsPicker from "../../../src/cli/wizard/behaviors-picker.js";

const { buildBehaviorsMap, BEHAVIOR_OPTIONS, DAMAGE_CONTROL_TOOLS } =
  behaviorsPicker;

describe("buildBehaviorsMap", () => {
  it("returns all-false when input is empty", () => {
    expect(buildBehaviorsMap({})).toEqual({
      loadContext: false,
      babysitDefault: false,
      damageControlBash: false,
      damageControlEdit: false,
      damageControlWrite: false,
      preCompactState: false,
    });
  });

  it("preserves only truthy keys, coerces the rest to false", () => {
    expect(
      buildBehaviorsMap({
        loadContext: true,
        damageControlBash: true,
        damageControlEdit: false,
      }),
    ).toEqual({
      loadContext: true,
      babysitDefault: false,
      damageControlBash: true,
      damageControlEdit: false,
      damageControlWrite: false,
      preCompactState: false,
    });
  });

  it("returns all-true when every key is set", () => {
    const all = {
      loadContext: true,
      babysitDefault: true,
      damageControlBash: true,
      damageControlEdit: true,
      damageControlWrite: true,
      preCompactState: true,
    };
    expect(buildBehaviorsMap(all)).toEqual(all);
  });

  it("ignores unknown keys silently (defensive)", () => {
    expect(
      buildBehaviorsMap({ loadContext: true, somethingElse: true }),
    ).toEqual({
      loadContext: true,
      babysitDefault: false,
      damageControlBash: false,
      damageControlEdit: false,
      damageControlWrite: false,
      preCompactState: false,
    });
  });

  it("returns a complete Behaviors-shaped object every time", () => {
    const result = buildBehaviorsMap({});
    expect(Object.keys(result).sort()).toEqual([
      "babysitDefault",
      "damageControlBash",
      "damageControlEdit",
      "damageControlWrite",
      "loadContext",
      "preCompactState",
    ]);
  });
});

describe("BEHAVIOR_OPTIONS", () => {
  it("exposes the three top-level behavior keys (damage control split out)", () => {
    expect(BEHAVIOR_OPTIONS.map((o) => o.key)).toEqual([
      "loadContext",
      "babysitDefault",
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

describe("DAMAGE_CONTROL_TOOLS", () => {
  it("exposes the three per-tool damage-control keys", () => {
    expect(DAMAGE_CONTROL_TOOLS.map((o) => o.key)).toEqual([
      "damageControlBash",
      "damageControlEdit",
      "damageControlWrite",
    ]);
  });

  it("every entry has a label and a hint string", () => {
    for (const o of DAMAGE_CONTROL_TOOLS) {
      expect(typeof o.label).toBe("string");
      expect(o.label.length).toBeGreaterThan(0);
      expect(typeof o.hint).toBe("string");
      expect(o.hint.length).toBeGreaterThan(0);
    }
  });
});
