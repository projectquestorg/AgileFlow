/**
 * Unit tests for the skill learnings runtime helper (new spec API).
 *
 * Covers:
 *  - readLearnings returns empty entries for missing file
 *  - appendLearning creates file if missing, adds entry with id+created
 *  - appendLearning trims to maxEntries when exceeded
 *  - formatLearningsBlock returns null for empty, correct markdown for entries
 *  - formatLearningsBlock orders by confidence (high first)
 */
import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// We need to bypass resolveSkillsDir's config reading — stub it so the
// skills dir always points inside the scratch directory.
vi.mock("../../../src/runtime/ide/capabilities.js", () => ({
  IDE_CAPABILITIES: {
    "claude-code": {
      skillsDir: ".claude/skills",
    },
  },
}));

import {
  readLearnings,
  appendLearning,
  formatLearningsBlock,
  scaffoldLearnings,
} from "../../../src/runtime/skills/learnings.js";

/** Build a scratch project dir that has no agileflow.config.json so the
 *  skills dir defaults to `.claude/skills`. */
function makeScratch() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "af-learn-"));
}

function skillsDir(scratch) {
  return path.join(scratch, ".claude", "skills");
}

function learnFile(scratch, skillName) {
  return path.join(
    skillsDir(scratch),
    skillName,
    "_learnings",
    `${skillName}.yaml`,
  );
}

describe("skill learnings — new spec API", () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = makeScratch();
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // readLearnings
  // -------------------------------------------------------------------------

  it("readLearnings returns empty entries for missing file", async () => {
    const result = await readLearnings("agileflow-research", scratch);
    expect(result.entries).toEqual([]);
    expect(result.version).toBe(1);
    expect(result.skill).toBe("agileflow-research");
  });

  it("readLearnings parses an existing file", async () => {
    const p = learnFile(scratch, "agileflow-research");
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    const doc = {
      version: 1,
      skill: "agileflow-research",
      updated: "2026-05-06",
      entries: [
        {
          id: "abc123",
          confidence: "high",
          created: "2026-05-06",
          observation: "prefer concise prompts",
          source: "correction",
        },
      ],
    };
    await fs.promises.writeFile(p, yaml.dump(doc), "utf8");

    const result = await readLearnings("agileflow-research", scratch);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].observation).toBe("prefer concise prompts");
    expect(result.skill).toBe("agileflow-research");
  });

  // -------------------------------------------------------------------------
  // appendLearning
  // -------------------------------------------------------------------------

  it("appendLearning creates file if missing, adds entry with id + created", async () => {
    await appendLearning("agileflow-research", scratch, {
      observation: "User prefers bullet lists",
      confidence: "high",
      source: "correction",
    });

    const p = learnFile(scratch, "agileflow-research");
    expect(fs.existsSync(p)).toBe(true);

    const doc = yaml.load(fs.readFileSync(p, "utf8"));
    expect(doc.entries).toHaveLength(1);
    const e = doc.entries[0];
    expect(e.observation).toBe("User prefers bullet lists");
    expect(e.confidence).toBe("high");
    expect(e.source).toBe("correction");
    expect(e.id).toMatch(/^[0-9a-f]{6}$/);
    expect(e.created).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("appendLearning appends to an existing file", async () => {
    await appendLearning("agileflow-adr", scratch, { observation: "first" });
    await appendLearning("agileflow-adr", scratch, { observation: "second" });

    const result = await readLearnings("agileflow-adr", scratch);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].observation).toBe("first");
    expect(result.entries[1].observation).toBe("second");
  });

  it("appendLearning trims oldest entries when maxEntries exceeded", async () => {
    for (let i = 0; i < 5; i++) {
      await appendLearning(
        "agileflow-story-writer",
        scratch,
        { observation: `signal-${i}` },
        { maxEntries: 3 },
      );
    }

    const result = await readLearnings("agileflow-story-writer", scratch);
    expect(result.entries).toHaveLength(3);
    expect(result.entries.map((e) => e.observation)).toEqual([
      "signal-2",
      "signal-3",
      "signal-4",
    ]);
  });

  it("appendLearning rejects empty observation", async () => {
    await expect(
      appendLearning("x", scratch, { observation: "  " }),
    ).rejects.toThrow(/non-empty/);
  });

  it("appendLearning rejects invalid confidence", async () => {
    await expect(
      appendLearning("x", scratch, {
        observation: "ok",
        confidence: "certain",
      }),
    ).rejects.toThrow(/confidence must be one of/);
  });

  it("appendLearning rejects invalid source", async () => {
    await expect(
      appendLearning("x", scratch, { observation: "ok", source: "guess" }),
    ).rejects.toThrow(/source must be one of/);
  });

  // -------------------------------------------------------------------------
  // formatLearningsBlock
  // -------------------------------------------------------------------------

  it("formatLearningsBlock returns null for empty entries", () => {
    expect(
      formatLearningsBlock({ entries: [], skill: "agileflow-research" }),
    ).toBeNull();
    expect(formatLearningsBlock(null)).toBeNull();
    expect(formatLearningsBlock(undefined)).toBeNull();
    expect(formatLearningsBlock({ entries: [] })).toBeNull();
  });

  it("formatLearningsBlock returns correct markdown for entries", () => {
    const learningsData = {
      skill: "agileflow-research",
      entries: [
        {
          id: "a1",
          confidence: "high",
          observation: "Use concise prompts",
          source: "correction",
        },
        {
          id: "b2",
          confidence: "medium",
          observation: "Project uses Prisma",
          source: "observation",
        },
      ],
    };
    const block = formatLearningsBlock(learningsData);
    expect(block).toContain("## Learned preferences (agileflow-research)");
    expect(block).toContain("From past sessions in this project:");
    expect(block).toContain("[high confidence] Use concise prompts");
    expect(block).toContain("[medium confidence] Project uses Prisma");
  });

  it("formatLearningsBlock orders by confidence: high first, then medium, then low", () => {
    const learningsData = {
      skill: "agileflow-research",
      entries: [
        {
          id: "c1",
          confidence: "low",
          observation: "low pref",
          source: "observation",
        },
        {
          id: "c2",
          confidence: "high",
          observation: "high pref",
          source: "correction",
        },
        {
          id: "c3",
          confidence: "medium",
          observation: "medium pref",
          source: "confirmation",
        },
      ],
    };
    const block = formatLearningsBlock(learningsData);
    const lines = block.split("\n");
    const highIdx = lines.findIndex((l) => l.includes("[high confidence]"));
    const medIdx = lines.findIndex((l) => l.includes("[medium confidence]"));
    const lowIdx = lines.findIndex((l) => l.includes("[low confidence]"));
    expect(highIdx).toBeLessThan(medIdx);
    expect(medIdx).toBeLessThan(lowIdx);
  });

  // -------------------------------------------------------------------------
  // Legacy scaffoldLearnings (kept for install.js compat)
  // -------------------------------------------------------------------------

  it("scaffoldLearnings creates a file in the legacy location", async () => {
    const r = await scaffoldLearnings(scratch, "demo-skill", "demo.yaml");
    expect(r.created).toBe(true);
    expect(fs.existsSync(r.path)).toBe(true);
    const text = fs.readFileSync(r.path, "utf8");
    expect(text).toMatch(/AgileFlow skill learnings — demo-skill/);
  });

  it("scaffoldLearnings is idempotent", async () => {
    await scaffoldLearnings(scratch, "demo-skill", "demo.yaml");
    const r2 = await scaffoldLearnings(scratch, "demo-skill", "demo.yaml");
    expect(r2.created).toBe(false);
  });
});
