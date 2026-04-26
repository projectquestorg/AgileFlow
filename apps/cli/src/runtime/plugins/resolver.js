/**
 * Plugin dependency resolver.
 *
 * Given a set of discovered plugins and the user's selection, computes:
 *   - the transitive closure of dependencies (auto-enable anything the
 *     user-selected plugins depend on),
 *   - a topological install order (dependencies before dependents),
 *   - cycle detection (throws with the offending cycle path).
 *
 * Plugins with `cannotDisable: true` (currently just `core`) are always
 * included in the resolved set even if not in `userSelected`.
 */

/**
 * @typedef {import('./registry.js').PluginManifest} PluginManifest
 *
 * @typedef {Object} ResolveResult
 * @property {PluginManifest[]} ordered
 *   Plugins in install order — dependencies appear before dependents.
 * @property {string[]} autoEnabled
 *   Ids that were pulled in because something else depended on them
 *   (i.e. not in `userSelected` and not `cannotDisable`).
 */

const COLOR_WHITE = 0;
const COLOR_GRAY = 1;
const COLOR_BLACK = 2;

/**
 * Validate that every plugin's `depends` references resolve to a known
 * id in the discovered set. Thrown errors quote both the dependent and
 * the missing dependency.
 *
 * @param {PluginManifest[]} discovered
 * @param {Map<string, PluginManifest>} byId
 */
function assertDependsExist(discovered, byId) {
  for (const p of discovered) {
    for (const dep of p.depends || []) {
      if (typeof dep !== 'string' || !dep) {
        throw new Error(
          `Plugin "${p.id}" has an invalid entry in 'depends': ${JSON.stringify(dep)}`,
        );
      }
      if (!byId.has(dep)) {
        throw new Error(
          `Plugin "${p.id}" depends on unknown plugin "${dep}"`,
        );
      }
    }
  }
}

/**
 * @param {PluginManifest[]} discovered
 * @param {Iterable<string>} userSelected - ids the user explicitly enabled
 * @returns {ResolveResult}
 */
function resolvePlugins(discovered, userSelected) {
  const byId = new Map(discovered.map((p) => [p.id, p]));
  assertDependsExist(discovered, byId);

  const userSet = new Set(userSelected);
  // Initial target set: cannotDisable (core) + user-selected.
  /** @type {Set<string>} */
  const target = new Set();
  for (const p of discovered) {
    if (p.cannotDisable || userSet.has(p.id)) {
      target.add(p.id);
    }
  }

  // Walk transitive dependencies to grow `target`.
  const queue = [...target];
  while (queue.length) {
    const id = queue.shift();
    const p = byId.get(id);
    for (const dep of p.depends || []) {
      if (!target.has(dep)) {
        target.add(dep);
        queue.push(dep);
      }
    }
  }

  // DFS topological sort with three-color cycle detection.
  /** @type {Map<string, number>} */
  const color = new Map();
  /** @type {string[]} */
  const order = [];

  /**
   * @param {string} id
   * @param {string[]} stack - the current DFS path; used for cycle reporting
   */
  function visit(id, stack) {
    const c = color.get(id) ?? COLOR_WHITE;
    if (c === COLOR_BLACK) return;
    if (c === COLOR_GRAY) {
      const cycleStart = stack.indexOf(id);
      const cycle = [...stack.slice(cycleStart), id].join(' -> ');
      throw new Error(`Plugin dependency cycle detected: ${cycle}`);
    }
    color.set(id, COLOR_GRAY);
    const p = byId.get(id);
    const nextStack = [...stack, id];
    for (const dep of p.depends || []) {
      visit(dep, nextStack);
    }
    color.set(id, COLOR_BLACK);
    order.push(id);
  }

  for (const id of target) {
    visit(id, []);
  }

  const ordered = order.map((id) => byId.get(id));
  const autoEnabled = [...target].filter((id) => {
    const p = byId.get(id);
    return !userSet.has(id) && !p.cannotDisable;
  });
  return { ordered, autoEnabled };
}

module.exports = { resolvePlugins };
