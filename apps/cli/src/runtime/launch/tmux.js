/**
 * tmux session orchestration for `agileflow launch`.
 *
 * Slice 2b: wrap the user's AI CLI in a per-cwd tmux session so
 * detach/reattach work like the v3 `af` script. Multiple `agileflow
 * launch` invocations from the same directory either reattach to an
 * existing detached session, or — if one is already attached — spawn
 * a numbered sibling (`<cli>-<dir>`, `<cli>-<dir>-2`, etc.).
 *
 * Everything that shells out to tmux goes through the `runner` parameter
 * (default: child_process), so unit tests can drive every code path
 * without a real tmux daemon. The orchestrator also threads the
 * preferred status-bar position from launch-prefs.json onto the session
 * after it's created.
 *
 * What this module deliberately does NOT do (deferred):
 *   - keybind preset files (.tmux.conf snippets for default/minimal/none)
 *   - freeze recovery, kill, list subcommands
 *   - multi-pane / worktree session creation (Alt+N etc.)
 */
const path = require("path");
const child_process = require("child_process");

const { commandExists: realCommandExists } = require("../../lib/path-check.js");
const { signalToExitCode } = require("./spawn.js");
const { resolveAgileflowBin } = require("./alias-installer.js");
const tabs = require("./tabs.js");

/**
 * @typedef {Object} TmuxLaunchResult
 * @property {number} exitCode                       - exit code of the attach (or session creation on failure)
 * @property {NodeJS.Signals | null} [signal]        - signal that terminated the attach, when applicable
 */

/**
 * @typedef {Object} TmuxRunSyncResult
 * @property {number} status                         - subprocess exit status (1 when spawn itself failed)
 * @property {string} stdout
 * @property {string} stderr
 * @property {Error | null} error                    - non-null when spawn ITSELF failed (e.g., ENOENT)
 */

/**
 * @typedef {Object} TmuxRunner
 * @property {(args: string[]) => TmuxRunSyncResult} runSync                                     - non-interactive tmux commands
 * @property {(args: string[]) => Promise<{ exitCode: number, signal: NodeJS.Signals | null }>} runAttach  - interactive `tmux attach` (foreground, stdio inherited)
 */

/**
 * Return true when the current process is already inside a tmux client.
 * tmux exports `$TMUX` containing the socket path + session id; we treat
 * any non-empty value as "inside". Callers should NOT nest sessions.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function isInsideTmux(env = process.env) {
  return typeof env.TMUX === "string" && env.TMUX.length > 0;
}

/**
 * Whether `tmux` resolves on PATH. Injectable for tests.
 *
 * @param {(name: string) => boolean} [exists]
 * @returns {boolean}
 */
function tmuxAvailable(exists = realCommandExists) {
  return exists("tmux");
}

/**
 * Derive a tmux session name from the AI CLI id and the current working
 * directory. tmux session names can't contain `:` or `.`; we also strip
 * other shell-noisy characters so names stay tab-completable.
 *
 * @param {string} cli  - e.g. "claude" / "codex"
 * @param {string} cwd  - absolute path; the basename is what's used
 * @returns {string}
 */
function baseSessionName(cli, cwd) {
  const dir = path.basename(cwd).replace(/[^A-Za-z0-9_-]+/g, "_") || "root";
  return `${cli}-${dir}`;
}

/**
 * Walk `<base>`, `<base>-2`, `<base>-3`, ... until one is unused (per
 * `exists()`) — used to spawn a parallel session when the canonical name
 * is already attached. Caller decides whether to attach to an existing
 * detached session or always create new.
 *
 * @param {string} base
 * @param {(name: string) => boolean} exists
 * @param {number} [max] - safety bound; defaults to 32
 * @returns {string}
 */
function nextFreeSessionName(base, exists, max = 32) {
  if (!exists(base)) return base;
  for (let i = 2; i <= max; i++) {
    const candidate = `${base}-${i}`;
    if (!exists(candidate)) return candidate;
  }
  // Fall back to base — caller will see a tmux "duplicate session" error
  // rather than us silently picking a 33rd session. Surfacing the failure
  // is better than masking it.
  return base;
}

/**
 * @returns {TmuxRunner}
 */
function defaultRunner() {
  return {
    runSync(args) {
      const result = child_process.spawnSync("tmux", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return {
        // spawnSync returns `status: null` when the spawn itself failed
        // (ENOENT etc.). In that case `error` is set; callers must check it
        // before treating status=1 as a real tmux exit code.
        status: typeof result.status === "number" ? result.status : 1,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        error: result.error || null,
      };
    },
    runAttach(args) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, value) => {
          if (settled) return;
          settled = true;
          fn(value);
        };
        let child;
        try {
          child = child_process.spawn("tmux", args, { stdio: "inherit" });
        } catch (err) {
          finish(reject, err);
          return;
        }
        child.on("error", (err) => finish(reject, err));
        child.on("close", (code, signal) => {
          // Mirror spawn.js's signal-to-exit-code table so shell scripts
          // can distinguish SIGINT (130) from SIGTERM (143) etc., instead
          // of all signal exits collapsing to 128.
          const exitCode =
            typeof code === "number" ? code : signalToExitCode(signal);
          finish(resolve, { exitCode, signal: signal || null });
        });
      });
    },
  };
}

/**
 * @param {string} name
 * @param {TmuxRunner} runner
 * @returns {boolean}
 */
function sessionExists(name, runner) {
  const result = runner.runSync(["has-session", "-t", `=${name}`]);
  return result.status === 0;
}

/**
 * Detect the running tmux's version via `tmux -V`. Returns null when
 * tmux isn't on PATH or its output is unparseable. Pure (no caching);
 * `launchInTmux` calls it once per invocation and threads the result.
 *
 * @param {TmuxRunner} runner
 * @returns {{ major: number, minor: number } | null}
 */
function detectTmuxVersion(runner) {
  const result = runner.runSync(["-V"]);
  if (result.status !== 0) return null;
  return tabs.parseTmuxVersion(result.stdout || "");
}

/**
 * Apply the tab-strip status-format for `sessionName`. Per-session
 * (status-format is one of the options that accepts `-t <session>`),
 * so the user's other tmux sessions are unaffected.
 *
 * On tmux >= 3.2 emits the cascading 5-tier compaction format; on
 * older tmux falls back to a single-tier themed format. Failure is
 * non-fatal — returns `{ applied: false, stderr }` so the caller can
 * surface a warning without aborting the launch.
 *
 * @param {string} sessionName
 * @param {TmuxRunner} runner
 * @param {{
 *   tmuxVersion?: { major: number, minor: number } | null,
 *   theme?: Partial<typeof tabs.DEFAULT_TAB_THEME>,
 *   agileflowBin?: string,
 * }} [opts]
 * @returns {{ applied: boolean, stderr: string }}
 */
function applyTabFormat(sessionName, runner, opts = {}) {
  const theme = { ...tabs.DEFAULT_TAB_THEME, ...(opts.theme || {}) };
  // Use the standard per-window formats instead of overriding the full
  // status-format[0] — broader tmux compatibility, and tmux silently
  // ignores invalid status-format expressions on some versions, which
  // makes overrides hard to debug. window-status-format works on every
  // tmux 2.0+.
  // jakobwesthoff/tmux-from-scratch inspired styling: active tab is a
  // rounded "pill" (Powerline half-round glyphs) over a lighter
  // background, with brand-orange accent on the index:name separator
  // colon. Inactive tabs are plain text with the same accent colon.
  // Session name appears as a rounded pill on the left, hostname as
  // a rounded pill on the right.
  //
  // Requires a Nerd Font / Powerline-patched font in the user's
  // terminal. Without one the glyphs render as tofu boxes; users on
  // a vanilla font can switch back via a future `tabStyle: "flat"`
  // pref.
  const HALF_ROUND_OPEN = ""; //
  const HALF_ROUND_CLOSE = ""; //
  const TRIANGLE_OPEN = ""; //
  const TRIANGLE_CLOSE = ""; //
  const BG = theme.stripBg;
  const PILL_BG = theme.activeNameBg;
  const ACCENT = theme.activeBg;
  const FG = theme.activeNameFg;

  // Active tab uses the BRAND ACCENT (orange) as its pill background
  // with the strip's dark color as text — maximum contrast against
  // the muted inactive tabs so the user always knows which tab is
  // focused after Alt+1..9 / Alt+Tab.
  const inactiveFormat = ` #I:#W `;
  const activeFormat =
    `#[fg=${ACCENT},bg=${BG}]${HALF_ROUND_OPEN}` +
    `#[bg=${ACCENT},fg=${theme.activeFg},bold] #I:#W ` +
    `#[fg=${ACCENT},bg=${BG}]${HALF_ROUND_CLOSE}`;
  const statusLeft =
    `#[fg=${PILL_BG},bg=${BG}]${HALF_ROUND_OPEN}` +
    `#[bg=${PILL_BG},fg=${ACCENT}] #S ` +
    `#[fg=${PILL_BG},bg=${BG}]${TRIANGLE_CLOSE}`;
  const statusRight =
    `#[fg=${PILL_BG},bg=${BG}]${TRIANGLE_OPEN}` +
    `#[bg=${PILL_BG},fg=${ACCENT}] #h ` +
    `#[fg=${PILL_BG},bg=${BG}]${HALF_ROUND_CLOSE}`;

  // Reduce escape-time so pressing Esc inside command-prompt (Alt+n
  // worktree-name prompt, etc.) cancels immediately. tmux's default
  // is 500ms — it waits for a follow-up key in case Esc is the start
  // of an Alt+key sequence. 0ms is "treat Esc as Esc immediately"
  // and matches what most modern terminals support.
  runner.runSync(["set-option", "-sg", "escape-time", "0"]);
  // Force emacs key bindings in the command-prompt so Esc cancels
  // the prompt instead of entering vi-normal mode (which makes the
  // prompt look like it changed color but never closes). If the
  // user's .tmux.conf set status-keys vi globally, our per-session
  // override wins for AgileFlow sessions.
  runner.runSync(["set-option", "-g", "status-keys", "emacs"]);
  runner.runSync(["set-option", "-g", "mode-keys", "emacs"]);

  // Apply each option with the correct tmux scope. Session-scope opts
  // (status-style, status-left/right, status-justify) take
  // `-t <session>`. Window-scope opts (window-status-format,
  // window-status-current-format, window-status-separator) take
  // `-wg` so every window in every session picks them up. Earlier
  // code applied ALL options with `-t session`, which made tmux
  // silently ignore the window-scope ones — the visible symptom
  // was tmux's default green status bar surviving on every session.
  const ops = [
    {
      scope: "session",
      option: "status-style",
      value: `bg=${BG},fg=${theme.inactiveFg}`,
    },
    { scope: "session", option: "status-justify", value: "centre" },
    { scope: "session", option: "status-left", value: statusLeft },
    { scope: "session", option: "status-left-length", value: "100" },
    { scope: "session", option: "status-right", value: statusRight },
    { scope: "session", option: "status-right-length", value: "100" },
    // Number windows from 1 so Alt+1 maps to the first tab (matches
    // Chrome's Ctrl+1 mental model). Tmux default is base-index 0,
    // which means Alt+1 with no other tabs open does nothing.
    { scope: "session", option: "base-index", value: "1" },
    // Keep tab indices contiguous after a close — without this,
    // closing window 2 leaves indices 1, 3, 4 and Alt+2 becomes
    // dead. tmux renumbers on close so Alt+1..N always works.
    { scope: "session", option: "renumber-windows", value: "on" },
    { scope: "window-global", option: "window-status-separator", value: "" },
    {
      scope: "window-global",
      option: "window-status-format",
      value: inactiveFormat,
    },
    {
      scope: "window-global",
      option: "window-status-current-format",
      value: activeFormat,
    },
  ];
  let lastResult = { status: 0, stderr: "" };
  const failures = [];
  for (const { scope, option, value } of ops) {
    const args =
      scope === "session"
        ? ["set-option", "-t", sessionName, option, value]
        : ["set-option", "-wg", option, value];
    const r = runner.runSync(args);
    lastResult = r;
    if (r.status !== 0) {
      failures.push({ option, stderr: (r.stderr || "").trim() });
    }
  }
  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `agileflow launch: tab strip styling — ${failures.length} of ${ops.length} options rejected by tmux:`,
    );
    for (const f of failures) {
      // eslint-disable-next-line no-console
      console.error(`  ${f.option}: ${f.stderr || "(no error message)"}`);
    }
  }
  return {
    applied: lastResult.status === 0,
    stderr: lastResult.stderr || "",
  };
}

/**
 * Install per-session tmux hooks that fire whenever the window layout
 * changes (new tab, close, rename). Each hook invokes the
 * `__snapshot-session` callback so the registry's `windows` array
 * stays current — that's what restore replays after a reboot.
 *
 * Kept separate from `applyTabFormat` so the restore path can replay
 * the saved windows BEFORE installing hooks (otherwise the new-window
 * calls during replay would fire window-linked, clobbering the saved
 * snapshot with a partial mid-replay state).
 *
 * Scoped per-session via `-t` so non-AgileFlow sessions on the same
 * tmux server aren't touched.
 *
 * @param {string} sessionName
 * @param {TmuxRunner} runner
 * @param {{ agileflowBin?: string }} [opts]
 */
function installSessionHooks(sessionName, runner, opts = {}) {
  const agileflowBin = opts.agileflowBin || resolveAgileflowBin();
  // Double-quote the binary path and session name so paths with
  // spaces (e.g., /Users/x with space/agileflow) work. The shell
  // command is itself wrapped in double quotes for run-shell to
  // accept it as a single argument.
  const shellCmd = `"${agileflowBin}" launch __snapshot-session "${sessionName}"`;
  const snapshotCmd = `run-shell -b "${shellCmd.replace(/"/g, '\\"')}"`;
  /** @type {Array<{ event: string, stderr: string }>} */
  const failures = [];
  // tmux 3.x hook names: `window-linked` and `window-unlinked` fire
  // on add/remove. There is NO `window-renamed` event — that name is
  // silently accepted by set-hook but never fires. The correct hook
  // for rename is `after-rename-window` (the "after-<command>" family
  // fires whenever the named command runs from any source).
  for (const event of [
    "window-linked",
    "window-unlinked",
    "after-rename-window",
  ]) {
    const r = runner.runSync([
      "set-hook",
      "-t",
      sessionName,
      event,
      snapshotCmd,
    ]);
    if (r.status !== 0) {
      failures.push({ event, stderr: (r.stderr || "").trim() });
    }
  }
  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `agileflow launch: tab persistence — ${failures.length} of 3 tmux hooks failed to install:`,
    );
    for (const f of failures) {
      // eslint-disable-next-line no-console
      console.error(`  ${f.event}: ${f.stderr || "(no error message)"}`);
    }
  }
}

/**
 * Create a new detached tmux session that immediately runs `bin args...`.
 * Returns the runner's exit status (0 on success).
 *
 * @param {{ name: string, bin: string, args: string[], cwd?: string, statusPosition?: string }} opts
 * @param {TmuxRunner} runner
 * @returns {{ status: number, stderr: string }}
 */
function createSession(opts, runner) {
  const args = ["new-session", "-d", "-s", opts.name];
  if (opts.cwd) args.push("-c", opts.cwd);
  args.push(opts.bin, ...opts.args);
  const result = runner.runSync(args);
  if (result.status === 0 && opts.statusPosition) {
    // Per-session option; safe even if the user has a global tmux config.
    runner.runSync([
      "set-option",
      "-t",
      opts.name,
      "status-position",
      opts.statusPosition,
    ]);
  }
  return {
    status: result.status,
    stderr: result.stderr,
    // Propagate the spawn-itself-failed error so callers can re-throw
    // ENOENT (= tmux not on PATH, e.g., TOCTOU after tmuxAvailable()
    // succeeded) instead of masking it as a generic tmux failure.
    error: result.error || null,
  };
}

/**
 * Attach to an existing session in the foreground. Returns the user's
 * exit code from the attach (typically 0 on clean detach).
 *
 * @param {string} name
 * @param {TmuxRunner} runner
 * @returns {Promise<TmuxLaunchResult>}
 */
async function attachSession(name, runner) {
  const result = await runner.runAttach(["attach-session", "-t", name]);
  return { exitCode: result.exitCode, signal: result.signal || null };
}

/**
 * Keybinds to install per preset. Each entry is the argv suffix passed
 * to `tmux bind-key`, expanded with `-T root -t <session>` at apply
 * time. The `-T root` table means keys fire WITHOUT the tmux prefix
 * (typically Ctrl+B), so users get the v3 `af` script's "tap Alt+q
 * to detach" feel rather than the stock tmux "prefix then bind".
 *
 * Keep this list narrow: every binding has to work with stock tmux,
 * no external helper scripts. Worktree / same-dir spawn shortcuts
 * (the old Alt+N / Alt+S) require shell helpers that don't exist in
 * v4 yet; they'll come in a follow-up slice.
 *
 * @typedef {Object} KeybindEntry
 * @property {string} key      - tmux key spec, e.g. "M-q" (Alt+q)
 * @property {string[]} action - tmux command args, e.g. ["detach-client"]
 * @property {string} hint     - human description; surfaced in errors if a bind fails
 */

/** @type {Record<string, KeybindEntry[]>} */
const KEYBIND_PRESET_BINDINGS = {
  default: [
    {
      key: "M-q",
      action: ["detach-client"],
      hint: "Alt+q → detach",
    },
    {
      // Soft interrupt — send Ctrl+C twice to the foreground pane.
      // Mirrors v3 `af`'s "if Claude is hung, gently nudge it" behavior.
      key: "M-k",
      action: ["send-keys", "C-c", "C-c"],
      hint: "Alt+k → send Ctrl+C twice (soft interrupt)",
    },
    {
      key: "M-K",
      action: ["kill-pane"],
      hint: "Alt+Shift+k → force kill the current pane",
    },
    {
      key: "M-r",
      action: ["respawn-pane", "-k"],
      hint: "Alt+r → respawn the current pane",
    },
    {
      // Spawn a parallel same-dir session and switch to it. The bound CLI
      // runs `agileflow launch new` which creates the session detached
      // and calls tmux switch-client — so the user's pane swaps to it.
      // `%AGILEFLOW%` is substituted at apply time with the actual binary
      // path so this works for dogfooded `node bin/agileflow.js` as well
      // as PATH-installed `agileflow`.
      key: "M-s",
      action: ["run-shell", "%AGILEFLOW% launch new"],
      hint: "Alt+s → spawn a same-dir parallel session",
    },
    {
      // Open a fresh tmux window and run the agileflow CLI with the
      // `--prompt` flag. The CLI uses Clack to read the worktree name
      // from a real TTY — no shell substitution involved.
      //
      // Previous design used `command-prompt -p '...' "run-shell
      // '%AGILEFLOW% launch new \"%%\"'"`, which substituted %% INTO
      // the run-shell argument BEFORE shell parsing. A user typing
      // `name"; rm -rf ~; #` would get arbitrary shell execution.
      // The new design routes input through stdin to a Node process
      // that never touches a shell, so injection is impossible.
      key: "M-n",
      action: ["new-window", "%AGILEFLOW% launch new --prompt"],
      hint: "Alt+n → prompt for a name, create a worktree, spawn there",
    },
    // v3-equivalent tab (tmux window) keybinds. Living in a separate
    // module so the format builder + keybind table stay testable in
    // isolation; spread into the default preset so they participate in
    // the same apply / unbind sweep as everything else.
    ...tabs.TAB_KEYBINDS,
  ],
  minimal: [
    {
      key: "M-q",
      action: ["detach-client"],
      hint: "Alt+q → detach",
    },
  ],
  none: [],
};

/**
 * Install the chosen keybind preset. tmux `bind-key` is server-wide
 * (the command doesn't accept `-t <session>`), so applying a preset
 * affects every tmux client on the same server, not just sessions
 * created by `agileflow launch`. This mirrors the v3 `af` script and is
 * the standard tmux config pattern — users who want isolation pick the
 * "none" preset.
 *
 * Bindings go in the `root` table so keys fire without the tmux prefix
 * (typically Ctrl+B), giving the v3 "tap Alt+q to detach" feel.
 *
 * Failures are not fatal: `tmux bind-key` either succeeds or the caller
 * gets a `failures` list to surface as a warning. Returning a
 * structured result keeps the function pure-ish — no console output
 * inside tmux.js.
 *
 * @param {string} preset      - one of "default" | "minimal" | "none"
 * @param {TmuxRunner} runner
 * @returns {{ applied: number, failures: { hint: string, stderr: string }[] }}
 */
/**
 * Union of all keys touched by any preset. Used to clear stale binds
 * before installing the chosen preset, so switching from "default" to
 * "minimal" doesn't leave Alt+k/Alt+K/Alt+r from the previous run
 * still active in the tmux server. Recomputed once at module load so
 * adding a binding to a preset automatically extends the unbind sweep.
 */
const ALL_PRESET_KEYS = (() => {
  const set = new Set();
  for (const list of Object.values(KEYBIND_PRESET_BINDINGS)) {
    for (const b of list) set.add(b.key);
  }
  return [...set];
})();

/**
 * Substitute `%AGILEFLOW%` in a key binding's action with the actual
 * binary path. Pure helper so tests can pin the substitution result.
 *
 * @param {string[]} action
 * @param {string} agileflowBin
 * @returns {string[]}
 */
function substituteBinding(action, agileflowBin) {
  return action.map((arg) =>
    typeof arg === "string" ? arg.replace(/%AGILEFLOW%/g, agileflowBin) : arg,
  );
}

/**
 * @param {string} preset
 * @param {TmuxRunner} runner
 * @param {{ agileflowBin?: string }} [opts]
 * @returns {{ applied: number, failures: { hint: string, stderr: string }[] }}
 */
function applyKeybindPreset(preset, runner, opts = {}) {
  const bindings = KEYBIND_PRESET_BINDINGS[preset] || [];
  let applied = 0;
  /** @type {{ hint: string, stderr: string }[]} */
  const failures = [];

  // Resolve the agileflow binary path once per preset apply. Falls back
  // to the literal string "agileflow" if argv[1] isn't a real file
  // (matches the alias-installer convention).
  const agileflowBin = opts.agileflowBin || resolveAgileflowBin();

  // Idempotent reset: unbind every key any preset could install BEFORE
  // applying the new set. Without this, switching default → minimal
  // leaves Alt+k/Alt+K/Alt+r from the previous run still bound (tmux's
  // `bind-key` is server-wide and persists across sessions). Unbinding
  // a key that wasn't bound is harmless — tmux exits non-zero with a
  // "key not found" but we don't care; the post-state is the same.
  for (const key of ALL_PRESET_KEYS) {
    runner.runSync(["unbind-key", "-T", "root", key]);
  }

  for (const b of bindings) {
    const action = substituteBinding(b.action, agileflowBin);
    const result = runner.runSync(["bind-key", "-T", "root", b.key, ...action]);
    if (result.status === 0) {
      applied++;
    } else {
      failures.push({ hint: b.hint, stderr: result.stderr || "" });
    }
  }
  return { applied, failures };
}

/**
 * List existing session names belonging to a specific CLI.
 *
 * Uses `tmux ls -F '#{session_name}'` and filters by the `<cli>-`
 * prefix our `baseSessionName` produces. Returns an empty array if no
 * tmux server is running (tmux ls exits non-zero), the call fails, or
 * no sessions match.
 *
 * @param {string} cli
 * @param {TmuxRunner} runner
 * @returns {string[]}
 */
function listSessionsForCli(cli, runner) {
  const result = runner.runSync(["ls", "-F", "#{session_name}"]);
  if (result.status !== 0 || !result.stdout) return [];
  const prefix = `${cli}-`;
  return result.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.startsWith(prefix));
}

/**
 * Kill a tmux session by name. Returns true on success, false on any
 * tmux error (already gone, permission, etc.) — caller decides whether
 * to surface the failure.
 *
 * @param {string} name
 * @param {TmuxRunner} runner
 * @returns {boolean}
 */
function killSession(name, runner) {
  const result = runner.runSync(["kill-session", "-t", `=${name}`]);
  return result.status === 0;
}

/**
 * Top-level orchestrator: pick a session name, ensure it exists with
 * the user's CLI running inside it, then attach. If the canonical name
 * is already attached elsewhere, spawn a numbered sibling.
 *
 * Caller has already verified tmux is available and we're not nested.
 *
 * @param {{
 *   bin: string,
 *   args?: string[],
 *   cwd?: string,
 *   statusPosition?: string,
 *   keybindPreset?: string,
 *   runner?: TmuxRunner,
 *   log?: (msg: string) => void,
 * }} opts
 * @returns {Promise<TmuxLaunchResult>}
 */
async function launchInTmux(opts) {
  const runner = opts.runner || defaultRunner();
  const cwd = opts.cwd || process.cwd();
  const base = baseSessionName(path.basename(opts.bin), cwd);
  // Narration: tells the user whether they're resuming an existing
  // session (their context survives) or starting fresh. Defaults to
  // stderr so it doesn't pollute scripts that pipe stdout. Injectable
  // for tests; pass a no-op `log` to silence.
  const log =
    typeof opts.log === "function"
      ? opts.log
      : (msg) => {
          // eslint-disable-next-line no-console
          console.error(msg);
        };

  // Reattach to the canonical session if it exists. tmux's `attach-session`
  // is the right command for both "exists detached" and "exists attached"
  // — the latter steals or shares the session, mirroring v3 `af` behavior.
  // If the user wants a fresh parallel session, they use `launch --new` (slice 2c).
  // Detect tmux version once per invocation; threaded into the tab
  // format builder so we can degrade to a single-tier format on tmux
  // < 3.2 instead of emitting `#{e|...}` operators it doesn't understand.
  const tmuxVersion = detectTmuxVersion(runner);

  const existsSync = (name) => sessionExists(name, runner);
  if (existsSync(base)) {
    // Apply prefs on every attach — cheap, and keeps the session in sync
    // if the user changed their pref since the session was created.
    if (opts.statusPosition) {
      runner.runSync([
        "set-option",
        "-t",
        base,
        "status-position",
        opts.statusPosition,
      ]);
    }
    if (opts.keybindPreset) {
      // Always invoke applyKeybindPreset — even for "none" — so the
      // unbind sweep runs and clears any leftover binds from a previous
      // "default" or "minimal" run. Without this, switching default → none
      // leaves Alt+k/Alt+K/Alt+r still bound in the tmux server.
      const result = applyKeybindPreset(opts.keybindPreset, runner);
      for (const f of result.failures) {
        log(`agileflow launch: keybind skipped — ${f.hint}`);
      }
    }
    // Re-apply the tab strip every attach so prefs / theme changes
    // since session creation take effect (and so a session created by
    // an older agileflow without a strip picks one up on reattach).
    // Single dark status line — the tab strip on line[0] replaces
    // tmux's default green status bar entirely.
    runner.runSync(["set-option", "-t", base, "status", "1"]);
    applyTabFormat(base, runner, { tmuxVersion });
    installSessionHooks(base, runner);
    log(`agileflow launch: resuming session ${base}`);
    return attachSession(base, runner);
  }

  // No existing session — create fresh. Run the agileflow `__exec`
  // wrapper instead of the raw CLI so the per-CLI resume strategy
  // fires (claude `--resume <uuid>` etc.) and so the session is
  // recorded in the cross-reboot registry. The wrapper reads the
  // session name from argv to look itself up in the registry.
  // `base` is confirmed free above; no `nextFreeSessionName` walk needed.
  // Lazy-load to avoid a require cycle (session-registry → tmux is fine,
  // but record-on-create wants the registry which depends on this module
  // transitively via parallel-session).
  const { recordSession } = require("./session-registry.js");
  const agileflowBin = resolveAgileflowBin();
  const name = base;
  const cliId = path.basename(opts.bin);
  recordSession({
    name,
    cli: cliId,
    cwd,
    uuid: null,
    // new-session creates the wrapper at index 0 (default base-index
    // before we change it). Restore replay skips this index so we
    // don't duplicate the wrapper window.
    wrapperWindowIndex: 0,
  });
  const create = createSession(
    {
      name,
      bin: agileflowBin,
      args: ["launch", "__exec", name],
      cwd,
      statusPosition: opts.statusPosition,
    },
    runner,
  );
  if (create.status !== 0) {
    // Spawn-itself-failed: tmux disappeared between tmuxAvailable() and
    // here. Re-throw the original ENOENT so launch.js's existing TOCTOU
    // branch can produce the install-or-reconfigure suggestion.
    if (create.error) throw create.error;

    // Concurrent-launch race: another `agileflow launch` from the same
    // cwd created the session between our existsSync probe and our
    // new-session call. The session exists now and is what the user
    // wanted; just attach to it instead of surfacing a misleading
    // "duplicate session" error. Apply the same setup the non-racey
    // reattach path does (keybinds + status height + tab format) so
    // the race-recovered user gets the same UX as everyone else.
    if (sessionExists(name, runner)) {
      log(`agileflow launch: resuming session ${name} (race-recovered)`);
      if (opts.statusPosition) {
        runner.runSync([
          "set-option",
          "-t",
          name,
          "status-position",
          opts.statusPosition,
        ]);
      }
      if (opts.keybindPreset) {
        const result = applyKeybindPreset(opts.keybindPreset, runner);
        for (const f of result.failures) {
          log(`agileflow launch: keybind skipped — ${f.hint}`);
        }
      }
      runner.runSync(["set-option", "-t", name, "status", "1"]);
      applyTabFormat(name, runner, { tmuxVersion });
      installSessionHooks(name, runner);
      return attachSession(name, runner);
    }

    const stderr = create.stderr.trim() || "tmux new-session failed";
    const err = new Error(`tmux: ${stderr}`);
    /** @type {any} */ (err).code = "ETMUX_CREATE";
    throw err;
  }

  if (opts.keybindPreset) {
    // Always invoke applyKeybindPreset — even for "none" — so the unbind
    // sweep runs and clears any prior preset's binds. Same reasoning as
    // the reattach branch above.
    const result = applyKeybindPreset(opts.keybindPreset, runner);
    for (const f of result.failures) {
      log(`agileflow launch: keybind skipped — ${f.hint}`);
    }
  }
  // Single dark status line — the tab strip on status-format[0]
  // replaces tmux's default green status bar entirely. Per-session
  // so other tmux clients are unaffected. Then write the tab format
  // itself. Both are best-effort; failure shouldn't block the attach.
  runner.runSync(["set-option", "-t", name, "status", "1"]);
  applyTabFormat(name, runner, { tmuxVersion });
  log(`agileflow launch: starting new session ${name}`);
  return attachSession(name, runner);
}

module.exports = {
  isInsideTmux,
  tmuxAvailable,
  baseSessionName,
  nextFreeSessionName,
  sessionExists,
  createSession,
  attachSession,
  launchInTmux,
  listSessionsForCli,
  killSession,
  applyKeybindPreset,
  substituteBinding,
  detectTmuxVersion,
  applyTabFormat,
  installSessionHooks,
  KEYBIND_PRESET_BINDINGS,
  defaultRunner,
};
