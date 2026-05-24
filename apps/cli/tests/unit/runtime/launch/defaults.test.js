/**
 * Sanity tests for the launch-prefs defaults factory.
 */
import { describe, it, expect } from "vitest";

import defaultsModule from "../../../../src/runtime/launch/defaults.js";

const { defaultPrefs, KNOWN_CLI_IDS, STATUS_POSITIONS, KEYBIND_PRESETS } =
  defaultsModule;

describe("launch defaultPrefs", () => {
  it("returns a fresh object on each call (not a shared reference)", () => {
    const a = defaultPrefs();
    const b = defaultPrefs();
    expect(a).not.toBe(b);
    a.tmux.enabled = false;
    expect(b.tmux.enabled).toBe(true);
  });

  it("matches the documented v1 shape", () => {
    const d = defaultPrefs();
    expect(d.version).toBe(1);
    expect(KNOWN_CLI_IDS).toContain(d.cli.preferred);
    expect(STATUS_POSITIONS).toContain(d.tmux.statusPosition);
    expect(KEYBIND_PRESETS).toContain(d.keybinds.preset);
    expect(d.aliases.af.enabled).toBe(false);
    expect(d.pinned).toEqual([]);
  });

  it("declares all KNOWN_CLI_IDS in fallbackOrder", () => {
    const d = defaultPrefs();
    for (const id of KNOWN_CLI_IDS) {
      expect(d.cli.fallbackOrder).toContain(id);
    }
  });
});
