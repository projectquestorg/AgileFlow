/**
 * IDE / CLI capability declarations.
 *
 * Different agentic IDEs and CLIs support different subsets of the
 * AgileFlow surface. Claude Code is the full-feature target — hooks,
 * skills, slash commands, subagents, MCP. Cursor / Windsurf / Codex
 * support only a subset (mostly slash commands and MCP, with no
 * formalized hook system).
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
 * @property {boolean} hooks - SessionStart / PreToolUse / etc. hooks
 * @property {boolean} skills - skill discovery + invocation
 * @property {boolean} commands - slash commands
 * @property {boolean} agents - subagents
 * @property {boolean} mcp - MCP server registration
 * @property {string} settingsFile - path the installer writes IDE config to
 *           (relative to project root)
 * @property {string} description - human-readable label for the picker
 */

/** @type {Record<string, IdeCapabilities>} */
const IDE_CAPABILITIES = {
  'claude-code': {
    hooks: true,
    skills: true,
    commands: true,
    agents: true,
    mcp: true,
    settingsFile: '.claude/settings.json',
    description: 'Anthropic Claude Code (full feature set)',
  },
  cursor: {
    hooks: false,
    skills: false,
    commands: true,
    agents: false,
    mcp: true,
    settingsFile: '.cursor/settings.json',
    description: 'Cursor IDE (slash commands + MCP only)',
  },
  windsurf: {
    hooks: false,
    skills: false,
    commands: true,
    agents: false,
    mcp: false,
    settingsFile: '.windsurf/settings.json',
    description: 'Windsurf (slash commands only)',
  },
  codex: {
    hooks: false,
    skills: false,
    commands: false,
    agents: false,
    mcp: false,
    settingsFile: '.codex/settings.json',
    description: 'OpenAI Codex CLI (limited integration)',
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
      `Unknown IDE "${ide}". Supported: ${SUPPORTED_IDES.join(', ')}`,
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

module.exports = {
  IDE_CAPABILITIES,
  SUPPORTED_IDES,
  capabilitiesFor,
  supports,
};
