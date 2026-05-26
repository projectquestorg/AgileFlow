/**
 * Unit tests for the per-CLI resume strategy table. Filesystem reads
 * for the claude strategy are injected so no real ~/.claude is touched.
 */
import { describe, it, expect, vi } from "vitest";

import resumeModule from "../../../../src/runtime/launch/cli-resume.js";

const {
  getResumeStrategy,
  captureClaudeUuid,
  captureCodexUuid,
  encodeClaudeProjectDir,
  RESUME_STRATEGIES,
} = resumeModule;

describe("encodeClaudeProjectDir", () => {
  it("encodes /home/me/app as -home-me-app", () => {
    expect(encodeClaudeProjectDir("/home/me/app")).toBe("-home-me-app");
  });
  it("encodes /a/b/c as -a-b-c", () => {
    expect(encodeClaudeProjectDir("/a/b/c")).toBe("-a-b-c");
  });
  it("encodes a single root-level dir", () => {
    expect(encodeClaudeProjectDir("/app")).toBe("-app");
  });

  it("normalizes Windows-style backslash paths to the same shape", () => {
    expect(encodeClaudeProjectDir("C:\\Users\\me\\app")).toBe(
      "-C:-Users-me-app",
    );
  });

  it("handles mixed separators on Windows-ish paths", () => {
    expect(encodeClaudeProjectDir("C:\\Users/me\\app")).toBe(
      "-C:-Users-me-app",
    );
  });
});

describe("claude strategy", () => {
  it("resumeArgs without a UUID is empty (fresh start)", () => {
    const s = getResumeStrategy("claude");
    expect(s.resumeArgs(null)).toEqual([]);
  });

  it("resumeArgs with a UUID forwards `--resume <uuid>`", () => {
    const s = getResumeStrategy("claude");
    expect(s.resumeArgs("abc-123")).toEqual(["--resume", "abc-123"]);
  });

  it("captureClaudeUuid returns the newest non-agent jsonl filename's UUID", () => {
    const readdirSync = vi.fn(() => [
      "old.jsonl",
      "agent-skip.jsonl",
      "newest.jsonl",
      "not-jsonl.txt",
    ]);
    const statSync = vi.fn((p) => {
      if (p.endsWith("old.jsonl")) return { mtimeMs: 1000 };
      if (p.endsWith("newest.jsonl")) return { mtimeMs: 5000 };
      if (p.endsWith("agent-skip.jsonl")) return { mtimeMs: 6000 }; // newest but agent — must be skipped
      return { mtimeMs: 0 };
    });
    const uuid = captureClaudeUuid("/home/me/app", {
      home: "/fake-home",
      readdirSync,
      statSync,
    });
    expect(uuid).toBe("newest");
  });

  it("captureClaudeUuid returns null when no jsonl files exist", () => {
    const readdirSync = vi.fn(() => ["readme.md", "notes.txt"]);
    const statSync = vi.fn();
    expect(
      captureClaudeUuid("/home/me/app", {
        home: "/fake",
        readdirSync,
        statSync,
      }),
    ).toBeNull();
  });

  it("captureClaudeUuid returns null when the project dir doesn't exist", () => {
    const readdirSync = vi.fn(() => {
      const err = new Error("ENOENT");
      err.code = "ENOENT";
      throw err;
    });
    expect(
      captureClaudeUuid("/missing", { home: "/fake", readdirSync }),
    ).toBeNull();
  });
});

describe("codex strategy", () => {
  it("resumeArgs without a UUID emits `resume --last`", () => {
    const s = getResumeStrategy("codex");
    expect(s.resumeArgs(null)).toEqual(["resume", "--last"]);
  });

  it("resumeArgs with a UUID forwards `resume <uuid>` (best-effort)", () => {
    const s = getResumeStrategy("codex");
    expect(s.resumeArgs("uuid-abc")).toEqual(["resume", "uuid-abc"]);
  });

  it("captureUuid scans ~/.codex/sessions for a matching cwd and returns its payload.id", () => {
    // Mock ~/.codex/sessions/YYYY/MM/DD/rollout-...UUID.jsonl tree.
    const tree = {
      "/fake/.codex/sessions": [
        { name: "2026", isDirectory: () => true, isFile: () => false },
      ],
      "/fake/.codex/sessions/2026": [
        { name: "05", isDirectory: () => true, isFile: () => false },
      ],
      "/fake/.codex/sessions/2026/05": [
        { name: "10", isDirectory: () => true, isFile: () => false },
      ],
      "/fake/.codex/sessions/2026/05/10": [
        {
          name: "rollout-old-uuid-1.jsonl",
          isDirectory: () => false,
          isFile: () => true,
        },
        {
          name: "rollout-new-uuid-2.jsonl",
          isDirectory: () => false,
          isFile: () => true,
        },
        {
          name: "rollout-other-cwd.jsonl",
          isDirectory: () => false,
          isFile: () => true,
        },
      ],
    };
    const readdirSync = vi.fn((p) => tree[p] || []);
    const mtimes = {
      "/fake/.codex/sessions/2026/05/10/rollout-old-uuid-1.jsonl": 1000,
      "/fake/.codex/sessions/2026/05/10/rollout-new-uuid-2.jsonl": 5000,
      "/fake/.codex/sessions/2026/05/10/rollout-other-cwd.jsonl": 9999,
    };
    const statSync = vi.fn((p) => ({ mtimeMs: mtimes[p] || 0 }));
    const contents = {
      "/fake/.codex/sessions/2026/05/10/rollout-old-uuid-1.jsonl":
        JSON.stringify({
          type: "session_meta",
          payload: { id: "uuid-old", cwd: "/home/me/app" },
        }) + "\n...",
      "/fake/.codex/sessions/2026/05/10/rollout-new-uuid-2.jsonl":
        JSON.stringify({
          type: "session_meta",
          payload: { id: "uuid-new", cwd: "/home/me/app" },
        }) + "\n...",
      "/fake/.codex/sessions/2026/05/10/rollout-other-cwd.jsonl":
        JSON.stringify({
          type: "session_meta",
          payload: { id: "uuid-other", cwd: "/somewhere/else" },
        }) + "\n...",
    };
    const readFileSync = vi.fn((p) => contents[p] || "");

    const uuid = captureCodexUuid("/home/me/app", {
      home: "/fake",
      readdirSync,
      statSync,
      readFileSync,
    });
    // Newest among matching-cwd files: uuid-new (mtime 5000) wins over
    // uuid-old (1000). uuid-other has the highest mtime but a different
    // cwd so it's skipped.
    expect(uuid).toBe("uuid-new");
  });

  it("captureUuid returns null when nothing matches the cwd", () => {
    const tree = {
      "/fake/.codex/sessions": [
        { name: "2026", isDirectory: () => true, isFile: () => false },
      ],
      "/fake/.codex/sessions/2026": [
        {
          name: "rollout-x.jsonl",
          isDirectory: () => false,
          isFile: () => true,
        },
      ],
    };
    const readdirSync = vi.fn((p) => tree[p] || []);
    const statSync = vi.fn(() => ({ mtimeMs: 1 }));
    const readFileSync = vi.fn(() =>
      JSON.stringify({
        type: "session_meta",
        payload: { id: "x", cwd: "/other" },
      }),
    );
    expect(
      captureCodexUuid("/no-match", {
        home: "/fake",
        readdirSync,
        statSync,
        readFileSync,
      }),
    ).toBeNull();
  });

  it("captureUuid returns null when ~/.codex/sessions doesn't exist", () => {
    const readdirSync = vi.fn(() => {
      const err = new Error("ENOENT");
      err.code = "ENOENT";
      throw err;
    });
    expect(
      captureCodexUuid("/cwd", {
        home: "/fake",
        readdirSync,
      }),
    ).toBeNull();
  });
});

describe("cursor-agent / aider strategies", () => {
  it("cursor-agent has no resume args", () => {
    expect(getResumeStrategy("cursor-agent").resumeArgs("any")).toEqual([]);
  });
  it("aider has no resume args (auto-restores from .aider.chat.history.md)", () => {
    expect(getResumeStrategy("aider").resumeArgs("any")).toEqual([]);
  });
});

describe("unknown CLI", () => {
  it("falls back to the empty strategy", () => {
    const s = getResumeStrategy("not-a-real-cli");
    expect(s.resumeArgs("uuid")).toEqual([]);
    expect(s.captureUuid("/cwd")).toBeNull();
  });
});

describe("RESUME_STRATEGIES table shape", () => {
  it("covers all four KNOWN_CLIS", () => {
    expect(Object.keys(RESUME_STRATEGIES).sort()).toEqual([
      "aider",
      "claude",
      "codex",
      "cursor-agent",
    ]);
  });
});
