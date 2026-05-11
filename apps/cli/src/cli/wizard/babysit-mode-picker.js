/**
 * Babysit mode picker — choose how opinionated the mentor skill should be.
 *
 * This maps to `plugins.core.settings.babysit.mode` in agileflow.config.json.
 * The installer reads that setting when rendering the babysit skill for each
 * target IDE.
 */
const prompts = require("@clack/prompts");
const { optionLabel, questionMessage } = require("../../lib/brand.js");

const MODE_OPTIONS = [
  {
    value: "full",
    label: optionLabel(
      "Full guidance",
      "Uses the most interactive flow available for the selected IDEs.",
    ),
    hint: "Use the richest interaction style the IDE supports.",
  },
  {
    value: "light",
    label: optionLabel(
      "Guided mode",
      "Keeps prompts short and only interrupts when needed.",
    ),
    hint: "Keeps prompts short and only interrupts when needed.",
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
    hint: "Pick plan mode, questions, tracking, delegation, and updates.",
  },
];

const CUSTOM_FEATURE_OPTIONS = [
  {
    value: "askQuestions",
    label: "Ask questions",
    hint: "Ask at decision points with specific options.",
  },
  {
    value: "planMode",
    label: "Plan mode",
    hint: "Use plan mode before non-trivial implementation.",
  },
  {
    value: "delegation",
    label: "Delegation",
    hint: "Use subagents when work splits cleanly.",
  },
  {
    value: "taskTracking",
    label: "Task tracking",
    hint: "Use a visible task list for multi-step work.",
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
 * @param {{ mode?: string } | undefined} current
 * @returns {'full' | 'light' | 'minimal' | 'custom'}
 */
function initialBabysitMode(current) {
  const currentMode =
    current && typeof current.mode === "string" ? current.mode : null;
  if (
    currentMode === "full" ||
    currentMode === "light" ||
    currentMode === "minimal" ||
    currentMode === "custom"
  ) {
    return currentMode;
  }
  return "full";
}

/**
 * @param {{ features?: Record<string, boolean> } | undefined} current
 * @returns {Record<string, boolean>}
 */
function initialCustomFeatures(current) {
  return {
    ...DEFAULT_CUSTOM_FEATURES,
    ...((current && current.features) || {}),
  };
}

/**
 * @param {{ mode?: string } | undefined} current
 * @returns {Promise<{ mode: 'full' | 'light' | 'minimal' | 'custom', features?: Record<string, boolean> }>}
 */
async function pickBabysitMode(current) {
  const choice = await prompts.select({
    message: questionMessage(
      "Babysit mode",
      "Choose how opinionated the mentor should be.",
    ),
    options: MODE_OPTIONS,
    initialValue: initialBabysitMode(current),
  });

  if (prompts.isCancel(choice)) {
    prompts.cancel("Setup cancelled. No changes made.");
    process.exit(1);
  }

  if (choice !== "custom") {
    return { mode: /** @type {'full' | 'light' | 'minimal'} */ (choice) };
  }

  const initialFeatures = initialCustomFeatures(current);
  const picked = await prompts.multiselect({
    message: questionMessage("Customize guidance behaviors"),
    options: CUSTOM_FEATURE_OPTIONS,
    initialValues: CUSTOM_FEATURE_OPTIONS.filter(
      (o) => initialFeatures[o.value],
    ).map((o) => o.value),
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
      CUSTOM_FEATURE_OPTIONS.map((option) => [
        option.value,
        selected.has(option.value),
      ]),
    ),
  };
}

module.exports = {
  pickBabysitMode,
  MODE_OPTIONS,
  CUSTOM_FEATURE_OPTIONS,
  DEFAULT_CUSTOM_FEATURES,
  initialBabysitMode,
  initialCustomFeatures,
};
