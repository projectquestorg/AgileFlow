/**
 * Portable AGENTS.md emitter + CLAUDE.md import bridge + per-agent
 * preference injection.
 *
 * WHY: Claude Code reads CLAUDE.md natively but NOT AGENTS.md. Roughly two
 * dozen other agentic tools (Cursor, Codex, Copilot, Windsurf, Gemini,
 * JetBrains Junie, Zed, Cline, ...) read a root AGENTS.md. To reach all of
 * them with one canonical source, the installer:
 *
 *   1. Writes a single AGENTS.md at the install root carrying the user's
 *      babysit-mode preference block, wrapped in BEGIN/END markers so a
 *      re-install refreshes ONLY the managed region and never clobbers
 *      user-authored content elsewhere in the file.
 *   2. Ensures CLAUDE.md imports AGENTS.md via an `@AGENTS.md` line inside
 *      its own managed marker block, so Claude Code picks up the same
 *      guidance without duplicating it.
 *   3. Bakes the same managed preference block into each installed subagent
 *      markdown file — subagents inherit CLAUDE.md but do NOT receive
 *      SessionStart hook output, so this is the only way to reach them.
 *
 * Every write is idempotent and preserves user content outside the markers.
 */
const fs = require("fs");
const path = require("path");

const { buildPrefsBlock } = require("./prefs-builder.js");

/** Marker comments that delimit the AgileFlow-managed region. */
const BEGIN_MARKER = "<!-- BEGIN AGILEFLOW MANAGED BLOCK -->";
const END_MARKER = "<!-- END AGILEFLOW MANAGED BLOCK -->";

/**
 * A short notice placed at the top of every managed region so a human
 * reader understands the region is generated. ASCII-only, no emoji.
 */
const MANAGED_NOTICE =
  "<!-- This region is generated and maintained by AgileFlow. It is refreshed on every install. Do not edit inside the markers; put your own content OUTSIDE this block so it is preserved. -->";

/**
 * Read a UTF-8 file, returning "" when it does not exist. Real I/O errors
 * (EACCES / EIO) propagate.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function readOrEmpty(filePath) {
  try {
    return await fs.promises.readFile(filePath, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") return "";
    throw err;
  }
}

/**
 * Insert or refresh the AgileFlow-managed region within `existing`.
 *
 * - If both markers are present, the text BETWEEN them (inclusive of the
 *   markers) is replaced with the fresh region — user content before the
 *   BEGIN marker and after the END marker is untouched.
 * - If the markers are absent, the region is appended to the end, keeping
 *   any existing user content intact.
 *
 * @param {string} existing - current file content ("" if the file is new)
 * @param {string} body - managed body markdown (already trimmed)
 * @returns {string} the full file content to write
 */
function upsertManagedRegion(existing, body) {
  const region = `${BEGIN_MARKER}\n${MANAGED_NOTICE}\n\n${body}\n${END_MARKER}`;

  // Anchor the END marker search AFTER the BEGIN marker so a stray END
  // marker earlier in the file (pasted example, merge artifact) can't push
  // us onto the append branch and duplicate the managed block.
  const beginIdx = existing.indexOf(BEGIN_MARKER);
  const endIdx = beginIdx === -1 ? -1 : existing.indexOf(END_MARKER, beginIdx);

  if (beginIdx !== -1 && endIdx !== -1) {
    const before = existing.slice(0, beginIdx);
    const after = existing.slice(endIdx + END_MARKER.length);
    return `${before}${region}${after}`;
  }

  // Append. Ensure exactly one blank line between prior content and the
  // managed region when there is prior content.
  if (existing.trim() === "") {
    return `${region}\n`;
  }
  const sep = existing.endsWith("\n") ? "\n" : "\n\n";
  return `${existing}${sep}${region}\n`;
}

/**
 * Remove the AgileFlow-managed region from `existing`, leaving all other
 * content intact. Returns the cleaned content (may be "").
 * @param {string} existing
 * @returns {string}
 */
function removeManagedRegion(existing) {
  const beginIdx = existing.indexOf(BEGIN_MARKER);
  const endIdx = beginIdx === -1 ? -1 : existing.indexOf(END_MARKER, beginIdx);
  if (beginIdx === -1 || endIdx === -1) return existing;
  // Strip surrounding newlines including a stray \r so CRLF-authored files
  // don't leave an orphaned carriage return behind.
  const before = existing.slice(0, beginIdx).replace(/[\r\n]+$/, "");
  const after = existing
    .slice(endIdx + END_MARKER.length)
    .replace(/^[\r\n]+/, "");
  if (before && after) return `${before}\n\n${after}`;
  return `${before}${after}`;
}

/**
 * Extract the babysit settings object from a merged AgileflowConfig.
 * @param {any} config
 * @returns {import('./prefs-builder.js').BabysitSettings|undefined}
 */
function babysitFrom(config) {
  return config?.plugins?.core?.settings?.babysit;
}

/**
 * Build the managed body for AGENTS.md from the merged config. Always
 * returns a non-empty body — AGENTS.md is universal, so even without a
 * configured preference profile it carries a stable header pointing users
 * at `agileflow setup`.
 * @param {any} config
 * @returns {string}
 */
function buildAgentsBody(config) {
  const prefs = buildPrefsBlock(babysitFrom(config));
  const header = [
    "# AgileFlow",
    "",
    "This file is read by agentic coding tools that support a root `AGENTS.md`",
    "(Cursor, Codex, Copilot, Windsurf, Gemini, Zed, Cline, and others). It",
    "carries the same working preferences AgileFlow applies inside a session.",
  ].join("\n");

  if (prefs) return `${header}\n\n${prefs}`;
  return `${header}\n\n## User Preferences\n\nNo AgileFlow preference profile is configured yet. Run \`agileflow setup\` to choose a babysit mode.`;
}

/**
 * Write / refresh the canonical AGENTS.md at the project root. Idempotent:
 * a re-install replaces only the managed region and preserves any
 * user-authored content outside the markers.
 *
 * @param {string} projectRoot
 * @param {any} config - merged AgileflowConfig (may be undefined)
 * @returns {Promise<string>} absolute path to AGENTS.md
 */
async function writeAgentsMd(projectRoot, config) {
  const target = path.join(projectRoot, "AGENTS.md");
  const existing = await readOrEmpty(target);
  const next = upsertManagedRegion(existing, buildAgentsBody(config));
  await fs.promises.mkdir(projectRoot, { recursive: true });
  await fs.promises.writeFile(target, next, "utf8");
  return target;
}

/**
 * Ensure the project's root CLAUDE.md imports AGENTS.md. The `@AGENTS.md`
 * import lives inside a managed marker block; a re-install refreshes only
 * that block and leaves all user content in CLAUDE.md intact. The file is
 * created if absent.
 *
 * @param {string} projectRoot
 * @returns {Promise<string>} absolute path to CLAUDE.md
 */
async function ensureClaudeMdImport(projectRoot) {
  const target = path.join(projectRoot, "CLAUDE.md");
  const existing = await readOrEmpty(target);
  const body = [
    "AgileFlow keeps the portable working preferences in `AGENTS.md`. The",
    "import below pulls them into Claude Code, which does not read AGENTS.md",
    "natively. Edit AGENTS.md (outside its own managed block) to customize.",
    "",
    "@AGENTS.md",
  ].join("\n");
  const next = upsertManagedRegion(existing, body);
  await fs.promises.mkdir(projectRoot, { recursive: true });
  await fs.promises.writeFile(target, next, "utf8");
  return target;
}

/**
 * List absolute paths to every `.md` file under `dir`, recursively.
 * Returns [] when the directory does not exist.
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function listMarkdownFiles(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") return out;
    throw err;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await listMarkdownFiles(full)));
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Bake the managed preference block into each installed subagent markdown
 * file under `agentsDir`. Idempotent: re-install refreshes the managed
 * block only and never duplicates it. When no preference profile is
 * configured, any previously-injected managed block is removed.
 *
 * @param {string} agentsDir - directory holding installed agent .md files
 * @param {any} config - merged AgileflowConfig (may be undefined)
 * @returns {Promise<{ touched: string[], failed: Array<{ file: string, error: string }> }>}
 *   `touched` = agent files written/refreshed; `failed` = files whose write
 *   threw (a mid-loop failure no longer aborts the whole install).
 */
async function injectAgentPrefs(agentsDir, config) {
  const prefs = buildPrefsBlock(babysitFrom(config));
  const files = await listMarkdownFiles(agentsDir);
  /** @type {string[]} */
  const touched = [];
  /** @type {Array<{ file: string, error: string }>} */
  const failed = [];
  for (const file of files) {
    // Per-file guard: a permission error on one agent .md must not leave the
    // remaining agents un-injected, and the caller needs to know which failed.
    try {
      const existing = await readOrEmpty(file);
      const next = prefs
        ? upsertManagedRegion(existing, prefs)
        : removeManagedRegion(existing);
      if (next !== existing) {
        await fs.promises.writeFile(file, next, "utf8");
        touched.push(file);
      }
    } catch (err) {
      failed.push({
        file,
        error: err && err.message ? err.message : String(err),
      });
    }
  }
  return { touched, failed };
}

module.exports = {
  BEGIN_MARKER,
  END_MARKER,
  MANAGED_NOTICE,
  upsertManagedRegion,
  removeManagedRegion,
  buildAgentsBody,
  writeAgentsMd,
  ensureClaudeMdImport,
  injectAgentPrefs,
};
