/**
 * Babysit mode picker with plain labels and short hints.
 */
const prompts = require("@clack/prompts");
const chalk = require("chalk");
const { optionLabel, questionMessage } = require("../../lib/brand.js");

const MODES = [
  {
    value: "full",
    label: optionLabel(
      "Full guidance",
      "Uses the most interactive flow available for the selected IDEs.",
    ),
    hint: chalk.dim(
      "Uses the most interactive flow available for the selected IDEs.",
    ),
  },
  {
    value: "light",
    label: optionLabel(
      "Guided mode",
      "Keeps prompts short and only interrupts when needed.",
    ),
    hint: "Keeps the mentor flow on, but asks less often.",
  },
  {
    value: "minimal",
    label: optionLabel("Minimal mode", "Stays terse and avoids extra prompts."),
    hint: "Stays terse and avoids extra prompts.",
  },
  {
    value: "custom",
    label: optionLabel(
      "Customize",
      "Choose exactly which mentor behaviors are enabled.",
    ),
    hint: "Pick the behaviors you want.",
  },
];

const CUSTOM_FEATURES = [
  {
    value: "askQuestions",
    label: "Ask questions",
    hint: "Ask at decision points with specific options.",
  },
  {
    value: "planMode",
    label: "Plan mode",
    hint: "Plan before non-trivial implementation.",
  },
  {
    value: "delegation",
    label: "Delegation",
    hint: "Use subagents when work splits cleanly.",
  },
  {
    value: "taskTracking",
    label: "Task tracking",
    hint: "Use visible task lists for multi-step work.",
  },
  {
    value: "progressUpdates",
    label: "Progress updates",
    hint: "Send short status updates while working.",
  },
  {
    value: "auditAll",
    label: "Audit everything",
    hint: "Run all enabled audits after every implementation, not just when relevant.",
  },
  {
    value: "logicAudit",
    label: "Logic audit",
    hint: "Suggest after implementation.",
  },
  {
    value: "flowAudit",
    label: "Flow audit",
    hint: "Suggest after implementation when user-facing flows changed.",
  },
  {
    value: "securityAudit",
    label: "Security audit",
    hint: "Suggest after implementation when auth, APIs, or sensitive data involved.",
  },
  {
    value: "performanceAudit",
    label: "Performance audit",
    hint: "Suggest after implementation when queries, rendering, or data size involved.",
  },
  {
    value: "accessibilityAudit",
    label: "Accessibility audit",
    hint: "Suggest after implementation when UI components changed.",
  },
  {
    value: "legalAudit",
    label: "Legal audit",
    hint: "Suggest after implementation when data handling, privacy, or compliance involved.",
  },
  {
    value: "strictMode",
    label: "Strict gates",
    hint: "Require tests and review to pass before commit.",
  },
  {
    value: "tddMode",
    label: "TDD mode",
    hint: "Enforce RED → GREEN → REFACTOR phases.",
  },
];

const DEFAULT_CUSTOM_FEATURES = {
  askQuestions: true,
  planMode: true,
  delegation: true,
  taskTracking: true,
  progressUpdates: true,
  auditAll: false,
  logicAudit: true,
  flowAudit: true,
  securityAudit: true,
  performanceAudit: false,
  accessibilityAudit: false,
  legalAudit: false,
  strictMode: false,
  tddMode: false,
};

/**
 * @param {string | { mode?: string, features?: Record<string, boolean> } | undefined} current
 * @returns {Promise<{ mode: 'full' | 'light' | 'minimal' | 'custom', features?: Record<string, boolean> }>}
 */
async function pickBabysitMode(current = "light") {
  const currentMode =
    typeof current === "string" ? current : current && current.mode;
  const option = await prompts.select({
    message: questionMessage("How should AgileFlow guide babysit work?"),
    options: MODES,
    initialValue: MODES.some((m) => m.value === currentMode)
      ? currentMode
      : "light",
  });

  if (prompts.isCancel(option)) {
    prompts.cancel("Setup cancelled. No changes made.");
    process.exit(1);
  }

  if (option !== "custom") {
    return { mode: /** @type {'full' | 'light' | 'minimal'} */ (option) };
  }

  const currentFeatures =
    current && typeof current === "object" && current.features
      ? current.features
      : {};
  const initialFeatures = { ...DEFAULT_CUSTOM_FEATURES, ...currentFeatures };
  const picked = await prompts.multiselect({
    message: questionMessage("Customize guidance behaviors"),
    options: CUSTOM_FEATURES,
    initialValues: CUSTOM_FEATURES.filter((f) => initialFeatures[f.value]).map(
      (f) => f.value,
    ),
    required: false,
  });

  if (prompts.isCancel(picked)) {
    prompts.cancel("Setup cancelled. No changes made.");
    process.exit(1);
  }

  const selected = new Set(/** @type {string[]} */ (picked));
  return {
    mode: "custom",
    features: Object.fromEntries(
      CUSTOM_FEATURES.map((feature) => [
        feature.value,
        selected.has(feature.value),
      ]),
    ),
  };
}

module.exports = {
  MODES,
  CUSTOM_FEATURES,
  DEFAULT_CUSTOM_FEATURES,
  pickBabysitMode,
};
