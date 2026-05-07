/**
 * Unit tests for the babysit mode picker helper.
 */
import { describe, it, expect } from "vitest";

import pickerModule from "../../../src/cli/wizard/babysit-mode-picker.js";

const {
  initialBabysitMode,
  initialCustomFeatures,
  MODE_OPTIONS,
  CUSTOM_FEATURE_OPTIONS,
} = pickerModule;

describe("initialBabysitMode", () => {
  it("defaults to light", () => {
    expect(initialBabysitMode(undefined)).toBe("light");
  });

  it("keeps a valid existing mode", () => {
    expect(initialBabysitMode({ mode: "full" })).toBe("full");
    expect(initialBabysitMode({ mode: "minimal" })).toBe("minimal");
    expect(initialBabysitMode({ mode: "custom" })).toBe("custom");
  });

  it("ignores invalid values", () => {
    expect(initialBabysitMode({ mode: "something-else" })).toBe("light");
  });
});

describe("MODE_OPTIONS", () => {
  it("offers the supported modes plus customization", () => {
    expect(MODE_OPTIONS.map((o) => o.value)).toEqual([
      "full",
      "light",
      "minimal",
      "custom",
    ]);
  });
});

describe("custom features", () => {
  it("offers the expected custom behavior toggles", () => {
    expect(CUSTOM_FEATURE_OPTIONS.map((o) => o.value)).toEqual([
      "askQuestions",
      "planMode",
      "delegation",
      "taskTracking",
      "progressUpdates",
      "auditAll",
      "logicAudit",
      "flowAudit",
      "securityAudit",
      "performanceAudit",
      "accessibilityAudit",
      "legalAudit",
      "strictMode",
      "tddMode",
    ]);
  });

  it("preserves existing custom feature choices", () => {
    expect(
      initialCustomFeatures({
        features: { planMode: false, delegation: false },
      }),
    ).toMatchObject({
      askQuestions: true,
      planMode: false,
      delegation: false,
      taskTracking: true,
      progressUpdates: true,
      auditAll: false,
      logicAudit: true,
      flowAudit: true,
      securityAudit: true,
      performanceAudit: false,
      accessibilityAudit: false,
      legalAudit: false,
      strictMode: false,
      tddMode: false,
    });
  });
});
