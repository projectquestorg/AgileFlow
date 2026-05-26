/**
 * Unit tests for the cross-reboot session registry.
 *
 * Uses a temp HOME so the real ~/.agileflow/launch-sessions.json is
 * never touched. Every helper accepts an explicit `home` override.
 */
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import registryModule from "../../../../src/runtime/launch/session-registry.js";

const {
  FILENAME,
  registryPath,
  loadRegistry,
  recordSession,
  updateSession,
  findSession,
  forgetSession,
} = registryModule;

describe("session registry", () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "af-sessions-"));
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("registryPath resolves under ~/.agileflow/launch-sessions.json", () => {
    expect(registryPath(scratch)).toBe(
      path.join(scratch, ".agileflow", FILENAME),
    );
  });

  it("loadRegistry returns an empty shape when the file is absent", () => {
    const reg = loadRegistry(scratch);
    expect(reg).toEqual({ version: 1, sessions: [] });
  });

  it("loadRegistry returns empty on malformed JSON instead of throwing", () => {
    const file = registryPath(scratch);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ not json");
    expect(loadRegistry(scratch)).toEqual({ version: 1, sessions: [] });
  });

  it("loadRegistry filters out entries missing required fields", () => {
    const file = registryPath(scratch);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        sessions: [
          { name: "good", cli: "claude", cwd: "/app", uuid: "abc" },
          { name: "no-cli", cwd: "/app" }, // missing cli
          { cli: "claude", cwd: "/app" }, // missing name
          "not even an object",
        ],
      }),
    );
    const reg = loadRegistry(scratch);
    expect(reg.sessions).toHaveLength(1);
    expect(reg.sessions[0].name).toBe("good");
  });

  it("recordSession appends an entry and stamps lastSeen", () => {
    const before = Date.now();
    recordSession(
      {
        name: "claude-myapp",
        cli: "claude",
        cwd: "/home/me/myapp",
        uuid: null,
      },
      scratch,
    );
    const reg = loadRegistry(scratch);
    expect(reg.sessions).toHaveLength(1);
    const entry = reg.sessions[0];
    expect(entry.name).toBe("claude-myapp");
    expect(entry.cli).toBe("claude");
    expect(entry.cwd).toBe("/home/me/myapp");
    expect(entry.uuid).toBeNull();
    expect(new Date(entry.lastSeen).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("recordSession replaces an existing entry with the same name", () => {
    recordSession(
      { name: "claude-myapp", cli: "claude", cwd: "/old", uuid: null },
      scratch,
    );
    recordSession(
      { name: "claude-myapp", cli: "claude", cwd: "/new", uuid: "xyz" },
      scratch,
    );
    const reg = loadRegistry(scratch);
    expect(reg.sessions).toHaveLength(1);
    expect(reg.sessions[0].cwd).toBe("/new");
    expect(reg.sessions[0].uuid).toBe("xyz");
  });

  it("recordSession preserves worktree metadata when supplied", () => {
    recordSession(
      {
        name: "claude-myapp-feat1",
        cli: "claude",
        cwd: "/home/me/myapp-feat1",
        uuid: null,
        worktree: {
          path: "/home/me/myapp-feat1",
          branch: "feat1",
          base: "main",
        },
      },
      scratch,
    );
    const entry = findSession("claude-myapp-feat1", scratch);
    expect(entry.worktree).toEqual({
      path: "/home/me/myapp-feat1",
      branch: "feat1",
      base: "main",
    });
  });

  it("updateSession patches uuid + lastSeen and writes back", () => {
    recordSession(
      { name: "claude-myapp", cli: "claude", cwd: "/app", uuid: null },
      scratch,
    );
    const ok = updateSession(
      "claude-myapp",
      { uuid: "new-uuid", lastSeen: "2026-05-25T12:00:00Z" },
      scratch,
    );
    expect(ok).toBe(true);
    const entry = findSession("claude-myapp", scratch);
    expect(entry.uuid).toBe("new-uuid");
    expect(entry.lastSeen).toBe("2026-05-25T12:00:00Z");
  });

  it("updateSession returns false for unknown sessions and writes nothing", () => {
    expect(updateSession("missing", { uuid: "x" }, scratch)).toBe(false);
    expect(loadRegistry(scratch).sessions).toEqual([]);
  });

  it("findSession returns the matching entry or null", () => {
    recordSession({ name: "a", cli: "claude", cwd: "/a", uuid: null }, scratch);
    recordSession({ name: "b", cli: "codex", cwd: "/b", uuid: null }, scratch);
    expect(findSession("b", scratch).cli).toBe("codex");
    expect(findSession("missing", scratch)).toBeNull();
  });

  it("forgetSession removes the entry; returns false when nothing to remove", () => {
    recordSession(
      { name: "claude-myapp", cli: "claude", cwd: "/app", uuid: null },
      scratch,
    );
    expect(forgetSession("claude-myapp", scratch)).toBe(true);
    expect(loadRegistry(scratch).sessions).toEqual([]);
    expect(forgetSession("claude-myapp", scratch)).toBe(false);
  });

  it("write is atomic — no leftover .tmp- file after success", () => {
    recordSession({ name: "a", cli: "claude", cwd: "/a", uuid: null }, scratch);
    const dir = path.join(scratch, ".agileflow");
    const leftover = fs.readdirSync(dir).filter((f) => f.includes(".tmp-"));
    expect(leftover).toEqual([]);
  });

  it("recordSession rejects entries with missing required fields", () => {
    expect(() =>
      recordSession({ name: "", cli: "claude", cwd: "/a" }, scratch),
    ).toThrow(/name must be a non-empty string/);
    expect(() =>
      recordSession({ name: "a", cli: "", cwd: "/a" }, scratch),
    ).toThrow(/cli must be a non-empty string/);
    expect(() =>
      recordSession({ name: "a", cli: "claude", cwd: "" }, scratch),
    ).toThrow(/cwd must be a non-empty string/);
    // Sanity: nothing was written to disk on any rejected call.
    expect(loadRegistry(scratch).sessions).toEqual([]);
  });

  it("updateSession coerces non-string uuid patches to null", () => {
    recordSession(
      { name: "a", cli: "claude", cwd: "/a", uuid: "abc" },
      scratch,
    );
    // @ts-expect-error intentional bad input
    updateSession("a", { uuid: { malformed: true } }, scratch);
    expect(findSession("a", scratch).uuid).toBeNull();
  });

  it("releases the lockfile after a successful mutation", () => {
    recordSession({ name: "a", cli: "claude", cwd: "/a" }, scratch);
    const lockPath = registryPath(scratch) + ".lock";
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("serializes interleaved updates so neither write is lost", () => {
    recordSession(
      { name: "a", cli: "claude", cwd: "/a", uuid: "old" },
      scratch,
    );
    // Synchronous sequential updates — exercises the lock around the
    // read-modify-write so a follow-up read sees BOTH updates.
    updateSession("a", { uuid: "first" }, scratch);
    updateSession("a", { uuid: "second" }, scratch);
    expect(findSession("a", scratch).uuid).toBe("second");
  });

  // The sequential-update test above runs inside a single process, so
  // the lock's job is trivial there (nothing else competes). The race
  // this slice actually exists to prevent is across processes — two
  // __exec wrappers finishing claude at the same time. These two tests
  // spawn real concurrent Node processes against the same registry to
  // prove the file lock holds the read-modify-write contract.
  const REGISTRY_MODULE = path.resolve(
    __dirname,
    "../../../../src/runtime/launch/session-registry.js",
  );

  /**
   * Fork `count` child processes that each run `script` with HOME=home.
   * Returns once they've all exited. Throws if any failed.
   *
   * @param {number} count
   * @param {string} home
   * @param {(i: number) => string} script
   */
  function spawnConcurrent(count, home, script) {
    const procs = [];
    for (let i = 0; i < count; i++) {
      procs.push(
        spawn(process.execPath, ["-e", script(i)], {
          env: { ...process.env, HOME: home },
          stdio: ["ignore", "pipe", "pipe"],
        }),
      );
    }
    return Promise.all(
      procs.map(
        (p, i) =>
          new Promise((resolve, reject) => {
            let stderr = "";
            p.stderr.on("data", (chunk) => {
              stderr += chunk.toString();
            });
            p.on("exit", (code) => {
              if (code === 0) resolve(undefined);
              else
                reject(
                  new Error(`child ${i} exited ${code}: ${stderr.trim()}`),
                );
            });
            p.on("error", reject);
          }),
      ),
    );
  }

  it("preserves every entry when N processes recordSession in parallel", async () => {
    const N = 12;
    await spawnConcurrent(
      N,
      scratch,
      (i) => `
      const reg = require(${JSON.stringify(REGISTRY_MODULE)});
      reg.recordSession(
        { name: "w-${i}", cli: "claude", cwd: "/w/${i}", uuid: "u-${i}" },
        ${JSON.stringify(scratch)},
      );
    `,
    );

    const reg = loadRegistry(scratch);
    expect(reg.sessions).toHaveLength(N);
    const names = reg.sessions.map((s) => s.name).sort();
    const expected = Array.from({ length: N }, (_, i) => `w-${i}`).sort();
    expect(names).toEqual(expected);
    // Every entry's uuid should match its name (no cross-pollution from
    // partially-written reg files).
    for (const s of reg.sessions) {
      expect(s.uuid).toBe(`u-${s.name.slice(2)}`);
    }
    // No leftover lock file after all writers finish.
    expect(fs.existsSync(registryPath(scratch) + ".lock")).toBe(false);
    // No leftover .tmp- files from interrupted atomic renames.
    const dir = path.join(scratch, ".agileflow");
    const leftover = fs.readdirSync(dir).filter((f) => f.includes(".tmp-"));
    expect(leftover).toEqual([]);
  }, 20_000);

  it("under N concurrent updateSession calls, exactly one uuid wins and no entry is corrupted", async () => {
    recordSession(
      { name: "shared", cli: "claude", cwd: "/shared", uuid: "initial" },
      scratch,
    );
    const N = 12;
    await spawnConcurrent(
      N,
      scratch,
      (i) => `
      const reg = require(${JSON.stringify(REGISTRY_MODULE)});
      reg.updateSession(
        "shared",
        { uuid: "u-${i}" },
        ${JSON.stringify(scratch)},
      );
    `,
    );

    const entry = findSession("shared", scratch);
    expect(entry).not.toBeNull();
    // Whichever process wrote last wins, but the entry must have a
    // valid uuid from ONE of the writers (not garbage, not "initial",
    // not null from a torn write).
    const validUuids = Array.from({ length: N }, (_, i) => `u-${i}`);
    expect(validUuids).toContain(entry.uuid);
    // Single entry — no duplication from racing writes.
    expect(loadRegistry(scratch).sessions).toHaveLength(1);
    expect(fs.existsSync(registryPath(scratch) + ".lock")).toBe(false);
  }, 20_000);
});
