/**
 * Library loader.
 *
 * Reads `library.yaml` and returns a normalized object with sections
 * for skills, agents, and prompts. Schema:
 *
 *   version: 1
 *   skills:
 *     - name: my-skill
 *       source: github
 *       repo: owner/repo
 *       path: skills/my-skill
 *       ref: main
 *   agents:
 *     - name: ag-ui
 *       source: local
 *       path: ../agents/ui
 *   prompts:
 *     - name: system-prompt
 *       source: github
 *       repo: owner/prompts
 *       path: prompts/system.md
 *
 * Returns null when the file does not exist (treated as "no library
 * references" by callers). Throws with a clear message on invalid YAML
 * or schema violations — partial/silent acceptance is not permitted.
 */
const fs = require("fs");
const yaml = require("js-yaml");

/** @type {number} */
const LIBRARY_VERSION = 1;

/** @type {ReadonlySet<string>} */
const VALID_SOURCES = new Set(["github", "local"]);

/** @type {string[]} */
const SECTIONS = ["skills", "agents", "prompts"];

/** @type {string} */
const DEFAULT_REF = "main";

/**
 * @typedef {Object} LibraryEntry
 * @property {string} section
 * @property {string} name
 * @property {string} source
 * @property {string} path
 * @property {string} [repo] Only for source === 'github'
 * @property {string} [ref] Only for source === 'github', defaults to DEFAULT_REF
 *
 * @typedef {Object} Library
 * @property {1} version
 * @property {LibraryEntry[]} skills
 * @property {LibraryEntry[]} agents
 * @property {LibraryEntry[]} prompts
 */

/**
 * Validates a single entry in a section. Enforces type, required fields,
 * and source-specific constraints.
 *
 * @param {*} raw
 * @param {string} section
 * @param {number} index
 * @returns {LibraryEntry}
 */
function normalizeEntry(raw, section, index) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${section}[${index}] must be an object`);
  }

  if (typeof raw.name !== "string" || !raw.name) {
    throw new Error(`${section}[${index}].name must be a non-empty string`);
  }

  if (typeof raw.source !== "string" || !VALID_SOURCES.has(raw.source)) {
    throw new Error(
      `${section}[${index}].source must be one of: ${[...VALID_SOURCES].sort().join(", ")}`,
    );
  }

  if (typeof raw.path !== "string" || !raw.path) {
    throw new Error(`${section}[${index}].path must be a non-empty string`);
  }

  const entry = {
    section,
    name: raw.name,
    source: raw.source,
    path: raw.path,
  };

  if (raw.source === "github") {
    if (typeof raw.repo !== "string" || !raw.repo) {
      throw new Error(
        `${section}[${index}].repo must be a non-empty string for github source`,
      );
    }
    if (!/^[\w.-]+\/[\w.-]+$/.test(raw.repo)) {
      throw new Error(
        `${section}[${index}].repo must match "owner/repo" pattern`,
      );
    }
    entry.repo = raw.repo;
    if (raw.ref != null && (typeof raw.ref !== "string" || !raw.ref)) {
      throw new Error(`${section}[${index}].ref must be a non-empty string`);
    }
    entry.ref = typeof raw.ref === "string" ? raw.ref : DEFAULT_REF;
  } else if (raw.source === "local") {
    // Local entries must not have repo or ref
    if (raw.repo != null) {
      throw new Error(
        `${section}[${index}]: repo is not allowed for local source`,
      );
    }
    if (raw.ref != null) {
      throw new Error(
        `${section}[${index}]: ref is not allowed for local source`,
      );
    }
  }

  return entry;
}

/**
 * Validates the overall structure of the parsed YAML and ensures
 * uniqueness of names within each section.
 *
 * @param {*} parsed
 * @returns {Library}
 */
function normalizeLibrary(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("library must be an object");
  }

  if (parsed.version !== LIBRARY_VERSION) {
    throw new Error(
      `library version must be ${LIBRARY_VERSION}, got ${JSON.stringify(parsed.version)}`,
    );
  }

  const result = {
    version: LIBRARY_VERSION,
    skills: [],
    agents: [],
    prompts: [],
  };

  for (const section of SECTIONS) {
    if (parsed[section] == null) {
      continue;
    }
    if (!Array.isArray(parsed[section])) {
      throw new Error(`library \`${section}\` must be an array`);
    }

    const seen = new Set();
    for (let i = 0; i < parsed[section].length; i++) {
      const entry = normalizeEntry(parsed[section][i], section, i);
      if (seen.has(entry.name)) {
        throw new Error(`duplicate ${section} name: ${entry.name}`);
      }
      seen.add(entry.name);
      result[section].push(entry);
    }
  }

  return result;
}

/**
 * @param {string} libraryPath
 * @returns {Promise<Library|null>}
 */
async function loadLibrary(libraryPath) {
  let raw;
  try {
    raw = await fs.promises.readFile(libraryPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }

  let parsed;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new Error(`Invalid YAML in ${libraryPath}: ${err.message}`);
  }

  return normalizeLibrary(parsed);
}

module.exports = {
  loadLibrary,
  normalizeLibrary,
  normalizeEntry,
  LIBRARY_VERSION,
  VALID_SOURCES,
  SECTIONS,
  DEFAULT_REF,
};
