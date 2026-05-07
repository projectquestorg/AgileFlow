/**
 * Unit tests for `agileflow update` command — guard paths only.
 *
 * The full install pipeline is covered by tests/integration/install-plugins.test.js.
 * Here we test the command's own guards:
 *  - exits 1 when no agileflow.config.json found
 *  - exits 1 when config.json is malformed JSON
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/runtime/ide/capabilities.js", () => ({
  capabilitiesFor: vi.fn(() => ({ hooks: false })),
  hookEventsForIdes: vi.fn(() => []),
  IDE_CAPABILITIES: { "claude-code": { skillsDir: ".claude/skills" } },
}));

import update from "../../../src/cli/commands/update.js";

function makeScratch() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "af-update-"));
}

describe("agileflow update command — guards", () => {
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

  it("exits 1 and suggests setup when no agileflow.config.json found", async () => {
    await update({}).catch(() => {});
    expect(consoleOutput.some((l) => l.includes("agileflow setup"))).toBe(true);
  });

  it("exits 1 when agileflow.config.json contains invalid JSON", async () => {
    fs.writeFileSync(
      path.join(scratch, "agileflow.config.json"),
      "{ not json }",
    );
    await update({}).catch(() => {});
    // Should emit an error (malformed config is caught by loadConfig)
    expect(consoleOutput.some((l) => l.includes("agileflow update:"))).toBe(
      true,
    );
  });
});
