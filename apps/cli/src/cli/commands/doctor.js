/**
 * `agileflow doctor` — validates everything we can statically check.
 *
 * Targets the BUNDLED content (under `apps/cli/content/`) so the user
 * gets the same answer the CI quality gate gives. Also validates the
 * installed `.agileflow/hook-manifest.yaml` if present (catches drift
 * from manual edits).
 *
 * Exit code: 0 on green, 1 if any errors. Warnings are surfaced but
 * don't fail the command.
 */
const path = require("path");
const fs = require("fs");

const { discoverPlugins } = require("../../runtime/plugins/registry.js");
const {
  validatePluginSet,
  hasErrors: pluginHasErrors,
} = require("../../runtime/plugins/validator.js");
const { loadHookManifest } = require("../../runtime/hooks/manifest-loader.js");
const { buildHookManifest } = require("../../runtime/hooks/aggregator.js");
const { resolvePlugins } = require("../../runtime/plugins/resolver.js");
const {
  validateSkillsAtRoot,
  validateSkill,
  loadSkill,
  detectKeywordCollisions,
  hasErrors: skillHasErrors,
} = require("../../runtime/skills/validator.js");
const { loadConfig } = require("../../runtime/config/loader.js");
const { IDE_CAPABILITIES } = require("../../runtime/ide/capabilities.js");

/**
 * Walk `content/plugins/<plugin>/skills/<skill>/SKILL.md` for every
 * plugin and run the validator. Returns issues + the loaded skill set.
 */
async function validateBundledSkills() {
  const plugins = discoverPlugins();
  /** @type {Array<import('../../runtime/skills/validator.js').SkillIssue>} */
  const issues = [];
  /** @type {Array<import('../../runtime/skills/validator.js').SkillManifest>} */
  const allSkills = [];
  for (const p of plugins) {
    const root = path.join(p.dir, "skills");
    const r = await validateSkillsAtRoot(root);
    issues.push(...r.issues);
    allSkills.push(...r.skills);
  }
  // Cross-plugin collision check across every skill that loaded.
  issues.push(...detectKeywordCollisions(allSkills));
  return { allSkills, issues };
}

/**
 * Validate the aggregated hook manifest the bundled plugins would
 * produce. Catches the same condition `installPlugins` does, but
 * surfaces it BEFORE any install runs.
 */
async function validateAggregatedHookManifest() {
  /** @type {string[]} */
  const errors = [];
  try {
    const plugins = discoverPlugins();
    const { ordered } = resolvePlugins(plugins, []);
    const manifestObj = buildHookManifest(ordered);
    const {
      normalizeManifest,
    } = require("../../runtime/hooks/manifest-loader.js");
    normalizeManifest(manifestObj);
  } catch (err) {
    errors.push(err.message);
  }
  return errors;
}

/**
 * Validate a project's installed hook manifest file (if present).
 */
async function validateInstalledManifest(cwd) {
  const manifestPath = path.join(cwd, ".agileflow", "hook-manifest.yaml");
  if (!fs.existsSync(manifestPath)) return [];
  /** @type {string[]} */
  const errors = [];
  try {
    await loadHookManifest(manifestPath);
  } catch (err) {
    errors.push(`installed hook manifest invalid: ${err.message}`);
  }
  return errors;
}

/**
 * Print a section header, then the list of issues. Returns the count
 * of errors in this section.
 *
 * @param {string} title
 * @param {Array<{severity: string, skillId?: string, message: string, pluginId?: string}>} issues
 */
function printSection(title, issues) {
  // eslint-disable-next-line no-console
  console.log(`\n${title}`);
  if (issues.length === 0) {
    // eslint-disable-next-line no-console
    console.log("  ok");
    return 0;
  }
  let errorCount = 0;
  for (const issue of issues) {
    const sev = issue.severity || "error";
    if (sev === "error") errorCount += 1;
    const label = sev === "error" ? "ERROR" : "WARN ";
    const id = issue.skillId || issue.pluginId || "";
    const idPrefix = id ? `[${id}] ` : "";
    // eslint-disable-next-line no-console
    console.log(`  ${label} ${idPrefix}${issue.message}`);
  }
  return errorCount;
}

/**
 * Check installation health in the current project directory.
 * Returns issues describing missing/misconfigured IDE setup.
 */
async function checkInstallHealth(cwd) {
  const issues = [];
  const configPath = path.join(cwd, "agileflow.config.json");

  if (!fs.existsSync(configPath)) {
    issues.push({
      severity: "warn",
      message:
        "agileflow.config.json not found — run `agileflow setup` to configure",
    });
    return issues;
  }

  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    issues.push({
      severity: "error",
      message: "agileflow.config.json is not valid JSON",
    });
    return issues;
  }

  const targets = cfg?.ide?.targets;
  if (!Array.isArray(targets) || targets.length === 0) {
    issues.push({
      severity: "warn",
      message: "No IDE targets configured in agileflow.config.json",
    });
    return issues;
  }

  for (const ide of targets) {
    const caps = IDE_CAPABILITIES[ide];
    if (!caps) {
      issues.push({
        severity: "warn",
        message: `Unknown IDE target "${ide}" in config`,
      });
      continue;
    }

    // Check skills directory exists and has at least one SKILL.md
    if (caps.skills) {
      const skillsDir = path.join(cwd, caps.skillsDir);
      if (!fs.existsSync(skillsDir)) {
        issues.push({
          severity: "error",
          message: `[${ide}] Skills not installed — ${caps.skillsDir}/ missing. Run \`agileflow setup\``,
        });
      } else {
        const skillFiles = fs.readdirSync(skillsDir).filter((f) => {
          const skillPath = path.join(skillsDir, f, "SKILL.md");
          return fs.existsSync(skillPath);
        });
        if (skillFiles.length === 0) {
          issues.push({
            severity: "error",
            message: `[${ide}] Skills directory exists but contains no SKILL.md files`,
          });
        } else {
          issues.push({
            severity: "info",
            message: `[${ide}] ${skillFiles.length} skill(s) installed in ${caps.skillsDir}/`,
          });
        }
      }
    }

    // Check hooks wired in IDE settings
    if (caps.hooks && caps.settingsFile) {
      const settingsPath = path.join(cwd, caps.settingsFile);
      if (!fs.existsSync(settingsPath)) {
        issues.push({
          severity: "warn",
          message: `[${ide}] Settings file not found at ${caps.settingsFile} — hooks may not fire`,
        });
      } else {
        try {
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
          const hasHooks =
            settings?.hooks && Object.keys(settings.hooks).length > 0;
          if (!hasHooks) {
            issues.push({
              severity: "warn",
              message: `[${ide}] No hooks found in ${caps.settingsFile} — SessionStart injection unavailable`,
            });
          } else {
            const hookEvents = Object.keys(settings.hooks);
            if (hookEvents.includes("PreCompact")) {
              issues.push({
                severity: "warn",
                message: `[${ide}] Stale hook "PreCompact" found — run \`agileflow setup\` to update to PostCompact`,
              });
            }
            issues.push({
              severity: "info",
              message: `[${ide}] Hooks wired: ${hookEvents.filter((e) => e !== "PreCompact").join(", ")}`,
            });
          }
        } catch {
          issues.push({
            severity: "warn",
            message: `[${ide}] Could not parse ${caps.settingsFile}`,
          });
        }
      }
    }
  }

  return issues;
}

async function doctor() {
  const cwd = process.cwd();
  let totalErrors = 0;

  // 1. Plugin manifests (every bundled plugin.yaml).
  const plugins = discoverPlugins();
  const pluginIssues = validatePluginSet(plugins);
  totalErrors += printSection("Plugin manifests:", pluginIssues);

  // 2. Skills (every SKILL.md across every bundled plugin).
  const { issues: skillIssues } = await validateBundledSkills();
  totalErrors += printSection(
    "Skills:",
    skillIssues.filter(
      (i) =>
        (i.severity !== "warn" && i.severity !== "warning") ||
        !i.message.includes("_learnings"),
    ),
  );

  // 3. Aggregated hook manifest (what install would write).
  const aggrErrors = await validateAggregatedHookManifest();
  totalErrors += printSection(
    "Hook manifest (aggregated):",
    aggrErrors.map((m) => ({ severity: "error", message: m })),
  );

  // 4. Installed hook manifest in this cwd (if any).
  const installedErrors = await validateInstalledManifest(cwd);
  totalErrors += printSection(
    "Hook manifest (installed):",
    installedErrors.map((m) => ({ severity: "error", message: m })),
  );

  // 5. Installation health — skills + hooks in the current project.
  const installIssues = await checkInstallHealth(cwd);
  // eslint-disable-next-line no-console
  console.log("\nInstallation health:");
  if (installIssues.length === 0) {
    // eslint-disable-next-line no-console
    console.log("  ok");
  } else {
    for (const issue of installIssues) {
      if (issue.severity === "info") {
        // eslint-disable-next-line no-console
        console.log(`  ✓    ${issue.message}`);
      } else if (issue.severity === "warn") {
        // eslint-disable-next-line no-console
        console.log(`  WARN ${issue.message}`);
      } else {
        totalErrors += 1;
        // eslint-disable-next-line no-console
        console.log(`  ERROR ${issue.message}`);
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log("");
  if (totalErrors === 0) {
    // eslint-disable-next-line no-console
    console.log("✓ doctor: all checks passed");
    return;
  }
  // eslint-disable-next-line no-console
  console.error(`✗ doctor: ${totalErrors} error(s)`);
  process.exit(1);
}

module.exports = doctor;
