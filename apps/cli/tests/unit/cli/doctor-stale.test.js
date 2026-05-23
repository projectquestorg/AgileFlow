/**
 * Unit tests for `checkStaleArtifacts` — the diagnose-only stale-state
 * detector. Each test sets up exactly one flavor of cruft in a scratch
 * directory and asserts the detector flags it (and nothing else).
 *
 * Includes audit-driven cases for malformed inputs (plugins as string,
 * hooks[event] as single object, broken YAML manifest) that an earlier
 * implementation would have crashed on or silently false-negated.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { checkStaleArtifacts } from "../../../src/cli/commands/doctor.js";

function scratch() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "af-stale-"));
}

function writeSettings(cwd, hooks) {
  fs.mkdirSync(path.join(cwd, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, ".claude", "settings.json"),
    JSON.stringify({ hooks }, null, 2),
  );
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

function writeConfig(cwd, plugins) {
  fs.writeFileSync(
    path.join(cwd, "agileflow.config.json"),
    JSON.stringify({
      version: 1,
      plugins,
      hooks: {},
      behaviors: {},
      learnings: { enabled: true },
      ide: { targets: ["claude-code"] },
      language: "en",
    }),
  );
}

describe("checkStaleArtifacts", () => {
  let cwd;
  beforeEach(() => {
    cwd = scratch();
  });
  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("returns no issues on a clean directory", async () => {
    const issues = await checkStaleArtifacts(cwd);
    expect(issues).toEqual([]);
  });

  it("flags legacy PreCompact hook event written by AgileFlow", async () => {
    writeSettings(cwd, {
      PreCompact: [agileflowEntry("npx agileflow hook PreCompact")],
    });
    const issues = await checkStaleArtifacts(cwd);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("legacy-hook-event");
    expect(issues[0].severity).toBe("warn");
    expect(issues[0].message).toContain("PreCompact");
  });

  it("flags legacy PostToolUse hook event written by AgileFlow", async () => {
    writeSettings(cwd, {
      PostToolUse: [agileflowEntry("npx agileflow hook PostToolUse")],
    });
    const issues = await checkStaleArtifacts(cwd);
    expect(issues.some((i) => i.kind === "legacy-hook-event")).toBe(true);
  });

  it("does NOT flag legacy events that contain only user hooks", async () => {
    writeSettings(cwd, {
      PreCompact: [{ hooks: [{ type: "command", command: "echo mine" }] }],
    });
    const issues = await checkStaleArtifacts(cwd);
    expect(issues).toEqual([]);
  });

  it("flags unknown event containing AgileFlow command as orphan", async () => {
    writeSettings(cwd, {
      SomeRetiredEvent: [agileflowEntry("npx agileflow hook SomeRetiredEvent")],
    });
    const issues = await checkStaleArtifacts(cwd);
    expect(issues.some((i) => i.kind === "orphan-hook-event")).toBe(true);
  });

  it("ignores current managed events (SessionStart, PreToolUse, etc.)", async () => {
    writeSettings(cwd, {
      SessionStart: [agileflowEntry("npx agileflow hook SessionStart")],
    });
    const issues = await checkStaleArtifacts(cwd);
    expect(issues).toEqual([]);
  });

  it("flags v3-era .agileflow/ subdirectories", async () => {
    fs.mkdirSync(path.join(cwd, ".agileflow", "commands"), { recursive: true });
    fs.mkdirSync(path.join(cwd, ".agileflow", "experts"), { recursive: true });
    const issues = await checkStaleArtifacts(cwd);
    const kinds = issues.filter((i) => i.kind === "legacy-agileflow-subdir");
    expect(kinds).toHaveLength(2);
    expect(kinds.map((i) => path.basename(i.path)).sort()).toEqual([
      "commands",
      "experts",
    ]);
  });

  it("flags v3-era .agileflow/ files (CHANGELOG.md, config.yaml)", async () => {
    fs.mkdirSync(path.join(cwd, ".agileflow"), { recursive: true });
    fs.writeFileSync(path.join(cwd, ".agileflow", "CHANGELOG.md"), "old");
    fs.writeFileSync(path.join(cwd, ".agileflow", "config.yaml"), "v: 1");
    const issues = await checkStaleArtifacts(cwd);
    const files = issues.filter((i) => i.kind === "legacy-agileflow-file");
    expect(files).toHaveLength(2);
  });

  it("flags v3 .claude/ subdirs only if they contain agileflow-* entries", async () => {
    // user-owned content in .claude/hooks should NOT trip the detector
    fs.mkdirSync(path.join(cwd, ".claude", "hooks"), { recursive: true });
    fs.writeFileSync(path.join(cwd, ".claude", "hooks", "my-helper.sh"), "x");
    let issues = await checkStaleArtifacts(cwd);
    expect(issues).toEqual([]);

    // agileflow-prefixed entry → flag it
    fs.writeFileSync(
      path.join(cwd, ".claude", "hooks", "agileflow-old.sh"),
      "x",
    );
    issues = await checkStaleArtifacts(cwd);
    expect(issues.some((i) => i.kind === "legacy-claude-subdir")).toBe(true);
  });

  it("flags broken hook-manifest script references as errors", async () => {
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
    const issues = await checkStaleArtifacts(cwd);
    const broken = issues.filter((i) => i.kind === "broken-hook-script");
    expect(broken).toHaveLength(1);
    expect(broken[0].severity).toBe("error");
  });

  it("flags orphan skill dirs not owned by any enabled plugin", async () => {
    writeConfig(cwd, { core: { enabled: true } });
    const skillDir = path.join(cwd, ".claude", "skills", "agileflow-ghost");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: x\n---");

    const issues = await checkStaleArtifacts(cwd);
    const orphans = issues.filter((i) => i.kind === "orphan-skill-dir");
    expect(orphans).toHaveLength(1);
    expect(orphans[0].path).toContain("agileflow-ghost");
  });

  it("does NOT flag skill dirs that are present in an enabled plugin", async () => {
    writeConfig(cwd, { core: { enabled: true } });
    // agileflow-adr is a real core skill
    const skillDir = path.join(cwd, ".claude", "skills", "agileflow-adr");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: x\n---");

    const issues = await checkStaleArtifacts(cwd);
    expect(issues.filter((i) => i.kind === "orphan-skill-dir")).toEqual([]);
  });

  // ---- audit-driven malformed input cases ----

  it("does not crash when agileflow.config.json has plugins as a string", async () => {
    fs.writeFileSync(
      path.join(cwd, "agileflow.config.json"),
      JSON.stringify({ version: 1, plugins: "core" }),
    );
    // Would have thrown TypeError on Object.entries(string) in the
    // pre-audit version.
    const issues = await checkStaleArtifacts(cwd);
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.filter((i) => i.kind === "orphan-skill-dir")).toEqual([]);
  });

  it("does not crash when agileflow.config.json has plugins as an array", async () => {
    fs.writeFileSync(
      path.join(cwd, "agileflow.config.json"),
      JSON.stringify({ version: 1, plugins: ["core", "engineering"] }),
    );
    const issues = await checkStaleArtifacts(cwd);
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.filter((i) => i.kind === "orphan-skill-dir")).toEqual([]);
  });

  it("does not crash when settings.json has hooks as an array", async () => {
    writeRawSettings(cwd, { hooks: [] });
    const issues = await checkStaleArtifacts(cwd);
    expect(Array.isArray(issues)).toBe(true);
  });

  it("handles non-array hooks[event] by coercing single object", async () => {
    // User hand-edited settings.json and wrote a single object instead
    // of the expected array wrapper. We should still see the AgileFlow
    // command rather than silently drop it.
    writeRawSettings(cwd, {
      hooks: {
        PreCompact: agileflowEntry("npx agileflow hook PreCompact"),
      },
    });
    const issues = await checkStaleArtifacts(cwd);
    expect(issues.some((i) => i.kind === "legacy-hook-event")).toBe(true);
  });

  it("does not crash on malformed YAML hook manifest", async () => {
    fs.mkdirSync(path.join(cwd, ".agileflow"), { recursive: true });
    // Invalid YAML that loadHookManifest will reject
    fs.writeFileSync(
      path.join(cwd, ".agileflow", "hook-manifest.yaml"),
      "this: is: not: valid: yaml: [\n",
    );
    // Other detection (e.g., legacy hook event) must still work even
    // though the manifest is unparseable — that's the audit fix.
    writeSettings(cwd, {
      PreCompact: [agileflowEntry("npx agileflow hook PreCompact")],
    });
    const issues = await checkStaleArtifacts(cwd);
    // legacy-hook-event should still surface despite manifest failure
    expect(issues.some((i) => i.kind === "legacy-hook-event")).toBe(true);
    // and we should NOT have thrown
    expect(Array.isArray(issues)).toBe(true);
  });

  it("does not push duplicate core when config already enables it", async () => {
    // This is a behavior contract — the detector shouldn't error or
    // produce different output based on whether core was explicitly
    // listed. Both forms should give the same orphan result.
    writeConfig(cwd, {
      core: { enabled: true },
      engineering: { enabled: true },
    });
    const skillDir = path.join(cwd, ".claude", "skills", "agileflow-ghost");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: x\n---");
    const issues = await checkStaleArtifacts(cwd);
    const orphans = issues.filter((i) => i.kind === "orphan-skill-dir");
    expect(orphans).toHaveLength(1);
  });
});
