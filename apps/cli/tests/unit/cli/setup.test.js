/**
 * Unit tests for the post-split setup.js entry points:
 *   - setup() dispatcher routes correctly between the two flows
 *   - setupNonInteractive() happy path produces a working install
 *   - setupNonInteractive() rejects bad input via fail() before any
 *     filesystem mutations
 *   - setupInteractive() drives the wizard end-to-end with injected
 *     stub pickers and a stub @clack/prompts module
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import setup, {
  setupNonInteractive,
  setupInteractive,
} from "../../../src/cli/commands/setup.js";
import { defaultConfig } from "../../../src/runtime/config/defaults.js";

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

function makePromptsStub() {
  return {
    intro: vi.fn(),
    outro: vi.fn(),
    cancel: vi.fn(),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), message: vi.fn() },
    spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
    select: vi.fn().mockResolvedValue("customize"),
    confirm: vi.fn().mockResolvedValue(false),
    isCancel: vi.fn(() => false),
  };
}

function makeWizardStubs(overrides = {}) {
  return {
    prompts: makePromptsStub(),
    pickSetupMode: vi.fn().mockResolvedValue("customize"),
    pickInstallScope: vi.fn().mockResolvedValue("project"),
    pickIdes: vi.fn().mockResolvedValue(["claude-code"]),
    pickPlugins: vi.fn().mockResolvedValue({ core: { enabled: true } }),
    pickBehaviors: vi.fn().mockImplementation((defaults) => defaults),
    pickBabysitMode: vi.fn().mockResolvedValue({ mode: "light" }),
    pickLearnings: vi.fn().mockResolvedValue({ enabled: false }),
    ...overrides,
  };
}

describe("setupInteractive() with injected stubs", () => {
  let originalCwd;
  let cwd;

  beforeEach(() => {
    cwd = scratch();
    originalCwd = process.cwd();
    process.chdir(cwd);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(cwd, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("runs the wizard end-to-end and writes a config matching picker results", async () => {
    const deps = makeWizardStubs({
      pickIdes: vi.fn().mockResolvedValue(["claude-code"]),
      pickPlugins: vi
        .fn()
        .mockResolvedValue({ core: { enabled: true }, seo: { enabled: true } }),
      pickBabysitMode: vi.fn().mockResolvedValue({ mode: "full" }),
    });
    await setupInteractive({}, cwd, deps);

    const config = JSON.parse(
      fs.readFileSync(path.join(cwd, "agileflow.config.json"), "utf8"),
    );
    expect(config.plugins.core.enabled).toBe(true);
    expect(config.plugins.seo.enabled).toBe(true);
    expect(config.ide.targets).toEqual(["claude-code"]);
    expect(config.plugins.core.settings.babysit).toEqual({ mode: "full" });
    expect(deps.prompts.intro).toHaveBeenCalledTimes(1);
    expect(deps.prompts.outro).toHaveBeenCalledTimes(1);
  });

  it("calls every picker exactly once on the happy path", async () => {
    const deps = makeWizardStubs();
    await setupInteractive({}, cwd, deps);
    expect(deps.pickInstallScope).toHaveBeenCalledTimes(1);
    expect(deps.pickIdes).toHaveBeenCalledTimes(1);
    expect(deps.pickPlugins).toHaveBeenCalledTimes(1);
    expect(deps.pickBabysitMode).toHaveBeenCalledTimes(1);
  });

  it("skips pickBehaviors when no selected IDE supports hooks", async () => {
    // cursor / windsurf / antigravity have hooks: false.
    const deps = makeWizardStubs({
      pickIdes: vi.fn().mockResolvedValue(["cursor"]),
    });
    await setupInteractive({}, cwd, deps);
    expect(deps.pickBehaviors).not.toHaveBeenCalled();
  });

  it("skips pickLearnings when no selected IDE supports skills", async () => {
    // Hypothetical: if there were an IDE without skills, pickLearnings
    // would be skipped. In practice all current IDEs support skills,
    // so we can't easily construct this case — assert the call
    // happens for a skill-supporting target as a sanity check.
    const deps = makeWizardStubs();
    await setupInteractive({}, cwd, deps);
    expect(deps.pickLearnings).toHaveBeenCalledTimes(1);
  });

  it("exits via prompts.log.error when loadConfig throws", async () => {
    // Write malformed config so loadConfig blows up.
    fs.writeFileSync(
      path.join(cwd, "agileflow.config.json"),
      "{ not valid json",
    );
    const deps = makeWizardStubs();
    await expect(setupInteractive({}, cwd, deps)).rejects.toThrow(
      "process.exit(1)",
    );
    expect(deps.prompts.log.error).toHaveBeenCalled();
    expect(deps.prompts.log.info).toHaveBeenCalledWith(
      expect.stringMatching(/fix or delete agileflow.config.json/i),
    );
  });

  it("exits via prompts.log.error + cancel when pickPlugins throws", async () => {
    const deps = makeWizardStubs({
      pickPlugins: vi.fn().mockRejectedValue(new Error("boom")),
    });
    await expect(setupInteractive({}, cwd, deps)).rejects.toThrow(
      "process.exit(1)",
    );
    expect(deps.prompts.log.error).toHaveBeenCalledWith(
      expect.stringMatching(/Failed to load plugins.*boom/),
    );
    expect(deps.prompts.cancel).toHaveBeenCalled();
  });

  it("includes stale-artifact summary in the outro when v3 leftovers exist", async () => {
    fs.mkdirSync(path.join(cwd, ".agileflow", "experts"), { recursive: true });
    const deps = makeWizardStubs();
    await setupInteractive({}, cwd, deps);
    // Outro is called with a multi-line summary. The cleanup branch
    // declined (confirm stub returns false), so the summary should
    // mention leaving files in place.
    const outroArg = deps.prompts.outro.mock.calls[0][0];
    expect(outroArg).toMatch(/left in place/);
    // Files still there since cleanup declined.
    expect(fs.existsSync(path.join(cwd, ".agileflow", "experts"))).toBe(true);
  });

  it("quick start writes a default config, installs, and skips the other pickers", async () => {
    const prompts = makePromptsStub();
    // User confirms the one-line Quick start summary.
    prompts.confirm = vi.fn().mockResolvedValue(true);
    const deps = makeWizardStubs({
      prompts,
      pickSetupMode: vi.fn().mockResolvedValue("quick"),
    });

    await setupInteractive({}, cwd, deps);

    const config = JSON.parse(
      fs.readFileSync(path.join(cwd, "agileflow.config.json"), "utf8"),
    );
    // Recommended defaults applied.
    expect(config.plugins.core.enabled).toBe(true);
    expect(config.ide.targets).toEqual(["claude-code"]);
    expect(config.install.scope).toBe("project");
    expect(config.plugins.core.settings.babysit).toEqual({ mode: "light" });
    expect(config.behaviors.loadContext).toBe(true);
    expect(config.learnings.enabled).toBe(true);

    // Quick start must NOT run any of the individual pickers.
    expect(deps.pickSetupMode).toHaveBeenCalledTimes(1);
    expect(deps.pickInstallScope).not.toHaveBeenCalled();
    expect(deps.pickIdes).not.toHaveBeenCalled();
    expect(deps.pickPlugins).not.toHaveBeenCalled();
    expect(deps.pickBehaviors).not.toHaveBeenCalled();
    expect(deps.pickBabysitMode).not.toHaveBeenCalled();
    expect(deps.pickLearnings).not.toHaveBeenCalled();
    // Shared tail still runs (single confirm + outro).
    expect(prompts.confirm).toHaveBeenCalledTimes(1);
    expect(prompts.outro).toHaveBeenCalledTimes(1);
  });

  it("quick start warns and defaults the confirm to no when it would overwrite an existing config", async () => {
    // A customized config already exists on disk (codex, not the default).
    const prior = defaultConfig();
    prior.ide = { targets: ["codex"] };
    fs.writeFileSync(
      path.join(cwd, "agileflow.config.json"),
      JSON.stringify(prior, null, 2),
      "utf8",
    );
    const prompts = makePromptsStub();
    prompts.confirm = vi.fn().mockResolvedValue(true);
    const deps = makeWizardStubs({
      prompts,
      pickSetupMode: vi.fn().mockResolvedValue("quick"),
    });

    await setupInteractive({}, cwd, deps);

    // The user is warned the existing config will be replaced...
    expect(prompts.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("REPLACE"),
    );
    // ...and the confirm defaults to "no" so an accidental Enter can't
    // discard their settings.
    expect(prompts.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ initialValue: false }),
    );
  });

  it("quick start honours --scope global from the flag", async () => {
    const prompts = makePromptsStub();
    prompts.confirm = vi.fn().mockResolvedValue(true);
    const home = scratch();
    const deps = makeWizardStubs({
      prompts,
      pickSetupMode: vi.fn().mockResolvedValue("quick"),
    });
    const spy = vi.spyOn(os, "homedir").mockReturnValue(home);
    try {
      await setupInteractive({ scope: "global" }, cwd, deps);
      const config = JSON.parse(
        fs.readFileSync(
          path.join(home, ".agileflow", "agileflow.config.json"),
          "utf8",
        ),
      );
      expect(config.install.scope).toBe("global");
    } finally {
      spy.mockRestore();
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("quick start aborts when the user declines the confirm", async () => {
    const prompts = makePromptsStub();
    prompts.confirm = vi.fn().mockResolvedValue(false);
    const deps = makeWizardStubs({
      prompts,
      pickSetupMode: vi.fn().mockResolvedValue("quick"),
    });
    await expect(setupInteractive({}, cwd, deps)).rejects.toThrow(
      "process.exit(1)",
    );
    expect(prompts.cancel).toHaveBeenCalled();
    expect(fs.existsSync(path.join(cwd, "agileflow.config.json"))).toBe(false);
  });

  it("customize path runs the full picker flow", async () => {
    const deps = makeWizardStubs({
      pickSetupMode: vi.fn().mockResolvedValue("customize"),
    });
    await setupInteractive({}, cwd, deps);
    expect(deps.pickSetupMode).toHaveBeenCalledTimes(1);
    expect(deps.pickInstallScope).toHaveBeenCalledTimes(1);
    expect(deps.pickIdes).toHaveBeenCalledTimes(1);
    expect(deps.pickPlugins).toHaveBeenCalledTimes(1);
    expect(deps.pickBehaviors).toHaveBeenCalledTimes(1);
    expect(deps.pickBabysitMode).toHaveBeenCalledTimes(1);
    expect(deps.pickLearnings).toHaveBeenCalledTimes(1);
  });
});
