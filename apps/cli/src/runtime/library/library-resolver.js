/**
 * Library resolver.
 *
 * Resolves library entries to concrete sources: github URLs or local paths.
 * Validates that local paths exist.
 */
const fs = require("fs");
const path = require("path");

/**
 * @typedef {Object} ResolvedReference
 * @property {string} section
 * @property {string} name
 * @property {string} source
 * @property {string} path
 * @property {string} type - 'github' or 'local'
 * @property {string} [repo] For github sources
 * @property {string} [ref] For github sources
 * @property {string} [url] For github sources
 * @property {string} [resolvedPath] For local sources
 *
 * @typedef {Object} ResolvedLibrary
 * @property {1} version
 * @property {ResolvedReference[]} skills
 * @property {ResolvedReference[]} agents
 * @property {ResolvedReference[]} prompts
 */

/**
 * Validates and resolves a single reference. For github references,
 * constructs the URL. For local references, resolves the path against
 * baseDir and validates existence.
 *
 * @param {Object} ref - Library entry to resolve
 * @param {Object} opts
 * @param {string} opts.baseDir - Directory containing the library.yaml
 * @returns {ResolvedReference}
 */
function resolveReference(ref, { baseDir }) {
  const result = {
    section: ref.section,
    name: ref.name,
    source: ref.source,
    path: ref.path,
    type: ref.source,
  };

  if (ref.source === "github") {
    // Re-assert repo shape for safety
    if (typeof ref.repo !== "string" || !ref.repo) {
      throw new Error(`github reference "${ref.name}" has invalid repo`);
    }
    if (!/^[\w.-]+\/[\w.-]+$/.test(ref.repo)) {
      throw new Error(
        `github reference "${ref.name}": repo must match "owner/repo" pattern`,
      );
    }
    result.repo = ref.repo;
    result.ref = ref.ref || "main";
    result.url = `https://github.com/${ref.repo}`;
  } else if (ref.source === "local") {
    const resolvedPath = path.resolve(baseDir, ref.path);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(
        `Local source "${ref.name}": path not found: ${resolvedPath}`,
      );
    }
    result.resolvedPath = resolvedPath;
  }

  return result;
}

/**
 * Resolves all entries in a library against a base directory.
 * Returns a new library object with resolved references.
 *
 * @param {Object} library - Output from normalizeLibrary
 * @param {Object} opts
 * @param {string} opts.baseDir - Directory containing library.yaml
 * @returns {ResolvedLibrary}
 */
function resolveLibrary(library, opts) {
  const { baseDir } = opts;
  const result = {
    version: library.version,
    skills: [],
    agents: [],
    prompts: [],
  };

  for (const section of ["skills", "agents", "prompts"]) {
    for (const entry of library[section]) {
      const resolved = resolveReference(entry, { baseDir });
      result[section].push(resolved);
    }
  }

  return result;
}

module.exports = {
  resolveReference,
  resolveLibrary,
};
