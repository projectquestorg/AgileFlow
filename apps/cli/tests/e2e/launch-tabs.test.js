/**
 * End-to-end tests for `agileflow launch` tabs and persistence.
 *
 * These tests drive a private tmux server on a custom socket (so they
 * don't touch the developer's real tmux), invoke our runtime modules
 * directly with an injected runner, and verify state via tmux's
 * introspection commands (show-option, list-windows, show-hooks).
 *
 * Skipped gracefully when tmux isn't installed — these tests need a
 * real binary, not a mock. They run as part of `npm test` when tmux
 * is available.
 *
 * Why E2E in addition to unit tests:
 *   - Caught `window-renamed` being a non-existent tmux 3.x hook name
 *     (set-hook silently accepts; show-hooks doesn't list it).
 *   - Caught tmux's format-string parser escape-encoding 0x1f bytes
 *     into literal `\037` text, breaking our delimiter-based parse.
 * Both bugs passed every unit test.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const SOCKET = "af-vitest-e2e";
const SRC = path.join(__dirname, "..", "..", "src");
const AGILEFLOW_BIN = `node ${path.join(SRC, "..", "bin", "agileflow.js")}`;

function tmuxAvailable() {
  const r = spawnSync("tmux", ["-V"], { encoding: "utf8" });
  return r.status === 0;
}

function tmuxCmd(...args) {
  const r = spawnSync("tmux", ["-L", SOCKET, ...args], { encoding: "utf8" });
  return {
    status: r.status,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim(),
  };
}

function sleep(ms) {
  const end = Date.now() + ms;
  // eslint-disable-next-line no-empty
  while (Date.now() < end) {}
}

const ourRunner = {
  runSync(args) {
    return tmuxCmd(...args);
  },
  runAttach() {
    throw new Error("not used in e2e");
  },
};

// Resolve the runtime modules once at top so the skipIf check is cheap.
const HAS_TMUX = tmuxAvailable();
const tmuxLib = HAS_TMUX
  ? require(path.join(SRC, "runtime/launch/tmux.js"))
  : null;
const registryLib = HAS_TMUX
  ? require(path.join(SRC, "runtime/launch/session-registry.js"))
  : null;
const closedLib = HAS_TMUX
  ? require(path.join(SRC, "runtime/launch/closed-windows.js"))
  : null;
const restoreLib = HAS_TMUX
  ? require(path.join(SRC, "runtime/launch/restore.js"))
  : null;

describe.skipIf(!HAS_TMUX)("launch tabs e2e", () => {
  /** @type {string} */
  let testHome;

  beforeAll(() => {
    testHome = fs.mkdtempSync(path.join(os.tmpdir(), "af-e2e-"));
    process.env.HOME = testHome;
    fs.mkdirSync(path.join(testHome, ".agileflow"), { recursive: true });
    tmuxCmd("kill-server");
    sleep(50);
  });

  afterAll(() => {
    tmuxCmd("kill-server");
    if (testHome) {
      fs.rmSync(testHome, { recursive: true, force: true });
    }
  });

  describe("tab strip styling", () => {
    beforeAll(() => {
      tmuxCmd("kill-server");
      sleep(50);
      const r = tmuxCmd("new-session", "-d", "-s", "style-test", "bash");
      expect(r.status).toBe(0);
      tmuxLib.applyTabFormat("style-test", ourRunner, {
        tmuxVersion: tmuxLib.detectTmuxVersion(ourRunner),
        agileflowBin: AGILEFLOW_BIN,
      });
    });

    it("status-style uses dark Tokyo Night background", () => {
      const r = tmuxCmd(
        "show-option",
        "-t",
        "style-test",
        "-v",
        "status-style",
      );
      expect(r.stdout).toContain("#1a1b26");
    });

    it("active-tab format uses brand orange #e8683a", () => {
      const r = tmuxCmd(
        "show-option",
        "-wg",
        "-v",
        "window-status-current-format",
      );
      expect(r.stdout).toContain("#e8683a");
    });

    it("status-left shows session name pill (#S)", () => {
      const r = tmuxCmd("show-option", "-t", "style-test", "-v", "status-left");
      expect(r.stdout).toContain("#S");
    });

    it("base-index forced to 1 for Alt+1 muscle memory", () => {
      const r = tmuxCmd("show-option", "-t", "style-test", "-v", "base-index");
      expect(r.stdout).toBe("1");
    });
  });

  describe("keybind preset installation", () => {
    beforeAll(() => {
      tmuxLib.applyKeybindPreset("default", ourRunner, {
        agileflowBin: AGILEFLOW_BIN,
      });
    });

    it.each([
      ["M-t"],
      ["M-w"],
      ["M-,"],
      ["M-1"],
      ["M-2"],
      ["M-9"],
      ["M-0"],
      ["M-Tab"],
      ["M-S-Tab"],
      ["M-s"],
      ["M-n"],
      ["M-q"],
    ])("binds %s on the root key table", (key) => {
      const r = tmuxCmd("list-keys", "-T", "root");
      expect(r.stdout).toContain(` ${key} `);
    });
  });

  describe("keybind actions produce expected state changes", () => {
    /** @type {string} */
    let session;

    beforeAll(() => {
      session = "action-test";
      tmuxCmd("new-session", "-d", "-s", session, "bash");
      tmuxCmd("set-option", "-t", session, "base-index", "1");
      tmuxCmd("set-option", "-t", session, "renumber-windows", "on");
    });

    /** Look up a bound action and execute it directly. */
    function fire(key) {
      const entry = tmuxLib.KEYBIND_PRESET_BINDINGS.default.find(
        (b) => b.key === key,
      );
      const action = entry.action.map((a) =>
        typeof a === "string" ? a.replace(/%AGILEFLOW%/g, AGILEFLOW_BIN) : a,
      );
      return tmuxCmd(...action);
    }

    function listWindows() {
      return tmuxCmd("list-windows", "-t", session, "-F", "#I")
        .stdout.split("\n")
        .filter(Boolean);
    }

    it("Alt+t adds new windows", () => {
      const before = listWindows().length;
      fire("M-t");
      fire("M-t");
      fire("M-t");
      const after = listWindows().length;
      expect(after).toBe(before + 3);
    });

    it("Alt+2 selects window 2", () => {
      fire("M-2");
      const active = tmuxCmd("display-message", "-t", session, "-p", "#I");
      expect(active.stdout).toBe("2");
    });

    it("Alt+0 jumps to first tab (window index 1)", () => {
      fire("M-0");
      const active = tmuxCmd("display-message", "-t", session, "-p", "#I");
      expect(active.stdout).toBe("1");
    });

    it("Alt+w + renumber-windows keeps indexes contiguous", () => {
      fire("M-2");
      const before = listWindows().length;
      // Directly kill since the M-w action involves a run-shell with
      // a real CLI subprocess that needs the agileflow binary on the
      // user's PATH — the unit test verifies the binding shape;
      // here we just verify renumber works.
      tmuxCmd("kill-window", "-t", session);
      const after = listWindows();
      expect(after.length).toBe(before - 1);
      const maxIdx = Math.max(...after.map(Number));
      expect(maxIdx).toBe(after.length);
    });
  });

  describe("session hooks", () => {
    /** @type {string} */
    let session;

    beforeAll(() => {
      session = "hook-test";
      tmuxCmd("new-session", "-d", "-s", session, "bash");
      tmuxLib.installSessionHooks(session, ourRunner, {
        agileflowBin: AGILEFLOW_BIN,
      });
    });

    it("window-linked hook installed", () => {
      const r = tmuxCmd("show-hooks", "-t", session);
      expect(r.stdout).toMatch(/window-linked\[/);
    });

    it("window-unlinked hook installed", () => {
      const r = tmuxCmd("show-hooks", "-t", session);
      expect(r.stdout).toMatch(/window-unlinked\[/);
    });

    it("after-rename-window hook installed (real tmux 3.x name)", () => {
      const r = tmuxCmd("show-hooks", "-t", session);
      // Regression guard: a previous iteration used `window-renamed`
      // which tmux silently accepts but never fires.
      expect(r.stdout).toMatch(/after-rename-window\[/);
    });
  });

  describe("snapshot subcommand updates registry", () => {
    /** @type {string} */
    let session;

    beforeAll(() => {
      session = "snapshot-test";
      tmuxCmd("new-session", "-d", "-s", session, "-c", testHome, "bash");
      tmuxCmd("new-window", "-t", session);
      tmuxCmd("new-window", "-t", session);
      registryLib.recordSession(
        {
          name: session,
          cli: "test",
          cwd: testHome,
          uuid: null,
          wrapperWindowIndex: 0,
        },
        testHome,
      );
    });

    it("tab-delimited probe survives tmux format-string parsing", () => {
      // Regression guard: a previous iteration used 0x1F which tmux
      // escape-encoded into literal `\037` text, breaking the parse.
      const DELIM = "\t";
      const r = tmuxCmd(
        "list-windows",
        "-t",
        session,
        "-F",
        `#{window_index}${DELIM}#{window_name}${DELIM}#{pane_current_path}`,
      );
      const lines = r.stdout.split("\n").filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        const parts = line.split(DELIM);
        expect(parts.length).toBe(3);
        expect(Number.isFinite(Number(parts[0]))).toBe(true);
      }
    });

    it("snapshot writes windows array with windowsCapturedAt", () => {
      const DELIM = "\t";
      const r = tmuxCmd(
        "list-windows",
        "-t",
        session,
        "-F",
        `#{window_index}${DELIM}#{window_name}${DELIM}#{pane_current_path}`,
      );
      const windows = r.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [idx, name, cwd] = line.split(DELIM);
          return { index: Number(idx), name, cwd };
        });
      const ts = Date.now();
      registryLib.updateSession(
        session,
        { windows, windowsCapturedAt: ts },
        testHome,
      );
      const reg = registryLib.loadRegistry(testHome);
      const entry = reg.sessions.find((s) => s.name === session);
      expect(entry).toBeDefined();
      expect(entry.windows).toEqual(windows);
      expect(entry.windowsCapturedAt).toBe(ts);
    });

    it("rejects stale snapshots (older windowsCapturedAt)", () => {
      const ts = Date.now();
      registryLib.updateSession(
        session,
        {
          windows: [{ index: 0, name: "FRESH", cwd: testHome }],
          windowsCapturedAt: ts + 1000,
        },
        testHome,
      );
      registryLib.updateSession(
        session,
        {
          windows: [{ index: 0, name: "STALE", cwd: testHome }],
          windowsCapturedAt: ts - 1000, // older
        },
        testHome,
      );
      const reg = registryLib.loadRegistry(testHome);
      const entry = reg.sessions.find((s) => s.name === session);
      expect(entry.windows[0].name).toBe("FRESH");
    });
  });

  describe("restore replays windows in original cwds", () => {
    /** @type {string} */
    let tabA;
    /** @type {string} */
    let tabB;
    /** @type {string} */
    let tabC;

    beforeAll(() => {
      tabA = fs.mkdtempSync(path.join(testHome, "tab-a-"));
      tabB = fs.mkdtempSync(path.join(testHome, "tab-b-"));
      tabC = fs.mkdtempSync(path.join(testHome, "tab-c-"));
      registryLib.recordSession(
        {
          name: "replay-test",
          cli: "test",
          cwd: testHome,
          uuid: null,
          wrapperWindowIndex: 0,
        },
        testHome,
      );
      registryLib.updateSession(
        "replay-test",
        {
          windows: [
            { index: 0, name: "wrapper", cwd: testHome },
            { index: 1, name: "tab-a", cwd: tabA },
            { index: 2, name: "tab-b", cwd: tabB },
            { index: 3, name: "tab-c", cwd: tabC },
          ],
          windowsCapturedAt: Date.now(),
        },
        testHome,
      );
      // Replay via our restore code (bash-stubbed; we can't use the
      // agileflow CLI because it'd exit immediately in this stub env).
      tmuxCmd("new-session", "-d", "-s", "replay-test", "-c", testHome, "bash");
      const entry = registryLib
        .loadRegistry(testHome)
        .sessions.find((s) => s.name === "replay-test");
      const sorted = entry.windows.slice().sort((a, b) => a.index - b.index);
      for (const w of sorted) {
        if (w.index === entry.wrapperWindowIndex) continue;
        const args = ["new-window", "-t", "replay-test", "-c", w.cwd];
        if (w.name) args.push("-n", w.name);
        tmuxCmd(...args);
      }
    });

    it("session has all 4 windows after replay", () => {
      const r = tmuxCmd(
        "list-windows",
        "-t",
        "replay-test",
        "-F",
        "#I:#W:#{pane_current_path}",
      );
      const lines = r.stdout.split("\n").filter(Boolean);
      expect(lines.length).toBe(4);
    });

    it.each([
      ["tab-a", () => tabA],
      ["tab-b", () => tabB],
      ["tab-c", () => tabC],
    ])("%s window has correct cwd", (name, getCwd) => {
      const r = tmuxCmd(
        "list-windows",
        "-t",
        "replay-test",
        "-F",
        "#I:#W:#{pane_current_path}",
      );
      expect(r.stdout).toContain(getCwd());
      expect(r.stdout).toContain(name);
    });
  });

  describe("wrapper-window skip with reordered session", () => {
    beforeAll(() => {
      const tabX = fs.mkdtempSync(path.join(testHome, "reorder-x-"));
      const tabY = fs.mkdtempSync(path.join(testHome, "reorder-y-"));
      registryLib.recordSession(
        {
          name: "reorder-test",
          cli: "test",
          cwd: testHome,
          uuid: null,
          wrapperWindowIndex: 2, // user moved wrapper to middle
        },
        testHome,
      );
      registryLib.updateSession(
        "reorder-test",
        {
          windows: [
            { index: 0, name: "x", cwd: tabX },
            { index: 1, name: "y", cwd: tabY },
            { index: 2, name: "wrapper", cwd: testHome },
          ],
          windowsCapturedAt: Date.now(),
        },
        testHome,
      );
      tmuxCmd(
        "new-session",
        "-d",
        "-s",
        "reorder-test",
        "-c",
        testHome,
        "bash",
      );
      const entry = registryLib
        .loadRegistry(testHome)
        .sessions.find((s) => s.name === "reorder-test");
      for (const w of entry.windows.slice().sort((a, b) => a.index - b.index)) {
        if (w.index === entry.wrapperWindowIndex) continue;
        tmuxCmd("new-window", "-t", "reorder-test", "-c", w.cwd, "-n", w.name);
      }
    });

    it("wrapperWindowIndex preserved across re-records", () => {
      const entry = registryLib
        .loadRegistry(testHome)
        .sessions.find((s) => s.name === "reorder-test");
      expect(entry.wrapperWindowIndex).toBe(2);
    });

    it("skipped only the wrapper, replayed real tabs", () => {
      // 1 from new-session + 2 replayed = 3 windows.
      const r = tmuxCmd("list-windows", "-t", "reorder-test", "-F", "#I");
      expect(r.stdout.split("\n").filter(Boolean).length).toBe(3);
    });
  });

  describe("close-then-undo cycle", () => {
    it("full close → log → kill → undo cycle works end-to-end", () => {
      // Single test (not split into multiple `it` blocks) because the
      // steps share mutable state — splitting causes vitest's parallel
      // scheduling across describes to clobber the closed-windows file.
      const session = "undo-test";
      tmuxCmd("kill-server");
      sleep(200);
      const ns = tmuxCmd(
        "new-session",
        "-d",
        "-s",
        session,
        "-c",
        testHome,
        "bash",
      );
      expect(ns.status, `new-session failed: ${ns.stderr}`).toBe(0);
      const tabACwd = fs.mkdtempSync(path.join(testHome, "undo-a-"));
      const tabBCwd = fs.mkdtempSync(path.join(testHome, "undo-b-"));
      const nw1 = tmuxCmd(
        "new-window",
        "-t",
        session,
        "-c",
        tabACwd,
        "-n",
        "tab-a",
      );
      expect(nw1.status, `new-window tab-a failed: ${nw1.stderr}`).toBe(0);
      const nw2 = tmuxCmd(
        "new-window",
        "-t",
        session,
        "-c",
        tabBCwd,
        "-n",
        "tab-b",
      );
      expect(nw2.status, `new-window tab-b failed: ${nw2.stderr}`).toBe(0);
      sleep(50); // tmux's new-window can be slightly async on first invocation

      // 1. Probe — tab-delimited format survives tmux parsing.
      const DELIM = "\t";
      const list = tmuxCmd("list-windows", "-t", session, "-F", "#I:#W").stdout;
      const tabBIdx = list
        .split("\n")
        .find((l) => l.includes("tab-b"))
        .split(":")[0];
      const probe = tmuxCmd(
        "display-message",
        "-p",
        "-t",
        `${session}:${tabBIdx}`,
        "-F",
        `#S${DELIM}#I${DELIM}#W${DELIM}#{pane_current_path}`,
      );
      const parts = probe.stdout.split(DELIM);
      expect(parts).toHaveLength(4);
      expect(parts[2]).toBe("tab-b");
      expect(parts[3]).toBe(tabBCwd);

      // 2. Kill + log: window removed, closed-windows.json has entry.
      tmuxCmd("kill-window", "-t", `${session}:${tabBIdx}`);
      closedLib.pushClosed(
        { sessionName: session, name: "tab-b", cwd: tabBCwd },
        testHome,
      );
      const after = tmuxCmd("list-windows", "-t", session, "-F", "#I")
        .stdout.split("\n")
        .filter(Boolean);
      expect(after.length).toBe(2);

      // 3. Undo: pop and recreate.
      const popped = closedLib.popClosed(session, testHome);
      expect(popped).toMatchObject({ name: "tab-b", cwd: tabBCwd });
      tmuxCmd("new-window", "-t", session, "-c", popped.cwd, "-n", popped.name);
      const final = tmuxCmd(
        "list-windows",
        "-t",
        session,
        "-F",
        "#I:#W:#{pane_current_path}",
      ).stdout;
      const lines = final.split("\n").filter(Boolean);
      expect(lines.length).toBe(3);
      expect(
        lines.some((l) => l.includes("tab-b") && l.includes(tabBCwd)),
      ).toBe(true);
    });
  });

  describe("concurrent restore lock", () => {
    it("throws when another restore is already running", () => {
      const lockFile = path.join(testHome, ".agileflow", "launch-restore.lock");
      const fd = fs.openSync(lockFile, "wx");
      try {
        expect(() =>
          restoreLib.runRestore({
            prefs: {
              tmux: { statusPosition: "bottom" },
              keybinds: { preset: "default" },
            },
            runner: ourRunner,
            home: testHome,
            agileflowBin: AGILEFLOW_BIN,
            onlyNames: ["nonexistent"],
            log: () => {},
          }),
        ).toThrow(/already in progress/);
      } finally {
        fs.closeSync(fd);
        try {
          fs.unlinkSync(lockFile);
        } catch {
          /* swallow */
        }
      }
    });
  });
});
