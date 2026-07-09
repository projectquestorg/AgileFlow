/**
 * Unit tests for the setup-mode-picker. The deps-bag pattern lets us
 * inject a stub @clack/prompts module directly (no vi.mock), so we can
 * exercise the interactive flow deterministically.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

import {
  SETUP_MODE_OPTIONS,
  pickSetupMode,
} from "../../../../src/cli/wizard/setup-mode-picker.js";

function makePromptsStub(overrides = {}) {
  return {
    select: vi.fn().mockResolvedValue("quick"),
    cancel: vi.fn(),
    isCancel: vi.fn(() => false),
    ...overrides,
  };
}

describe("setup-mode-picker.SETUP_MODE_OPTIONS", () => {
  it("offers quick and customize, in that order", () => {
    expect(SETUP_MODE_OPTIONS.map((o) => o.value)).toEqual([
      "quick",
      "customize",
    ]);
  });

  it("uses ASCII-only labels and hints (no emoji)", () => {
    const nonAscii = /[^\x00-\x7F]/;
    for (const opt of SETUP_MODE_OPTIONS) {
      expect(JSON.stringify(opt)).not.toMatch(nonAscii);
    }
  });
});

describe("setup-mode-picker.pickSetupMode", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the selected mode from the injected prompts", async () => {
    const prompts = makePromptsStub({
      select: vi.fn().mockResolvedValue("customize"),
    });
    const result = await pickSetupMode({ prompts });
    expect(result).toBe("customize");
    expect(prompts.select).toHaveBeenCalledTimes(1);
  });

  it("defaults the selection to quick start", async () => {
    const prompts = makePromptsStub();
    await pickSetupMode({ prompts });
    expect(prompts.select.mock.calls[0][0].initialValue).toBe("quick");
  });

  it("cancels and exits when the prompt is cancelled", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const prompts = makePromptsStub({
      select: vi.fn().mockResolvedValue(Symbol("cancel")),
      isCancel: vi.fn(() => true),
    });
    await expect(pickSetupMode({ prompts })).rejects.toThrow("process.exit(1)");
    expect(prompts.cancel).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
