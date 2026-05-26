/**
 * Unit tests for the cross-reboot session registry.
 *
 * Uses a temp HOME so the real ~/.agileflow/launch-sessions.json is
 * never touched. Every helper accepts an explicit `home` override.
 */
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
});
