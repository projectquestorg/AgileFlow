/**
 * `af` alias picker for `agileflow launch setup`.
 *
 * Asks whether to install the short `af` alias as a symlink at
 * `~/.local/bin/af` → `agileflow`. The picker only captures the user's
 * preference; the actual symlink is created by `installAfAlias()` after
 * prefs are written, so failure modes (permission errors, PATH warnings)
 * are surfaced cleanly through the existing outro path.
 *
 * Windows users see the option but the side-effect step reports
 * "unsupported" and prints a PowerShell function snippet instead.
 */
const prompts = require("@clack/prompts");
const { questionMessage } = require("../../lib/brand.js");

/**
 * @param {{ aliases: { af: { enabled: boolean } } }} currentPrefs
 * @returns {Promise<{ af: { enabled: boolean } }>}
 */
async function pickAliases(currentPrefs) {
  const initial =
    currentPrefs &&
    currentPrefs.aliases &&
    currentPrefs.aliases.af &&
    typeof currentPrefs.aliases.af.enabled === "boolean"
      ? currentPrefs.aliases.af.enabled
      : false;

  const detail =
    process.platform === "win32"
      ? "On Windows the symlink can't be auto-created; we'll print a PowerShell snippet instead."
      : "Creates ~/.local/bin/af → agileflow. No sudo needed.";

  const choice = await prompts.confirm({
    message: questionMessage(
      "Install `af` as a short alias for `agileflow launch`?",
      detail,
    ),
    initialValue: initial,
  });

  if (prompts.isCancel(choice)) {
    prompts.cancel("Setup cancelled. No changes made.");
    process.exit(1);
  }

  return { af: { enabled: /** @type {boolean} */ (choice) } };
}

module.exports = { pickAliases };
