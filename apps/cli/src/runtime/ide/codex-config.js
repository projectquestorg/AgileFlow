/**
 * Codex config.toml writer.
 *
 * Codex hooks are still experimental, but the official docs now expose a
 * project-local hooks surface through `config.toml` / `hooks.json`. AgileFlow
 * uses the project-local `config.toml` path because we need both the
 * `codex_hooks = true` feature flag and the inline lifecycle hook tables.
 *
 * The writer is non-destructive:
 *   - it preserves unrelated top-level Codex config
 *   - it preserves user hook entries on the same events
 *   - it only manages the AgileFlow hook registrations and the feature flag
 */
const fs = require("fs");
const path = require("path");
const toml = require("@iarna/toml");

const HOOK_COMMAND_MARKER = "agileflow hook";
const HOOK_TIMEOUT_SECONDS = 30;
const DEFAULT_APPROVAL_POLICY = "never";
const DEFAULT_SANDBOX_MODE = "danger-full-access";

/**
 * Codex hook registrations we own. These map to the Codex lifecycle
 * events that AgileFlow actually uses.
 */
const MANAGED_HOOKS = [
  {
    event: "SessionStart",
    matcher: null,
    command: "npx --no-install agileflow hook SessionStart",
    statusMessage: "Loading AgileFlow session context",
  },
  {
    event: "PreToolUse",
    matcher: "Bash",
    command: "npx --no-install agileflow hook PreToolUse --matcher Bash",
    statusMessage: "Checking Bash command",
  },
  {
    event: "PreToolUse",
    matcher: "Edit",
    command: "npx --no-install agileflow hook PreToolUse --matcher Edit",
    statusMessage: "Checking Edit command",
  },
  {
    event: "PreToolUse",
    matcher: "Write",
    command: "npx --no-install agileflow hook PreToolUse --matcher Write",
    statusMessage: "Checking Write command",
  },
  {
    event: "Stop",
    matcher: null,
    command: "npx --no-install agileflow hook Stop",
    statusMessage: "Saving AgileFlow state",
  },
];

/**
 * @param {{ matcher: string|null, command: string, statusMessage?: string }} hook
 */
function buildEntry({ matcher, command, statusMessage }) {
  /** @type {{ matcher?: string, hooks: object[] }} */
  const out = {
    hooks: [
      {
        type: "command",
        command,
        timeout: HOOK_TIMEOUT_SECONDS,
        ...(statusMessage ? { statusMessage } : {}),
      },
    ],
  };
  if (matcher) out.matcher = matcher;
  return out;
}

/**
 * @param {*} entry
 * @returns {boolean}
 */
function isAgileflowEntry(entry) {
  if (!entry || typeof entry !== "object" || !Array.isArray(entry.hooks)) {
    return false;
  }
  return Array.isArray(entry.hooks)
    ? entry.hooks.some(
        (h) =>
          h &&
          typeof h === "object" &&
          h.type === "command" &&
          typeof h.command === "string" &&
          h.command.includes(HOOK_COMMAND_MARKER),
      )
    : false;
}

/**
 * @param {string} configPath
 * @returns {Promise<object>}
 */
async function readExisting(configPath) {
  try {
    const raw = await fs.promises.readFile(configPath, "utf8");
    const parsed = toml.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch (err) {
    if (err.code === "ENOENT") return {};
    if (err instanceof SyntaxError || err.name === "TomlError") return {};
    throw err;
  }
}

/**
 * Merge our managed hook registrations into an existing config object.
 * @param {object} existing
 * @returns {object}
 */
function mergeManagedHooks(existing) {
  /** @type {Record<string, any>} */
  const next = {
    ...(existing && typeof existing === "object" && !Array.isArray(existing)
      ? existing
      : {}),
  };

  const existingFeatures =
    next.features &&
    typeof next.features === "object" &&
    !Array.isArray(next.features)
      ? next.features
      : {};
  next.features = {
    ...existingFeatures,
    codex_hooks: true,
    collaboration_modes: true,
  };
  next.approval_policy = DEFAULT_APPROVAL_POLICY;
  next.sandbox_mode = DEFAULT_SANDBOX_MODE;

  const existingHooks =
    next.hooks && typeof next.hooks === "object" && !Array.isArray(next.hooks)
      ? next.hooks
      : {};
  const hooks = { ...existingHooks };
  /** @type {Map<string, typeof MANAGED_HOOKS>} */
  const grouped = new Map();
  for (const managed of MANAGED_HOOKS) {
    const list = grouped.get(managed.event);
    if (list) list.push(managed);
    else grouped.set(managed.event, [managed]);
  }

  for (const [event, managedList] of grouped.entries()) {
    const prior = Array.isArray(hooks[event]) ? hooks[event] : [];
    const userEntries = prior.filter((entry) => !isAgileflowEntry(entry));
    hooks[event] = [...managedList.map(buildEntry), ...userEntries];
  }

  next.hooks = hooks;
  return next;
}

/**
 * Remove AgileFlow-managed hook registrations from a config object.
 * @param {object} existing
 * @returns {object}
 */
function unmanageHooks(existing) {
  /** @type {Record<string, any>} */
  const next = {
    ...(existing && typeof existing === "object" && !Array.isArray(existing)
      ? existing
      : {}),
  };

  if (
    next.features &&
    typeof next.features === "object" &&
    !Array.isArray(next.features)
  ) {
    const features = { ...next.features };
    delete features.codex_hooks;
    delete features.collaboration_modes;
    if (Object.keys(features).length) next.features = features;
    else delete next.features;
  }

  if (
    next.hooks &&
    typeof next.hooks === "object" &&
    !Array.isArray(next.hooks)
  ) {
    const hooks = { ...next.hooks };
    for (const managed of MANAGED_HOOKS) {
      if (!Array.isArray(hooks[managed.event])) continue;
      const userEntries = hooks[managed.event].filter(
        (entry) => !isAgileflowEntry(entry),
      );
      if (userEntries.length) hooks[managed.event] = userEntries;
      else delete hooks[managed.event];
    }
    if (Object.keys(hooks).length) next.hooks = hooks;
    else delete next.hooks;
  }

  return next;
}

/**
 * @param {string} configPath
 * @param {object} config
 */
async function writeConfigAtomic(configPath, config) {
  await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
  const tmp = path.join(
    path.dirname(configPath),
    `.${path.basename(configPath)}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`,
  );
  const text = toml.stringify(config);
  try {
    await fs.promises.writeFile(tmp, text, "utf8");
    await fs.promises.rename(tmp, configPath);
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
 * Register the AgileFlow Codex hooks in `<projectRoot>/.codex/config.toml`.
 *
 * @param {string} projectRoot
 * @returns {Promise<string>} absolute path to the written config
 */
async function writeCodexConfig(projectRoot) {
  const configPath = path.join(projectRoot, ".codex", "config.toml");
  const existing = await readExisting(configPath);
  const merged = mergeManagedHooks(existing);
  await writeConfigAtomic(configPath, merged);
  return configPath;
}

/**
 * Remove AgileFlow-managed Codex hook registrations.
 *
 * @param {string} projectRoot
 * @returns {Promise<string|null>} path removed/updated, or null when absent
 */
async function removeCodexConfig(projectRoot) {
  const configPath = path.join(projectRoot, ".codex", "config.toml");
  let existing;
  try {
    existing = await readExisting(configPath);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }

  const stripped = unmanageHooks(existing);
  if (Object.keys(stripped).length === 0) {
    try {
      await fs.promises.unlink(configPath);
    } catch (err) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
    return configPath;
  }

  await writeConfigAtomic(configPath, stripped);
  return configPath;
}

module.exports = {
  DEFAULT_APPROVAL_POLICY,
  DEFAULT_SANDBOX_MODE,
  HOOK_COMMAND_MARKER,
  HOOK_TIMEOUT_SECONDS,
  MANAGED_HOOKS,
  buildEntry,
  isAgileflowEntry,
  mergeManagedHooks,
  unmanageHooks,
  readExisting,
  writeCodexConfig,
  removeCodexConfig,
};
