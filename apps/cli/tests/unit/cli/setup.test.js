/**
 * Unit tests for the post-split setup.js entry points:
 *   - setup() dispatcher routes correctly between the two flows
 *   - setupNonInteractive() happy path produces a working install
 *   - setupNonInteractive() rejects bad input via fail() before any
 *     filesystem mutations
 *
 * setupInteractive() is not covered here — it makes ~5 separate
 * @clack/prompts calls and would require a bigger dependency-injection
 * refactor to test cleanly. Manual sanity in this session confirmed the
 * interactive flow still works post-refactor.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import setup, { setupNonInteractive } from "../../../src/cli/commands/setup.js";

function scratch() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "af-setup-"));
}

describe("setup() dispatcher", () => {
  let consoleOutput;
  let exitMock;
  let originalCwd;
  let cwd;

  beforeEach(() => {
    cwd = scratch();
    originalCwd = process.cwd();
    process.chdir(cwd);
    consoleOutput = [];
    vi.spyOn(console, "log").mockImplementation((...args) =>
      consoleOutput.push(args.join(" ")),
    );
    vi.spyOn(console, "error").mockImplementation((...args) =>
      consoleOutput.push(args.join(" ")),
    );
    exitMock = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(cwd, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("routes --yes to the non-interactive flow without prompting", async () => {
    await setup({ yes: true });
    // Non-interactive flow logs `✓ Wrote ...` then plain console.log
    // outro lines. Interactive flow would call prompts.intro which
    // would write directly to stderr/stdout via clack — its presence
    // would mean we routed wrong.
    expect(consoleOutput.join("\n")).toContain("Wrote");
    expect(fs.existsSync(path.join(cwd, "agileflow.config.json"))).toBe(true);
    expect(exitMock).not.toHaveBeenCalled();
  });
});

describe("setupNonInteractive() happy path", () => {
  let consoleOutput;
  let originalCwd;
  let cwd;

  beforeEach(() => {
    cwd = scratch();
    originalCwd = process.cwd();
    process.chdir(cwd);
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
    fs.rmSync(cwd, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("writes config and installs core plugin from defaults", async () => {
    await setupNonInteractive({ yes: true }, cwd);
    const configPath = path.join(cwd, "agileflow.config.json");
    expect(fs.existsSync(configPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    expect(config.plugins.core.enabled).toBe(true);
    expect(config.ide.targets).toEqual(["claude-code"]);
    expect(config.install.scope).toBe("project");
  });

  it("respects --plugins flag to enable opt-in packs", async () => {
    await setupNonInteractive({ yes: true, plugins: "core,seo" }, cwd);
    const config = JSON.parse(
      fs.readFileSync(path.join(cwd, "agileflow.config.json"), "utf8"),
    );
    expect(config.plugins.core.enabled).toBe(true);
    expect(config.plugins.seo.enabled).toBe(true);
  });

  it("respects --ide flag", async () => {
    await setupNonInteractive({ yes: true, ide: "codex" }, cwd);
    const config = JSON.parse(
      fs.readFileSync(path.join(cwd, "agileflow.config.json"), "utf8"),
    );
    expect(config.ide.targets).toEqual(["codex"]);
  });

  it("surfaces stale-artifact warning when v3 leftovers exist", async () => {
    fs.mkdirSync(path.join(cwd, ".agileflow", "experts"), { recursive: true });
    await setupNonInteractive({ yes: true }, cwd);
    const out = consoleOutput.join("\n");
    expect(out).toMatch(/stale artifact/);
    expect(out).toMatch(/doctor --fix/);
    // Warning only — files still on disk.
    expect(fs.existsSync(path.join(cwd, ".agileflow", "experts"))).toBe(true);
  });
});

describe("setupNonInteractive() error paths", () => {
  let consoleOutput;
  let originalCwd;
  let cwd;

  beforeEach(() => {
    cwd = scratch();
    originalCwd = process.cwd();
    process.chdir(cwd);
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
    fs.rmSync(cwd, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("fails fast with a typed error on unknown --ide", async () => {
    await expect(
      setupNonInteractive({ yes: true, ide: "totally-bogus-ide" }, cwd),
    ).rejects.toThrow("process.exit(1)");
    const out = consoleOutput.join("\n");
    expect(out).toMatch(/unknown IDE/);
    expect(out).toMatch(/use one of/);
    expect(fs.existsSync(path.join(cwd, "agileflow.config.json"))).toBe(false);
  });

  it("fails fast with a typed error on unknown --plugins", async () => {
    await expect(
      setupNonInteractive({ yes: true, plugins: "core,nonexistent-pack" }, cwd),
    ).rejects.toThrow("process.exit(1)");
    const out = consoleOutput.join("\n");
    expect(out).toMatch(/unknown plugin/);
    expect(out).toMatch(/available plugins/);
    expect(fs.existsSync(path.join(cwd, "agileflow.config.json"))).toBe(false);
  });

  it("fails fast with a typed error on corrupted agileflow.config.json", async () => {
    fs.writeFileSync(
      path.join(cwd, "agileflow.config.json"),
      "{ not valid json",
    );
    await expect(setupNonInteractive({ yes: true }, cwd)).rejects.toThrow(
      "process.exit(1)",
    );
    const out = consoleOutput.join("\n");
    expect(out).toMatch(/fix or delete agileflow.config.json/);
  });
});
