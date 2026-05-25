/**
 * Resolve the AI CLI to launch given a prefs object.
 *
 * Walks `[cli.preferred, ...cli.fallbackOrder]` (deduped, preferred first),
 * looks up each id's descriptor in the known-CLI registry, and returns
 * the first one whose binary actually resolves on PATH. Returns null if
 * none of the user's configured CLIs are installed — the caller surfaces
 * the actionable error.
 *
 * `exists` is injectable so tests don't shell out.
 */
const { commandExists: realCommandExists } = require("../../lib/path-check.js");
const { findCli } = require("./detect-clis.js");

/**
 * Build the dedup'd lookup order: preferred first, then any fallback ids
 * that weren't the preferred. Skips ids the user has explicitly removed
 * from fallback (i.e., empty fallbackOrder means "only try preferred").
 *
 * @param {{ preferred: string, fallbackOrder: string[] }} cli
 * @returns {string[]}
 */
function buildLookupOrder(cli) {
  const seen = new Set();
  const order = [];
  const push = (id) => {
    if (typeof id !== "string" || !id) return;
    if (seen.has(id)) return;
    seen.add(id);
    order.push(id);
  };
  push(cli.preferred);
  for (const id of cli.fallbackOrder || []) push(id);
  return order;
}

/**
 * @param {{ cli: { preferred: string, fallbackOrder: string[] } }} prefs
 * @param {(name: string) => boolean} [exists]
 * @returns {{
 *   resolved: import('./detect-clis.js').CliDescriptor | null,
 *   tried: string[],
 * }}
 */
function resolveCli(prefs, exists = realCommandExists) {
  const tried = buildLookupOrder(prefs.cli);
  for (const id of tried) {
    const desc = findCli(id);
    if (desc && exists(desc.bin)) {
      return { resolved: desc, tried };
    }
  }
  return { resolved: null, tried };
}

module.exports = { resolveCli, buildLookupOrder };
