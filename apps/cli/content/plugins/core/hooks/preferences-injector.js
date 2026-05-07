#!/usr/bin/env node
/**
 * Core hook: preferences-injector (SessionStart).
 *
 * Reads agileflow.config.json and emits a concise user-preferences block
 * so every skill and interaction in the session automatically respects
 * the user's configured settings — without each skill needing its own
 * config-reading logic.
 *
 * Always exits 0.
 */
const path = require("path");
const fs = require("fs");

const projectDir =
  process.env.AGILEFLOW_PROJECT_DIR ||
  process.env.CLAUDE_PROJECT_DIR ||
  process.cwd();

// Resolve capabilities.js from the installed runtime or the source tree.
let IDE_CAPABILITIES = null;
try {
  ({ IDE_CAPABILITIES } = require("../../../src/runtime/ide/capabilities.js"));
} catch {
  try {
    // Installed path: node_modules/agileflow/src/runtime/ide/capabilities.js
    ({
      IDE_CAPABILITIES,
    } = require("agileflow/src/runtime/ide/capabilities.js"));
  } catch {
    // capabilities unavailable — skip capability block
  }
}

// Resolve learnings helpers from the installed runtime or the source tree.
let _readLearnings = null;
let _formatLearningsBlock = null;
try {
  const learnings = require("../../../src/runtime/skills/learnings.js");
  _readLearnings = learnings.readLearnings;
  _formatLearningsBlock = learnings.formatLearningsBlock;
} catch {
  try {
    const learnings = require("agileflow/src/runtime/skills/learnings.js");
    _readLearnings = learnings.readLearnings;
    _formatLearningsBlock = learnings.formatLearningsBlock;
  } catch {
    // learnings unavailable — skip learnings block
  }
}

module.exports = { buildPreferencesBlock, buildLearningsBlock };

function buildCapabilitiesBlock(cfg) {
  if (!IDE_CAPABILITIES) return null;

  const targets = cfg?.ide?.targets;
  if (!Array.isArray(targets) || targets.length === 0) return null;

  // Use the first target as the primary IDE for capability detection.
  const primaryIde = targets[0];
  const caps = IDE_CAPABILITIES[primaryIde];
  if (!caps) return null;

  const tick = (v) => (v ? "✓" : "✗");

  const lines = [
    `## Runtime Capabilities (${caps.description})`,
    "",
    "Skills and workflows adapt their behavior based on what this IDE supports:",
    "",
    `| Capability | Available | Behavior when unavailable |`,
    `|------------|-----------|--------------------------|`,
    `| **Interactive prompts** (AskUserQuestion) | ${tick(caps.interactivePrompts)} | Present options as a numbered list instead |`,
    `| **Agent spawning** (Task / multi-agent) | ${tick(caps.multiAgent)} | Work through each analysis inline, sequentially |`,
    `| **Session restore** (PostCompact hook) | ${tick(caps.sessionRestore)} | Re-state context manually if conversation compacts |`,
    `| **Lifecycle hooks** | ${tick(caps.hooks)} | Guidance and state injection unavailable between sessions |`,
    "",
  ];

  if (!caps.interactivePrompts) {
    lines.push(
      "**Note:** This IDE does not support interactive prompts. When a workflow says to present options, write a numbered list and ask the user to reply with a number.",
    );
  }
  if (!caps.multiAgent) {
    lines.push(
      "**Note:** This IDE does not support agent spawning. When a workflow calls for running multiple expert agents in parallel, perform each analysis inline and sequentially instead.",
    );
  }

  // Filter trailing empty string if no notes added
  return lines.join("\n").trimEnd();
}

function buildPreferencesBlock() {
  let cfg = {};
  try {
    const raw = fs.readFileSync(
      path.join(projectDir, "agileflow.config.json"),
      "utf8",
    );
    cfg = JSON.parse(raw);
  } catch {
    // config missing — emit nothing
    return null;
  }

  const babysit = cfg?.plugins?.core?.settings?.babysit;
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
        ? "- **Logic audit after every implementation** — suggest 🔍 Run logic audit as (Recommended) after every implementation."
        : "- **Logic audit after implementation** — suggest 🔍 Run logic audit as (Recommended) after implementation.",
    );
  }
  if (on("flowAudit")) {
    prefs.push(
      always
        ? "- **Flow audit after every implementation** — suggest 🔄 Run flow audit after every implementation. Include a Verify flow integrity step in plans."
        : "- **Flow audit after implementation** — when user-facing flows were touched (forms, navigation, auth, CRUD), suggest 🔄 Run flow audit after implementation. Include a Verify flow integrity step in plans.",
    );
  }
  if (on("securityAudit")) {
    prefs.push(
      always
        ? "- **Security audit after every implementation** — suggest 🔒 Run security audit after every implementation."
        : "- **Security audit after implementation** — when auth, APIs, user input, file handling, or sensitive data were touched, suggest 🔒 Run security audit after implementation.",
    );
  }
  if (on("performanceAudit")) {
    prefs.push(
      always
        ? "- **Performance audit after every implementation** — suggest ⚡ Run performance audit after every implementation."
        : "- **Performance audit after implementation** — when database queries, rendering, large data, or caching were touched, suggest ⚡ Run performance audit after implementation.",
    );
  }
  if (on("accessibilityAudit")) {
    prefs.push(
      always
        ? "- **Accessibility audit after every implementation** — suggest ♿ Run accessibility audit after every implementation."
        : "- **Accessibility audit after implementation** — when UI components, forms, or interactive elements were changed, suggest ♿ Run accessibility audit after implementation.",
    );
  }
  if (on("legalAudit")) {
    prefs.push(
      always
        ? "- **Legal audit after every implementation** — suggest ⚖️ Run legal audit after every implementation."
        : "- **Legal audit after implementation** — when data collection, privacy, user consent, or compliance-sensitive code was touched, suggest ⚖️ Run legal audit after implementation.",
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

  const prefsBlock = [
    `## User Preferences (agileflow ${modeLabel} mode)`,
    "",
    "Apply these preferences throughout this session across all skills and tasks:",
    "",
    ...prefs,
    "",
    "To change: run `agileflow setup`.",
  ].join("\n");

  const capsBlock = buildCapabilitiesBlock(cfg);

  return capsBlock ? `${capsBlock}\n\n${prefsBlock}` : prefsBlock;
}

/**
 * Build a learnings block by scanning the installed skills directory for
 * skills that have `learns.enabled: true` and have at least one learning entry.
 *
 * @param {object} cfg - parsed agileflow.config.json
 * @returns {string|null}
 */
function buildLearningsBlock(cfg) {
  if (!_readLearnings || !_formatLearningsBlock) return null;
  if (!cfg?.learnings?.enabled) return null;

  const primaryIde =
    Array.isArray(cfg?.ide?.targets) && cfg.ide.targets.length > 0
      ? cfg.ide.targets[0]
      : "claude-code";

  const skillsDir =
    IDE_CAPABILITIES?.[primaryIde]?.skillsDir ?? ".claude/skills";
  const absoluteSkillsDir = path.join(projectDir, skillsDir);

  let skillNames;
  try {
    skillNames = fs.readdirSync(absoluteSkillsDir);
  } catch {
    return null; // skills dir not yet installed
  }

  const yaml = (() => {
    try {
      return require("js-yaml");
    } catch {
      return null;
    }
  })();
  if (!yaml) return null;

  const blocks = [];

  for (const skillName of skillNames) {
    const skillMdPath = path.join(absoluteSkillsDir, skillName, "SKILL.md");
    let skillMdText;
    try {
      skillMdText = fs.readFileSync(skillMdPath, "utf8");
    } catch {
      continue;
    }

    // Parse frontmatter between first two `---` fences.
    const fmMatch = skillMdText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) continue;

    let fm;
    try {
      fm = yaml.load(fmMatch[1]);
    } catch {
      continue;
    }

    if (!fm?.learns?.enabled) continue;

    // readLearnings is async — run synchronously via the already-read skills dir.
    // We resolve the learnings file path directly.
    const learnFile = fm.learns.file || `_learnings/${skillName}.yaml`;
    const safeParts = learnFile
      .split("/")
      .filter((p) => p && p !== ".." && p !== ".");
    const learnFilePath = path.join(absoluteSkillsDir, skillName, ...safeParts);

    let learningsData;
    try {
      const text = fs.readFileSync(learnFilePath, "utf8");
      if (!text.trim()) continue;
      const doc = yaml.load(text);
      if (!doc || !Array.isArray(doc.entries) || doc.entries.length === 0)
        continue;
      learningsData = { entries: doc.entries, skill: skillName };
    } catch {
      continue; // file absent or invalid — skip silently
    }

    const block = _formatLearningsBlock(learningsData);
    if (block) blocks.push(block);
  }

  return blocks.length > 0 ? blocks.join("\n\n") : null;
}

if (require.main === module) {
  let cfg = {};
  try {
    cfg = JSON.parse(
      fs.readFileSync(path.join(projectDir, "agileflow.config.json"), "utf8"),
    );
  } catch {
    /* ignore */
  }

  const prefsBlock = buildPreferencesBlock();
  const learnBlock = buildLearningsBlock(cfg);

  const parts = [prefsBlock, learnBlock].filter(Boolean);
  if (parts.length > 0) {
    process.stdout.write(parts.join("\n\n") + "\n");
  }
  process.exit(0);
}
