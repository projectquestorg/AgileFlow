/**
 * Brand styling helpers for the CLI wizard.
 *
 * BRAND_COLOR (#e8683a, burnt orange) is AgileFlow's identity color —
 * used for the logo banner and option labels in setup prompts so users
 * can visually parse "label vs. description" without squinting.
 */
const chalk = require("chalk");

const BRAND_COLOR = "#e8683a";
const brand = chalk.hex(BRAND_COLOR);

// Recolor Clack's frame symbols to the brand color. Clack reads
// `picocolors.cyan` (left-side bar │, corners └, active diamond ◆) and
// `picocolors.green` (submit diamond ◇, success bullet) at render time,
// so replacing those two functions on the picocolors module is enough
// to retheme the entire wizard without forking @clack/prompts.
//
// We leave red (error), yellow (warn), gray (dim), and blue (info)
// alone — those convey state and shouldn't all collapse into brand
// orange. Text content stays default white; only the structural symbols
// change.
let themed = false;
function applyClackTheme() {
  if (themed) return;
  themed = true;
  try {
    const pc = require("picocolors");
    const wrap = (s) => `\x1b[38;2;232;104;58m${s}\x1b[39m`;
    pc.cyan = wrap;
    pc.green = wrap;

    // Make `dim` ALSO strip bold escapes from its input, so a label that
    // contains `\x1b[1m...\x1b[22m` (chalk.bold) renders bold only when
    // it's the active row (Clack doesn't wrap active labels), and renders
    // plain when Clack wraps the inactive label in `dim()`. This is the
    // only way to get "bold on active, normal on inactive" without
    // forking @clack/prompts.
    const BOLD_RE = /\x1b\[(?:1|22)m/g;
    const origDim = pc.dim;
    pc.dim = (s) => origDim(String(s).replace(BOLD_RE, ""));
  } catch {
    // picocolors not installed (shouldn't happen — clack depends on it).
    // Silently skip; the wizard still works, just with default colors.
  }
}
applyClackTheme();

// Canonical AgileFlow wordmark — kept in sync with apps/website/lib/logo.ts.
const LOGO = [
  " █████╗  ██████╗ ██╗██╗     ███████╗███████╗██╗      ██████╗ ██╗    ██╗",
  "██╔══██╗██╔════╝ ██║██║     ██╔════╝██╔════╝██║     ██╔═══██╗██║    ██║",
  "███████║██║  ███╗██║██║     █████╗  █████╗  ██║     ██║   ██║██║ █╗ ██║",
  "██╔══██║██║   ██║██║██║     ██╔══╝  ██╔══╝  ██║     ██║   ██║██║███╗██║",
  "██║  ██║╚██████╔╝██║███████╗███████╗██║     ███████╗╚██████╔╝╚███╔███╔╝",
  "╚═╝  ╚═╝ ╚═════╝ ╚═╝╚══════╝╚══════╝╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝",
];

/**
 * Render the brand logo as a single string, brand-colored. Caller is
 * responsible for printing it (typically before `prompts.intro`).
 *
 * @param {string} [version]
 * @returns {string}
 */
function logoBanner(version) {
  const lines = LOGO.map((l) => brand(l));
  if (version) {
    lines.push("");
    lines.push(brand.bold(`v${version}`));
  }
  return lines.join("\n");
}

/**
 * Build a Clack option label that visually separates name and description:
 *   bold brand-color label
 *   dim description on a second line
 *
 * Clack renders `label` verbatim, so embedded newlines work and produce
 * a clean two-line option that's much easier to read than label+hint
 * sharing one line in the same color.
 *
 * @param {string} title
 * @param {string} [description]
 * @returns {string}
 */
function optionLabel(title, description) {
  // Bold the title; the picocolors.dim() patch above strips bold from
  // dimmed rows, so this only renders bold on the active row.
  const head = chalk.bold(title);
  if (!description) return head;
  return `${head}\n   ${chalk.ansi256(245)(description)}`;
}

/**
 * Build a Clack prompt message with a bold question and optional muted
 * supporting sentence on the next line.
 *
 * @param {string} title
 * @param {string} [description]
 * @returns {string}
 */
function questionMessage(title, description) {
  const head = chalk.bold(title);
  if (!description) return head;
  return `${head}\n${chalk.ansi256(245)(description)}`;
}

module.exports = {
  BRAND_COLOR,
  brand,
  logoBanner,
  optionLabel,
  questionMessage,
};
