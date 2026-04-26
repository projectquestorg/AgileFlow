/**
 * Claude Code settings.json writer.
 *
 * When the target IDE is `claude-code`, the installer registers our 6
 * hook entry points in `.claude/settings.json` so Claude Code actually
 * invokes them at runtime. We use the unified `npx --no-install
 * agileflow hook <event> [--matcher <m>]` command so the path resolves
 * regardless of how the package is installed.
 *
 * The writer is **non-destructive**: it merges with any existing
 * settings.json. Only AgileFlow-owned hook entries (identified by the
 * `agileflow hook` substring in their command) are replaced; the
 * user's other hook registrations and non-hook fields (permissions,
 * env, etc.) are preserved.
 *
 * On a non-claude-code switch, `removeManagedHooks` strips our entries
 * but leaves the rest of the file alone.
 */
const fs = require('fs');
const path = require('path');

const HOOK_COMMAND_MARKER = 'agileflow hook';
const HOOK_TIMEOUT_SECONDS = 30;

/**
 * The 6 hook registrations we own. Each is `{ event, matcher?, command }`.
 * The `command` is what gets baked into settings.json.
 */
const MANAGED_HOOKS = [
  { event: 'SessionStart', matcher: null, command: 'npx --no-install agileflow hook SessionStart' },
  { event: 'PreToolUse', matcher: 'Bash', command: 'npx --no-install agileflow hook PreToolUse --matcher Bash' },
  { event: 'PreToolUse', matcher: 'Edit', command: 'npx --no-install agileflow hook PreToolUse --matcher Edit' },
  { event: 'PreToolUse', matcher: 'Write', command: 'npx --no-install agileflow hook PreToolUse --matcher Write' },
  { event: 'PreCompact', matcher: null, command: 'npx --no-install agileflow hook PreCompact' },
  { event: 'Stop', matcher: null, command: 'npx --no-install agileflow hook Stop' },
];

const MANAGED_EVENTS = new Set(MANAGED_HOOKS.map((h) => h.event));

/**
 * Detect whether a settings.json hook entry belongs to AgileFlow.
 * @param {*} entry
 */
function isAgileflowEntry(entry) {
  if (!entry || typeof entry !== 'object' || !Array.isArray(entry.hooks)) return false;
  return entry.hooks.some(
    (h) =>
      h &&
      typeof h === 'object' &&
      h.type === 'command' &&
      typeof h.command === 'string' &&
      h.command.includes(HOOK_COMMAND_MARKER),
  );
}

/**
 * Build a fresh entry for one MANAGED_HOOKS row.
 * @param {{ matcher: string|null, command: string }} hook
 */
function buildEntry({ matcher, command }) {
  /** @type {{ matcher?: string, hooks: object[] }} */
  const out = {
    hooks: [
      { type: 'command', command, timeout: HOOK_TIMEOUT_SECONDS },
    ],
  };
  if (matcher) out.matcher = matcher;
  return out;
}

/**
 * Read existing settings.json (or {} if absent / malformed).
 * @param {string} settingsPath
 * @returns {Promise<object>}
 */
async function readExisting(settingsPath) {
  try {
    const raw = await fs.promises.readFile(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    if (err instanceof SyntaxError) return {};
    throw err;
  }
}

/**
 * Atomically write the merged settings.
 * @param {string} settingsPath
 * @param {object} settings
 */
async function writeMerged(settingsPath, settings) {
  await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
  const tmp = path.join(
    path.dirname(settingsPath),
    `.${path.basename(settingsPath)}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`,
  );
  const text = JSON.stringify(settings, null, 2) + '\n';
  try {
    await fs.promises.writeFile(tmp, text, 'utf8');
    await fs.promises.rename(tmp, settingsPath);
  } catch (err) {
    try {
      await fs.promises.unlink(tmp);
    } catch {
      /* swallow */
    }
    throw err;
  }
}

/**
 * Compute the merged settings: drop any existing AgileFlow entries from
 * the events we manage, append our fresh ones in the canonical order,
 * leave everything else alone.
 *
 * @param {object} existing
 * @returns {object}
 */
function mergeManagedHooks(existing) {
  const next = { ...existing };
  const hooks = { ...(existing.hooks && typeof existing.hooks === 'object' ? existing.hooks : {}) };

  for (const event of MANAGED_EVENTS) {
    const prior = Array.isArray(hooks[event]) ? hooks[event] : [];
    // Strip our previous registrations, keep user's other entries.
    const userEntries = prior.filter((e) => !isAgileflowEntry(e));
    const ours = MANAGED_HOOKS.filter((h) => h.event === event).map(buildEntry);
    hooks[event] = [...ours, ...userEntries];
  }

  next.hooks = hooks;
  return next;
}

/**
 * Compute the unmanaged settings: strip AgileFlow entries from every
 * event we manage. Used when switching to a non-claude-code IDE.
 *
 * @param {object} existing
 * @returns {object}
 */
function unmanageHooks(existing) {
  const next = { ...existing };
  if (!existing.hooks || typeof existing.hooks !== 'object') return next;
  const hooks = { ...existing.hooks };
  for (const event of MANAGED_EVENTS) {
    if (!Array.isArray(hooks[event])) continue;
    const userEntries = hooks[event].filter((e) => !isAgileflowEntry(e));
    if (userEntries.length === 0) {
      delete hooks[event];
    } else {
      hooks[event] = userEntries;
    }
  }
  // If hooks ended up with no keys, drop the field entirely.
  if (Object.keys(hooks).length === 0) {
    delete next.hooks;
  } else {
    next.hooks = hooks;
  }
  return next;
}

/**
 * Register the 6 AgileFlow hooks in `<projectRoot>/.claude/settings.json`.
 *
 * @param {string} projectRoot
 * @returns {Promise<string>} absolute path of the written settings file
 */
async function writeClaudeCodeSettings(projectRoot) {
  const settingsPath = path.join(projectRoot, '.claude', 'settings.json');
  const existing = await readExisting(settingsPath);
  const merged = mergeManagedHooks(existing);
  await writeMerged(settingsPath, merged);
  return settingsPath;
}

/**
 * Strip AgileFlow hook registrations from settings.json. If the file
 * ends up empty (no hooks AND no other fields), it's removed; if it
 * still has content, the cleaned version is written back.
 *
 * @param {string} projectRoot
 * @returns {Promise<{ removed: boolean, settingsPath: string|null }>}
 */
async function removeClaudeCodeSettings(projectRoot) {
  const settingsPath = path.join(projectRoot, '.claude', 'settings.json');
  let existing;
  try {
    existing = await readExisting(settingsPath);
  } catch {
    return { removed: false, settingsPath: null };
  }
  const next = unmanageHooks(existing);
  if (Object.keys(next).length === 0) {
    try {
      await fs.promises.unlink(settingsPath);
      return { removed: true, settingsPath };
    } catch (err) {
      if (err.code === 'ENOENT') return { removed: false, settingsPath: null };
      throw err;
    }
  }
  await writeMerged(settingsPath, next);
  return { removed: false, settingsPath };
}

module.exports = {
  writeClaudeCodeSettings,
  removeClaudeCodeSettings,
  mergeManagedHooks,
  unmanageHooks,
  isAgileflowEntry,
  MANAGED_HOOKS,
  MANAGED_EVENTS,
  HOOK_COMMAND_MARKER,
  HOOK_TIMEOUT_SECONDS,
};
