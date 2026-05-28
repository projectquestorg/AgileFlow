/**
 * Unit tests for library-resolver — resolve library entries to concrete sources.
 * Tests cover github URL construction and local path resolution with existence
 * validation.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  resolveReference,
  resolveLibrary,
} from "../../../../src/runtime/library/library-resolver.js";

function scratch() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "af-res-"));
}

describe("resolveReference", () => {
  let dir;
  beforeEach(() => {
    dir = scratch();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("resolves github reference to type github and constructs URL", () => {
    const ref = {
      section: "skills",
      name: "my-skill",
      source: "github",
      path: "skills/my-skill",
      repo: "owner/repo",
      ref: "main",
    };

    const resolved = resolveReference(ref, { baseDir: dir });
    expect(resolved.type).toBe("github");
    expect(resolved.url).toBe("https://github.com/owner/repo");
    expect(resolved.repo).toBe("owner/repo");
    expect(resolved.ref).toBe("main");
    expect(resolved.name).toBe("my-skill");
    expect(resolved.section).toBe("skills");
    expect(resolved.path).toBe("skills/my-skill");
    expect(resolved.resolvedPath).toBeUndefined();
  });

  it("validates repo format on github references", () => {
    const badRef = {
      section: "skills",
      name: "bad",
      source: "github",
      path: "x",
      repo: "invalid",
      ref: "main",
    };

    expect(() => resolveReference(badRef, { baseDir: dir })).toThrow(
      /repo must match "owner\/repo" pattern/,
    );
  });

  it("throws if github ref has missing or empty repo", () => {
    const ref = {
      section: "skills",
      name: "test",
      source: "github",
      path: "x",
      repo: "",
    };

    expect(() => resolveReference(ref, { baseDir: dir })).toThrow(
      /invalid repo/,
    );
  });

  it("resolves local reference to type local and resolves path", () => {
    const localDir = path.join(dir, "local-content");
    fs.mkdirSync(localDir, { recursive: true });

    const ref = {
      section: "agents",
      name: "ag-ui",
      source: "local",
      path: "local-content",
    };

    const resolved = resolveReference(ref, { baseDir: dir });
    expect(resolved.type).toBe("local");
    expect(resolved.resolvedPath).toBe(localDir);
    expect(resolved.name).toBe("ag-ui");
    expect(resolved.section).toBe("agents");
    expect(resolved.path).toBe("local-content");
    expect(resolved.url).toBeUndefined();
    expect(resolved.repo).toBeUndefined();
  });

  it("resolves relative paths for local references", () => {
    const nested = path.join(dir, "a", "b", "c");
    fs.mkdirSync(nested, { recursive: true });

    const ref = {
      section: "skills",
      name: "nested",
      source: "local",
      path: "a/b/c",
    };

    const resolved = resolveReference(ref, { baseDir: dir });
    expect(resolved.resolvedPath).toBe(nested);
  });

  it("throws if local path does not exist", () => {
    const ref = {
      section: "agents",
      name: "missing",
      source: "local",
      path: "does-not-exist",
    };

    expect(() => resolveReference(ref, { baseDir: dir })).toThrow(
      /path not found/,
    );
  });

  it("includes name in error message for missing local path", () => {
    const ref = {
      section: "prompts",
      name: "my-prompt",
      source: "local",
      path: "gone",
    };

    expect(() => resolveReference(ref, { baseDir: dir })).toThrow(
      /Local source "my-prompt": path not found/,
    );
  });
});

describe("resolveLibrary", () => {
  let dir;
  beforeEach(() => {
    dir = scratch();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("resolves all entries in a library", () => {
    // Create local directories
    fs.mkdirSync(path.join(dir, "local-skills"), { recursive: true });
    fs.mkdirSync(path.join(dir, "local-agents"), { recursive: true });

    const library = {
      version: 1,
      skills: [
        {
          section: "skills",
          name: "github-skill",
          source: "github",
          path: "skills/x",
          repo: "owner/repo",
          ref: "main",
        },
        {
          section: "skills",
          name: "local-skill",
          source: "local",
          path: "local-skills",
        },
      ],
      agents: [
        {
          section: "agents",
          name: "ui-agent",
          source: "local",
          path: "local-agents",
        },
      ],
      prompts: [],
    };

    const resolved = resolveLibrary(library, { baseDir: dir });

    expect(resolved.version).toBe(1);
    expect(resolved.skills).toHaveLength(2);
    expect(resolved.agents).toHaveLength(1);
    expect(resolved.prompts).toHaveLength(0);

    // Check github skill
    const ghSkill = resolved.skills.find((s) => s.name === "github-skill");
    expect(ghSkill.type).toBe("github");
    expect(ghSkill.url).toBe("https://github.com/owner/repo");

    // Check local skill
    const localSkill = resolved.skills.find((s) => s.name === "local-skill");
    expect(localSkill.type).toBe("local");
    expect(localSkill.resolvedPath).toBe(path.join(dir, "local-skills"));

    // Check agent
    const agent = resolved.agents[0];
    expect(agent.type).toBe("local");
    expect(agent.resolvedPath).toBe(path.join(dir, "local-agents"));
  });

  it("throws on first bad local path during resolution", () => {
    const library = {
      version: 1,
      skills: [
        {
          section: "skills",
          name: "bad",
          source: "local",
          path: "does-not-exist",
        },
      ],
      agents: [],
      prompts: [],
    };

    expect(() => resolveLibrary(library, { baseDir: dir })).toThrow(
      /path not found/,
    );
  });

  it("handles multi-section library with mixed sources", () => {
    fs.mkdirSync(path.join(dir, "prompts-dir"), { recursive: true });

    const library = {
      version: 1,
      skills: [
        {
          section: "skills",
          name: "skill1",
          source: "github",
          path: "skills/1",
          repo: "a/b",
          ref: "dev",
        },
      ],
      agents: [
        {
          section: "agents",
          name: "ag1",
          source: "github",
          path: "agents/1",
          repo: "c/d",
          ref: "main",
        },
      ],
      prompts: [
        {
          section: "prompts",
          name: "prompt1",
          source: "local",
          path: "prompts-dir",
        },
      ],
    };

    const resolved = resolveLibrary(library, { baseDir: dir });

    expect(resolved.skills[0].url).toBe("https://github.com/a/b");
    expect(resolved.agents[0].url).toBe("https://github.com/c/d");
    expect(resolved.prompts[0].resolvedPath).toBe(
      path.join(dir, "prompts-dir"),
    );
  });

  it("preserves all fields during resolution", () => {
    fs.mkdirSync(path.join(dir, "test"));

    const library = {
      version: 1,
      skills: [
        {
          section: "skills",
          name: "test-skill",
          source: "local",
          path: "test",
        },
      ],
      agents: [],
      prompts: [],
    };

    const resolved = resolveLibrary(library, { baseDir: dir });
    const skill = resolved.skills[0];

    expect(skill.section).toBe("skills");
    expect(skill.name).toBe("test-skill");
    expect(skill.source).toBe("local");
    expect(skill.path).toBe("test");
    expect(skill.type).toBe("local");
  });
});
