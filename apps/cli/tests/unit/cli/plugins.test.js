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

  it("list --enabled filters to only enabled and always plugins", async () => {
    writeConfig(scratch, {
      ads: { enabled: true },
      audit: { enabled: false },
    });
    await pluginsCmd("list", undefined, { enabled: true, json: true });
    const jsonLine = consoleOutput.find((l) => l.startsWith("{"));
    const parsed = JSON.parse(jsonLine);
    const ids = parsed.plugins.map((p) => p.id);
    expect(ids).toContain("core"); // always
    expect(ids).toContain("ads"); // enabled
    expect(ids).not.toContain("audit"); // disabled — excluded
  });

  it("list --disabled filters to only disabled plugins (excludes always)", async () => {
    writeConfig(scratch, {
      ads: { enabled: true },
      audit: { enabled: false },
    });
    await pluginsCmd("list", undefined, { disabled: true, json: true });
    const jsonLine = consoleOutput.find((l) => l.startsWith("{"));
    const parsed = JSON.parse(jsonLine);
    const ids = parsed.plugins.map((p) => p.id);
    expect(ids).not.toContain("core"); // always — excluded
    expect(ids).not.toContain("ads"); // enabled — excluded
    expect(ids).toContain("audit"); // disabled
  });

  it("list rejects --enabled + --disabled used together", async () => {
    writeConfig(scratch);
    await pluginsCmd("list", undefined, {
      enabled: true,
      disabled: true,
    }).catch(() => {});
    expect(consoleOutput.some((l) => l.includes("mutually exclusive"))).toBe(
      true,
    );
  });

  it("search matches plugin id substring", async () => {
    writeConfig(scratch);
    await pluginsCmd("search", "audit", { json: true });
    const jsonLine = consoleOutput.find((l) => l.startsWith("{"));
    const parsed = JSON.parse(jsonLine);
    expect(parsed.query).toBe("audit");
    expect(parsed.plugins.some((p) => p.id === "audit")).toBe(true);
  });

  it("search is case-insensitive", async () => {
    writeConfig(scratch);
    await pluginsCmd("search", "CORE", { json: true });
    const jsonLine = consoleOutput.find((l) => l.startsWith("{"));
    const parsed = JSON.parse(jsonLine);
    expect(parsed.plugins.some((p) => p.id === "core")).toBe(true);
  });

  it("search prints empty message when nothing matches", async () => {
    writeConfig(scratch);
    await pluginsCmd("search", "zzz-no-such-plugin", {});
    expect(
      consoleOutput.some((l) =>
        l.includes('No plugins match "zzz-no-such-plugin"'),
      ),
    ).toBe(true);
  });

  it("search rejects empty query", async () => {
    writeConfig(scratch);
    await pluginsCmd("search", "", {}).catch(() => {});
    expect(consoleOutput.some((l) => l.includes("requires a query"))).toBe(
      true,
    );
  });

  it("search rejects whitespace-only query", async () => {
    writeConfig(scratch);
    await pluginsCmd("search", "   ", {}).catch(() => {});
    expect(consoleOutput.some((l) => l.includes("requires a query"))).toBe(
      true,
    );
  });

  it("search rejects when options object is passed instead of query", async () => {
    writeConfig(scratch);
    // Legacy two-arg call style with options bag in arg position — the
    // normalization branch should hoist it to options and then the empty
    // query check should fire.
    await pluginsCmd("search", { json: true }).catch(() => {});
    expect(consoleOutput.some((l) => l.includes("requires a query"))).toBe(
      true,
    );
  });

  it("search human output does not double-print the header", async () => {
    writeConfig(scratch);
    await pluginsCmd("search", "audit", {});
    const all = consoleOutput.join("\n");
    expect(all).toContain('Plugins matching "audit":');
    expect(all).not.toContain("Available plugins:");
  });

  it("show prints plugin detail with provides breakdown", async () => {
    writeConfig(scratch);
    await pluginsCmd("show", "core", {});
    const all = consoleOutput.join("\n");
    expect(all).toContain("core");
    expect(all).toContain("Version:");
    expect(all).toContain("Status:");
    expect(all).toContain("Depends:");
    expect(all).toContain("Provides:");
    expect(all).toContain("Skills");
  });

  it("show --json returns full plugin structure", async () => {
    writeConfig(scratch);
    await pluginsCmd("show", "core", { json: true });
    const jsonLine = consoleOutput.find((l) => l.startsWith("{"));
    const parsed = JSON.parse(jsonLine);
    expect(parsed.plugin.id).toBe("core");
    expect(parsed.plugin.cannotDisable).toBe(true);
    expect(parsed.plugin.provides).toBeDefined();
    expect(Array.isArray(parsed.plugin.provides.skills)).toBe(true);
  });

  it("show exits 1 for unknown plugin id", async () => {
    writeConfig(scratch);
    await pluginsCmd("show", "nonexistent", {}).catch(() => {});
    expect(
      consoleOutput.some((l) => l.includes('plugin "nonexistent" not found')),
    ).toBe(true);
  });

  it("show rejects empty id", async () => {
    writeConfig(scratch);
    await pluginsCmd("show", "", {}).catch(() => {});
    expect(consoleOutput.some((l) => l.includes("requires a plugin id"))).toBe(
      true,
    );
  });
});
