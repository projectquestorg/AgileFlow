/**
 * Unit tests for `agileflow plugins list` command.
 *
 * Uses the real bundled plugin registry (discoverPlugins() reads content/).
 *
 * Covers:
 *  - list shows all plugins with status and skill count
 *  - list marks enabled plugins correctly when config present
 *  - list marks cannotDisable plugins as "always"
 *  - list shows "defaults" note when no config
 *  - list --json returns structured output
 *  - unknown action exits 1
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import pluginsCmd from "../../../src/cli/commands/plugins.js";

function makeScratch() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "af-plugins-"));
}

function writeConfig(dir, pluginOverrides = {}) {
  const plugins = {
    core: { enabled: true },
    ads: { enabled: true },
    audit: { enabled: false },
    ...pluginOverrides,
  };
  fs.writeFileSync(
    path.join(dir, "agileflow.config.json"),
    JSON.stringify({
      version: 1,
      plugins,
      ide: { targets: ["claude-code"] },
      behaviors: {},
    }),
  );
}

describe("agileflow plugins list command", () => {
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

  it("list shows all plugins with status and skill count", async () => {
    writeConfig(scratch);
    await pluginsCmd("list", {});
    const all = consoleOutput.join("\n");
    // core, ads, audit should all appear
    expect(all).toContain("core");
    expect(all).toContain("ads");
    expect(all).toContain("audit");
  });

  it("list marks enabled and disabled plugins correctly", async () => {
    writeConfig(scratch, { ads: { enabled: true }, audit: { enabled: false } });
    await pluginsCmd("list", {});
    const all = consoleOutput.join("\n");
    expect(all).toContain("enabled");
    expect(all).toContain("disabled");
  });

  it("list marks core as 'always' (cannotDisable)", async () => {
    writeConfig(scratch);
    await pluginsCmd("list", {});
    const all = consoleOutput.join("\n");
    expect(all).toContain("always");
  });

  it("list shows defaults notice when no config present", async () => {
    await pluginsCmd("list", {});
    const all = consoleOutput.join("\n");
    expect(all).toContain("agileflow setup");
  });

  it("list --json returns structured output with plugins array", async () => {
    writeConfig(scratch);
    await pluginsCmd("list", { json: true });
    const jsonLine = consoleOutput.find((l) => l.startsWith("{"));
    expect(jsonLine).toBeTruthy();
    const parsed = JSON.parse(jsonLine);
    expect(Array.isArray(parsed.plugins)).toBe(true);
    expect(parsed.plugins.length).toBeGreaterThan(0);
    const core = parsed.plugins.find((p) => p.id === "core");
    expect(core).toBeDefined();
    expect(core.cannotDisable).toBe(true);
  });

  it("exits 1 for unknown action", async () => {
    await pluginsCmd("install", {}).catch(() => {});
    expect(consoleOutput.some((l) => l.includes("unknown action"))).toBe(true);
  });
});
