/**
 * Unit tests for library-loader — parse and validate library.yaml files.
 * Tests cover valid libraries, missing files, YAML errors, schema violations,
 * and duplicate name detection across all sections.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  loadLibrary,
  normalizeLibrary,
  normalizeEntry,
  LIBRARY_VERSION,
  VALID_SOURCES,
  SECTIONS,
  DEFAULT_REF,
} from "../../../../src/runtime/library/library-loader.js";

function scratch() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "af-lib-"));
}

function writeLibrary(dir, content) {
  fs.writeFileSync(path.join(dir, "library.yaml"), content);
}

describe("normalizeEntry", () => {
  it("throws if raw is not an object", () => {
    expect(() => normalizeEntry("string", "skills", 0)).toThrow(
      /skills\[0\] must be an object/,
    );
    expect(() => normalizeEntry([], "agents", 0)).toThrow(
      /agents\[0\] must be an object/,
    );
    expect(() => normalizeEntry(null, "prompts", 0)).toThrow(
      /prompts\[0\] must be an object/,
    );
  });

  it("throws if name is missing or empty", () => {
    expect(() =>
      normalizeEntry({ source: "github", path: "x" }, "skills", 0),
    ).toThrow(/skills\[0\]\.name must be a non-empty string/);
    expect(() =>
      normalizeEntry({ name: "", source: "github", path: "x" }, "skills", 0),
    ).toThrow(/skills\[0\]\.name must be a non-empty string/);
  });

  it("throws if source is missing or invalid", () => {
    expect(() =>
      normalizeEntry({ name: "test", path: "x" }, "skills", 0),
    ).toThrow(/skills\[0\]\.source must be one of/);
    expect(() =>
      normalizeEntry(
        { name: "test", source: "invalid", path: "x" },
        "skills",
        0,
      ),
    ).toThrow(/skills\[0\]\.source must be one of/);
  });

  it("throws if path is missing or empty", () => {
    expect(() =>
      normalizeEntry({ name: "test", source: "github" }, "skills", 0),
    ).toThrow(/skills\[0\]\.path must be a non-empty string/);
    expect(() =>
      normalizeEntry({ name: "test", source: "github", path: "" }, "skills", 0),
    ).toThrow(/skills\[0\]\.path must be a non-empty string/);
  });

  it("requires repo for github source and validates format", () => {
    expect(() =>
      normalizeEntry(
        { name: "test", source: "github", path: "x" },
        "skills",
        0,
      ),
    ).toThrow(/skills\[0\]\.repo must be a non-empty string/);

    expect(() =>
      normalizeEntry(
        { name: "test", source: "github", path: "x", repo: "invalid" },
        "skills",
        0,
      ),
    ).toThrow(/skills\[0\]\.repo must match "owner\/repo" pattern/);
  });

  it("accepts valid github entry and defaults ref to main", () => {
    const entry = normalizeEntry(
      { name: "test", source: "github", path: "x", repo: "owner/repo" },
      "skills",
      0,
    );
    expect(entry).toEqual({
      section: "skills",
      name: "test",
      source: "github",
      path: "x",
      repo: "owner/repo",
      ref: "main",
    });
  });

  it("accepts custom ref for github entry", () => {
    const entry = normalizeEntry(
      {
        name: "test",
        source: "github",
        path: "x",
        repo: "owner/repo",
        ref: "develop",
      },
      "skills",
      0,
    );
    expect(entry.ref).toBe("develop");
  });

  it("rejects an empty or non-string ref on a github entry", () => {
    expect(() =>
      normalizeEntry(
        {
          name: "test",
          source: "github",
          path: "x",
          repo: "owner/repo",
          ref: "",
        },
        "skills",
        0,
      ),
    ).toThrow(/skills\[0\]\.ref must be a non-empty string/);
    expect(() =>
      normalizeEntry(
        {
          name: "test",
          source: "github",
          path: "x",
          repo: "owner/repo",
          ref: 5,
        },
        "skills",
        0,
      ),
    ).toThrow(/skills\[0\]\.ref must be a non-empty string/);
  });

  it("rejects repo field on local source", () => {
    expect(() =>
      normalizeEntry(
        { name: "test", source: "local", path: "x", repo: "owner/repo" },
        "skills",
        0,
      ),
    ).toThrow(/repo is not allowed for local source/);
  });

  it("rejects ref field on local source", () => {
    expect(() =>
      normalizeEntry(
        { name: "test", source: "local", path: "x", ref: "main" },
        "skills",
        0,
      ),
    ).toThrow(/ref is not allowed for local source/);
  });

  it("accepts valid local entry", () => {
    const entry = normalizeEntry(
      { name: "test", source: "local", path: "../agents/ui" },
      "agents",
      1,
    );
    expect(entry).toEqual({
      section: "agents",
      name: "test",
      source: "local",
      path: "../agents/ui",
    });
  });
});

describe("normalizeLibrary", () => {
  it("throws if top-level is not an object", () => {
    expect(() => normalizeLibrary("string")).toThrow(
      /library must be an object/,
    );
    expect(() => normalizeLibrary([])).toThrow(/library must be an object/);
  });

  it("throws if version is missing or wrong", () => {
    expect(() => normalizeLibrary({})).toThrow(/library version must be/);
    expect(() => normalizeLibrary({ version: 2 })).toThrow(
      /library version must be 1/,
    );
  });

  it("throws if section is present but not an array", () => {
    expect(() => normalizeLibrary({ version: 1, skills: "not-array" })).toThrow(
      /library `skills` must be an array/,
    );
    expect(() => normalizeLibrary({ version: 1, agents: {} })).toThrow(
      /library `agents` must be an array/,
    );
  });

  it("returns library with empty sections for missing sections", () => {
    const lib = normalizeLibrary({ version: 1 });
    expect(lib).toEqual({
      version: 1,
      skills: [],
      agents: [],
      prompts: [],
    });
  });

  it("parses valid full library with all sections", () => {
    const lib = normalizeLibrary({
      version: 1,
      skills: [
        { name: "skill1", source: "github", path: "x", repo: "owner/repo" },
        { name: "skill2", source: "local", path: "../skills/local" },
      ],
      agents: [{ name: "ag-ui", source: "local", path: "../agents/ui" }],
      prompts: [
        {
          name: "system",
          source: "github",
          path: "prompts/system.md",
          repo: "a/b",
        },
      ],
    });

    expect(lib.version).toBe(1);
    expect(lib.skills).toHaveLength(2);
    expect(lib.agents).toHaveLength(1);
    expect(lib.prompts).toHaveLength(1);
    expect(lib.skills[0].name).toBe("skill1");
    expect(lib.skills[1].name).toBe("skill2");
  });

  it("throws on duplicate name within a section", () => {
    expect(() =>
      normalizeLibrary({
        version: 1,
        skills: [
          { name: "dupe", source: "github", path: "x", repo: "a/b" },
          { name: "dupe", source: "local", path: "y" },
        ],
      }),
    ).toThrow(/duplicate skills name: dupe/);
  });

  it("allows same name across different sections", () => {
    const lib = normalizeLibrary({
      version: 1,
      skills: [{ name: "common", source: "local", path: "x" }],
      agents: [{ name: "common", source: "local", path: "y" }],
      prompts: [{ name: "common", source: "local", path: "z" }],
    });

    expect(lib.skills[0].name).toBe("common");
    expect(lib.agents[0].name).toBe("common");
    expect(lib.prompts[0].name).toBe("common");
  });

  it("propagates section/index context in error messages", () => {
    expect(() =>
      normalizeLibrary({
        version: 1,
        agents: [
          { name: "ok", source: "local", path: "x" },
          { name: "bad", source: "github", path: "y" }, // missing repo
        ],
      }),
    ).toThrow(/agents\[1\]\.repo must be a non-empty string/);
  });
});

describe("loadLibrary", () => {
  let dir;
  beforeEach(() => {
    dir = scratch();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns null if file does not exist", async () => {
    const lib = await loadLibrary(path.join(dir, "library.yaml"));
    expect(lib).toBeNull();
  });

  it("throws on invalid YAML syntax", async () => {
    writeLibrary(dir, "version: 1\nskills:\n  - invalid: [\n");
    await expect(loadLibrary(path.join(dir, "library.yaml"))).rejects.toThrow(
      /Invalid YAML in/,
    );
  });

  it("loads and parses valid library", async () => {
    writeLibrary(
      dir,
      [
        "version: 1",
        "skills:",
        "  - name: my-skill",
        "    source: github",
        "    repo: owner/repo",
        "    path: skills/my-skill",
        "agents:",
        "  - name: ag-ui",
        "    source: local",
        "    path: ../agents/ui",
      ].join("\n"),
    );

    const lib = await loadLibrary(path.join(dir, "library.yaml"));
    expect(lib).not.toBeNull();
    expect(lib.version).toBe(1);
    expect(lib.skills[0].name).toBe("my-skill");
    expect(lib.agents[0].name).toBe("ag-ui");
  });

  it("throws on validation error during load", async () => {
    writeLibrary(dir, "version: 2\nskills: []");
    await expect(loadLibrary(path.join(dir, "library.yaml"))).rejects.toThrow(
      /library version must be 1/,
    );
  });

  it("propagates ENOENT as null (not other filesystem errors)", async () => {
    // ENOENT should return null
    const lib = await loadLibrary(path.join(dir, "nope.yaml"));
    expect(lib).toBeNull();
  });
});

describe("Constants", () => {
  it("LIBRARY_VERSION is 1", () => {
    expect(LIBRARY_VERSION).toBe(1);
  });

  it("VALID_SOURCES contains github and local", () => {
    expect(VALID_SOURCES).toContain("github");
    expect(VALID_SOURCES).toContain("local");
  });

  it("SECTIONS contains skills, agents, prompts", () => {
    expect(SECTIONS).toEqual(["skills", "agents", "prompts"]);
  });

  it("DEFAULT_REF is main", () => {
    expect(DEFAULT_REF).toBe("main");
  });
});
