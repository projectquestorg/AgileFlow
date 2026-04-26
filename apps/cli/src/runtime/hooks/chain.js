/**
 * Hook chain ordering.
 *
 * Given a list of `HookEntry` for a single event, returns the topological
 * order in which they must be executed (dependencies before dependents)
 * and detects cycles with a clear error message that names the cycle path.
 *
 * Filtering by event happens upstream — `orderChain` accepts whatever
 * the caller gives it.
 */

const COLOR_WHITE = 0;
const COLOR_GRAY = 1;
const COLOR_BLACK = 2;

/**
 * @typedef {import('./manifest-loader.js').HookEntry} HookEntry
 */

/**
 * Validate that every `runAfter` entry resolves to a hook id in this set.
 * @param {HookEntry[]} hooks
 * @param {Map<string, HookEntry>} byId
 */
function assertRunAfterExists(hooks, byId) {
  for (const h of hooks) {
    for (const dep of h.runAfter) {
      if (!byId.has(dep)) {
        throw new Error(
          `Hook "${h.id}" runAfter references unknown hook "${dep}" (in same event chain)`,
        );
      }
    }
  }
}

/**
 * Topologically sort the chain. Hooks with `runAfter: [a, b]` come AFTER
 * a and b. Within a layer, ordering is stable on the original input order
 * so two ready-to-run hooks keep their declaration order.
 *
 * @param {HookEntry[]} hooks
 * @returns {HookEntry[]}
 * @throws {Error} on cycles or unresolved runAfter targets
 */
function orderChain(hooks) {
  const byId = new Map(hooks.map((h) => [h.id, h]));
  if (byId.size !== hooks.length) {
    // Caller should have rejected duplicates upstream; defensive check.
    const seen = new Set();
    for (const h of hooks) {
      if (seen.has(h.id)) throw new Error(`duplicate hook id in chain: ${h.id}`);
      seen.add(h.id);
    }
  }
  assertRunAfterExists(hooks, byId);

  /** @type {Map<string, number>} */
  const color = new Map();
  /** @type {HookEntry[]} */
  const order = [];

  /**
   * @param {string} id
   * @param {string[]} stack
   */
  function visit(id, stack) {
    const c = color.get(id) ?? COLOR_WHITE;
    if (c === COLOR_BLACK) return;
    if (c === COLOR_GRAY) {
      const start = stack.indexOf(id);
      const cycle = [...stack.slice(start), id].join(' -> ');
      throw new Error(`Hook chain cycle detected: ${cycle}`);
    }
    color.set(id, COLOR_GRAY);
    const h = byId.get(id);
    const next = [...stack, id];
    for (const dep of h.runAfter) {
      visit(dep, next);
    }
    color.set(id, COLOR_BLACK);
    order.push(h);
  }

  // Visit in declaration order so within a topological "layer" the
  // original order is preserved.
  for (const h of hooks) {
    visit(h.id, []);
  }
  return order;
}

module.exports = { orderChain };
