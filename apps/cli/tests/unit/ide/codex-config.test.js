/**
 * Unit tests for the Codex config.toml writer.
 *
 * The writer needs to preserve unrelated config while managing just the
 * AgileFlow hook registrations and the codex_hooks feature flag.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import codexModule from "../../../src/runtime/ide/codex-config.js";

const {
  writeCodexConfig,
  removeCodexConfig,
  mergeManagedHooks,
  unmanageHooks,
  isAgileflowEntry,
  MANAGED_HOOKS,
  HOOK_COMMAND_MARKER,
  DEFAULT_APPROVAL_POLICY,
  DEFAULT_SANDBOX_MODE,
} = codexModule;

describe("isAgileflowEntry", () => {
  it("detects command entries containing the marker", () => {
    expect(
      isAgileflowEntry({
        hooks: [
          {
            type: "command",
            command: "npx --no-install agileflow hook SessionStart",
          },
        ],
      }),
    ).toBe(true);
  });

  it("ignores unrelated entries", () => {
    expect(
      isAgileflowEntry({ hooks: [{ type: "command", command: "echo hello" }] }),
    ).toBe(false);
  });
});

describe("mergeManagedHooks", () => {
  it("adds codex_hooks and managed hook registrations", () => {
    const merged = mergeManagedHooks({});
    expect(merged.approval_policy).toBe(DEFAULT_APPROVAL_POLICY);
    expect(merged.sandbox_mode).toBe(DEFAULT_SANDBOX_MODE);
    expect(merged.features.codex_hooks).toBe(true);
    expect(Object.keys(merged.hooks).sort()).toEqual([
      "PreToolUse",
      "SessionStart",
      "Stop",
    ]);
    expect(merged.hooks.PreToolUse).toHaveLength(3);
  });

  it("forces full access defaults over existing sandbox settings", () => {
    const merged = mergeManagedHooks({
      approval_policy: "on-request",
      sandbox_mode: "workspace-write",
    });
    expect(merged.approval_policy).toBe("never");
    expect(merged.sandbox_mode).toBe("danger-full-access");
  });

  it("preserves user hook entries on managed events", () => {
    const existing = {
      features: { preserve_me: true },
      hooks: {
        PreToolUse: [
          {
            matcher: "Notebook",
            hooks: [{ type: "command", command: "echo notebook" }],
          },
        ],
      },
    };
    const merged = mergeManagedHooks(existing);
    expect(merged.features.preserve_me).toBe(true);
    expect(merged.hooks.PreToolUse.some((e) => e.matcher === "Notebook")).toBe(
      true,
    );
    expect(merged.hooks.PreToolUse[0].hooks[0].command).toContain(
      HOOK_COMMAND_MARKER,
    );
  });
});

describe("unmanageHooks", () => {
  it("removes managed hooks and codex_hooks but leaves user content", () => {
    const stripped = unmanageHooks(
      mergeManagedHooks({
        features: { preserve_me: true },
        hooks: {
          PreToolUse: [
            {
              matcher: "Notebook",
              hooks: [{ type: "command", command: "echo notebook" }],
            },
          ],
        },
      }),
    );
    expect(stripped.features).toEqual({ preserve_me: true });
    expect(stripped.hooks.PreToolUse).toHaveLength(1);
    expect(stripped.hooks.PreToolUse[0].matcher).toBe("Notebook");
  });
});

describe("writeCodexConfig + removeCodexConfig", () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "af-codex-"));
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("creates .codex/config.toml with hooks enabled", async () => {
    const out = await writeCodexConfig(scratch);
    expect(out).toBe(path.join(scratch, ".codex", "config.toml"));
    const text = fs.readFileSync(out, "utf8");
    expect(text).toContain('approval_policy = "never"');
    expect(text).toContain('sandbox_mode = "danger-full-access"');
    expect(text).toContain("codex_hooks = true");
    expect(text).toContain("SessionStart");
    expect(text).toContain("PreToolUse");
    expect(text).toContain("Stop");
  });

  it("removes only AgileFlow-managed content on switch-away", async () => {
    const configPath = path.join(scratch, ".codex", "config.toml");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      [
        "[features]",
        "preserve_me = true",
        "",
        "[[hooks.PreToolUse]]",
        'matcher = "Notebook"',
        "",
        "[[hooks.PreToolUse.hooks]]",
        'type = "command"',
        'command = "echo notebook"',
        "",
      ].join("\n"),
    );

    await writeCodexConfig(scratch);
    await removeCodexConfig(scratch);
    const text = fs.readFileSync(configPath, "utf8");
    expect(text).toContain("preserve_me = true");
    expect(text).not.toContain("codex_hooks = true");
    expect(text).toContain("Notebook");
    expect(text).not.toContain("agileflow hook");
  });
});

describe("MANAGED_HOOKS structure", () => {
  it("keeps the expected hook command count", () => {
    expect(MANAGED_HOOKS).toHaveLength(5);
  });
});
