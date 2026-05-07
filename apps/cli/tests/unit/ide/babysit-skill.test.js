/**
 * Unit tests for the babysit skill renderer.
 */
import { describe, it, expect } from "vitest";

import babysitModule from "../../../src/runtime/ide/babysit-skill.js";

const {
  resolveBabysitMode,
  renderBabysitAppendix,
  renderSkillForTarget,
  featuresForMode,
} = babysitModule;

describe("resolveBabysitMode", () => {
  it("defaults to full for Claude Code and light elsewhere", () => {
    expect(resolveBabysitMode("claude-code", {})).toBe("full");
    expect(resolveBabysitMode("codex", {})).toBe("light");
  });

  it("honors explicit config overrides", () => {
    const config = {
      plugins: {
        core: {
          settings: {
            babysit: { mode: "minimal" },
          },
        },
      },
    };
    expect(resolveBabysitMode("claude-code", config)).toBe("minimal");
  });

  it("honors custom mode", () => {
    const config = {
      plugins: {
        core: {
          settings: {
            babysit: { mode: "custom", features: { planMode: false } },
          },
        },
      },
    };
    expect(resolveBabysitMode("claude-code", config)).toBe("custom");
  });
});

describe("featuresForMode", () => {
  it("uses explicit feature toggles for custom mode", () => {
    expect(
      featuresForMode("custom", {
        planMode: false,
        askQuestions: true,
        taskTracking: false,
        delegation: true,
        progressUpdates: false,
      }),
    ).toMatchObject({
      planMode: false,
      askQuestions: true,
      taskTracking: false,
      delegation: true,
      progressUpdates: false,
    });
  });
});

describe("renderSkillForTarget", () => {
  it("appends Claude-specific tool guidance for Claude Code", () => {
    const rendered = renderSkillForTarget(
      "agileflow-babysit-mentor",
      "# base\n",
      {
        targetIde: "claude-code",
        config: {},
      },
    );
    expect(rendered).toContain("AskUserQuestion");
    expect(rendered).toContain("EnterPlanMode");
    expect(rendered).toContain("TaskCreate");
  });

  it("uses plain-text fallbacks for Codex", () => {
    const rendered = renderSkillForTarget(
      "agileflow-babysit-mentor",
      "# base\n",
      {
        targetIde: "codex",
        config: {},
      },
    );
    expect(rendered).not.toContain("AskUserQuestion");
    expect(rendered).toContain("numbered choice list");
    expect(rendered).not.toContain("subagents");
  });

  it("mentions Codex tasks when task tracking is enabled", () => {
    const rendered = renderBabysitAppendix("codex", {
      plugins: {
        core: {
          settings: {
            babysit: {
              mode: "custom",
              features: {
                planMode: false,
                askQuestions: false,
                taskTracking: true,
                delegation: false,
                progressUpdates: false,
              },
            },
          },
        },
      },
    });
    expect(rendered).toContain("Codex tasks");
    expect(rendered).not.toContain("TaskCreate");
  });

  it("keeps non-babysit skills untouched", () => {
    expect(
      renderSkillForTarget("agileflow-story-writer", "# other\n", {
        targetIde: "codex",
        config: {},
      }),
    ).toBe("# other\n");
  });

  it("reduces interaction when babysit mode is minimal", () => {
    const rendered = renderBabysitAppendix("claude-code", {
      plugins: {
        core: {
          settings: {
            babysit: { mode: "minimal" },
          },
        },
      },
    });
    expect(rendered).toContain("minimal");
    expect(rendered).not.toContain("AskUserQuestion");
    expect(rendered).not.toContain("EnterPlanMode");
    expect(rendered).not.toContain("TaskCreate");
  });

  it("renders only enabled custom behaviors", () => {
    const rendered = renderBabysitAppendix("claude-code", {
      plugins: {
        core: {
          settings: {
            babysit: {
              mode: "custom",
              features: {
                planMode: false,
                askQuestions: true,
                taskTracking: false,
                delegation: false,
                progressUpdates: false,
              },
            },
          },
        },
      },
    });
    expect(rendered).toContain("custom");
    expect(rendered).toContain("AskUserQuestion");
    expect(rendered).not.toContain("EnterPlanMode");
    expect(rendered).not.toContain("TaskCreate");
    expect(rendered).not.toContain("subagents");
  });
});
