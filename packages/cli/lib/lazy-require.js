/**
 * lazy-require.js - Reusable Lazy-Loading Utility
 *
 * AgileFlow scripts are copied to user projects (.agileflow/scripts/) and run
 * as hooks. When these scripts eagerly require() npm dependencies at module
 * load time, they crash if the dependency isn't resolvable from the user's
 * project directory. This utility standardizes the lazy-loading pattern used
 * ad-hoc in yaml-utils.js and dashboard-server.js.
 *
 * Usage:
 *   const { lazyRequire } = require('./lazy-require');
 *
 *   // Returns a getter function; require() is deferred until first call
 *   const getChalk = lazyRequire('chalk');
 *
 *   // With fallback resolution paths
 *   const getYaml = lazyRequire('js-yaml',
 *     path.join(__dirname, '..', 'node_modules', 'js-yaml')
 *   );
 *
 *   // Later, when actually needed:
 *   const chalk = getChalk();
 */

'use strict';

/**
 * Create a lazy-loading getter for an npm module.
 *
 * The returned function defers require() until first invocation, then caches
 * the result. Multiple resolution paths are tried in order, so the module can
 * be found from the user's node_modules, AgileFlow's own node_modules, or any
 * other location.
 *
 * @param {string} name - Primary module name (passed to require())
 * @param {...string} fallbackPaths - Additional paths to try if primary fails
 * @returns {function(): any} Getter that returns the loaded module
 */
function lazyRequire(name, ...fallbackPaths) {
  let cached = null;
  return () => {
    if (cached) return cached;
    const paths = [name, ...fallbackPaths];
    for (const p of paths) {
      try {
        cached = require(p);
        return cached;
      } catch (_e) {
        // Continue to next path
      }
    }
    throw new Error(
      `${name} not found. Run: npm install ${name}\n` +
        'Or reinstall AgileFlow: npx agileflow setup --force'
    );
  };
}

module.exports = { lazyRequire };
