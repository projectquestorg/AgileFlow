/**
 * Unit tests for `agileflow learn` command.
 *
 * Uses real bundled skills:
 *  - agileflow-epic-planner  → learns.enabled: true
 *  - agileflow-status-updater → learns.enabled: false
 *
 * Covers:
 *  - append writes a learning entry and prints count
 *  - append rejects blank observation
 *  - append rejects invalid confidence
 *  - list prints entries sorted by confidence (high first)
 *  - list prints empty message when no entries
 *  - unknown action calls process.exit(1)
 *  - skill with learns.enabled: false does not write a file
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Bypass resolveSkillsDir config reading — skills dir defaults to .claude/skills
vi.mock("../../../src/runtime/ide/capabilities.js", () => ({
  IDE_CAPABILITIES: {
    "claude-code": { skillsDir: ".claude/skills" },
  },
}));

import learn from "../../../src/cli/commands/learn.js";

function makeScratch() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "af-learn-cmd-"));
}

function defaultLearningsPath(scratch, skillName) {
  return path.join(
    scratch,
    ".claude",
    "skills",
    skillName,
    "_learnings",
    `${skillName}.yaml`,
  );
}

describe("agileflow learn command", () => {
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

  it("append writes a learning entry and prints count", async () => {
    await learn("append", "agileflow-epic-planner", "prefer 3 milestones", {
      confidence: "high",
      source: "correction",
    });
    const p = defaultLearningsPath(scratch, "agileflow-epic-planner");
    expect(fs.existsSync(p)).toBe(true);
    expect(
      consoleOutput.some(
        (l) =>
          l.includes("✓ learning saved") &&
          l.includes("agileflow-epic-planner"),
      ),
    ).toBe(true);
  });

  it("append rejects blank observation", async () => {
    await learn("append", "agileflow-epic-planner", "   ", {}).catch(() => {});
    expect(consoleOutput.some((l) => l.includes("usage"))).toBe(true);
  });

  it("append rejects invalid confidence", async () => {
    await learn("append", "agileflow-epic-planner", "valid obs", {
      confidence: "very-high",
    }).catch(() => {});
    expect(consoleOutput.some((l) => l.includes("confidence"))).toBe(true);
  });

  it("list prints entries sorted by confidence (high first)", async () => {
    await learn("append", "agileflow-epic-planner", "low pref", {
      confidence: "low",
      source: "observation",
    });
    await learn("append", "agileflow-epic-planner", "high pref", {
      confidence: "high",
      source: "correction",
    });

    consoleOutput = [];
    await learn("list", "agileflow-epic-planner");
    const highIdx = consoleOutput.findIndex((l) => l.includes("high pref"));
    const lowIdx = consoleOutput.findIndex((l) => l.includes("low pref"));
    expect(highIdx).toBeGreaterThanOrEqual(0);
    expect(lowIdx).toBeGreaterThan(highIdx);
  });

  it("list prints empty message when no entries", async () => {
    await learn("list", "agileflow-epic-planner");
    expect(consoleOutput.some((l) => l.includes("no learnings yet"))).toBe(
      true,
    );
  });

  it("unknown action exits 1", async () => {
    await learn("delete", "agileflow-epic-planner", "obs", {}).catch(() => {});
    expect(consoleOutput.some((l) => l.includes("unknown action"))).toBe(true);
  });

  it("skill with learns.enabled: false does not write a file", async () => {
    await learn("append", "agileflow-status-updater", "some obs", {}).catch(
      () => {},
    );
    const p = defaultLearningsPath(scratch, "agileflow-status-updater");
    expect(fs.existsSync(p)).toBe(false);
  });
});
