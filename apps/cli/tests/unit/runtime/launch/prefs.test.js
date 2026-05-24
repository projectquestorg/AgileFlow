/**
 * Unit tests for the launch-prefs read/write/merge module.
 *
 * Uses a temp HOME so the real `~/.agileflow/launch-prefs.json` is never
 * touched. Every call to prefsPath / loadPrefs / writePrefs accepts an
 * explicit `home` override for exactly this reason.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import prefsModule from "../../../../src/runtime/launch/prefs.js";
import defaultsModule from "../../../../src/runtime/launch/defaults.js";

const {
  FILENAME,
  prefsPath,
  loadPrefs,
  writePrefs,
  mergeWithDefaults,
  prefsExist,
} = prefsModule;
const { defaultPrefs } = defaultsModule;

describe("launch prefs", () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "af-launch-prefs-"));
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("prefsPath resolves under ~/.agileflow/launch-prefs.json", () => {
    expect(prefsPath(scratch)).toBe(path.join(scratch, ".agileflow", FILENAME));
  });

  it("loadPrefs returns defaults when file is absent", async () => {
    const result = await loadPrefs(scratch);
    expect(result.source).toBe("defaults");
    expect(result.prefs).toEqual(defaultPrefs());
  });

  it("mergeWithDefaults fills missing keys", () => {
    const merged = mergeWithDefaults({ tmux: { enabled: false } });
    expect(merged.tmux.enabled).toBe(false);
    // statusPosition was not provided → must come from defaults
    expect(merged.tmux.statusPosition).toBe(defaultPrefs().tmux.statusPosition);
    expect(merged.cli.preferred).toBe(defaultPrefs().cli.preferred);
    expect(merged.aliases.af.enabled).toBe(false);
  });

  it("mergeWithDefaults sanitizes unknown enum values", () => {
    const merged = mergeWithDefaults({
      tmux: { statusPosition: "left" }, // not a valid v1 value
      keybinds: { preset: "vim" }, // not a valid preset
      cli: { preferred: "emacs", fallbackOrder: ["emacs", "claude"] },
    });
    expect(merged.tmux.statusPosition).toBe("bottom");
    expect(merged.keybinds.preset).toBe("default");
    expect(merged.cli.preferred).toBe("claude");
    expect(merged.cli.fallbackOrder).toEqual(["claude"]);
  });

  it("writePrefs then loadPrefs round-trips, stamping lastUpdated", async () => {
    const before = Date.now();
    const next = defaultPrefs();
    next.tmux.statusPosition = "top";
    next.aliases.af.enabled = true;

    const file = await writePrefs(next, scratch);
    expect(file).toBe(path.join(scratch, ".agileflow", FILENAME));

    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(typeof raw.lastUpdated).toBe("string");
    expect(new Date(raw.lastUpdated).getTime()).toBeGreaterThanOrEqual(before);

    const result = await loadPrefs(scratch);
    expect(result.source).toBe("file");
    expect(result.prefs.tmux.statusPosition).toBe("top");
    expect(result.prefs.aliases.af.enabled).toBe(true);
  });

  it("loadPrefs throws on invalid JSON", async () => {
    const file = prefsPath(scratch);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ not json");
    await expect(loadPrefs(scratch)).rejects.toThrow(/parse/);
  });

  it("loadPrefs rejects valid JSON that isn't an object (null/array/primitive)", async () => {
    const file = prefsPath(scratch);
    fs.mkdirSync(path.dirname(file), { recursive: true });

    fs.writeFileSync(file, "null");
    await expect(loadPrefs(scratch)).rejects.toThrow(
      /expected a JSON object.*null/,
    );

    fs.writeFileSync(file, "[1, 2, 3]");
    await expect(loadPrefs(scratch)).rejects.toThrow(
      /expected a JSON object.*array/,
    );

    fs.writeFileSync(file, "42");
    await expect(loadPrefs(scratch)).rejects.toThrow(
      /expected a JSON object.*number/,
    );

    fs.writeFileSync(file, '"a string"');
    await expect(loadPrefs(scratch)).rejects.toThrow(
      /expected a JSON object.*string/,
    );
  });

  it("mergeWithDefaults enforces preferred is in fallbackOrder", () => {
    // Hand-edited prefs file: preferred is valid but missing from fallbackOrder.
    const merged = mergeWithDefaults({
      cli: { preferred: "codex", fallbackOrder: ["claude", "aider"] },
    });
    expect(merged.cli.preferred).toBe("codex");
    expect(merged.cli.fallbackOrder).toContain("codex");
    // Should be prepended, not duplicated
    expect(merged.cli.fallbackOrder.filter((id) => id === "codex").length).toBe(
      1,
    );
    expect(merged.cli.fallbackOrder[0]).toBe("codex");
  });

  it("mergeWithDefaults keeps fallbackOrder intact when preferred is already in it", () => {
    const merged = mergeWithDefaults({
      cli: { preferred: "claude", fallbackOrder: ["claude", "codex"] },
    });
    expect(merged.cli.fallbackOrder).toEqual(["claude", "codex"]);
  });

  it("prefsExist mirrors the underlying file state", async () => {
    expect(await prefsExist(scratch)).toBe(false);
    await writePrefs(defaultPrefs(), scratch);
    expect(await prefsExist(scratch)).toBe(true);
  });

  it("writePrefs is atomic — no temp file remains after success", async () => {
    await writePrefs(defaultPrefs(), scratch);
    const dir = path.join(scratch, ".agileflow");
    const leftover = fs.readdirSync(dir).filter((f) => f.includes(".tmp-"));
    expect(leftover).toEqual([]);
  });
});
