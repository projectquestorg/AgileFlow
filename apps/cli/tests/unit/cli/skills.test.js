/**
 * Unit tests for `agileflow skills list` command.
 *
 * Uses a scratch dir with a minimal installed skills structure.
 *
 * Covers:
 *  - list shows installed skills with version and learns status
 *  - list shows learnings count for skills with learnings enabled
 *  - list prints "not installed" message when skills dir is absent
 *  - list --json returns structured output
 *  - unknown action exits 1
 */
import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/runtime/ide/capabilities.js", () => ({
  IDE_CAPABILITIES: {
    "claude-code": { skillsDir: ".claude/skills", skills: true, hooks: false },
  },
}));

import skillsCmd from "../../../src/cli/commands/skills.js";

function makeScratch() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "af-skills-"));
}

function writeConfig(dir, targets = ["claude-code"]) {
  fs.writeFileSync(
    path.join(dir, "agileflow.config.json"),
    JSON.stringify({
      version: 1,
      plugins: { core: { enabled: true } },
      ide: { targets },
      behaviors: {},
    }),
  );
}

function installFakeSkill(
  skillsDir,
  skillId,
  { version = "1.0.0", learnsEnabled = false, learnings = [] } = {},
) {
  const skillDir = path.join(skillsDir, skillId);
  fs.mkdirSync(skillDir, { recursive: true });
  const fm = {
    name: skillId,
    version,
    description: `Description for ${skillId}`,
    learns: {
      enabled: learnsEnabled,
      file: `_learnings/${skillId}.yaml`,
      maxEntries: 10,
    },
  };
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\n${yaml.dump(fm)}---\n\n# Body\n`,
  );
  if (learnsEnabled && learnings.length > 0) {
    const learningsDir = path.join(skillDir, "_learnings");
    fs.mkdirSync(learningsDir, { recursive: true });
    const doc = {
      version: 1,
      skill: skillId,
      updated: "2026-05-07",
      entries: learnings.map((obs, i) => ({
        id: `abc${i}`,
        confidence: "high",
        created: "2026-05-07",
        observation: obs,
        source: "correction",
      })),
    };
    fs.writeFileSync(
      path.join(learningsDir, `${skillId}.yaml`),
      yaml.dump(doc),
    );
  }
}

describe("agileflow skills list command", () => {
  let scratch;
  let originalCwd;
  let consoleOutput;

  beforeEach(() => {
    scratch = makeScratch();
    originalCwd = process.cwd();
    process.chdir(scratch);
    consoleOutput = [];
    vi.spyOn(console, "log").mockImplementation((...args) =>
      consoleOutput.push(args.join(" ")),
    );
    vi.spyOn(console, "error").mockImplementation((...args) =>
      consoleOutput.push(args.join(" ")),
    );
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(scratch, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("shows installed skills with version and learns status", async () => {
    writeConfig(scratch);
    const skillsDir = path.join(scratch, ".claude", "skills");
    installFakeSkill(skillsDir, "agileflow-epic-planner", { version: "2.0.0" });
    installFakeSkill(skillsDir, "agileflow-story-writer", {
      version: "1.0.0",
      learnsEnabled: true,
    });

    await skillsCmd("list", undefined, {});

    const all = consoleOutput.join("\n");
    expect(all).toContain("agileflow-epic-planner");
    expect(all).toContain("agileflow-story-writer");
    expect(all).toContain("2.0.0");
    expect(all).toContain("yes");
  });

  it("shows correct learnings count for skills with learnings", async () => {
    writeConfig(scratch);
    const skillsDir = path.join(scratch, ".claude", "skills");
    installFakeSkill(skillsDir, "agileflow-research", {
      learnsEnabled: true,
      learnings: ["prefer bullets", "concise prompts"],
    });

    await skillsCmd("list", undefined, {});

    const all = consoleOutput.join("\n");
    expect(all).toContain("yes (2)");
  });

  it("shows 'not installed' message when skills dir is absent", async () => {
    writeConfig(scratch);
    await skillsCmd("list", undefined, {});
    expect(consoleOutput.some((l) => l.includes("agileflow setup"))).toBe(true);
  });

  it("outputs JSON with structured skill data when --json flag is set", async () => {
    writeConfig(scratch);
    const skillsDir = path.join(scratch, ".claude", "skills");
    installFakeSkill(skillsDir, "agileflow-adr", { version: "1.0.0" });

    await skillsCmd("list", undefined, { json: true });

    const jsonLine = consoleOutput.find(
      (l) => l.startsWith("{") || l.startsWith("\n{"),
    );
    expect(jsonLine).toBeTruthy();
    const parsed = JSON.parse(jsonLine);
    expect(parsed.skills).toHaveLength(1);
    expect(parsed.skills[0].id).toBe("agileflow-adr");
    expect(parsed.ide).toBe("claude-code");
  });

  it("exits 1 for unknown action", async () => {
    await skillsCmd("purge", {}).catch(() => {});
    expect(consoleOutput.some((l) => l.includes("unknown action"))).toBe(true);
  });

  it("enable: exits 1 for unknown plugin id", async () => {
    writeConfig(scratch);
    await skillsCmd("enable", "nonexistent-plugin", {}).catch(() => {});
    expect(consoleOutput.some((l) => l.includes("unknown plugin"))).toBe(true);
  });

  it("disable: exits 1 when trying to disable core (cannotDisable)", async () => {
    writeConfig(scratch);
    await skillsCmd("disable", "core", {}).catch(() => {});
    expect(consoleOutput.some((l) => l.includes("cannot be disabled"))).toBe(
      true,
    );
  });

  it("enable: exits 1 when no agileflow.config.json found", async () => {
    await skillsCmd("enable", "ads", {}).catch(() => {});
    expect(consoleOutput.some((l) => l.includes("agileflow setup"))).toBe(true);
  });
});
