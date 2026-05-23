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
const {
  MANAGED_EVENTS,
  LEGACY_MANAGED_EVENTS,
  HOOK_COMMAND_MARKER,
  isAgileflowEntry,
} = require("../../runtime/ide/claude-code-settings.js");

/**
 * v3-era directories under `.agileflow/` that v4 never writes.
 * Detection-only — actual removal is the follow-up `--fix` work.
 */
const LEGACY_AGILEFLOW_SUBDIRS = [
  "agents",
  "base-prompts",
  "cache",
  "commands",
  "config",
  "council",
  "experts",
  "hooks",
  "knowledge",
  "lib",
  "mixins",
  "profiles",
  "scripts",
  "snippets",
];

/** v3-era files at `.agileflow/` root that v4 doesn't write. */
const LEGACY_AGILEFLOW_FILES = ["CHANGELOG.md", "config.yaml"];

/**
 * v3-era directories under `.claude/` that v4 doesn't populate.
 * `agents/` and `commands/` are intentionally NOT here — v4 still
 * mirrors plugin slash-commands and subagents into them via
 * claude-code-content.js. Only flagged if they contain agileflow-*
 * entries (see section C below).
 */
const LEGACY_CLAUDE_SUBDIRS = ["hooks", "plans"];

/** Narrow a value to a plain object (not array, not null, not primitive). */
function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Read JSON file, returning null on any failure (missing, malformed,
 * permission denied). The detector treats unreadable config as "skip
 * this section" rather than crashing.
 */
function readJSONSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/** readdirSync wrapped to return [] on permission-denied / vanished dirs. */
function readdirSafe(p) {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
}

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
          severity: "warn",
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
            issues.push({
              severity: "info",
              message: `[${ide}] Hooks wired: ${hookEvents
                .filter((e) => !LEGACY_MANAGED_EVENTS.has(e))
                .join(", ")}`,
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

/**
 * Detect stale AgileFlow artifacts left over from older versions, plugin
 * renames, or aborted installs. Each issue identifies a path or hook
 * entry that update wouldn't currently sweep.
 *
 * Diagnose-only: this function never modifies anything. Always returns
 * an array — IO failures are caught and either yield an issue or are
 * skipped (never thrown to the caller).
 *
 * Issue shape: { severity: "warn"|"error", kind: string, path?: string, message: string }
 *
 * @param {string} cwd
 * @returns {Promise<Array<{severity: string, kind: string, path?: string, message: string}>>}
 */
async function checkStaleArtifacts(cwd) {
  /** @type {Array<{severity: string, kind: string, path?: string, message: string}>} */
  const issues = [];

  // (A) Legacy hook events in .claude/settings.json — events AgileFlow
  // used to write but no longer manages. mergeManagedHooks() never
  // touches these, so they linger forever without explicit cleanup.
  const settingsPath = path.join(cwd, ".claude", "settings.json");
  if (fs.existsSync(settingsPath)) {
    const settings = readJSONSafe(settingsPath);
    // Reject array-shaped or non-object `hooks` outright — same guard
    // mergeManagedHooks uses (claude-code-settings.js:147).
    const hooks =
      settings && isPlainObject(settings.hooks) ? settings.hooks : {};
    for (const event of Object.keys(hooks)) {
      // Tolerate the wrong shape: a single hook-entry object instead of
      // the expected array. Coerce to a single-element list so we still
      // see AgileFlow's command rather than silently dropping it.
      const raw = hooks[event];
      let entries;
      if (Array.isArray(raw)) entries = raw;
      else if (isPlainObject(raw)) entries = [raw];
      else entries = [];
      const ours = entries.filter(isAgileflowEntry);
      if (ours.length === 0) continue;
      if (LEGACY_MANAGED_EVENTS.has(event)) {
        issues.push({
          severity: "warn",
          kind: "legacy-hook-event",
          path: `${settingsPath}#hooks.${event}`,
          message: `Legacy hook event "${event}" in .claude/settings.json — AgileFlow used to write this, no longer does. Safe to remove ${ours.length} entry/entries.`,
        });
      } else if (!MANAGED_EVENTS.has(event)) {
        issues.push({
          severity: "warn",
          kind: "orphan-hook-event",
          path: `${settingsPath}#hooks.${event}`,
          message: `Unknown event "${event}" in .claude/settings.json contains \`${HOOK_COMMAND_MARKER}\` command — not a current AgileFlow event. Probably from a much older install.`,
        });
      }
    }
  }

  // (B) v3-era directories and files under .agileflow/.
  const aflowDir = path.join(cwd, ".agileflow");
  if (fs.existsSync(aflowDir)) {
    for (const name of LEGACY_AGILEFLOW_SUBDIRS) {
      const p = path.join(aflowDir, name);
      if (fs.existsSync(p)) {
        issues.push({
          severity: "warn",
          kind: "legacy-agileflow-subdir",
          path: p,
          message: `v3 directory \`.agileflow/${name}/\` present — v4 (skills-first) doesn't use this. Safe to delete unless you've kept custom content.`,
        });
      }
    }
    for (const name of LEGACY_AGILEFLOW_FILES) {
      const p = path.join(aflowDir, name);
      if (fs.existsSync(p)) {
        issues.push({
          severity: "warn",
          kind: "legacy-agileflow-file",
          path: p,
          message: `v3 file \`.agileflow/${name}\` present — not written by v4.`,
        });
      }
    }
  }

  // (C) v3-era directories under .claude/. Only flag if they contain
  // agileflow-* entries (user-owned content in the same dir is fine).
  const claudeDir = path.join(cwd, ".claude");
  if (fs.existsSync(claudeDir)) {
    for (const name of LEGACY_CLAUDE_SUBDIRS) {
      const p = path.join(claudeDir, name);
      if (!fs.existsSync(p)) continue;
      const entries = readdirSafe(p);
      const agileflowOwned = entries.filter(
        (e) => e.startsWith("agileflow") || e.startsWith("AgileFlow"),
      );
      if (agileflowOwned.length === 0) continue;
      issues.push({
        severity: "warn",
        kind: "legacy-claude-subdir",
        path: p,
        message: `v3 \`.claude/${name}/\` contains ${agileflowOwned.length} AgileFlow item(s) — v4 ships skills only; this dir isn't used.`,
      });
    }
  }

  // (D) Broken hook-manifest script references. Split parse from walk
  // so a YAML error doesn't hide all broken-script detection: even if
  // parse fails, we don't pretend the section ran cleanly. Parse errors
  // are reported separately by validateInstalledManifest, so we just
  // skip the walk here.
  const manifestPath = path.join(aflowDir, "hook-manifest.yaml");
  if (fs.existsSync(manifestPath)) {
    /** @type {{ hooks?: Array<{id: string, event: string, script: string}> } | null} */
    let manifest = null;
    try {
      manifest = await loadHookManifest(manifestPath);
    } catch {
      manifest = null;
    }
    if (manifest && Array.isArray(manifest.hooks)) {
      for (const h of manifest.hooks) {
        if (!h || typeof h.script !== "string") continue;
        const scriptPath = path.isAbsolute(h.script)
          ? h.script
          : path.join(cwd, h.script);
        if (!fs.existsSync(scriptPath)) {
          issues.push({
            severity: "error",
            kind: "broken-hook-script",
            path: scriptPath,
            message: `Hook "${h.id}" (${h.event}) points at missing script ${h.script}`,
          });
        }
      }
    }
  }

  // (E) Orphan skill directories — skills installed in .claude/skills/
  // whose owning plugin isn't enabled in agileflow.config.json.
  const cfgPath = path.join(cwd, "agileflow.config.json");
  if (fs.existsSync(cfgPath)) {
    const cfg = readJSONSafe(cfgPath);
    // Guard against malformed plugins fields: string, array, primitive.
    // Object.entries on a string returns char-indexed entries; on an
    // array it returns numeric-indexed ones — both produce garbage.
    if (cfg && isPlainObject(cfg.plugins)) {
      const enabled = Object.entries(cfg.plugins)
        .filter(([, v]) => v && v.enabled !== false)
        .map(([k]) => k);
      // De-dupe: don't push "core" if config already has it enabled.
      if (!enabled.includes("core")) enabled.push("core");
      /** @type {Set<string>} */
      const expectedSkillIds = new Set();
      const plugins = discoverPlugins();
      for (const p of plugins) {
        if (!enabled.includes(p.id)) continue;
        const skillsRoot = path.join(p.dir, "skills");
        if (!fs.existsSync(skillsRoot)) continue;
        for (const entry of readdirSafe(skillsRoot)) {
          const skillFile = path.join(skillsRoot, entry, "SKILL.md");
          if (!fs.existsSync(skillFile)) continue;
          // loadSkill returns { skillId, frontmatter, body, ... } or
          // throws on unreadable files. Either way, claim the dir name
          // so we don't false-positive flag a bundled skill.
          let id = entry;
          try {
            const s = await loadSkill(skillFile);
            id =
              (s && s.frontmatter && s.frontmatter.name) || s.skillId || entry;
          } catch {
            // unparseable bundled skill — still treat dir as owned
          }
          expectedSkillIds.add(id);
        }
      }
      const skillsDir = path.join(cwd, ".claude", "skills");
      if (fs.existsSync(skillsDir)) {
        for (const entry of readdirSafe(skillsDir)) {
          if (!entry.startsWith("agileflow")) continue;
          if (expectedSkillIds.has(entry)) continue;
          issues.push({
            severity: "warn",
            kind: "orphan-skill-dir",
            path: path.join(skillsDir, entry),
            message: `Orphan skill \`.claude/skills/${entry}/\` — not owned by any enabled plugin. Likely from a disabled or removed plugin.`,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Apply a single stale-artifact fix. Per-kind: hook-event entries are
 * stripped from settings.json (preserving user entries in that event),
 * filesystem artifacts are removed. Broken hook scripts cannot be
 * auto-fixed — the script file itself is gone.
 *
 * @param {{kind: string, path?: string, message: string}} issue
 * @param {string} cwd
 * @returns {{ok: boolean, message: string}}
 */
function applyStaleFix(issue, cwd) {
  switch (issue.kind) {
    case "legacy-hook-event":
    case "orphan-hook-event": {
      // path shape: "<settingsPath>#hooks.<eventName>"
      const hashIdx = (issue.path || "").lastIndexOf("#hooks.");
      if (hashIdx < 0) {
        return {
          ok: false,
          message: "Malformed issue.path; expected #hooks.<event>",
        };
      }
      const settingsPath = issue.path.slice(0, hashIdx);
      const event = issue.path.slice(hashIdx + "#hooks.".length);
      const settings = readJSONSafe(settingsPath);
      if (!settings || !isPlainObject(settings.hooks)) {
        return { ok: false, message: `No hooks object in ${settingsPath}` };
      }
      const raw = settings.hooks[event];
      const entries = Array.isArray(raw)
        ? raw
        : isPlainObject(raw)
          ? [raw]
          : [];
      const userEntries = entries.filter((e) => !isAgileflowEntry(e));
      if (userEntries.length === 0) {
        delete settings.hooks[event];
      } else {
        settings.hooks[event] = userEntries;
      }
      // Drop the hooks key entirely if nothing's left, to keep the file tidy.
      if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
      return {
        ok: true,
        message: `Removed AgileFlow entries from .claude/settings.json#hooks.${event}`,
      };
    }
    case "legacy-agileflow-subdir":
    case "orphan-skill-dir": {
      if (!issue.path || !fs.existsSync(issue.path)) {
        return { ok: false, message: `Path missing: ${issue.path}` };
      }
      fs.rmSync(issue.path, { recursive: true, force: true });
      return { ok: true, message: `Removed ${path.relative(cwd, issue.path)}` };
    }
    case "legacy-agileflow-file": {
      if (!issue.path || !fs.existsSync(issue.path)) {
        return { ok: false, message: `Path missing: ${issue.path}` };
      }
      fs.unlinkSync(issue.path);
      return { ok: true, message: `Removed ${path.relative(cwd, issue.path)}` };
    }
    case "legacy-claude-subdir": {
      // Only delete agileflow-* entries; leave user files alone. After
      // cleanup, remove the dir itself only if it's empty.
      if (!issue.path || !fs.existsSync(issue.path)) {
        return { ok: false, message: `Path missing: ${issue.path}` };
      }
      let removed = 0;
      for (const entry of readdirSafe(issue.path)) {
        if (!entry.startsWith("agileflow") && !entry.startsWith("AgileFlow"))
          continue;
        const p = path.join(issue.path, entry);
        fs.rmSync(p, { recursive: true, force: true });
        removed += 1;
      }
      // Empty-dir cleanup — fail silently if dir has other content.
      try {
        fs.rmdirSync(issue.path);
      } catch {
        /* dir not empty (user files present); leave it */
      }
      return {
        ok: true,
        message: `Removed ${removed} AgileFlow item(s) from ${path.relative(cwd, issue.path)}`,
      };
    }
    case "broken-hook-script": {
      return {
        ok: false,
        message:
          "Cannot auto-fix — the script file is gone. Run `agileflow update` to reinstall plugin scripts.",
      };
    }
    default:
      return { ok: false, message: `Unknown issue kind: ${issue.kind}` };
  }
}

/**
 * `agileflow doctor --fix` body. Detects stale artifacts (same as
 * `doctor`), then either previews removal (`--fix` alone) or executes
 * (`--fix --yes`). Returns counts for testing.
 *
 * @param {string} cwd
 * @param {{yes?: boolean, log?: (msg: string) => void}} [opts]
 * @returns {Promise<{detected: number, fixed: number, failed: number, dryRun: boolean}>}
 */
async function doctorFix(cwd, opts = {}) {
  const log = opts.log || ((m) => console.log(m)); // eslint-disable-line no-console
  const issues = await checkStaleArtifacts(cwd);
  if (issues.length === 0) {
    log("Stale artifacts: ok — nothing to fix.");
    return { detected: 0, fixed: 0, failed: 0, dryRun: !opts.yes };
  }
  if (!opts.yes) {
    log(
      `\n${issues.length} stale artifact(s) — dry-run preview (use --yes to actually remove):\n`,
    );
    for (const issue of issues) {
      log(`  • [${issue.kind}] ${issue.message}`);
      if (issue.path) log(`    ${issue.path}`);
    }
    log("\n  Re-run with `agileflow doctor --fix --yes` to apply.");
    return { detected: issues.length, fixed: 0, failed: 0, dryRun: true };
  }
  let fixed = 0;
  let failed = 0;
  log(`\nApplying fixes for ${issues.length} stale artifact(s):\n`);
  for (const issue of issues) {
    const r = applyStaleFix(issue, cwd);
    if (r.ok) {
      fixed += 1;
      log(`  ✓ ${r.message}`);
    } else {
      failed += 1;
      log(`  ✗ [${issue.kind}] ${r.message}`);
    }
  }
  log(`\n  ${fixed} fixed, ${failed} skipped/failed.`);
  return { detected: issues.length, fixed, failed, dryRun: false };
}

async function doctor(opts = {}) {
  if (opts && opts.fix) {
    const cwd = process.cwd();
    const r = await doctorFix(cwd, { yes: !!opts.yes });
    if (r.failed > 0) process.exit(1);
    return;
  }
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

  // 5. Stale artifacts from older versions / aborted installs.
  const staleIssues = await checkStaleArtifacts(cwd);
  // eslint-disable-next-line no-console
  console.log("\nStale artifacts:");
  if (staleIssues.length === 0) {
    // eslint-disable-next-line no-console
    console.log("  ok");
  } else {
    for (const issue of staleIssues) {
      const label = issue.severity === "error" ? "ERROR" : "WARN ";
      if (issue.severity === "error") totalErrors += 1;
      // eslint-disable-next-line no-console
      console.log(`  ${label} ${issue.message}`);
      if (issue.path) {
        // eslint-disable-next-line no-console
        console.log(`         ${issue.path}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `\n  ${staleIssues.length} stale artifact(s). Auto-fix is not yet available — review and remove manually for now.`,
    );
  }

  // 6. Installation health — skills + hooks in the current project.
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
module.exports.checkStaleArtifacts = checkStaleArtifacts;
module.exports.applyStaleFix = applyStaleFix;
module.exports.doctorFix = doctorFix;
