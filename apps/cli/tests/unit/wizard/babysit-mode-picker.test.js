/**
 * Unit tests for the babysit mode picker helper.
 */
import { describe, it, expect } from "vitest";

import pickerModule from "../../../src/cli/wizard/babysit-mode-picker.js";

const { MODES, CUSTOM_FEATURES, DEFAULT_CUSTOM_FEATURES } = pickerModule;

describe("MODES", () => {
  it("offers the supported modes plus customization", () => {
    expect(MODES.map((o) => o.value)).toEqual([
      "full",
      "light",
      "minimal",
      "custom",
    ]);
  });
});

describe("CUSTOM_FEATURES", () => {
  it("offers the expected custom behavior toggles", () => {
    expect(CUSTOM_FEATURES.map((o) => o.value)).toEqual([
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
});

describe("DEFAULT_CUSTOM_FEATURES", () => {
  it("enables core mentor behaviors by default", () => {
    expect(DEFAULT_CUSTOM_FEATURES).toMatchObject({
      askQuestions: true,
      planMode: true,
      delegation: true,
      taskTracking: true,
      progressUpdates: true,
      logicAudit: true,
      flowAudit: true,
      securityAudit: true,
    });
  });

  it("leaves opt-in audits and strict gates disabled by default", () => {
    expect(DEFAULT_CUSTOM_FEATURES).toMatchObject({
      auditAll: false,
      performanceAudit: false,
      accessibilityAudit: false,
      legalAudit: false,
      strictMode: false,
      tddMode: false,
    });
  });

  it("covers every value listed in CUSTOM_FEATURES", () => {
    for (const feature of CUSTOM_FEATURES) {
      expect(DEFAULT_CUSTOM_FEATURES).toHaveProperty(feature.value);
    }
  });
});
