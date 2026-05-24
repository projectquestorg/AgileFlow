/**
 * Unit tests for `runPostInstallCleanup` — the stale-artifact prompt
 * that fires after `agileflow setup` finishes its install. Covers:
 *   - clean directory  → returns no summary
 *   - --yes mode        → warns only, never modifies the filesystem
 *   - interactive yes  → applies fixes, reports success
 *   - interactive no   → leaves files, reports follow-up command
 *   - interactive cancel (Ctrl-C) → same as no
 *
 * The helper accepts an injectable prompts dependency for these tests,
 * sidestepping the CJS/ESM module-mocking pitfalls.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { runPostInstallCleanup } from "../../../src/cli/commands/setup.js";

function scratch() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "af-setup-cleanup-"));
}

function seedStaleArtifacts(cwd) {
  fs.mkdirSync(path.join(cwd, ".agileflow", "experts"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".agileflow", "commands"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".agileflow", "CHANGELOG.md"), "old");
}

function makePromptsStub({ confirmResult = false } = {}) {
  const cancelSentinel = Symbol.for("clack.cancel");
  return {
    confirm: vi.fn().mockResolvedValue(confirmResult),
    isCancel: vi.fn((v) => v === cancelSentinel),
    log: { warn: vi.fn(), message: vi.fn() },
  };
}

describe("runPostInstallCleanup", () => {
  let cwd;

  beforeEach(() => {
    cwd = scratch();
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("returns null summary on a clean directory", async () => {
    const promptsStub = makePromptsStub();
    const r = await runPostInstallCleanup(
      cwd,
      { interactive: true },
      { prompts: promptsStub },
    );
    expect(r.summary).toBeNull();
    expect(promptsStub.confirm).not.toHaveBeenCalled();
  });

  it("--yes mode warns but never modifies the filesystem", async () => {
    seedStaleArtifacts(cwd);
    const promptsStub = makePromptsStub();
    const r = await runPostInstallCleanup(
      cwd,
      { interactive: false },
      { prompts: promptsStub },
    );
    expect(r.summary).toMatch(/3 stale artifact/);
    expect(r.summary).toMatch(/doctor --fix/);
    expect(promptsStub.confirm).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(cwd, ".agileflow", "experts"))).toBe(true);
    expect(fs.existsSync(path.join(cwd, ".agileflow", "commands"))).toBe(true);
    expect(fs.existsSync(path.join(cwd, ".agileflow", "CHANGELOG.md"))).toBe(
      true,
    );
  });

  it("interactive yes applies all fixes and reports success", async () => {
    seedStaleArtifacts(cwd);
    const promptsStub = makePromptsStub({ confirmResult: true });
    const r = await runPostInstallCleanup(
      cwd,
      { interactive: true },
      { prompts: promptsStub },
    );
    expect(r.summary).toMatch(/Cleaned up 3 stale artifact/);
    expect(fs.existsSync(path.join(cwd, ".agileflow", "experts"))).toBe(false);
    expect(fs.existsSync(path.join(cwd, ".agileflow", "commands"))).toBe(false);
    expect(fs.existsSync(path.join(cwd, ".agileflow", "CHANGELOG.md"))).toBe(
      false,
    );
  });

  it("interactive no leaves files in place with a follow-up hint", async () => {
    seedStaleArtifacts(cwd);
    const promptsStub = makePromptsStub({ confirmResult: false });
    const r = await runPostInstallCleanup(
      cwd,
      { interactive: true },
      { prompts: promptsStub },
    );
    expect(r.summary).toMatch(/left in place/);
    expect(r.summary).toMatch(/doctor --fix/);
    expect(fs.existsSync(path.join(cwd, ".agileflow", "experts"))).toBe(true);
  });

  it("interactive cancel (Ctrl-C) is treated as no", async () => {
    seedStaleArtifacts(cwd);
    const promptsStub = makePromptsStub({
      confirmResult: Symbol.for("clack.cancel"),
    });
    const r = await runPostInstallCleanup(
      cwd,
      { interactive: true },
      { prompts: promptsStub },
    );
    expect(r.summary).toMatch(/left in place/);
    expect(fs.existsSync(path.join(cwd, ".agileflow", "experts"))).toBe(true);
  });

  it("interactive run lists each detected issue before prompting", async () => {
    seedStaleArtifacts(cwd);
    const promptsStub = makePromptsStub({ confirmResult: false });
    await runPostInstallCleanup(
      cwd,
      { interactive: true },
      { prompts: promptsStub },
    );
    expect(promptsStub.log.warn).toHaveBeenCalledTimes(1);
    expect(promptsStub.log.message).toHaveBeenCalledTimes(3);
  });
});
