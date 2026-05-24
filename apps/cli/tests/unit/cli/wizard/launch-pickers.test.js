/**
 * Unit tests for the pure helpers extracted from the launch wizard
 * pickers. The interactive Clack flows themselves are not unit-tested
 * (v4 convention — see plugin-picker.test.js comments); we exercise
 * the deterministic logic that builds choices and resolves defaults.
 */
import { describe, it, expect } from "vitest";

import cliPickerModule from "../../../../src/cli/wizard/launch-cli-picker.js";
import tmuxPickerModule from "../../../../src/cli/wizard/launch-tmux-picker.js";

const { buildCliChoices, pickInitialPreferred } = cliPickerModule;
const { buildStatusOptions, buildKeybindOptions } = tmuxPickerModule;

describe("launch-cli-picker.buildCliChoices", () => {
  it("uses detected CLIs when at least one resolves", () => {
    const detected = [
      { id: "claude", bin: "claude", label: "Claude", hint: "" },
    ];
    const result = buildCliChoices(detected, ["claude", "codex"]);
    expect(result.noneDetected).toBe(false);
    expect(result.choices).toBe(detected);
    expect(result.initial).toEqual(["claude"]);
  });

  it("falls back to KNOWN_CLIS when nothing is detected", () => {
    const result = buildCliChoices([], []);
    expect(result.noneDetected).toBe(true);
    expect(result.choices.length).toBeGreaterThan(0);
  });

  it("filters initial fallback ids to those actually available", () => {
    const detected = [{ id: "codex", bin: "codex", label: "Codex", hint: "" }];
    const result = buildCliChoices(detected, ["claude", "codex", "aider"]);
    expect(result.initial).toEqual(["codex"]);
  });
});

describe("launch-cli-picker.pickInitialPreferred", () => {
  it("keeps the existing preference when still selected", () => {
    expect(pickInitialPreferred(["claude", "codex"], "codex")).toBe("codex");
  });

  it("falls back to the first selected id when the previous preference is dropped", () => {
    expect(pickInitialPreferred(["claude", "codex"], "aider")).toBe("claude");
  });
});

describe("launch-tmux-picker.buildStatusOptions", () => {
  it("offers top and bottom only", () => {
    const { options } = buildStatusOptions("bottom");
    expect(options.map((o) => o.value)).toEqual(["top", "bottom"]);
  });

  it("preserves a valid current value as initialValue", () => {
    expect(buildStatusOptions("top").initialValue).toBe("top");
  });

  it("falls back to 'bottom' for an invalid current value", () => {
    expect(buildStatusOptions("left").initialValue).toBe("bottom");
    expect(buildStatusOptions(undefined).initialValue).toBe("bottom");
  });
});

describe("launch-tmux-picker.buildKeybindOptions", () => {
  it("offers the three v1 presets", () => {
    const { options } = buildKeybindOptions("default");
    expect(options.map((o) => o.value)).toEqual(["default", "minimal", "none"]);
  });

  it("preserves a valid current preset", () => {
    expect(buildKeybindOptions("minimal").initialValue).toBe("minimal");
  });

  it("falls back to 'default' for an unknown preset", () => {
    expect(buildKeybindOptions("vim").initialValue).toBe("default");
  });
});
