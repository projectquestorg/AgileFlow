/**
 * Unit tests for `applyStaleFix` and `doctorFix` — the removal half of
 * the stale-artifact workflow. Each test sets up a specific stale state,
 * applies the fix, and verifies the filesystem ends in the expected
 * state (and untouched user content stays untouched).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  applyStaleFix,
  doctorFix,
  checkStaleArtifacts,
} from "../../../src/cli/commands/doctor.js";

function scratch() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "af-fix-"));
}

function writeRawSettings(cwd, settingsObj) {
  fs.mkdirSync(path.join(cwd, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, ".claude", "settings.json"),
    JSON.stringify(settingsObj, null, 2),
  );
}

function agileflowEntry(command) {
  return { hooks: [{ type: "command", command, timeout: 30 }] };
}

describe("applyStaleFix", () => {
  let cwd;
  beforeEach(() => {
    cwd = scratch();
  });
  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("strips AgileFlow entries from legacy hook event, preserves user entries", () => {
    const userEntry = {
      hooks: [{ type: "command", command: "echo user", timeout: 5 }],
    };
    writeRawSettings(cwd, {
      hooks: {
        PreCompact: [
          agileflowEntry("npx agileflow hook PreCompact"),
          userEntry,
        ],
      },
    });
    const settingsPath = path.join(cwd, ".claude", "settings.json");
    const r = applyStaleFix(
      {
        kind: "legacy-hook-event",
        path: `${settingsPath}#hooks.PreCompact`,
        message: "x",
      },
      cwd,
    );
    expect(r.ok).toBe(true);
    const after = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    expect(after.hooks.PreCompact).toEqual([userEntry]);
  });

  it("drops empty event after removing the only AgileFlow entry", () => {
    writeRawSettings(cwd, {
      hooks: {
        PreCompact: [agileflowEntry("npx agileflow hook PreCompact")],
        SessionStart: [agileflowEntry("npx agileflow hook SessionStart")],
      },
    });
    const settingsPath = path.join(cwd, ".claude", "settings.json");
    applyStaleFix(
      {
        kind: "legacy-hook-event",
        path: `${settingsPath}#hooks.PreCompact`,
        message: "x",
      },
      cwd,
    );
    const after = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    expect(after.hooks.PreCompact).toBeUndefined();
    expect(after.hooks.SessionStart).toBeDefined();
  });

  it("removes legacy-agileflow-subdir recursively", () => {
    const dir = path.join(cwd, ".agileflow", "commands");
    fs.mkdirSync(path.join(dir, "nested"), { recursive: true });
    fs.writeFileSync(path.join(dir, "nested", "f.txt"), "x");
    const r = applyStaleFix(
      { kind: "legacy-agileflow-subdir", path: dir, message: "x" },
      cwd,
    );
    expect(r.ok).toBe(true);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("removes legacy-agileflow-file", () => {
    const file = path.join(cwd, ".agileflow", "CHANGELOG.md");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "old");
    const r = applyStaleFix(
      { kind: "legacy-agileflow-file", path: file, message: "x" },
      cwd,
    );
    expect(r.ok).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("removes only agileflow-* files from legacy-claude-subdir, preserves user files", () => {
    const dir = path.join(cwd, ".claude", "hooks");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "agileflow-old.sh"), "x");
    fs.writeFileSync(path.join(dir, "my-helper.sh"), "x");
    const r = applyStaleFix(
      { kind: "legacy-claude-subdir", path: dir, message: "x" },
      cwd,
    );
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(dir, "agileflow-old.sh"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "my-helper.sh"))).toBe(true);
    // dir itself preserved because user file remains
    expect(fs.existsSync(dir)).toBe(true);
  });

  it("removes empty legacy-claude-subdir after removing all agileflow-* entries", () => {
    const dir = path.join(cwd, ".claude", "hooks");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "agileflow-a.sh"), "x");
    fs.writeFileSync(path.join(dir, "agileflow-b.sh"), "y");
    applyStaleFix(
      { kind: "legacy-claude-subdir", path: dir, message: "x" },
      cwd,
    );
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("removes orphan-skill-dir recursively", () => {
    const dir = path.join(cwd, ".claude", "skills", "agileflow-ghost");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), "---\nname: x\n---");
    const r = applyStaleFix(
      { kind: "orphan-skill-dir", path: dir, message: "x" },
      cwd,
    );
    expect(r.ok).toBe(true);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("returns ok:false for broken-hook-script (cannot auto-fix)", () => {
    const r = applyStaleFix(
      {
        kind: "broken-hook-script",
        path: "/tmp/missing.js",
        message: "x",
      },
      cwd,
    );
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Run `agileflow update`");
  });

  it("returns ok:false for unknown kinds", () => {
    const r = applyStaleFix(
      { kind: "totally-made-up-kind", message: "x" },
      cwd,
    );
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Unknown issue kind");
  });
});

describe("doctorFix", () => {
  let cwd;
  beforeEach(() => {
    cwd = scratch();
  });
  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("dry-run mode (yes=false) does not modify the filesystem", async () => {
    fs.mkdirSync(path.join(cwd, ".agileflow", "experts"), { recursive: true });
    const log = [];
    const r = await doctorFix(cwd, { yes: false, log: (m) => log.push(m) });
    expect(r.dryRun).toBe(true);
    expect(r.fixed).toBe(0);
    expect(fs.existsSync(path.join(cwd, ".agileflow", "experts"))).toBe(true);
    expect(log.join("\n")).toContain("dry-run");
  });

  it("execute mode (yes=true) removes all fixable issues", async () => {
    fs.mkdirSync(path.join(cwd, ".agileflow", "experts"), { recursive: true });
    fs.mkdirSync(path.join(cwd, ".agileflow", "commands"), { recursive: true });
    const log = [];
    const r = await doctorFix(cwd, { yes: true, log: (m) => log.push(m) });
    expect(r.dryRun).toBe(false);
    expect(r.fixed).toBe(2);
    expect(r.failed).toBe(0);
    expect(fs.existsSync(path.join(cwd, ".agileflow", "experts"))).toBe(false);
    expect(fs.existsSync(path.join(cwd, ".agileflow", "commands"))).toBe(false);
  });

  it("reports zero detected on a clean directory", async () => {
    const log = [];
    const r = await doctorFix(cwd, { yes: true, log: (m) => log.push(m) });
    expect(r.detected).toBe(0);
    expect(log.join("\n")).toContain("nothing to fix");
  });

  it("after --fix --yes, a second checkStaleArtifacts shows zero issues", async () => {
    fs.mkdirSync(path.join(cwd, ".agileflow"), { recursive: true });
    fs.writeFileSync(path.join(cwd, ".agileflow", "CHANGELOG.md"), "old");
    fs.writeFileSync(path.join(cwd, ".agileflow", "config.yaml"), "v: 1");
    fs.mkdirSync(path.join(cwd, ".agileflow", "experts"), { recursive: true });

    const before = await checkStaleArtifacts(cwd);
    expect(before.length).toBe(3);

    await doctorFix(cwd, { yes: true, log: () => {} });

    const after = await checkStaleArtifacts(cwd);
    expect(after).toEqual([]);
  });

  it("broken-hook-script counts as failed, doesn't block other fixes", async () => {
    // Set up: broken script reference + a legacy subdir
    fs.mkdirSync(path.join(cwd, ".agileflow"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".agileflow", "hook-manifest.yaml"),
      [
        "version: 1",
        "hooks:",
        "  - id: ghost",
        "    event: SessionStart",
        "    script: .agileflow/plugins/gone/hooks/missing.js",
        "    timeout: 5000",
        "    skipOnError: true",
      ].join("\n"),
    );
    fs.mkdirSync(path.join(cwd, ".agileflow", "experts"), { recursive: true });
    const r = await doctorFix(cwd, { yes: true, log: () => {} });
    expect(r.fixed).toBe(1); // the experts dir
    expect(r.failed).toBe(1); // the broken script
  });
});
