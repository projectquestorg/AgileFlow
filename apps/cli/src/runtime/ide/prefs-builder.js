/**
 * Pure builder for the AgileFlow "User Preferences" block.
 *
 * The SessionStart hook `preferences-injector.js` emits an identical
 * block at runtime, but it reads `agileflow.config.json` from disk and
 * cannot be reused as a pure function. This module factors out the exact
 * same wording as a side-effect-free builder that takes the babysit
 * settings object directly, so install-time emitters (AGENTS.md, per-agent
 * markdown) can bake the same guidance into files that never see the
 * SessionStart hook.
 *
 * IMPORTANT: keep the wording here byte-for-byte identical to
 * `buildPreferencesBlock` in
 * content/plugins/core/hooks/preferences-injector.js. Do not modify that
 * file — mirror any change here instead.
 */

/**
 * @typedef {Object} BabysitFeatures
 * @property {boolean} [askQuestions]
 * @property {boolean} [planMode]
 * @property {boolean} [delegation]
 * @property {boolean} [taskTracking]
 * @property {boolean} [progressUpdates]
 * @property {boolean} [auditAll]
 * @property {boolean} [logicAudit]
 * @property {boolean} [flowAudit]
 * @property {boolean} [securityAudit]
 * @property {boolean} [performanceAudit]
 * @property {boolean} [accessibilityAudit]
 * @property {boolean} [legalAudit]
 * @property {boolean} [strictMode]
 * @property {boolean} [tddMode]
 *
 * @typedef {Object} BabysitSettings
 * @property {'full'|'light'|'minimal'|'custom'} [mode]
 * @property {BabysitFeatures} [features]
 */

/**
 * Build the "## User Preferences" markdown block from a babysit settings
 * object. Returns `null` when there is no babysit config or when no
 * preference lines are enabled — matching the runtime hook's behavior.
 *
 * @param {BabysitSettings|undefined|null} babysit
 * @returns {string|null}
 */
function buildPrefsBlock(babysit) {
  if (!babysit) return null;

  const mode = babysit.mode || "full";
  const f = babysit.features || {};

  const on = (key) => {
    if (mode === "full") return true;
    if (mode === "light")
      return ["askQuestions", "planMode", "taskTracking"].includes(key);
    if (mode === "minimal") return key === "askQuestions";
    // custom — default true for core features unless explicitly false
    const defaults = {
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
    return key in f ? f[key] : (defaults[key] ?? false);
  };

  const prefs = [];

  if (on("askQuestions")) {
    prefs.push(
      '- **Ask at decision points** — end responses with AskUserQuestion (specific options, one marked Recommended). Never generic "Continue?".',
    );
  }
  if (on("planMode")) {
    prefs.push(
      "- **Plan mode for non-trivial work** — EnterPlanMode before implementing anything beyond a one-liner.",
    );
  }
  if (on("delegation")) {
    prefs.push(
      "- **Delegate to domain experts** — use Task tool with appropriate subagent_type for complex single-domain work; orchestrator for multi-domain.",
    );
  }
  if (on("taskTracking")) {
    prefs.push(
      "- **Track progress** — TaskCreate for 3+ step tasks, TaskUpdate as each completes.",
    );
  }
  if (on("progressUpdates")) {
    prefs.push(
      "- **Short status updates** — brief progress notes while working.",
    );
  }
  const always = mode === "full" || on("auditAll");

  if (on("logicAudit")) {
    prefs.push(
      always
        ? "- **Logic audit after every implementation** — suggest Run logic audit as (Recommended) after every implementation."
        : "- **Logic audit after implementation** — suggest Run logic audit as (Recommended) after implementation.",
    );
  }
  if (on("flowAudit")) {
    prefs.push(
      always
        ? "- **Flow audit after every implementation** — suggest Run flow audit after every implementation. Include a Verify flow integrity step in plans."
        : "- **Flow audit after implementation** — when user-facing flows were touched (forms, navigation, auth, CRUD), suggest Run flow audit after implementation. Include a Verify flow integrity step in plans.",
    );
  }
  if (on("securityAudit")) {
    prefs.push(
      always
        ? "- **Security audit after every implementation** — suggest Run security audit after every implementation."
        : "- **Security audit after implementation** — when auth, APIs, user input, file handling, or sensitive data were touched, suggest Run security audit after implementation.",
    );
  }
  if (on("performanceAudit")) {
    prefs.push(
      always
        ? "- **Performance audit after every implementation** — suggest Run performance audit after every implementation."
        : "- **Performance audit after implementation** — when database queries, rendering, large data, or caching were touched, suggest Run performance audit after implementation.",
    );
  }
  if (on("accessibilityAudit")) {
    prefs.push(
      always
        ? "- **Accessibility audit after every implementation** — suggest Run accessibility audit after every implementation."
        : "- **Accessibility audit after implementation** — when UI components, forms, or interactive elements were changed, suggest Run accessibility audit after implementation.",
    );
  }
  if (on("legalAudit")) {
    prefs.push(
      always
        ? "- **Legal audit after every implementation** — suggest Run legal audit after every implementation."
        : "- **Legal audit after implementation** — when data collection, privacy, user consent, or compliance-sensitive code was touched, suggest Run legal audit after implementation.",
    );
  }
  if (on("strictMode")) {
    prefs.push(
      "- **Strict gates** — hide commit option until tests pass; auto-trigger code review at 5+ files changed; remove skip options.",
    );
  }
  if (on("tddMode")) {
    prefs.push(
      "- **TDD phases** — RED (failing tests first) → GREEN (minimum code) → REFACTOR. Gate each phase.",
    );
  }

  if (prefs.length === 0) return null;

  const modeLabel =
    mode === "custom"
      ? `custom (${Object.entries(f)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(", ")})`
      : mode;

  return [
    `## User Preferences (agileflow ${modeLabel} mode)`,
    "",
    "Apply these preferences throughout this session across all skills and tasks:",
    "",
    ...prefs,
    "",
    "To change: run `agileflow setup`.",
  ].join("\n");
}

module.exports = { buildPrefsBlock };
