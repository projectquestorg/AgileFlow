/**
 * Unit tests for the per-project prefs cascade. Uses real temp dirs for
 * the walk-up search, but injects the global loader so no real
 * ~/.agileflow is touched.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import projectPrefs from "../../../../src/runtime/launch/project-prefs.js";
import { defaultPrefs } from "../../../../src/runtime/launch/defaults.js";

const {
  PROJECT_DIR,
  PROJECT_FILENAME,
  findProjectPrefsFile,
  readProjectPrefs,
  mergePartialOver,
  loadCascadedPrefs,
} = projectPrefs;

/**
 * Build a fake global-prefs loader for injection. Lets a test pretend
 * the user has a particular `~/.agileflow/launch-prefs.json` without
 * touching disk.
 */
function fakeGlobalLoader(prefs, source = "file", filePath = "/fake/global") {
  return async () => ({ prefs, source, path: filePath });
}

describe("findProjectPrefsFile", () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "af-project-"));
  });
  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("returns null when no project file exists anywhere up the tree", () => {
    fs.mkdirSync(path.join(scratch, "deep", "nested"), { recursive: true });
    expect(
      findProjectPrefsFile(path.join(scratch, "deep", "nested")),
    ).toBeNull();
  });

  it("finds the file in the current directory", () => {
    fs.mkdirSync(path.join(scratch, PROJECT_DIR), { recursive: true });
    const file = path.join(scratch, PROJECT_DIR, PROJECT_FILENAME);
    fs.writeFileSync(file, "{}");
    expect(findProjectPrefsFile(scratch)).toBe(file);
  });

  it("walks up to find the file in an ancestor directory", () => {
    fs.mkdirSync(path.join(scratch, PROJECT_DIR), { recursive: true });
    const file = path.join(scratch, PROJECT_DIR, PROJECT_FILENAME);
    fs.writeFileSync(file, "{}");
    fs.mkdirSync(path.join(scratch, "sub", "sub2"), { recursive: true });
    expect(findProjectPrefsFile(path.join(scratch, "sub", "sub2"))).toBe(file);
  });

  it("stops at a .git boundary (won't cross into the parent repo)", () => {
    // outer/ has a project file
    fs.mkdirSync(path.join(scratch, "outer", PROJECT_DIR), { recursive: true });
    fs.writeFileSync(
      path.join(scratch, "outer", PROJECT_DIR, PROJECT_FILENAME),
      "{}",
    );
    // inner/ has its own .git but no project file. Search from inside inner
    // must NOT find outer's project file.
    fs.mkdirSync(path.join(scratch, "outer", "inner", ".git"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(scratch, "outer", "inner", "src"), {
      recursive: true,
    });
    expect(
      findProjectPrefsFile(path.join(scratch, "outer", "inner", "src")),
    ).toBeNull();
  });

  it("allows the repo root itself to host the project file (even with .git there)", () => {
    fs.mkdirSync(path.join(scratch, ".git"), { recursive: true });
    fs.mkdirSync(path.join(scratch, PROJECT_DIR), { recursive: true });
    const file = path.join(scratch, PROJECT_DIR, PROJECT_FILENAME);
    fs.writeFileSync(file, "{}");
    fs.mkdirSync(path.join(scratch, "src", "nested"), { recursive: true });
    expect(findProjectPrefsFile(path.join(scratch, "src", "nested"))).toBe(
      file,
    );
  });
});

describe("readProjectPrefs", () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "af-project-read-"));
  });
  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("returns null for malformed JSON (and logs to stderr)", () => {
    const file = path.join(scratch, "bad.json");
    fs.writeFileSync(file, "{ not json");
    // Silence stderr noise during the assertion.
    const origErr = console.error;
    console.error = () => {};
    try {
      expect(readProjectPrefs(file)).toBeNull();
    } finally {
      console.error = origErr;
    }
  });

  it("returns null when the JSON parses to a non-object (e.g. array)", () => {
    const file = path.join(scratch, "arr.json");
    fs.writeFileSync(file, "[]");
    expect(readProjectPrefs(file)).toBeNull();
  });

  it("returns the parsed partial when JSON is a valid object", () => {
    const file = path.join(scratch, "ok.json");
    fs.writeFileSync(file, JSON.stringify({ tmux: { enabled: false } }));
    expect(readProjectPrefs(file)).toEqual({ tmux: { enabled: false } });
  });

  it("returns null when the file doesn't exist", () => {
    expect(readProjectPrefs(path.join(scratch, "absent.json"))).toBeNull();
  });
});

describe("mergePartialOver", () => {
  const base = defaultPrefs();

  it("returns base unchanged when the partial is empty", () => {
    expect(mergePartialOver(base, {})).toEqual(base);
  });

  it("overrides only the specified leaf in cli", () => {
    const result = mergePartialOver(base, { cli: { preferred: "codex" } });
    expect(result.cli.preferred).toBe("codex");
    expect(result.cli.fallbackOrder).toEqual(base.cli.fallbackOrder);
  });

  it("overrides only the specified leaf in tmux", () => {
    const result = mergePartialOver(base, { tmux: { enabled: false } });
    expect(result.tmux.enabled).toBe(false);
    expect(result.tmux.statusPosition).toBe(base.tmux.statusPosition);
  });

  it("falls back to base when the partial supplies an unknown enum value", () => {
    const result = mergePartialOver(base, {
      tmux: { statusPosition: "sideways" },
    });
    expect(result.tmux.statusPosition).toBe(base.tmux.statusPosition);
  });

  it("repairs the preferred-in-fallback invariant when partial breaks it", () => {
    const baseWithSmallList = {
      ...base,
      cli: { preferred: "claude", fallbackOrder: ["claude"] },
    };
    const result = mergePartialOver(baseWithSmallList, {
      cli: { preferred: "codex" },
    });
    expect(result.cli.preferred).toBe("codex");
    expect(result.cli.fallbackOrder[0]).toBe("codex");
  });

  it("replaces pinned wholesale (it's a list, not a deep-merge dict)", () => {
    const withPins = { ...base, pinned: ["a", "b"] };
    const result = mergePartialOver(withPins, { pinned: ["c"] });
    expect(result.pinned).toEqual(["c"]);
  });

  it("preserves pinned when the partial omits it", () => {
    const withPins = { ...base, pinned: ["a", "b"] };
    const result = mergePartialOver(withPins, { tmux: { enabled: false } });
    expect(result.pinned).toEqual(["a", "b"]);
  });
});

describe("loadCascadedPrefs", () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "af-cascade-"));
  });
  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("returns global prefs untouched when no project file exists", async () => {
    const global = defaultPrefs();
    global.cli.preferred = "codex";
    const result = await loadCascadedPrefs({
      cwd: scratch,
      loadGlobalPrefs: fakeGlobalLoader(global, "file", "/fake/global"),
    });
    expect(result.prefs.cli.preferred).toBe("codex");
    expect(result.sources.map((s) => s.layer)).toEqual(["defaults", "global"]);
  });

  it("layers project partial on top of global", async () => {
    fs.mkdirSync(path.join(scratch, PROJECT_DIR), { recursive: true });
    fs.writeFileSync(
      path.join(scratch, PROJECT_DIR, PROJECT_FILENAME),
      JSON.stringify({ tmux: { enabled: false } }),
    );
    const global = defaultPrefs();
    global.cli.preferred = "codex"; // global change must survive
    const result = await loadCascadedPrefs({
      cwd: scratch,
      loadGlobalPrefs: fakeGlobalLoader(global),
    });
    expect(result.prefs.cli.preferred).toBe("codex");
    expect(result.prefs.tmux.enabled).toBe(false);
    expect(result.sources.map((s) => s.layer)).toEqual([
      "defaults",
      "global",
      "project",
    ]);
  });

  it("omits the global source entry when global is from defaults", async () => {
    const result = await loadCascadedPrefs({
      cwd: scratch,
      loadGlobalPrefs: fakeGlobalLoader(defaultPrefs(), "defaults", "/x"),
    });
    expect(result.sources.map((s) => s.layer)).toEqual(["defaults"]);
  });

  it("tolerates a malformed project file (treats as absent)", async () => {
    fs.mkdirSync(path.join(scratch, PROJECT_DIR), { recursive: true });
    fs.writeFileSync(
      path.join(scratch, PROJECT_DIR, PROJECT_FILENAME),
      "{ not json",
    );
    const global = defaultPrefs();
    const origErr = console.error;
    console.error = () => {};
    try {
      const result = await loadCascadedPrefs({
        cwd: scratch,
        loadGlobalPrefs: fakeGlobalLoader(global),
      });
      expect(result.prefs.cli.preferred).toBe(global.cli.preferred);
      expect(result.sources.map((s) => s.layer)).toEqual([
        "defaults",
        "global",
      ]);
    } finally {
      console.error = origErr;
    }
  });
});
