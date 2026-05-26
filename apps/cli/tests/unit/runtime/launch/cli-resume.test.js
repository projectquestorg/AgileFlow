/**
 * Unit tests for the per-CLI resume strategy table. Filesystem reads
 * for the claude strategy are injected so no real ~/.claude is touched.
 */
import { describe, it, expect, vi } from "vitest";

import resumeModule from "../../../../src/runtime/launch/cli-resume.js";

const {
  getResumeStrategy,
  captureClaudeUuid,
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

  it("captureUuid is a no-op for codex (UUID indexing deferred)", () => {
    expect(getResumeStrategy("codex").captureUuid("/anything")).toBeNull();
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
