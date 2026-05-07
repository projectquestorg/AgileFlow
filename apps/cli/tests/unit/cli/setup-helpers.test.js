/**
 * Unit tests for the pluginsFromCsv helper extracted from setup.js.
 *
 * The full setup flow is exercised by integration tests; here we cover
 * the CSV parsing + unknown-plugin detection logic in isolation.
 */
import { describe, it, expect } from "vitest";

import setupModule from "../../../src/cli/commands/setup.js";

const {
  pluginsFromCsv,
  resolveIdeTargets,
  resolveInstallScope,
  installPathsForScope,
} = setupModule;

describe("pluginsFromCsv", () => {
  it("enables core even if CSV is empty", () => {
    const { plugins, unknownPlugins } = pluginsFromCsv("");
    expect(plugins.core.enabled).toBe(true);
    expect(unknownPlugins).toEqual([]);
  });

  it("enables listed discovered plugins", () => {
    const { plugins, unknownPlugins } = pluginsFromCsv("seo,audit");
    expect(plugins.core.enabled).toBe(true);
    expect(plugins.seo.enabled).toBe(true);
    expect(plugins.audit.enabled).toBe(true);
    expect(plugins.ads.enabled).toBe(false);
    expect(unknownPlugins).toEqual([]);
  });

  it("surfaces typos / unknown plugin ids", () => {
    const { plugins, unknownPlugins } = pluginsFromCsv("seo,typo,another-typo");
    expect(plugins.seo.enabled).toBe(true);
    expect(unknownPlugins.sort()).toEqual(["another-typo", "typo"]);
  });

  it("ignores whitespace-only CSV entries", () => {
    const { plugins, unknownPlugins } = pluginsFromCsv("  ,  ,seo,  ");
    expect(plugins.seo.enabled).toBe(true);
    expect(unknownPlugins).toEqual([]);
  });

  it("preserves custom plugin entries in existing config", () => {
    const existing = {
      core: { enabled: true },
      mycustom: { enabled: true, settings: { key: "value" } },
    };
    const { plugins, unknownPlugins } = pluginsFromCsv("seo", existing);
    expect(plugins.mycustom).toEqual({
      enabled: true,
      settings: { key: "value" },
    });
    expect(plugins.seo.enabled).toBe(true);
    expect(unknownPlugins).toEqual([]);
  });
});

describe("resolveIdeTargets", () => {
  it("keeps an explicit comma-separated list", () => {
    expect(resolveIdeTargets("cursor,windsurf", ["claude-code"])).toEqual([
      "cursor",
      "windsurf",
    ]);
  });

  it("expands the all alias to every supported IDE", () => {
    expect(resolveIdeTargets("all", ["claude-code"])).toEqual([
      "claude-code",
      "cursor",
      "windsurf",
      "codex",
      "antigravity",
    ]);
  });

  it("falls back to the provided default list when no option is set", () => {
    expect(resolveIdeTargets(undefined, ["claude-code"])).toEqual([
      "claude-code",
    ]);
  });
});

describe("install scope helpers", () => {
  it("defaults invalid or missing scope to project", () => {
    expect(resolveInstallScope(undefined)).toBe("project");
    expect(resolveInstallScope("anything-else")).toBe("project");
  });

  it("accepts global scope", () => {
    expect(resolveInstallScope("global")).toBe("global");
  });

  it("uses the cwd for project installs", () => {
    expect(installPathsForScope("project", "/repo")).toEqual({
      scope: "project",
      configRoot: "/repo",
      agileflowDir: "/repo/.agileflow",
      ideRoot: "/repo",
    });
  });

  it("uses the home-backed .agileflow root for global installs", () => {
    const paths = installPathsForScope("global", "/repo");
    expect(paths.scope).toBe("global");
    expect(paths.configRoot.endsWith("/.agileflow")).toBe(true);
    expect(paths.agileflowDir).toBe(paths.configRoot);
    expect(paths.ideRoot).not.toBe("/repo");
  });
});
