/**
 * Unit tests for the `af` alias installer. Uses a temp HOME so the
 * real ~/.local/bin is never touched.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import aliasModule from "../../../../src/runtime/launch/alias-installer.js";

const {
  aliasPath,
  resolveAgileflowBin,
  localBinOnPath,
  installAfAlias,
  uninstallAfAlias,
} = aliasModule;

const skipOnWin = process.platform === "win32" ? describe.skip : describe;

describe("alias-installer paths", () => {
  it("aliasPath resolves under HOME/.local/bin/af", () => {
    expect(aliasPath("/tmp/fake")).toBe("/tmp/fake/.local/bin/af");
  });

  it("localBinOnPath detects presence in $PATH", () => {
    const home = "/tmp/fake";
    expect(localBinOnPath(home, "/usr/bin:/tmp/fake/.local/bin:/bin")).toBe(
      true,
    );
    expect(localBinOnPath(home, "/usr/bin:/bin")).toBe(false);
  });

  it("resolveAgileflowBin prefers argv[1] when it exists on disk", () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "af-bin-"));
    const fake = path.join(scratch, "agileflow.js");
    fs.writeFileSync(fake, "#!/usr/bin/env node\n");
    const proc = /** @type {any} */ ({ argv: [process.execPath, fake] });
    expect(resolveAgileflowBin(proc)).toBe(fs.realpathSync(fake));
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("resolveAgileflowBin falls back to 'agileflow' when argv[1] doesn't exist", () => {
    const proc = /** @type {any} */ ({
      argv: [process.execPath, "/no/such/path/xyz"],
    });
    expect(resolveAgileflowBin(proc)).toBe("agileflow");
  });
});

skipOnWin("alias-installer install/uninstall (POSIX)", () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "af-alias-"));
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("installAfAlias creates the symlink under HOME/.local/bin", async () => {
    const fakeBin = path.join(scratch, "agileflow.js");
    fs.writeFileSync(fakeBin, "#!/usr/bin/env node\nconsole.log('hi');\n");
    fs.chmodSync(fakeBin, 0o755);
    const proc = /** @type {any} */ ({ argv: [process.execPath, fakeBin] });

    const result = await installAfAlias({ home: scratch, proc });
    expect(result.status).toBe("installed");
    expect(result.path).toBe(path.join(scratch, ".local", "bin", "af"));
    expect(fs.realpathSync(result.path)).toBe(fs.realpathSync(fakeBin));
  });

  it("reports 'unchanged' when the symlink already points at the same target", async () => {
    const fakeBin = path.join(scratch, "agileflow.js");
    fs.writeFileSync(fakeBin, "#!/usr/bin/env node\n");
    const proc = /** @type {any} */ ({ argv: [process.execPath, fakeBin] });

    await installAfAlias({ home: scratch, proc });
    const second = await installAfAlias({ home: scratch, proc });
    expect(second.status).toBe("unchanged");
  });

  it("refuses to clobber a non-symlink file", async () => {
    const link = path.join(scratch, ".local", "bin", "af");
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.writeFileSync(link, "totally not a symlink");

    const result = await installAfAlias({ home: scratch });
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/not a symlink/);
    // Original file untouched
    expect(fs.readFileSync(link, "utf8")).toBe("totally not a symlink");
  });

  it("uninstallAfAlias removes a symlink that points at agileflow", async () => {
    const fakeBin = path.join(scratch, "agileflow.js");
    fs.writeFileSync(fakeBin, "#!/usr/bin/env node\n");
    const proc = /** @type {any} */ ({ argv: [process.execPath, fakeBin] });

    await installAfAlias({ home: scratch, proc });
    const result = await uninstallAfAlias({ home: scratch });
    expect(result.status).toBe("removed");
    expect(fs.existsSync(result.path)).toBe(false);
  });

  it("uninstallAfAlias is a safe no-op when nothing exists", async () => {
    const result = await uninstallAfAlias({ home: scratch });
    expect(result.status).toBe("absent");
  });

  it("uninstallAfAlias refuses to remove a symlink pointing elsewhere", async () => {
    const link = path.join(scratch, ".local", "bin", "af");
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync("/usr/bin/cat", link);

    const result = await uninstallAfAlias({ home: scratch });
    expect(result.status).toBe("skipped");
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
  });
});
