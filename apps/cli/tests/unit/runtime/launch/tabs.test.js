/**
 * Unit tests for tabs.js — tab format builder + tier selection +
 * version detection. Pure helpers, no tmux runtime involved.
 */
import { describe, it, expect } from "vitest";

import tabs from "../../../../src/runtime/launch/tabs.js";

const {
  DEFAULT_TAB_THEME,
  TIERS,
  COMPACTION_MIN_TMUX,
  TAB_KEYBINDS,
  parseTmuxVersion,
  compareVersions,
  supportsCompaction,
  buildTabFormat,
} = tabs;

describe("parseTmuxVersion", () => {
  it("parses 'tmux 3.3a\\n'", () => {
    expect(parseTmuxVersion("tmux 3.3a\n")).toEqual({ major: 3, minor: 3 });
  });
  it("parses 'tmux 3.2'", () => {
    expect(parseTmuxVersion("tmux 3.2")).toEqual({ major: 3, minor: 2 });
  });
  it("parses 'tmux 2.6'", () => {
    expect(parseTmuxVersion("tmux 2.6")).toEqual({ major: 2, minor: 6 });
  });
  it("parses double-digit minors like 'tmux 3.10'", () => {
    expect(parseTmuxVersion("tmux 3.10")).toEqual({ major: 3, minor: 10 });
  });
  it("returns null for unrecognized input", () => {
    expect(parseTmuxVersion("")).toBeNull();
    expect(parseTmuxVersion("garbage")).toBeNull();
    // @ts-expect-error - testing non-string input
    expect(parseTmuxVersion(null)).toBeNull();
  });
});

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(
      compareVersions({ major: 3, minor: 2 }, { major: 3, minor: 2 }),
    ).toBe(0);
  });
  it("returns positive when a > b on major", () => {
    expect(
      compareVersions({ major: 3, minor: 0 }, { major: 2, minor: 9 }),
    ).toBeGreaterThan(0);
  });
  it("returns negative when a < b on minor (same major)", () => {
    expect(
      compareVersions({ major: 3, minor: 1 }, { major: 3, minor: 2 }),
    ).toBeLessThan(0);
  });
});

describe("supportsCompaction", () => {
  it("returns false for null version", () => {
    expect(supportsCompaction(null)).toBe(false);
  });
  it("returns false for versions older than 3.2", () => {
    expect(supportsCompaction({ major: 2, minor: 6 })).toBe(false);
    expect(supportsCompaction({ major: 3, minor: 1 })).toBe(false);
  });
  it("returns true for 3.2 (the threshold)", () => {
    expect(supportsCompaction(COMPACTION_MIN_TMUX)).toBe(true);
  });
  it("returns true for newer versions", () => {
    expect(supportsCompaction({ major: 3, minor: 5 })).toBe(true);
    expect(supportsCompaction({ major: 4, minor: 0 })).toBe(true);
  });
});

describe("buildTabFormat", () => {
  it("uses the cascading format on tmux 3.2+", () => {
    const out = buildTabFormat({ tmuxVersion: { major: 3, minor: 2 } });
    // `#{e|...}` operators are the marker that we're on the new-tmux branch
    expect(out).toContain("#{e|");
    expect(out).toContain("#{?#{e|<=:#{e|*:#{session_windows}");
  });

  it("falls back to single-tier on tmux < 3.2", () => {
    const out = buildTabFormat({ tmuxVersion: { major: 2, minor: 6 } });
    expect(out).not.toContain("#{e|");
    // Still themed — must contain the strip background marker.
    expect(out).toContain(DEFAULT_TAB_THEME.stripBg);
  });

  it("falls back to single-tier when tmuxVersion is null", () => {
    const out = buildTabFormat({ tmuxVersion: null });
    expect(out).not.toContain("#{e|");
  });

  it("defaults to single-tier when no version supplied", () => {
    const out = buildTabFormat();
    expect(out).not.toContain("#{e|");
  });

  it("emits all five tier breakpoints in correct order", () => {
    const out = buildTabFormat({ tmuxVersion: { major: 3, minor: 2 } });
    // Confirm the four conditional cutoffs appear in widest-to-narrowest order.
    const widthsInOrder = [21, 14, 10, 7];
    let cursor = 0;
    for (const w of widthsInOrder) {
      const needle = `},${w}}`; // `#{e|*:#{session_windows},${w}}` ends with this
      const idx = out.indexOf(needle, cursor);
      expect(
        idx,
        `tier breakpoint ${w} not found at expected position`,
      ).toBeGreaterThan(-1);
      cursor = idx + needle.length;
    }
  });

  it("includes the brand active color by default", () => {
    const out = buildTabFormat({ tmuxVersion: { major: 3, minor: 2 } });
    expect(out).toContain(DEFAULT_TAB_THEME.activeBg);
  });

  it("respects a theme override", () => {
    const out = buildTabFormat({
      tmuxVersion: { major: 3, minor: 2 },
      theme: { activeBg: "#ff0000" },
    });
    expect(out).toContain("#ff0000");
    // Other defaults still present (we partial-merged).
    expect(out).toContain(DEFAULT_TAB_THEME.stripBg);
  });

  it("uses #{=N:window_name} truncation on the active tier 0 name segment", () => {
    const out = buildTabFormat({ tmuxVersion: { major: 3, minor: 2 } });
    expect(out).toContain(`#{=${TIERS[0].activeName}:window_name}`);
  });

  it("emits #I-only chip for the numeric tier (no name)", () => {
    const out = buildTabFormat({ tmuxVersion: { major: 3, minor: 2 } });
    // Tier 3 (and 4) drop the name — confirm a bare `#I` appears outside
    // a `#{=N:window_name}` wrapper somewhere in the format.
    expect(out).toMatch(/bg=#e8683a bold\]#I#\[/);
  });
});

describe("TAB_KEYBINDS", () => {
  it("includes the core named keybinds", () => {
    const keys = TAB_KEYBINDS.map((b) => b.key);
    expect(keys).toContain("M-t");
    expect(keys).toContain("M-,");
    expect(keys).toContain("M-w");
    expect(keys).toContain("M-W");
    expect(keys).toContain("M-T");
  });

  it("includes Alt+1..Alt+9 numeric switchers", () => {
    for (let n = 1; n <= 9; n++) {
      const entry = TAB_KEYBINDS.find((b) => b.key === `M-${n}`);
      expect(entry, `M-${n} should be bound`).toBeTruthy();
      expect(entry.action).toEqual(["select-window", "-t", `:${n}`]);
    }
  });

  it("Alt+w binds directly to tmux kill-window (no CLI roundtrip)", () => {
    // Regression guard: a previous iteration routed Alt+w through a
    // run-shell agileflow callback, which silently failed when the
    // binary path resolution returned stale state. Direct kill-window
    // is bulletproof — tmux handles it entirely in-process.
    const entry = TAB_KEYBINDS.find((b) => b.key === "M-w");
    expect(entry).toBeTruthy();
    expect(entry.action).toEqual(["kill-window"]);
  });

  it("Alt+T action references the restore-window callback", () => {
    const entry = TAB_KEYBINDS.find((b) => b.key === "M-T");
    expect(entry).toBeTruthy();
    expect(entry.action.join(" ")).toContain(
      "%AGILEFLOW% launch __restore-window",
    );
  });

  it("Alt+T passes #{session_name} so restore targets the correct session", () => {
    const entry = TAB_KEYBINDS.find((b) => b.key === "M-T");
    expect(entry.action.join(" ")).toContain("#{session_name}");
  });

  it("every entry has a non-empty hint string", () => {
    for (const b of TAB_KEYBINDS) {
      expect(typeof b.hint).toBe("string");
      expect(b.hint.length).toBeGreaterThan(0);
    }
  });
});
