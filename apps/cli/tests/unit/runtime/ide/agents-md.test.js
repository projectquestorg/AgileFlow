/**
 * Unit tests for the portable AGENTS.md emitter, the CLAUDE.md import
 * bridge, and per-agent preference injection.
 *
 * Focus: managed markers are present, re-runs are idempotent, and user
 * content placed OUTSIDE the markers is always preserved.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import agentsMd from "../../../../src/runtime/ide/agents-md.js";

const {
  BEGIN_MARKER,
  END_MARKER,
  upsertManagedRegion,
  removeManagedRegion,
  writeAgentsMd,
  ensureClaudeMdImport,
  injectAgentPrefs,
} = agentsMd;

/** A merged config with a full babysit profile. */
function fullConfig() {
  return {
    plugins: {
      core: { enabled: true, settings: { babysit: { mode: "full" } } },
    },
  };
}

describe("upsertManagedRegion", () => {
  it("appends a fresh managed region to empty content", () => {
    const out = upsertManagedRegion("", "hello");
    expect(out).toContain(BEGIN_MARKER);
    expect(out).toContain(END_MARKER);
    expect(out).toContain("hello");
  });

  it("replaces only the managed region and preserves surrounding user text", () => {
    const first = upsertManagedRegion("USER TOP\n", "managed v1");
    const withTail = `${first}\nUSER BOTTOM\n`;
    const second = upsertManagedRegion(withTail, "managed v2");
    expect(second).toContain("USER TOP");
    expect(second).toContain("USER BOTTOM");
    expect(second).toContain("managed v2");
    expect(second).not.toContain("managed v1");
    // Exactly one managed region.
    expect(second.split(BEGIN_MARKER).length - 1).toBe(1);
    expect(second.split(END_MARKER).length - 1).toBe(1);
  });

  it("is idempotent for identical bodies", () => {
    const a = upsertManagedRegion("x\n", "body");
    const b = upsertManagedRegion(a, "body");
    expect(b).toBe(a);
  });
});

describe("removeManagedRegion", () => {
  it("strips the managed region and keeps user content", () => {
    const withRegion = upsertManagedRegion("KEEP ME\n", "managed");
    const cleaned = removeManagedRegion(withRegion);
    expect(cleaned).toContain("KEEP ME");
    expect(cleaned).not.toContain(BEGIN_MARKER);
    expect(cleaned).not.toContain("managed");
  });

  it("is a no-op when no region is present", () => {
    expect(removeManagedRegion("plain text")).toBe("plain text");
  });
});

describe("writeAgentsMd", () => {
  /** @type {string} */
  let scratch;
  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "af-agentsmd-"));
  });
  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("generates AGENTS.md with managed markers and the prefs block", async () => {
    const p = await writeAgentsMd(scratch, fullConfig());
    const text = fs.readFileSync(p, "utf8");
    expect(text).toContain(BEGIN_MARKER);
    expect(text).toContain(END_MARKER);
    expect(text).toContain("## User Preferences (agileflow full mode)");
    expect(text).toContain("Ask at decision points");
  });

  it("emits AGENTS.md even without a babysit profile", async () => {
    const p = await writeAgentsMd(scratch, {});
    const text = fs.readFileSync(p, "utf8");
    expect(text).toContain(BEGIN_MARKER);
    expect(text).toContain("agileflow setup");
  });

  it("preserves user content added outside the markers on a second run", async () => {
    const p = await writeAgentsMd(scratch, fullConfig());
    // User edits the file, adding content before and after the region.
    let text = fs.readFileSync(p, "utf8");
    text = `# My Project Notes\n\n${text}\n## Extra user section\nkeep this\n`;
    fs.writeFileSync(p, text, "utf8");

    await writeAgentsMd(scratch, fullConfig());
    const after = fs.readFileSync(p, "utf8");
    expect(after).toContain("# My Project Notes");
    expect(after).toContain("## Extra user section");
    expect(after).toContain("keep this");
    // Still exactly one managed region.
    expect(after.split(BEGIN_MARKER).length - 1).toBe(1);
  });
});

describe("ensureClaudeMdImport", () => {
  /** @type {string} */
  let scratch;
  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "af-claudemd-"));
  });
  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("creates CLAUDE.md with an @AGENTS.md import", async () => {
    const p = await ensureClaudeMdImport(scratch);
    const text = fs.readFileSync(p, "utf8");
    expect(text).toContain("@AGENTS.md");
    expect(text).toContain(BEGIN_MARKER);
  });

  it("adds the import idempotently and preserves existing user content", async () => {
    const target = path.join(scratch, "CLAUDE.md");
    fs.writeFileSync(
      target,
      "# Existing house rules\n\nDo the thing.\n",
      "utf8",
    );

    await ensureClaudeMdImport(scratch);
    await ensureClaudeMdImport(scratch);
    const text = fs.readFileSync(target, "utf8");

    expect(text).toContain("# Existing house rules");
    expect(text).toContain("Do the thing.");
    // Import present exactly once.
    expect(text.split("@AGENTS.md").length - 1).toBe(1);
    expect(text.split(BEGIN_MARKER).length - 1).toBe(1);
  });
});

describe("injectAgentPrefs", () => {
  /** @type {string} */
  let scratch;
  /** @type {string} */
  let agentsDir;
  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "af-agentprefs-"));
    agentsDir = path.join(scratch, "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, "expert.md"),
      "---\nname: expert\n---\n\nYou are an expert.\n",
      "utf8",
    );
    fs.mkdirSync(path.join(agentsDir, "nested"), { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, "nested", "helper.md"),
      "# Helper\n",
      "utf8",
    );
  });
  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("bakes the managed prefs block into every agent .md file", async () => {
    const { touched, failed } = await injectAgentPrefs(agentsDir, fullConfig());
    expect(touched.length).toBe(2);
    expect(failed).toEqual([]);
    const expert = fs.readFileSync(path.join(agentsDir, "expert.md"), "utf8");
    expect(expert).toContain("You are an expert.");
    expect(expert).toContain(BEGIN_MARKER);
    expect(expert).toContain("## User Preferences (agileflow full mode)");
  });

  it("is idempotent — a second run does not duplicate the block", async () => {
    await injectAgentPrefs(agentsDir, fullConfig());
    const { touched: touchedAgain } = await injectAgentPrefs(
      agentsDir,
      fullConfig(),
    );
    expect(touchedAgain).toEqual([]);
    const expert = fs.readFileSync(path.join(agentsDir, "expert.md"), "utf8");
    expect(expert.split(BEGIN_MARKER).length - 1).toBe(1);
    expect(expert.split(END_MARKER).length - 1).toBe(1);
  });

  it("removes the managed block when no babysit profile is configured", async () => {
    await injectAgentPrefs(agentsDir, fullConfig());
    await injectAgentPrefs(agentsDir, {});
    const expert = fs.readFileSync(path.join(agentsDir, "expert.md"), "utf8");
    expect(expert).not.toContain(BEGIN_MARKER);
    expect(expert).toContain("You are an expert.");
  });

  it("returns [] when the agents directory does not exist", async () => {
    const { touched } = await injectAgentPrefs(
      path.join(scratch, "missing"),
      fullConfig(),
    );
    expect(touched).toEqual([]);
  });
});
