/**
 * `agileflow setup` — interactive install wizard.
 *
 * After Phase 2b: the wizard not only writes `agileflow.config.json` but
 * also runs `installPlugins()` so the user ends up with a working
 * `.agileflow/` tree. Use `agileflow update` to re-install without
 * re-prompting (e.g. after manually editing the config).
 *
 *   - Plugin multiselect via @clack/prompts (skills.sh-style UX)
 *   - Non-interactive path: --yes --plugins <ids>
 *   - Errors (write failure, plugin discovery failure, unknown plugin
 *     ids) produce actionable messages instead of stack traces.
 *   - Custom plugin entries in the existing config are preserved across
 *     wizard reruns.
 */
const path = require("path");
const os = require("os");
const prompts = require("@clack/prompts");
const pkg = require("../../../package.json");
const { logoBanner } = require("../../lib/brand.js");
const { loadConfig } = require("../../runtime/config/loader.js");
const { writeConfig } = require("../../runtime/config/writer.js");
const { defaultConfig } = require("../../runtime/config/defaults.js");
const { discoverPlugins } = require("../../runtime/plugins/registry.js");
const { installPlugins } = require("../../runtime/installer/install.js");
const { pickPlugins, buildPluginsMap } = require("../wizard/plugin-picker.js");
const { pickInstallScope } = require("../wizard/install-scope-picker.js");
const { pickIdes } = require("../wizard/ide-picker.js");
const { pickBehaviors } = require("../wizard/behaviors-picker.js");
const { pickBabysitMode } = require("../wizard/babysit-mode-picker-clean.js");
const { pickLearnings } = require("../wizard/learnings-picker.js");
const {
  SUPPORTED_IDES,
  capabilitiesFor,
  hookEventsForIdes,
} = require("../../runtime/ide/capabilities.js");

/**
 * Parse a CSV of plugin ids, apply it over the discovered+existing plugin
 * set, and surface any ids that don't map to a known plugin.
 *
 * @param {string} csv
 * @param {Record<string, { enabled: boolean, settings?: any }>} existingPlugins
 * @returns {{ plugins: Record<string, { enabled: boolean }>, unknownPlugins: string[] }}
 */
function pluginsFromCsv(csv, existingPlugins = {}) {
  const requested = new Set(
    (csv || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const discovered = discoverPlugins();
  const discoveredIds = new Set(discovered.map((p) => p.id));
  const unknownPlugins = [...requested].filter((id) => !discoveredIds.has(id));

  const selectedDiscoveredIds = new Set(
    [...requested].filter((id) => discoveredIds.has(id)),
  );
  const plugins = buildPluginsMap(
    discovered,
    selectedDiscoveredIds,
    existingPlugins,
  );

  return { plugins, unknownPlugins };
}

/**
 * Normalize requested IDE targets from `--ide`.
 *
 * Accepts a comma-separated list and the special alias `all`.
 *
 * @param {string | undefined} ideOption
 * @param {string[]} fallback
 * @returns {string[]}
 */
function resolveIdeTargets(ideOption, fallback) {
  const raw = ideOption
    ? String(ideOption)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : fallback;

  if (raw.length === 1 && raw[0] === "all") {
    return [...SUPPORTED_IDES];
  }

  return raw;
}

/**
 * @param {string | undefined} scopeOption
 * @returns {'project' | 'global'}
 */
function resolveInstallScope(scopeOption) {
  if (scopeOption === "global") return "global";
  return "project";
}

/**
 * @param {'project' | 'global'} scope
 * @param {string} cwd
 * @returns {{ scope: 'project' | 'global', configRoot: string, agileflowDir: string, ideRoot: string }}
 */
function installPathsForScope(scope, cwd) {
  if (scope === "global") {
    const home = os.homedir();
    const agileflowDir = path.join(home, ".agileflow");
    return {
      scope,
      configRoot: agileflowDir,
      agileflowDir,
      ideRoot: home,
    };
  }
  return {
    scope,
    configRoot: cwd,
    agileflowDir: path.join(cwd, ".agileflow"),
    ideRoot: cwd,
  };
}

/**
 * @param {string} cwd
 * @param {import('../../runtime/config/defaults.js').AgileflowConfig} config
 * @param {{ interactive: boolean, spinner?: any }} ctx
 */
async function writeConfigWithFeedback(cwd, config, ctx) {
  try {
    return await writeConfig(cwd, config);
  } catch (err) {
    if (ctx.interactive) {
      if (ctx.spinner) ctx.spinner.stop("Config write failed");
      prompts.log.error(`Could not write config: ${err.message}`);
      prompts.log.info(
        "Check permissions and disk space, then run `agileflow setup` again.",
      );
    } else {
      // eslint-disable-next-line no-console
      console.error(`agileflow setup: failed to write config: ${err.message}`);
      // eslint-disable-next-line no-console
      console.error("Check permissions and disk space, then retry.");
    }
    process.exit(1);
  }
}

/**
 * Run the installer for the given enabled plugin ids and surface failures.
 * @param {string[]} enabledIds
 * @param {{ agileflowDir: string }} roots
 * @param {string[]} ides - target IDE ids (gates hook manifest + per-IDE skill mirrors)
 * @param {import('../../runtime/config/defaults.js').Behaviors} behaviors - hook preset toggles
 * @param {boolean} learningsEnabled - global skill learnings toggle
 * @param {import('../../runtime/config/defaults.js').AgileflowConfig} config - merged config passed through to installers
 * @param {{ interactive: boolean, spinner?: any }} ctx
 */
async function runInstallWithFeedback(
  enabledIds,
  roots,
  ides,
  behaviors,
  learningsEnabled,
  config,
  ctx,
) {
  // userSelected is "everything except core" — core is always-on via
  // cannotDisable, the resolver will pull it in.
  const userSelected = enabledIds.filter((id) => id !== "core");
  try {
    return await installPlugins({
      discovered: discoverPlugins(),
      userSelected,
      agileflowDir: roots.agileflowDir,
      cliVersion: pkg.version,
      ides,
      behaviors,
      learningsEnabled,
      config,
    });
  } catch (err) {
    if (ctx.interactive) {
      if (ctx.spinner) ctx.spinner.stop("Install failed");
      prompts.log.error(`Install failed: ${err.message}`);
    } else {
      // eslint-disable-next-line no-console
      console.error(`agileflow setup: install failed: ${err.message}`);
    }
    process.exit(1);
  }
}

/**
 * @param {{ yes?: boolean, plugins?: string, ide?: string, scope?: string }} options
 */
async function setup(options = {}) {
  const cwd = process.cwd();
  const initialScope = resolveInstallScope(options.scope);
  let scope = initialScope;
  let roots = installPathsForScope(scope, cwd);

  if (!options.yes) {
    // eslint-disable-next-line no-console
    console.log("\n" + logoBanner(pkg.version) + "\n");
    prompts.intro("agileflow setup");
    scope = await pickInstallScope(initialScope);
    roots = installPathsForScope(scope, cwd);
  }

  /** @type {Awaited<ReturnType<typeof loadConfig>>} */
  let existing;
  try {
    existing = await loadConfig(roots.configRoot);
  } catch (err) {
    if (options.yes) {
      // eslint-disable-next-line no-console
      console.error(`agileflow setup: ${err.message}`);
      process.exit(1);
    }
    prompts.log.error(err.message);
    prompts.log.info(
      "Fix or delete agileflow.config.json and re-run `agileflow setup`.",
    );
    process.exit(1);
  }

  const base = existing.source === "file" ? existing.config : defaultConfig();
  const rawBaseBabysit =
    base.plugins &&
    base.plugins.core &&
    base.plugins.core.settings &&
    base.plugins.core.settings.babysit;
  const baseBabysit =
    rawBaseBabysit && typeof rawBaseBabysit === "object"
      ? rawBaseBabysit
      : { mode: typeof rawBaseBabysit === "string" ? rawBaseBabysit : "light" };
  const baseBabysitMode =
    typeof baseBabysit.mode === "string" ? baseBabysit.mode : "light";

  if (options.yes) {
    // Resolve IDE targets: --ide flag (csv) wins, then existing config, then default.
    /** @type {string[]} */
    const requestedIdes = resolveIdeTargets(
      options.ide,
      Array.isArray(base.ide.targets) && base.ide.targets.length
        ? base.ide.targets
        : ["claude-code"],
    );
    const unknownIdes = requestedIdes.filter(
      (id) => !SUPPORTED_IDES.includes(id),
    );
    if (unknownIdes.length) {
      // eslint-disable-next-line no-console
      console.error(
        `agileflow setup: unknown IDE(s) "${unknownIdes.join(", ")}". Supported: ${SUPPORTED_IDES.join(", ")}`,
      );
      process.exit(1);
    }

    const { plugins, unknownPlugins } = pluginsFromCsv(
      options.plugins || "core",
      base.plugins,
    );
    if (unknownPlugins.length) {
      const known = discoverPlugins()
        .map((p) => p.id)
        .join(", ");
      // eslint-disable-next-line no-console
      console.error(
        `agileflow setup: unknown plugin(s): ${unknownPlugins.join(", ")}`,
      );
      // eslint-disable-next-line no-console
      console.error(`Available plugins: ${known}`);
      process.exit(1);
    }

    const next = {
      ...base,
      plugins,
      install: { scope },
      ide: { targets: /** @type {any} */ (requestedIdes) },
    };
    next.plugins.core = next.plugins.core || { enabled: true };
    next.plugins.core.settings = {
      ...(next.plugins.core.settings || {}),
      babysit: baseBabysit,
    };
    const file = await writeConfigWithFeedback(roots.configRoot, next, {
      interactive: false,
    });
    const enabled = Object.entries(plugins)
      .filter(([, v]) => v && v.enabled)
      .map(([id]) => id);

    const installResult = await runInstallWithFeedback(
      enabled,
      roots,
      requestedIdes,
      next.behaviors,
      Boolean(next.learnings && next.learnings.enabled),
      next,
      { interactive: false },
    );

    const anyHooks = requestedIdes.some((id) => capabilitiesFor(id).hooks);
    // eslint-disable-next-line no-console
    console.log(`✓ Wrote ${file}`);
    // eslint-disable-next-line no-console
    console.log(`  scope: ${scope}`);
    // eslint-disable-next-line no-console
    console.log(`  ides: ${requestedIdes.join(", ")}`);
    // eslint-disable-next-line no-console
    console.log(`  skill packs enabled: ${enabled.join(", ")}`);
    // eslint-disable-next-line no-console
    console.log(`  babysit mode: ${baseBabysitMode}`);
    if (anyHooks) {
      const activeBehaviors = Object.entries(next.behaviors || {})
        .filter(([, v]) => v)
        .map(([k]) => k);
      // eslint-disable-next-line no-console
      console.log(
        `  behaviors enabled: ${activeBehaviors.length ? activeBehaviors.join(", ") : "(none — no hooks will run)"}`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(
      `  installed: created=${installResult.ops.created} updated=${installResult.ops.updated} unchanged=${installResult.ops.unchanged} preserved=${installResult.ops.preserved} removed=${installResult.ops.removed}`,
    );
    return;
  }

  if (existing.source === "file") {
    prompts.log.info(
      `Existing config found at ${existing.path} — re-running wizard to update.`,
    );
  } else {
    prompts.log.info("No existing config — starting from defaults.");
  }

  // Ask the IDE targets first — affects which features end up enabled later.
  const ides = await pickIdes(base.ide.targets);

  let plugins;
  try {
    plugins = await pickPlugins(base);
  } catch (err) {
    prompts.log.error(`Failed to load plugins: ${err.message}`);
    prompts.cancel("Setup cannot continue. Fix plugin manifests and retry.");
    process.exit(1);
  }
  // Behavior presets only apply when AT LEAST ONE selected IDE supports
  // hooks. Cursor/Windsurf/Codex would ignore the toggles, so skip if
  // none of the targets accept them.
  const targetCaps = ides.map((id) => capabilitiesFor(id));
  const anyHooks = targetCaps.some((c) => c.hooks);
  const supportedHookEvents = hookEventsForIdes(ides);
  const anySkills = targetCaps.some((c) => c.skills);
  const behaviors = anyHooks
    ? await pickBehaviors(base.behaviors, supportedHookEvents)
    : base.behaviors;

  const babysit = await pickBabysitMode(
    base.plugins &&
      base.plugins.core &&
      base.plugins.core.settings &&
      base.plugins.core.settings.babysit,
  );

  const learnings = anySkills
    ? await pickLearnings(base.learnings)
    : base.learnings;

  /** @type {import('../../runtime/config/defaults.js').AgileflowConfig} */
  const next = {
    ...base,
    plugins,
    install: { scope },
    behaviors,
    learnings,
    ide: { targets: /** @type {any} */ (ides) },
  };
  next.plugins.core = next.plugins.core || { enabled: true };
  next.plugins.core.settings = {
    ...(next.plugins.core.settings || {}),
    babysit,
  };

  const writeSpinner = prompts.spinner();
  writeSpinner.start("Writing agileflow.config.json");
  const file = await writeConfigWithFeedback(roots.configRoot, next, {
    interactive: true,
    spinner: writeSpinner,
  });
  writeSpinner.stop(`Config written → ${file}`);

  const enabledList = Object.entries(plugins)
    .filter(([, v]) => v && v.enabled)
    .map(([id]) => id);

  const installSpinner = prompts.spinner();
  installSpinner.start(`Installing ${enabledList.length} skill pack(s)`);
  const installResult = await runInstallWithFeedback(
    enabledList,
    roots,
    ides,
    behaviors,
    Boolean(learnings && learnings.enabled),
    next,
    { interactive: true, spinner: installSpinner },
  );
  installSpinner.stop(
    `Installed: created=${installResult.ops.created} updated=${installResult.ops.updated} unchanged=${installResult.ops.unchanged} preserved=${installResult.ops.preserved} removed=${installResult.ops.removed}`,
  );

  // Surface behaviors state in the outro. With behaviors gated, a user
  // who deselected all four ends up with zero hooks running — they
  // need to know that explicitly, not infer it from "X plugins enabled".
  const activeBehaviors = anyHooks
    ? Object.entries(behaviors || {})
        .filter(([, v]) => v)
        .map(([k]) => k)
    : [];
  const behaviorsLine = anyHooks
    ? activeBehaviors.length
      ? `behaviors active: ${activeBehaviors.join(", ")}`
      : "behaviors active: (none — no hooks will run; re-run setup to enable)"
    : `hooks not supported by ${ides.join(", ")} — behaviors skipped`;

  prompts.outro(
    [
      `${enabledList.length} skill pack(s) enabled: ${enabledList.join(", ")}`,
      `scope: ${scope}`,
      `babysit mode: ${babysit.mode}`,
      behaviorsLine,
      installResult.ops.preserved
        ? `${installResult.ops.preserved} file(s) preserved (your edits) — review .agileflow/_cfg/updates/`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

module.exports = setup;
module.exports.pluginsFromCsv = pluginsFromCsv;
module.exports.resolveIdeTargets = resolveIdeTargets;
module.exports.resolveInstallScope = resolveInstallScope;
module.exports.installPathsForScope = installPathsForScope;
