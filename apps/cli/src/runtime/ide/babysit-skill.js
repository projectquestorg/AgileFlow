/**
 * Babysit mentor skill renderer.
 *
 * The bundled babysit skill stays as the shared baseline. At install
 * time we append IDE-specific guidance so the mirrored SKILL.md only
 * names primitives the target can actually use.
 */
const { capabilitiesFor } = require("./capabilities.js");

const VALID_MODES = new Set(["full", "light", "minimal", "custom"]);

const DEFAULT_CUSTOM_FEATURES = {
  planMode: true,
  askQuestions: true,
  taskTracking: true,
  delegation: true,
  progressUpdates: true,
};

/**
 * @param {any} config
 * @returns {{ mode: 'full' | 'light' | 'minimal' | 'custom' | null, features: Record<string, boolean> }}
 */
function resolveBabysitSettings(config) {
  const raw =
    config &&
    config.plugins &&
    config.plugins.core &&
    config.plugins.core.settings &&
    config.plugins.core.settings.babysit;
  const mode = raw && VALID_MODES.has(raw.mode) ? raw.mode : null;
  const features =
    raw && raw.features && typeof raw.features === "object"
      ? { ...DEFAULT_CUSTOM_FEATURES, ...raw.features }
      : { ...DEFAULT_CUSTOM_FEATURES };
  return { mode, features };
}

/**
 * @param {string} targetIde
 * @param {any} config
 * @returns {'full' | 'light' | 'minimal' | 'custom'}
 */
function resolveBabysitMode(targetIde, config) {
  const { mode } = resolveBabysitSettings(config);
  if (mode) return mode;
  return targetIde === "claude-code" ? "full" : "light";
}

/**
 * @param {'full' | 'light' | 'minimal' | 'custom'} mode
 * @param {Record<string, boolean>} customFeatures
 * @returns {Record<string, boolean>}
 */
function featuresForMode(mode, customFeatures) {
  if (mode === "custom")
    return { ...DEFAULT_CUSTOM_FEATURES, ...customFeatures };
  if (mode === "minimal") {
    return {
      planMode: false,
      askQuestions: false,
      taskTracking: false,
      delegation: false,
      progressUpdates: false,
    };
  }
  if (mode === "light") {
    return {
      planMode: true,
      askQuestions: true,
      taskTracking: true,
      delegation: false,
      progressUpdates: true,
    };
  }
  return { ...DEFAULT_CUSTOM_FEATURES };
}

/**
 * Build the IDE-specific appendix for the babysit skill.
 *
 * @param {string} targetIde
 * @param {any} config
 * @returns {string}
 */
function renderBabysitAppendix(targetIde, config) {
  const caps = capabilitiesFor(targetIde);
  const mode = resolveBabysitMode(targetIde, config);
  const settings = resolveBabysitSettings(config);
  const features = featuresForMode(mode, settings.features);

  const lines = [];
  lines.push("## IDE-specific guidance");
  lines.push("");
  lines.push(`- Installed babysit mode: \`${mode}\``);
  if (mode === "custom") {
    const enabled = Object.entries(features)
      .filter(([, value]) => value)
      .map(([key]) => key);
    lines.push(
      `- Custom behaviors enabled: ${enabled.length ? enabled.join(", ") : "none"}`,
    );
  }

  if (targetIde === "claude-code") {
    if (features.askQuestions) {
      lines.push(
        "- Use `AskUserQuestion` at decision points when a choice would benefit from user control.",
      );
    }
    if (features.planMode) {
      lines.push(
        "- Use `EnterPlanMode` for non-trivial implementation, then `ExitPlanMode` when the plan is ready.",
      );
    }
    if (features.taskTracking) {
      lines.push(
        "- Use `TaskCreate` / `TaskUpdate` for 3+ step work and update as each step lands.",
      );
    }
    if (features.delegation) {
      lines.push(
        "- Use subagents for bounded parallel exploration or delegation when the work splits cleanly.",
      );
    }
    if (features.progressUpdates) {
      lines.push("- Send short progress updates while working for a while.");
    }
    if (mode === "light") {
      lines.push(
        "- Keep the prompt surface lighter: ask only when blocked or when the next move is genuinely ambiguous.",
      );
    }
    if (mode === "minimal") {
      lines.push(
        "- Keep the interaction terse: make one recommendation, explain the next action, and avoid repeated confirmation loops.",
      );
    }
    return `${lines.join("\n")}\n`;
  }

  if (targetIde === "codex" && features.taskTracking) {
    lines.push(
      "- Use Codex tasks for multi-step work and keep the task scoped to a single clear outcome.",
    );
  }
  if (features.askQuestions) {
    lines.push(
      "- Use `request_user_input` for small sets of clarifying questions when collaboration mode is enabled; otherwise fall back to a concise numbered choice list with one recommended option first.",
    );
  }
  if (features.planMode) {
    lines.push(
      "- Write a short plan in plain text before non-trivial implementation.",
    );
  }
  if (features.delegation) {
    if (caps.agents) {
      lines.push(
        "- Use subagents for bounded parallel exploration or delegation when the work splits cleanly.",
      );
    } else {
      lines.push(
        "- If subagents are unavailable, keep delegation in plain text and split the work into explicit named steps.",
      );
    }
  }
  if (features.taskTracking) {
    lines.push(
      "- Track progress visibly with a checklist or step list and mark each item complete as soon as it lands.",
    );
  }
  if (features.progressUpdates) {
    lines.push("- Keep the user updated as each step lands.");
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Append IDE-specific babysit guidance to a SKILL.md payload.
 *
 * @param {string} skillId
 * @param {string} sourceText
 * @param {{ targetIde?: string, config?: any }} [context]
 * @returns {string}
 */
function renderSkillForTarget(skillId, sourceText, context = {}) {
  if (skillId !== "agileflow-babysit-mentor") {
    return sourceText;
  }
  const targetIde = context.targetIde || "claude-code";
  const appendix = renderBabysitAppendix(targetIde, context.config);
  return `${sourceText.replace(/\s+$/u, "")}\n\n${appendix}`;
}

module.exports = {
  resolveBabysitSettings,
  resolveBabysitMode,
  featuresForMode,
  renderBabysitAppendix,
  renderSkillForTarget,
};
