/**
 * `agileflow launch` — slice 1: prefs-only.
 *
 * Two surfaces:
 *   - `agileflow launch setup`  — always runs the prefs wizard.
 *   - `agileflow launch`         — runs setup on first invocation
 *                                  (no prefs file); otherwise loads
 *                                  prefs and prints a placeholder. The
 *                                  tmux engine that actually starts
 *                                  sessions lands in slice 2.
 *
 * Errors here go through the typed-error / `fail()` plumbing in
 * `src/lib/errors.js` so messages stay consistent with `setup` /
 * `doctor` / etc.
 */
const path = require("path");
const prompts = require("@clack/prompts");
const pkg = require("../../../package.json");
const { logoBanner } = require("../../lib/brand.js");
const {
  loadPrefs,
  writePrefs,
  prefsExist,
} = require("../../runtime/launch/prefs.js");
const { pickCli } = require("../wizard/launch-cli-picker.js");
const { pickTmux } = require("../wizard/launch-tmux-picker.js");
const { pickAliases } = require("../wizard/launch-alias-picker.js");
const {
  installAfAlias,
  uninstallAfAlias,
} = require("../../runtime/launch/alias-installer.js");
const {
  AgileflowError,
  OperationFailedError,
  fail,
} = require("../../lib/errors.js");

/**
 * Pure helper for unit testing: decide which flow to enter given the
 * subcommand name and whether a prefs file exists.
 *
 * @param {{ sub?: string, hasPrefs: boolean }} input
 * @returns {'setup' | 'placeholder' | 'first-run-setup'}
 */
function decideFlow({ sub, hasPrefs }) {
  if (sub === "setup") return "setup";
  if (!hasPrefs) return "first-run-setup";
  return "placeholder";
}

/**
 * Load prefs, or `fail()` with the actionable hint that matches the
 * inner-wizard error path. Without this, the bare-launch / first-run-tail
 * call sites fall through to the catch-all `OperationFailedError` wrapper
 * and the user gets a generic "re-run with DEBUG=1" message for what is
 * really a "fix or delete the prefs file" situation.
 *
 * @returns {Promise<Awaited<ReturnType<typeof loadPrefs>>>}
 */
async function loadPrefsOrFail() {
  try {
    return await loadPrefs();
  } catch (err) {
    fail(
      new OperationFailedError(err.message, {
        suggestion:
          "fix or delete the prefs file and re-run `agileflow launch setup`",
        cause: err,
      }),
      { command: "launch" },
    );
  }
}

/**
 * Run the interactive setup wizard. Used by both explicit `launch setup`
 * and first-run from bare `launch`.
 *
 * @returns {Promise<void>}
 */
async function runSetup() {
  // eslint-disable-next-line no-console
  console.log("\n" + logoBanner(pkg.version) + "\n");
  prompts.intro("agileflow launch — setup");

  /** @type {Awaited<ReturnType<typeof loadPrefs>>} */
  let existing;
  try {
    existing = await loadPrefs();
  } catch (err) {
    prompts.log.error(err.message);
    prompts.cancel("Fix or delete the prefs file and re-run.");
    process.exit(1);
  }

  if (existing.source === "file") {
    prompts.log.info(
      `Existing prefs at ${existing.path} — re-running wizard to update.`,
    );
  } else {
    prompts.log.info("No prefs found — starting from defaults.");
  }

  const base = existing.prefs;

  const cli = await pickCli(base);
  const tmuxAndKeybinds = await pickTmux(base);
  const aliases = await pickAliases(base);

  const next = {
    version: /** @type {1} */ (1),
    cli,
    tmux: tmuxAndKeybinds.tmux,
    keybinds: tmuxAndKeybinds.keybinds,
    aliases,
    pinned: base.pinned,
  };

  // Apply the alias side-effect BEFORE writing prefs. Writing first
  // risks recording `aliases.af.enabled = true` to disk when the symlink
  // failed to materialize — on next invocation we'd then lie about the
  // alias being installed. Run the install/uninstall, reconcile the
  // `next` object against what actually happened, then persist.
  /** @type {string[]} */
  const aliasSummary = [];

  if (aliases.af.enabled) {
    const aliasSpinner = prompts.spinner();
    aliasSpinner.start("Installing `af` alias");
    const result = await installAfAlias();
    if (result.status === "installed" || result.status === "updated") {
      aliasSpinner.stop(
        `Alias ${result.status} → ${result.path} → ${result.target}`,
      );
      if (!result.onPath) {
        prompts.log.warn(
          `${path.dirname(result.path)} is not on your PATH. Add this to your shell rc:\n  ` +
            `export PATH="$HOME/.local/bin:$PATH"`,
        );
      }
      aliasSummary.push(`af alias: ${result.status} (${result.path})`);
    } else if (result.status === "unchanged") {
      aliasSpinner.stop("Alias already in place");
      aliasSummary.push(`af alias: unchanged (${result.path})`);
    } else if (result.status === "unsupported") {
      aliasSpinner.stop("Alias not auto-installable on this platform");
      prompts.log.warn(result.message || "Unsupported platform");
      aliasSummary.push("af alias: skipped (platform)");
      // Reconcile: no symlink exists, so persist that truth.
      next.aliases.af.enabled = false;
    } else {
      aliasSpinner.stop("Alias install failed");
      prompts.log.warn(
        `${result.message || "unknown failure"}\n  ` +
          "Re-run `agileflow launch setup` to retry, or create the symlink manually.",
      );
      aliasSummary.push("af alias: failed");
      // Reconcile: install failed → no symlink exists.
      next.aliases.af.enabled = false;
    }
  } else {
    // User declined — clean up any previous symlink we installed.
    const aliasSpinner = prompts.spinner();
    aliasSpinner.start("Checking `af` alias");
    const removal = await uninstallAfAlias();
    if (removal.status === "removed") {
      aliasSpinner.stop(`Alias removed → ${removal.path}`);
      aliasSummary.push(`af alias: removed (${removal.path})`);
    } else if (removal.status === "absent") {
      aliasSpinner.stop("Alias not present");
      aliasSummary.push("af alias: not present");
    } else if (removal.status === "skipped") {
      aliasSpinner.stop("Alias points elsewhere — left untouched");
      prompts.log.warn(
        removal.message ||
          `${removal.path} points at a different binary; remove it manually to free the name.`,
      );
      aliasSummary.push("af alias: skipped (foreign symlink)");
    } else if (removal.status === "failed") {
      aliasSpinner.stop("Alias removal failed");
      prompts.log.warn(
        `Could not remove existing af alias at ${removal.path}: ${
          removal.message || "unknown error"
        }`,
      );
      aliasSummary.push(`af alias: removal failed (${removal.path})`);
    }
  }

  const writeSpinner = prompts.spinner();
  writeSpinner.start("Writing launch-prefs.json");
  /** @type {string} */
  let file;
  try {
    file = await writePrefs(next);
  } catch (err) {
    writeSpinner.stop("Prefs write failed");
    prompts.log.error(err.message);
    process.exit(1);
  }
  writeSpinner.stop(`Prefs written → ${file}`);

  /** @type {string[]} */
  const summary = [
    `preferred CLI: ${cli.preferred}`,
    `fallback order: ${cli.fallbackOrder.join(" → ")}`,
    tmuxAndKeybinds.tmux.enabled
      ? `tmux: on (status ${tmuxAndKeybinds.tmux.statusPosition}, keybinds ${tmuxAndKeybinds.keybinds.preset})`
      : "tmux: off",
    ...aliasSummary,
  ];

  prompts.outro(summary.join("\n"));
}

/**
 * Print the slice-1 placeholder ("engine landing in slice 2") plus a
 * one-line summary of the loaded prefs so the user can confirm they're
 * being read correctly.
 *
 * @param {import('../../runtime/launch/defaults.js').LaunchPrefs} prefs
 * @param {string} prefsFile
 */
function printPlaceholder(prefs, prefsFile) {
  const lines = [
    "agileflow launch — slice 1",
    `prefs: ${prefsFile}`,
    `preferred CLI: ${prefs.cli.preferred} (fallback ${prefs.cli.fallbackOrder.join(" → ")})`,
    prefs.tmux.enabled
      ? `tmux: on (status ${prefs.tmux.statusPosition}, keybinds ${prefs.keybinds.preset})`
      : "tmux: off",
    `af alias: ${prefs.aliases.af.enabled ? "enabled" : "disabled"}`,
    "",
    "Session engine ships in slice 2.",
    "Re-run with `agileflow launch setup` to update prefs.",
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join("\n"));
}

/**
 * Commander action for `agileflow launch [sub]`.
 *
 * Commander v12 invokes action with positional args first, options last:
 * `action((sub, options) => ...)` for `.command("launch [sub]")`. Keeping
 * the signature explicit so we don't accidentally swap them.
 *
 * @param {string | undefined} sub
 * @param {Record<string, unknown>} [_options]
 */
async function launch(sub, _options) {
  try {
    if (sub && sub !== "setup") {
      fail(
        new OperationFailedError(`unknown launch subcommand: ${sub}`, {
          suggestion: "use `agileflow launch` or `agileflow launch setup`",
        }),
        { command: "launch" },
      );
    }

    const hasPrefs = await prefsExist();
    const flow = decideFlow({ sub, hasPrefs });

    if (flow === "setup" || flow === "first-run-setup") {
      await runSetup();
      if (flow === "first-run-setup") {
        // After first-run setup, also print the placeholder so the user
        // sees what the bare `launch` invocation would do next time.
        const { prefs, path: prefsFile } = await loadPrefsOrFail();
        // eslint-disable-next-line no-console
        console.log("");
        printPlaceholder(prefs, prefsFile);
      }
      return;
    }

    const { prefs, path: prefsFile } = await loadPrefsOrFail();
    printPlaceholder(prefs, prefsFile);
  } catch (err) {
    // Preserve typed AgileflowError subclasses (OperationFailedError,
    // InvalidArgumentError, MissingFileError) with their `suggestion`
    // intact. A `name` string compare would miss subclasses — they each
    // override `name` to their own class name.
    if (err instanceof AgileflowError) throw err;
    fail(
      new OperationFailedError(
        `launch failed: ${err && err.message ? err.message : String(err)}`,
        { suggestion: "re-run with DEBUG=1 for a stack trace", cause: err },
      ),
      { command: "launch" },
    );
  }
}

module.exports = launch;
module.exports.decideFlow = decideFlow;
module.exports.runSetup = runSetup;
module.exports.printPlaceholder = printPlaceholder;
