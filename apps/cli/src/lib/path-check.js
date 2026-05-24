/**
 * Check whether a command is resolvable on the user's PATH.
 *
 * Used by `agileflow launch` to detect which AI CLIs (claude, codex,
 * cursor-agent, aider) are installed so the onboarding picker only
 * offers real choices.
 *
 * Implementation: shell out to `command -v` (POSIX) or `where` (Windows).
 * Both are built-ins, present on every supported platform, and exit
 * non-zero when the name is not found.
 *
 * Safety: the name argument is constrained to a conservative character
 * class before being interpolated into the shell command. These are CLI
 * binary names — not free-form user input — so the restriction is
 * intentional rather than limiting.
 */
const { execSync } = require("child_process");

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

/**
 * @param {string} name
 * @returns {boolean}
 */
function commandExists(name) {
  if (typeof name !== "string" || !SAFE_NAME.test(name)) return false;

  const probe =
    process.platform === "win32" ? `where ${name}` : `command -v ${name}`;

  try {
    execSync(probe, { stdio: "ignore", shell: true });
    return true;
  } catch {
    return false;
  }
}

module.exports = { commandExists, SAFE_NAME };
