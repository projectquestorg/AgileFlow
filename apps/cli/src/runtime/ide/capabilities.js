/**
 * IDE / CLI capability declarations.
 *
 * Different agentic IDEs and CLIs support different subsets of the
 * AgileFlow surface. Claude Code is the full-feature target — hooks,
 * skills, subagents, MCP. Cursor / Windsurf support only a subset
 * (mostly MCP, with no formalized hook system). Codex now supports
 * hooks through its experimental config.toml / hooks.json surface, but
 * with a smaller event set than Claude Code. Antigravity appears to
 * support skills and agent workflows, but we have not verified a hook
 * surface yet, so it stays skill/agent-only for now.
 *
 * The installer reads this map to gate plugin content: a plugin's
 * hooks won't be written into a `cursor` install because Cursor has
 * nothing to invoke them; a plugin's skills won't be installed into
 * Windsurf because Windsurf has no skill discovery mechanism. Plugins
 * stay portable — the gate is at install time, not at authoring time.
 *
 * When an IDE adds a feature, bump its capability map here and the
 * existing plugin content starts flowing into it on the next install.
 *
 * Note: the capability values reflect AgileFlow v4's *current*
 * willingness to ship to that IDE. They are conservative for
 * non-Claude-Code targets — it's safer to start with "off" and turn
 * features on as we validate them than to ship features that silently
 * misbehave.
 */

/**
 * @typedef {Object} IdeCapabilities
 * @property {boolean} hooks - whether this IDE can run any AgileFlow hooks
 * @property {string[]} hookEvents - supported lifecycle events
 * @property {boolean} skills - skill discovery + invocation
 * @property {boolean} agents - subagents (Task tool / multi-agent spawning)
 * @property {boolean} interactivePrompts - AskUserQuestion renders as interactive UI
 * @property {boolean} multiAgent - parallel agent spawning via Task tool
 * @property {boolean} sessionRestore - PostCompact hook fires to re-inject context
 * @property {string} settingsFile - path the installer writes IDE config to
 *           (relative to project root)
 * @property {string} skillsDir - path the installer mirrors SKILL.md files
 *           into (relative to project root). Convention: <ide-dotdir>/skills.
 * @property {string} description - human-readable label for the picker
 */

/** @type {Record<string, IdeCapabilities>} */
const IDE_CAPABILITIES = {
  "claude-code": {
    hooks: true,
    hookEvents: ["SessionStart", "PreToolUse", "PostCompact", "Stop"],
    skills: true,
    agents: true,
    interactivePrompts: true,
    multiAgent: true,
    sessionRestore: true,
    settingsFile: ".claude/settings.json",
    skillsDir: ".claude/skills",
    description: "Claude Code",
  },
  cursor: {
    hooks: false,
    hookEvents: [],
    skills: true,
    agents: false,
    interactivePrompts: false,
    multiAgent: false,
    sessionRestore: false,
    settingsFile: ".cursor/settings.json",
    skillsDir: ".cursor/skills",
    description: "Cursor",
  },
  windsurf: {
    hooks: false,
    hookEvents: [],
    skills: true,
    agents: false,
    interactivePrompts: false,
    multiAgent: false,
    sessionRestore: false,
    settingsFile: ".windsurf/settings.json",
    skillsDir: ".windsurf/skills",
    description: "Windsurf",
  },
  codex: {
    hooks: true,
    hookEvents: [
      "SessionStart",
      "PreToolUse",
      "PermissionRequest",
      "PostToolUse",
      "UserPromptSubmit",
      "Stop",
    ],
    skills: true,
    agents: true,
    interactivePrompts: false,
    multiAgent: true,
    sessionRestore: false,
    settingsFile: ".codex/config.toml",
    skillsDir: ".codex/skills",
    description: "Codex",
  },
  antigravity: {
    hooks: false,
    hookEvents: [],
    skills: true,
    agents: true,
    interactivePrompts: false,
    multiAgent: true,
    sessionRestore: false,
    settingsFile: ".antigravity/settings.json",
    skillsDir: ".antigravity/skills",
    description: "Antigravity",
  },
};

const SUPPORTED_IDES = Object.keys(IDE_CAPABILITIES);

/**
 * @param {string} ide
 * @returns {IdeCapabilities}
 * @throws {Error} when the ide is not recognized
 */
function capabilitiesFor(ide) {
  const caps = IDE_CAPABILITIES[ide];
  if (!caps) {
    throw new Error(
      `Unknown IDE "${ide}". Supported: ${SUPPORTED_IDES.join(", ")}`,
    );
  }
  return caps;
}

/**
 * @param {string} ide
 * @param {keyof IdeCapabilities} feature
 * @returns {boolean}
 */
function supports(ide, feature) {
  const caps = IDE_CAPABILITIES[ide];
  if (!caps) return false;
  return Boolean(caps[feature]);
}

/**
 * @param {string[]} ides
 * @returns {Set<string>}
 */
function hookEventsForIdes(ides) {
  const events = new Set();
  for (const ide of ides || []) {
    const caps = IDE_CAPABILITIES[ide];
    if (!caps || !Array.isArray(caps.hookEvents)) continue;
    for (const event of caps.hookEvents) {
      events.add(event);
    }
  }
  return events;
}

module.exports = {
  IDE_CAPABILITIES,
  SUPPORTED_IDES,
  capabilitiesFor,
  supports,
  hookEventsForIdes,
};
