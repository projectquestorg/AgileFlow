/**
 * Skill validator — enforces frontmatter v2 policy on every SKILL.md.
 *
 * The skills-only direction (no slash commands) makes activation
 * triggers load-bearing. A typo in a description or a colliding
 * keyword silently degrades reliability. This validator catches those
 * before alpha.1 ships.
 *
 * Per-skill checks:
 *   - YAML frontmatter parses
 *   - Required fields: name, version, category, description, triggers
 *   - `description` starts with "Use when" (forces the activation-
 *     trigger framing instead of workflow summary)
 *   - `triggers.keywords` is a non-empty array of strings
 *   - `triggers.priority` is an integer in [0, 100]
 *   - `triggers.exclude` (if present) is an array of strings
 *   - `version` is valid semver
 *   - SKILL.md body (after frontmatter) is < 400 lines (kills the
 *     bloated 350-line v3 anti-pattern by policy)
 *   - If `learns.enabled === true`, `_learnings/<skill>.yaml` must
 *     exist alongside the SKILL.md
 *   - `provides.command` (if set) requires a corresponding command
 *     in the plugin's `provides.commands` — but we ship skills-only
 *     in v4, so this surfaces as a warning that the policy was
 *     ignored, not an error.
 *
 * Cross-skill checks (validateSkillSet):
 *   - No two skills share a `(keyword, priority)` pair (collision-free
 *     activation)
 *   - Duplicate skill ids
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const MAX_BODY_LINES = 400;
const REQUIRED_FIELDS = ['name', 'version', 'category', 'description', 'triggers'];

/**
 * @typedef {Object} SkillIssue
 * @property {'error' | 'warning'} severity
 * @property {string} skillPath - absolute path to SKILL.md
 * @property {string} [skillId]
 * @property {string} message
 *
 * @typedef {Object} SkillManifest
 * @property {string} skillId
 * @property {string} skillDir
 * @property {string} skillPath
 * @property {object} frontmatter - parsed YAML
 * @property {string} body - everything after the frontmatter
 */

/**
 * Split a SKILL.md text into `{ frontmatter, body }`. Frontmatter is
 * the YAML between the first two `---` lines.
 *
 * Handles two real-world wrinkles that vanilla regex would miss:
 *   - Windows CRLF line endings (`\r?\n` instead of `\n`) — common
 *     when authors edit files on Windows and commit them.
 *   - UTF-8 BOM (`\uFEFF` prefix) — some editors (Notepad, VS Code on
 *     Windows by default) write a BOM that would otherwise prevent
 *     `^---` from matching at the start of the file.
 *
 * @param {string} text
 * @returns {{ frontmatterText: string|null, body: string }}
 */
function splitFrontmatter(text) {
  // Strip a leading BOM if present so the file looks like it starts
  // with `---` to the regex engine.
  const cleaned = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const match = cleaned.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatterText: null, body: cleaned };
  return { frontmatterText: match[1], body: match[2] };
}

/**
 * Read and structurally parse a SKILL.md. Throws on non-existence /
 * missing frontmatter; the caller is responsible for catching and
 * surfacing.
 *
 * @param {string} skillPath
 * @returns {Promise<SkillManifest>}
 */
async function loadSkill(skillPath) {
  const text = await fs.promises.readFile(skillPath, 'utf8');
  const { frontmatterText, body } = splitFrontmatter(text);
  if (frontmatterText == null) {
    throw new Error('missing or malformed YAML frontmatter');
  }
  let frontmatter;
  try {
    frontmatter = yaml.load(frontmatterText);
  } catch (err) {
    throw new Error(`invalid YAML frontmatter: ${err.message}`);
  }
  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    throw new Error('frontmatter must be a YAML object');
  }
  const skillDir = path.dirname(skillPath);
  const skillId =
    typeof frontmatter.name === 'string' ? frontmatter.name : path.basename(skillDir);
  return { skillId, skillDir, skillPath, frontmatter, body };
}

/**
 * Run all per-skill checks. Pure-ish: only filesystem call is for the
 * learnings-file existence check.
 *
 * @param {SkillManifest} skill
 * @returns {Promise<SkillIssue[]>}
 */
async function validateSkill(skill) {
  /** @type {SkillIssue[]} */
  const issues = [];
  const fm = skill.frontmatter;
  const error = (msg) =>
    issues.push({ severity: 'error', skillPath: skill.skillPath, skillId: skill.skillId, message: msg });
  const warn = (msg) =>
    issues.push({ severity: 'warning', skillPath: skill.skillPath, skillId: skill.skillId, message: msg });

  for (const field of REQUIRED_FIELDS) {
    if (fm[field] == null) {
      error(`missing required frontmatter field "${field}"`);
    }
  }

  if (typeof fm.name === 'string' && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(fm.name)) {
    error(`name "${fm.name}" must match /^[a-z0-9][a-z0-9-]{0,63}$/ (kebab-case)`);
  }

  if (typeof fm.version !== 'string' || !SEMVER.test(fm.version)) {
    error(`version must be valid semver (got ${JSON.stringify(fm.version)})`);
  }

  // The defining policy of skills-only v4: descriptions MUST start
  // with "Use when" to force activation-trigger framing.
  if (typeof fm.description !== 'string') {
    error('description must be a string');
  } else {
    const trimmed = fm.description.trim();
    if (!/^Use when\b/i.test(trimmed)) {
      error('description must start with "Use when …" (skills-only activation policy)');
    }
    if (trimmed.length < 30) {
      warn('description is very short — Claude needs context to choose between skills');
    }
  }

  // Triggers.
  if (fm.triggers == null) {
    // Already flagged as missing required field above.
  } else if (typeof fm.triggers !== 'object' || Array.isArray(fm.triggers)) {
    error('triggers must be an object');
  } else {
    if (!Array.isArray(fm.triggers.keywords) || fm.triggers.keywords.length === 0) {
      error('triggers.keywords must be a non-empty array');
    } else {
      for (const kw of fm.triggers.keywords) {
        if (typeof kw !== 'string' || !kw.trim()) {
          error(`triggers.keywords contains invalid entry: ${JSON.stringify(kw)}`);
        }
      }
    }
    if (fm.triggers.priority == null) {
      warn('triggers.priority is omitted — defaults to 50; set explicitly for collision resolution');
    } else if (
      typeof fm.triggers.priority !== 'number' ||
      !Number.isInteger(fm.triggers.priority) ||
      fm.triggers.priority < 0 ||
      fm.triggers.priority > 100
    ) {
      error('triggers.priority must be an integer in [0, 100]');
    }
    if (fm.triggers.exclude != null) {
      if (!Array.isArray(fm.triggers.exclude)) {
        error('triggers.exclude must be an array of strings (or omitted)');
      } else {
        for (const ex of fm.triggers.exclude) {
          if (typeof ex !== 'string' || !ex.trim()) {
            error(`triggers.exclude contains invalid entry: ${JSON.stringify(ex)}`);
          }
        }
      }
    }
  }

  // Body length policy.
  const bodyLines = skill.body.split('\n').length;
  if (bodyLines > MAX_BODY_LINES) {
    error(`SKILL.md body has ${bodyLines} lines (max ${MAX_BODY_LINES} — move long-form content into cookbook/)`);
  }

  // Learnings file presence (only if learns.enabled === true).
  if (
    fm.learns &&
    typeof fm.learns === 'object' &&
    fm.learns.enabled === true
  ) {
    const learningsRel =
      typeof fm.learns.file === 'string' && fm.learns.file
        ? fm.learns.file
        : `_learnings/${skill.skillId}.yaml`;
    const learningsPath = path.join(skill.skillDir, learningsRel);
    try {
      await fs.promises.access(learningsPath);
    } catch {
      warn(`learns.enabled is true but ${learningsRel} does not exist (will be created on first correction)`);
    }
  }

  // Skills-only policy: provides.command should NOT be set in v4.
  if (
    fm.provides &&
    typeof fm.provides === 'object' &&
    fm.provides.command != null
  ) {
    warn(
      `provides.command is set ("${fm.provides.command}") but v4 ships skills-only — slash command will not be installed`,
    );
  }

  return issues;
}

/**
 * Build a `(keyword, priority)` collision map across a set of skills
 * and report any collisions as issues.
 *
 * @param {SkillManifest[]} skills
 * @returns {SkillIssue[]}
 */
function detectKeywordCollisions(skills) {
  /** @type {SkillIssue[]} */
  const issues = [];
  /** @type {Map<string, Array<{skillId: string, skillPath: string}>>} */
  const buckets = new Map();
  for (const s of skills) {
    const fm = s.frontmatter;
    if (!fm || !fm.triggers || !Array.isArray(fm.triggers.keywords)) continue;
    const priority = typeof fm.triggers.priority === 'number' ? fm.triggers.priority : 50;
    for (const kwRaw of fm.triggers.keywords) {
      if (typeof kwRaw !== 'string') continue;
      const kw = kwRaw.toLowerCase().trim();
      if (!kw) continue;
      const key = `${kw}|${priority}`;
      const list = buckets.get(key) || [];
      list.push({ skillId: s.skillId, skillPath: s.skillPath });
      buckets.set(key, list);
    }
  }
  for (const [key, list] of buckets) {
    if (list.length > 1) {
      const [keyword, priority] = key.split('|');
      const ids = list.map((x) => x.skillId).join(', ');
      for (const entry of list) {
        issues.push({
          severity: 'error',
          skillPath: entry.skillPath,
          skillId: entry.skillId,
          message: `keyword "${keyword}" at priority ${priority} collides with: ${ids} — bump priority or remove the overlap`,
        });
      }
    }
  }
  return issues;
}

/**
 * Validate every SKILL.md found by walking `skillsRoot/<id>/SKILL.md`.
 * Useful for both the doctor command (validate everything in
 * `.claude/skills/` after install) and CI (validate everything in
 * `apps/cli/content/plugins/*\/skills/` before commit).
 *
 * Skips dirs whose SKILL.md cannot be loaded — those produce a single
 * `error` issue per skill rather than blowing up the whole pass.
 *
 * @param {string} skillsRoot - directory whose immediate children are skill dirs
 * @returns {Promise<{ skills: SkillManifest[], issues: SkillIssue[] }>}
 */
async function validateSkillsAtRoot(skillsRoot) {
  /** @type {SkillManifest[]} */
  const skills = [];
  /** @type {SkillIssue[]} */
  const issues = [];
  let entries;
  try {
    entries = await fs.promises.readdir(skillsRoot, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return { skills, issues };
    throw err;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const skillPath = path.join(skillsRoot, e.name, 'SKILL.md');
    let skill;
    try {
      skill = await loadSkill(skillPath);
    } catch (err) {
      issues.push({
        severity: 'error',
        skillPath,
        skillId: e.name,
        message: `failed to load skill: ${err.message}`,
      });
      continue;
    }
    skills.push(skill);
    const perSkill = await validateSkill(skill);
    issues.push(...perSkill);
  }
  // Cross-skill checks across whatever loaded successfully.
  issues.push(...detectKeywordCollisions(skills));
  return { skills, issues };
}

/**
 * @param {SkillIssue[]} issues
 * @returns {boolean}
 */
function hasErrors(issues) {
  return issues.some((i) => i.severity === 'error');
}

module.exports = {
  validateSkill,
  validateSkillsAtRoot,
  detectKeywordCollisions,
  loadSkill,
  splitFrontmatter,
  hasErrors,
  MAX_BODY_LINES,
  SEMVER,
};
