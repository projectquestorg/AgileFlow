/**
 * Unit tests for closed-windows.js — FIFO push/pop/peek + lock +
 * per-session isolation. Each test uses an isolated temp HOME so the
 * real `~/.agileflow/launch-closed-windows.json` is never touched.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import closedWindows from "../../../../src/runtime/launch/closed-windows.js";

const {
  FILENAME,
  MAX_PER_SESSION,
  logPath,
  loadLog,
  writeLog,
  pushClosed,
  popClosed,
  peekClosed,
  clearOlderThan,
  emptyLog,
} = closedWindows;

/** @type {string} */
let home;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "af-closed-windows-"));
});
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

describe("logPath", () => {
  it("uses ~/.agileflow/<FILENAME> under the supplied home", () => {
    expect(logPath(home)).toBe(path.join(home, ".agileflow", FILENAME));
  });
});

describe("loadLog", () => {
  it("returns an empty log when the file is missing", () => {
    expect(loadLog(home)).toEqual(emptyLog());
  });

  it("returns empty when the file is malformed JSON", () => {
    fs.mkdirSync(path.join(home, ".agileflow"), { recursive: true });
    fs.writeFileSync(logPath(home), "{ not json");
    expect(loadLog(home)).toEqual(emptyLog());
  });

  it("returns empty when payload isn't an object", () => {
    fs.mkdirSync(path.join(home, ".agileflow"), { recursive: true });
    fs.writeFileSync(logPath(home), "[]");
    expect(loadLog(home)).toEqual(emptyLog());
  });

  it("drops invalid entries (no name, no cwd, etc.)", () => {
    fs.mkdirSync(path.join(home, ".agileflow"), { recursive: true });
    fs.writeFileSync(
      logPath(home),
      JSON.stringify({
        version: 1,
        sessions: {
          a: [
            { name: "ok", cwd: "/tmp" },
            { name: "no-cwd" },
            { cwd: "/no-name" },
            "not-an-object",
            null,
          ],
        },
      }),
    );
    const log = loadLog(home);
    expect(log.sessions.a).toHaveLength(1);
    expect(log.sessions.a[0].name).toBe("ok");
  });
});

describe("pushClosed", () => {
  it("appends to the session's stack", () => {
    pushClosed({ sessionName: "s1", name: "win-a", cwd: "/p/a" }, home);
    pushClosed({ sessionName: "s1", name: "win-b", cwd: "/p/b" }, home);
    const log = loadLog(home);
    expect(log.sessions.s1).toHaveLength(2);
    expect(log.sessions.s1[1].name).toBe("win-b");
  });

  it("isolates per-session stacks", () => {
    pushClosed({ sessionName: "alpha", name: "a1", cwd: "/x" }, home);
    pushClosed({ sessionName: "beta", name: "b1", cwd: "/y" }, home);
    const log = loadLog(home);
    expect(log.sessions.alpha).toHaveLength(1);
    expect(log.sessions.beta).toHaveLength(1);
  });

  it("caps at MAX_PER_SESSION (oldest evicted)", () => {
    for (let i = 0; i < MAX_PER_SESSION + 5; i++) {
      pushClosed({ sessionName: "s1", name: `w${i}`, cwd: "/p" }, home);
    }
    const log = loadLog(home);
    expect(log.sessions.s1).toHaveLength(MAX_PER_SESSION);
    // First five (w0..w4) should have been evicted; last entry is the newest.
    expect(log.sessions.s1[0].name).toBe("w5");
    expect(log.sessions.s1[MAX_PER_SESSION - 1].name).toBe(
      `w${MAX_PER_SESSION + 4}`,
    );
  });

  it("returns the pushed entry with a generated id + ISO timestamp", () => {
    const entry = pushClosed({ sessionName: "s1", name: "n", cwd: "/p" }, home);
    expect(entry.id).toMatch(/^[0-9a-f]{6}$/);
    expect(entry.closedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("throws TypeError on bad args", () => {
    expect(() => pushClosed(null, home)).toThrow(TypeError);
    expect(() => pushClosed({}, home)).toThrow(TypeError);
    expect(() =>
      pushClosed({ sessionName: "s", name: "n", cwd: "" }, home),
    ).toThrow(TypeError);
  });
});

describe("popClosed", () => {
  it("returns null when no entries exist for the session", () => {
    expect(popClosed("nope", home)).toBeNull();
  });

  it("returns null for empty/invalid sessionName", () => {
    expect(popClosed("", home)).toBeNull();
    // @ts-expect-error - testing invalid input
    expect(popClosed(null, home)).toBeNull();
  });

  it("returns and removes the most recent entry (LIFO)", () => {
    pushClosed({ sessionName: "s1", name: "older", cwd: "/o" }, home);
    pushClosed({ sessionName: "s1", name: "newer", cwd: "/n" }, home);
    const popped = popClosed("s1", home);
    expect(popped.name).toBe("newer");
    const log = loadLog(home);
    expect(log.sessions.s1).toHaveLength(1);
    expect(log.sessions.s1[0].name).toBe("older");
  });

  it("removes the session key entirely when stack empties", () => {
    pushClosed({ sessionName: "lonely", name: "only", cwd: "/" }, home);
    popClosed("lonely", home);
    const log = loadLog(home);
    expect(log.sessions.lonely).toBeUndefined();
  });

  it("does not touch other sessions when popping", () => {
    pushClosed({ sessionName: "a", name: "a1", cwd: "/" }, home);
    pushClosed({ sessionName: "b", name: "b1", cwd: "/" }, home);
    popClosed("a", home);
    const log = loadLog(home);
    expect(log.sessions.b).toHaveLength(1);
  });
});

describe("peekClosed", () => {
  it("returns the most recent entry without removing it", () => {
    pushClosed({ sessionName: "s1", name: "first", cwd: "/" }, home);
    pushClosed({ sessionName: "s1", name: "second", cwd: "/" }, home);
    const peeked = peekClosed("s1", home);
    expect(peeked.name).toBe("second");
    const log = loadLog(home);
    expect(log.sessions.s1).toHaveLength(2);
  });

  it("returns null when stack is empty", () => {
    expect(peekClosed("no-such", home)).toBeNull();
  });

  it("returns null for empty sessionName", () => {
    expect(peekClosed("", home)).toBeNull();
  });
});

describe("clearOlderThan", () => {
  it("removes entries with closedAt older than the cutoff", () => {
    fs.mkdirSync(path.join(home, ".agileflow"), { recursive: true });
    const now = Date.now();
    writeLog(
      {
        version: 1,
        sessions: {
          s1: [
            {
              id: "aaa",
              name: "old",
              cwd: "/o",
              closedAt: new Date(now - 60000).toISOString(),
            },
            {
              id: "bbb",
              name: "new",
              cwd: "/n",
              closedAt: new Date(now - 100).toISOString(),
            },
          ],
        },
      },
      home,
    );
    const removed = clearOlderThan(30000, home);
    expect(removed).toBe(1);
    const log = loadLog(home);
    expect(log.sessions.s1).toHaveLength(1);
    expect(log.sessions.s1[0].name).toBe("new");
  });

  it("keeps entries whose timestamp is unparseable (defensive)", () => {
    fs.mkdirSync(path.join(home, ".agileflow"), { recursive: true });
    writeLog(
      {
        version: 1,
        sessions: {
          s1: [{ id: "x", name: "kept", cwd: "/p", closedAt: "garbage" }],
        },
      },
      home,
    );
    expect(clearOlderThan(1000, home)).toBe(0);
    expect(loadLog(home).sessions.s1).toHaveLength(1);
  });

  it("returns 0 for negative or NaN maxAge", () => {
    expect(clearOlderThan(-1, home)).toBe(0);
    expect(clearOlderThan(NaN, home)).toBe(0);
  });
});
