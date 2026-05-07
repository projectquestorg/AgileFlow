/**
 * `agileflow update` — re-run the installer for the currently-enabled
 * plugin set, no prompts.
 *
 * Use cases:
 *   - User edited `agileflow.config.json` directly and wants to apply
 *     it without re-running the wizard.
 *   - CI step that ensures `.agileflow/` is in sync with the committed
 *     `agileflow.config.json`.
 *   - User installed a new bundled plugin via `enable` and wants the
 *     content materialized.
 *
 * Always non-interactive. Exits non-zero on validation / install
 * failure.
 */
const path = require("path");
const os = require("os");
const pkg = require("../../../package.json");
const { loadConfig } = require("../../runtime/config/loader.js");
const { discoverPlugins } = require("../../runtime/plugins/registry.js");
const { installPlugins } = require("../../runtime/installer/install.js");
const {
  capabilitiesFor,
  hookEventsForIdes,
} = require("../../runtime/ide/capabilities.js");
const {
  normalizeBehaviorsForEvents,
} = require("../wizard/behaviors-picker.js");

/**
 * @param {{ force?: boolean }} options
 */
async function update(options = {}) {
  const cwd = process.cwd();
  const scope = options.scope === "global" ? "global" : "project";
  const agileflowDir =
    scope === "global"
      ? path.join(os.homedir(), ".agileflow")
      : path.join(cwd, ".agileflow");
  const configRoot = scope === "global" ? agileflowDir : cwd;

  let existing;
  try {
    existing = await loadConfig(configRoot);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`agileflow update: ${err.message}`);
    process.exit(1);
  }

  if (existing.source === "defaults") {
    // eslint-disable-next-line no-console
    console.error(
      "agileflow update: no agileflow.config.json found. Run `agileflow setup` first.",
    );
    process.exit(1);
  }

  const enabled = Object.entries(existing.config.plugins || {})
    .filter(([, v]) => v && v.enabled)
    .map(([id]) => id);

  // userSelected excludes core (cannotDisable handles it).
  const userSelected = enabled.filter((id) => id !== "core");

  let result;
  try {
    const supportedHookEvents = hookEventsForIdes(existing.config.ide.targets);
    const normalizedBehaviors = normalizeBehaviorsForEvents(
      existing.config.behaviors,
      supportedHookEvents,
    );
    result = await installPlugins({
      discovered: discoverPlugins(),
      userSelected,
      agileflowDir,
      cliVersion: pkg.version,
      ides: existing.config.ide.targets,
      behaviors: normalizedBehaviors,
      learningsEnabled: Boolean(
        existing.config.learnings && existing.config.learnings.enabled,
      ),
      force: Boolean(options.force),
      config: existing.config,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`agileflow update: install failed: ${err.message}`);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(
    `✓ Updated ${enabled.length} skill pack(s): ${enabled.join(", ")}`,
  );
  // eslint-disable-next-line no-console
  console.log(`  scope: ${scope}`);

  const targets = existing.config.ide.targets || [];
  const anyHooks = targets.some((id) => capabilitiesFor(id).hooks);
  if (anyHooks) {
    const activeBehaviors = Object.entries(
      normalizeBehaviorsForEvents(
        existing.config.behaviors,
        hookEventsForIdes(targets),
      ),
    )
      .filter(([, v]) => v)
      .map(([k]) => k);
    // eslint-disable-next-line no-console
    console.log(
      `  behaviors enabled: ${activeBehaviors.length ? activeBehaviors.join(", ") : "(none — no hooks will run)"}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    `  created=${result.ops.created} updated=${result.ops.updated} unchanged=${result.ops.unchanged} preserved=${result.ops.preserved} removed=${result.ops.removed}`,
  );
  if (result.ops.preserved > 0 && result.ops.updatesPath) {
    // eslint-disable-next-line no-console
    console.log(
      `  ${result.ops.preserved} file(s) preserved — review ${result.ops.updatesPath}/`,
    );
  }
}

module.exports = update;
