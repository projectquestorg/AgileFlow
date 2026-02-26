#!/bin/bash
# claude-tmux.sh - Wrapper script that auto-starts Claude Code in a tmux session
#
# Usage:
#   ./claude-tmux.sh              # Reattach to detached session, or create new
#   ./claude-tmux.sh --new        # Force create a new session
#   ./claude-tmux.sh --attach     # Reattach to most recent session (any state)
#   ./claude-tmux.sh --no-tmux    # Start without tmux (regular claude)
#   ./claude-tmux.sh -n           # Same as --no-tmux
#   ./claude-tmux.sh --kill       # Kill ALL sessions for this directory
#   ./claude-tmux.sh --refresh    # Refresh tmux config on all existing sessions
#   ./claude-tmux.sh --help       # Show help with keybinds
#
# When already in tmux: Just runs claude normally
# When not in tmux: Reattaches to a detached session if one exists, otherwise
#   creates a new tmux session. Use --new to always create a fresh session.
#
# Multiple terminals can run `af` from the same directory simultaneously.
# Sessions are named: claude-<dir>, claude-<dir>-2, claude-<dir>-3, etc.
# Your Claude conversation is preserved via smart resume (per-pane UUID tracking).
#
# SESSION CREATION (while inside tmux):
#   - Alt+N     New worktree session (isolated branch + directory)
#   - Alt+S     Same-directory session (quick, no worktree)
#
# FREEZE RECOVERY (while inside tmux):
#   - Alt+k     Send Ctrl+C twice (soft interrupt)
#   - Alt+K     Force kill the pane immediately
#   - Alt+R     Respawn pane with fresh shell
#   - Alt+q     Detach from tmux (session stays alive)

set -e

# Resolve script directory (used for claude-smart.sh and other helpers)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse arguments
NO_TMUX=false
KILL_SESSION=false
SHOW_HELP=false
ATTACH_ONLY=false
FORCE_NEW=false
REFRESH_CONFIG=false
USE_RESUME=false
RESUME_SESSION_ID=""

for arg in "$@"; do
  case $arg in
    --no-tmux|-n)
      NO_TMUX=true
      shift
      ;;
    --attach|-a)
      ATTACH_ONLY=true
      shift
      ;;
    --new)
      FORCE_NEW=true
      shift
      ;;
    --fresh|-f)
      # Kept for backwards compat, but this is now the default behavior
      shift
      ;;
    --rescue|-r)
      # Kept for backwards compat, same as default now
      shift
      ;;
    --kill)
      KILL_SESSION=true
      shift
      ;;
    --refresh)
      REFRESH_CONFIG=true
      shift
      ;;
    --help|-h)
      SHOW_HELP=true
      shift
      ;;
  esac
done

# Show help
if [ "$SHOW_HELP" = true ]; then
  cat << 'EOF'
AgileFlow Claude tmux Wrapper

USAGE:
  af [options] [claude-args...]
  agileflow [options] [claude-args...]

OPTIONS:
  --attach, -a     Reattach to most recent session (attached or detached)
  --new            Force create a new session (skip auto-reattach)
  --no-tmux, -n    Run claude without tmux
  --kill           Kill ALL sessions for this directory
  --refresh        Refresh tmux config on all existing sessions
  --help, -h       Show this help

By default, af reattaches to a detached session if one exists (so Alt+Q
then af gets you right back). Use --new to force a new session.

SESSIONS:
  Alt+s            New Claude window
  Alt+l            Switch between sessions (picker)
  Alt+q            Detach (run af to reattach)

WINDOWS:
  Alt+1-9          Switch to window N
  Alt+c            Create empty window
  Alt+n/p          Next/previous window
  Alt+r            Rename window
  Alt+w            Close window
  Alt+W            Batch close windows (picker)
  Alt+t            Reopen closed window

PANES:
  Alt+d            Split side by side
  Alt+v            Split top/bottom
  Alt+arrows       Navigate panes
  Alt+z            Zoom/unzoom pane
  Alt+x            Close pane

FREEZE RECOVERY:
  Alt+k            Send Ctrl+C twice (soft unfreeze)
  Alt+K            Force kill Claude process (keeps tab)
  Alt+R            Respawn pane (fresh shell)

OTHER:
  Alt+b            Scroll mode (browse history)
  Alt+h            Show keybind help panel
EOF
  exit 0
fi

# If --no-tmux was specified, just run claude directly
if [ "$NO_TMUX" = true ]; then
  exec claude "$@"
fi

# ── Self-healing: ensure tmux socket directory exists ──────────────────────
# macOS clears /private/tmp/ on reboot, which removes the tmux socket dir.
# This causes "error connecting to ... (No such file or directory)" on every
# tmux command. We fix it automatically so users never see this error.
# Must run BEFORE any tmux command (including --kill, --attach, --refresh).
#
# IMPORTANT: tmux uses $TMUX_TMPDIR, then falls back to /tmp (NOT $TMPDIR).
# On macOS, $TMPDIR is /var/folders/.../T/ but tmux uses /private/tmp/.
if command -v tmux &> /dev/null; then
  _TMUX_BASE="${TMUX_TMPDIR:-/tmp}"
  _TMUX_BASE="${_TMUX_BASE%/}"
  _TMUX_SOCK_DIR="${_TMUX_BASE}/tmux-$(id -u)"
  if [ ! -d "$_TMUX_SOCK_DIR" ]; then
    mkdir -p "$_TMUX_SOCK_DIR" 2>/dev/null && chmod 700 "$_TMUX_SOCK_DIR" 2>/dev/null
    if [ ! -d "$_TMUX_SOCK_DIR" ]; then
      echo "Warning: Could not create tmux socket directory ($_TMUX_SOCK_DIR)."
      echo "Running claude without tmux."
      exec claude "$@"
    fi
  fi
  unset _TMUX_BASE _TMUX_SOCK_DIR
fi

# ══════════════════════════════════════════════════════════════════════════════
# TAB FORMAT BUILDER — dynamic compaction based on window count & terminal width
# Uses tmux 3.2+ #{e|...} numeric operators for cascading tier selection
# ══════════════════════════════════════════════════════════════════════════════
build_tab_format() {
  # Chrome-like tab compaction: 14 tiers with threshold = width for minimal waste.
  # Per-window budget (width/windows) picks the largest tier that fits.
  # #{pN:#{=N:var}} = exactly N visible chars (truncate long + pad short names).

  # ── Active tab: orange bg index + dark bg name ──────────────────────────
  # "  I  " prefix = 5 visible chars (wide); " I " = 3 chars (narrow)
  # Width = prefix + 1(space) + pN(name) + 1(space)
  local a0='#[fg=#1a1b26 bg=#e8683a bold]  #I  #[fg=#e8683a bg=#2d2f3a]#[fg=#e0e0e0] #{p33:#{=33:window_name}} #[bg=#1a1b26 fg=#2d2f3a]'
  local a1='#[fg=#1a1b26 bg=#e8683a bold]  #I  #[fg=#e8683a bg=#2d2f3a]#[fg=#e0e0e0] #{p20:#{=20:window_name}} #[bg=#1a1b26 fg=#2d2f3a]'
  local a2='#[fg=#1a1b26 bg=#e8683a bold]  #I  #[fg=#e8683a bg=#2d2f3a]#[fg=#e0e0e0] #{p13:#{=13:window_name}} #[bg=#1a1b26 fg=#2d2f3a]'
  local a3='#[fg=#1a1b26 bg=#e8683a bold] #I #[fg=#e8683a bg=#2d2f3a]#[fg=#e0e0e0] #{p11:#{=11:window_name}} #[bg=#1a1b26 fg=#2d2f3a]'
  local a4='#[fg=#1a1b26 bg=#e8683a bold] #I #[fg=#e8683a bg=#2d2f3a]#[fg=#e0e0e0] #{p8:#{=8:window_name}} #[bg=#1a1b26 fg=#2d2f3a]'
  local a5='#[fg=#1a1b26 bg=#e8683a bold] #I #[fg=#e8683a bg=#2d2f3a]#[fg=#e0e0e0] #{p6:#{=6:window_name}} #[bg=#1a1b26 fg=#2d2f3a]'
  local a6='#[fg=#1a1b26 bg=#e8683a bold] #I #[fg=#e0e0e0 bg=#2d2f3a] #{p5:#{=5:window_name}} #[bg=#1a1b26 fg=#2d2f3a]'
  local a7='#[fg=#1a1b26 bg=#e8683a bold] #I #[fg=#e0e0e0 bg=#2d2f3a] #{p4:#{=4:window_name}} #[bg=#1a1b26 fg=#2d2f3a]'
  local a8='#[fg=#1a1b26 bg=#e8683a bold] #I #[fg=#e0e0e0 bg=#2d2f3a] #{p3:#{=3:window_name}} #[bg=#1a1b26 fg=#2d2f3a]'
  local a9='#[fg=#1a1b26 bg=#e8683a bold] #I #[fg=#e0e0e0 bg=#2d2f3a] #{p2:#{=2:window_name}} #[bg=#1a1b26 fg=#2d2f3a]'
  local a10='#[fg=#1a1b26 bg=#e8683a bold] #I #[fg=#e0e0e0 bg=#2d2f3a] #{p1:#{=1:window_name}} #[bg=#1a1b26 fg=#2d2f3a]'
  local a11='#[fg=#1a1b26 bg=#e8683a bold]  #I  #[bg=#1a1b26 fg=#e8683a]'
  local a12='#[fg=#1a1b26 bg=#e8683a bold] #I #[bg=#1a1b26 fg=#e8683a]'
  local a13='#[fg=#e8683a bold]#I#[fg=default]'

  # ── Inactive tab: gray text ─────────────────────────────────────────────
  # "  I:" prefix = 4 visible chars (wide); " I:" = 3 chars (narrow)
  # Width = prefix + pN(name) + 1(space)
  local i0='#[fg=#8a8a8a]  #I:#{p35:#{=35:window_name}} '
  local i1='#[fg=#8a8a8a]  #I:#{p22:#{=22:window_name}} '
  local i2='#[fg=#8a8a8a]  #I:#{p15:#{=15:window_name}} '
  local i3='#[fg=#8a8a8a] #I:#{p12:#{=12:window_name}} '
  local i4='#[fg=#8a8a8a] #I:#{p9:#{=9:window_name}} '
  local i5='#[fg=#8a8a8a] #I:#{p7:#{=7:window_name}} '
  local i6='#[fg=#8a8a8a] #I:#{p6:#{=6:window_name}} '
  local i7='#[fg=#8a8a8a] #I:#{p5:#{=5:window_name}} '
  local i8='#[fg=#8a8a8a] #I:#{p4:#{=4:window_name}} '
  local i9='#[fg=#8a8a8a] #I:#{p3:#{=3:window_name}} '
  local i10='#[fg=#8a8a8a] #I:#{p2:#{=2:window_name}} '
  local i11='#[fg=#8a8a8a] #I:#{p1:#{=1:window_name}} '
  local i12='#[fg=#8a8a8a] #I '
  local i13='#[fg=#565a6e]#I'

  # ── Tier selection: budget = width / windows ─────────────────────────────
  local budget='#{e|/|:#{client_width},#{session_windows}}'
  local cp="#{?#{e|>=|:${budget},"
  local cm='},'
  local cs='}'

  # 14 tiers: threshold = format width → minimal wasted space.
  # 81-col fill: 2-11 wins >=95%, 12-16 wins >=86%.
  #
  #   Tier  >=Thr  Width  81-col example       Fill%
  #   T0     40     40    2 wins (40ea)          98%
  #   T1     27     27    3 wins (27ea)         100%
  #   T2     20     20    4 wins (20ea)          98%
  #   T3     16     16    5 wins (16ea)          98%
  #   T4     13     13    6 wins (13ea)          96%
  #   T5     11     11    7 wins (11ea)          95%
  #   T6     10     10    8 wins (10ea)          98%
  #   T7      9      9    9 wins (9ea)          100%
  #   T8      8      8   10 wins (8ea)           98%
  #   T9      7      7   11 wins (7ea)           95%
  #   T10     6      6   12-13 wins            88-96%
  #   T11     5      5   14-16 wins            86-98%
  #   T12     3      3   17-27 wins
  #   T13  fallback  1   28+ wins
  local active="${cp}40${cm}${a0},${cp}27${cm}${a1},${cp}20${cm}${a2},${cp}16${cm}${a3},${cp}13${cm}${a4},${cp}11${cm}${a5},${cp}10${cm}${a6},${cp}9${cm}${a7},${cp}8${cm}${a8},${cp}7${cm}${a9},${cp}6${cm}${a10},${cp}5${cm}${a11},${cp}3${cm}${a12},${a13}${cs}${cs}${cs}${cs}${cs}${cs}${cs}${cs}${cs}${cs}${cs}${cs}${cs}"
  local inactive="${cp}40${cm}${i0},${cp}27${cm}${i1},${cp}20${cm}${i2},${cp}16${cm}${i3},${cp}13${cm}${i4},${cp}11${cm}${i5},${cp}10${cm}${i6},${cp}9${cm}${i7},${cp}8${cm}${i8},${cp}7${cm}${i9},${cp}6${cm}${i10},${cp}5${cm}${i11},${cp}3${cm}${i12},${i13}${cs}${cs}${cs}${cs}${cs}${cs}${cs}${cs}${cs}${cs}${cs}${cs}${cs}"

  echo "#[bg=#1a1b26]#{W:#{?window_active,${active},${inactive}}}"
}

# ══════════════════════════════════════════════════════════════════════════════
# TMUX CONFIGURATION FUNCTION — applies theme, keybinds, and status bar
# Defined early so --refresh can use it before any session logic
# ══════════════════════════════════════════════════════════════════════════════
configure_tmux_session() {
  local target_session="$1"

  # Enable mouse support
  tmux set-option -t "$target_session" mouse on

  # Reduce escape-time from default 500ms to 10ms.
  # The default causes two problems:
  #   1) Arrow keys (which send \e[A etc.) get misinterpreted as Alt+[ if
  #      there's any delivery delay, accidentally triggering copy-mode.
  #   2) Pressing Escape in Claude Code has a 500ms lag before tmux forwards it.
  # 10ms is enough to detect genuine escape sequences on localhost/fast SSH.
  tmux set-option -t "$target_session" escape-time 10

  # Automatically renumber windows when one is closed (no gaps)
  tmux set-option -t "$target_session" renumber-windows on

  # Fix colors - proper terminal support
  tmux set-option -t "$target_session" default-terminal "xterm-256color"
  tmux set-option -t "$target_session" -ga terminal-overrides ",xterm-256color:Tc"

  # ─── Status Bar Styling (2-line) ────────────────────────────────────────────

  # Status bar position and refresh
  tmux set-option -t "$target_session" status-position bottom
  # Reduce refresh rate to prevent CPU overhead and freezes (was 5s, now 30s)
  tmux set-option -t "$target_session" status-interval 30

  # Enable 2-line status bar
  tmux set-option -t "$target_session" status 2

  # Base styling - Tokyo Night inspired dark theme
  tmux set-option -t "$target_session" status-style "bg=#1a1b26,fg=#a9b1d6"

  # Line 0 (top): Session name + live git branch + keybind hints
  # Uses #() for live branch updates (runs on status-interval, every 30s)
  tmux set-option -t "$target_session" status-format[0] "#[bg=#1a1b26]  #[fg=#e8683a bold]#{s/claude-//:session_name}  #[fg=#3b4261]·  #[fg=#7aa2f7]󰘬 #(git -C #{pane_current_path} branch --show-current 2>/dev/null || echo '-')#[align=right]#[fg=#565a6e]Alt+h help  "

  # Line 1 (bottom): Window tabs with dynamic compaction
  # Tabs auto-shrink based on window count and terminal width
  local tab_format
  tab_format=$(build_tab_format)
  tmux set-option -t "$target_session" status-format[1] "$tab_format"

  # Pane border styling - blue inactive, orange active
  tmux set-option -t "$target_session" pane-border-style "fg=#3d59a1"
  tmux set-option -t "$target_session" pane-active-border-style "fg=#e8683a"

  # Message styling - orange highlight
  tmux set-option -t "$target_session" message-style "bg=#e8683a,fg=#1a1b26,bold"

  # ─── Keybindings ────────────────────────────────────────────────────────────

  # Alt+number to switch windows (1-9)
  for i in 1 2 3 4 5 6 7 8 9; do
    tmux bind-key -n "M-$i" select-window -t ":$i"
  done

  # Alt+c to create new window
  tmux bind-key -n M-c new-window -c "#{pane_current_path}"

  # Alt+q to detach
  tmux bind-key -n M-q detach-client

  # Alt+l to list and switch between sessions (interactive picker)
  tmux bind-key -n M-l choose-tree -s -Z

  # Alt+d to split horizontally (side by side)
  tmux bind-key -n M-d split-window -h -c "#{pane_current_path}"

  # Alt+v to split vertically (top/bottom)
  tmux bind-key -n M-v split-window -v -c "#{pane_current_path}"

  # Alt+arrow to navigate panes
  tmux bind-key -n M-Left select-pane -L
  tmux bind-key -n M-Right select-pane -R
  tmux bind-key -n M-Up select-pane -U
  tmux bind-key -n M-Down select-pane -D

  # Alt+x to close current pane (with confirmation)
  tmux bind-key -n M-x confirm-before -p "Close pane? (y/n)" kill-pane

  # Alt+w to close current window (save state for Alt+T restore, then kill)
  tmux bind-key -n M-w confirm-before -p "Close window? (y/n)" "run-shell '\"\$AGILEFLOW_SCRIPTS/tmux-save-closed-window.sh\"' ; kill-window"

  # Alt+W (uppercase) to batch-close windows via multi-select picker
  tmux bind-key -n M-W display-popup -E -w 60 -h 20 "\"$AGILEFLOW_SCRIPTS/tmux-close-windows.sh\""

  # Alt+t to restore the most recently closed window (like Ctrl+Shift+T in browsers)
  tmux bind-key -n M-t run-shell '"$AGILEFLOW_SCRIPTS/tmux-restore-window.sh"'

  # Alt+n/p for next/previous window
  tmux bind-key -n M-n next-window
  tmux bind-key -n M-p previous-window

  # Alt+r to rename window
  tmux bind-key -n M-r command-prompt -I "#W" "rename-window '%%'"

  # Alt+z to zoom/unzoom pane (fullscreen toggle)
  tmux bind-key -n M-z resize-pane -Z

  # Alt+b to enter copy mode (for scrolling / browsing history)
  # NOTE: Do NOT use Alt+[ here — \e[ is the CSI prefix for arrow keys and
  # function keys. Binding M-[ in the root table causes accidental copy-mode
  # entry whenever an escape sequence is split by network latency, making the
  # terminal appear to "lose focus" until Escape is pressed.
  tmux bind-key -n M-b copy-mode

  # ─── Session Creation Keybindings ──────────────────────────────────────────
  # Alt+s to create a new Claude window (starts fresh, future re-runs in same pane resume)
  # Window gets sequential name (claude-2, claude-3, ...) so windows are distinguishable
  tmux bind-key -n M-s run-shell "N=\$(( \$(tmux list-windows -F '#{window_name}' 2>/dev/null | grep -c '^claude') + 1 )); tmux new-window -n \"claude-\$N\" -c '#{pane_current_path}' && tmux send-keys '\"\$AGILEFLOW_SCRIPTS/claude-smart.sh\" --fresh \$CLAUDE_SESSION_FLAGS' Enter"

  # ─── Freeze Recovery Keybindings ───────────────────────────────────────────
  # Alt+k to send Ctrl+C twice (soft interrupt for frozen processes)
  # Uses #{pane_id} to target the correct pane even if focus shifts during the sleep
  tmux bind-key -n M-k run-shell "tmux send-keys -t '#{pane_id}' C-c; sleep 0.5; tmux send-keys -t '#{pane_id}' C-c"

  # Alt+K (uppercase) to force kill Claude process in pane without closing tab
  # Finds the claude child process under the pane's shell and kills it,
  # leaving the shell prompt intact so the user can restart or continue.
  # Uses ps -o pid=,args= with grep to find claude, then cuts the PID (avoids awk quoting issues in tmux run-shell).
  tmux bind-key -n M-K run-shell '\
    PANE_PID=$(tmux display-message -p "#{pane_pid}"); \
    CLAUDE_PID=$(ps --ppid "$PANE_PID" -o pid=,args= 2>/dev/null | grep -v "watchdog" | grep "claude" | head -1 | sed "s/^[[:space:]]*//" | cut -d" " -f1); \
    if [ -n "$CLAUDE_PID" ]; then \
      kill -TERM "$CLAUDE_PID" 2>/dev/null; \
      sleep 2; \
      kill -0 "$CLAUDE_PID" 2>/dev/null && kill -KILL "$CLAUDE_PID" 2>/dev/null; \
      tmux display-message "Killed Claude process (PID $CLAUDE_PID)"; \
    else \
      tmux display-message "No Claude process found in this pane"; \
    fi'

  # Alt+R to respawn pane (kills everything in the pane, starts fresh shell)
  tmux bind-key -n M-R respawn-pane -k

  # ─── Help Panel ──────────────────────────────────────────────────────────
  # Alt+h to show all Alt keybindings in a popup
  tmux bind-key -n M-h display-popup -E -w 52 -h 32 "\
    printf '\\n';\
    printf '  \\033[1;38;5;208mSESSIONS\\033[0m\\n';\
    printf '  Alt+s      New Claude session\\n';\
    printf '  Alt+l      Switch session (picker)\\n';\
    printf '  Alt+q      Detach (af to resume)\\n';\
    printf '\\n';\
    printf '  \\033[1;38;5;208mWINDOWS\\033[0m\\n';\
    printf '  Alt+c      New empty window\\n';\
    printf '  Alt+1-9    Switch to window N\\n';\
    printf '  Alt+n/p    Next / previous window\\n';\
    printf '  Alt+r      Rename window\\n';\
    printf '  Alt+w      Close window\\n';\
    printf '  Alt+W      Batch close windows\\n';\
    printf '  Alt+t      Reopen closed window\\n';\
    printf '\\n';\
    printf '  \\033[1;38;5;208mPANES\\033[0m\\n';\
    printf '  Alt+d      Split side by side\\n';\
    printf '  Alt+v      Split top / bottom\\n';\
    printf '  Alt+arrows Navigate panes\\n';\
    printf '  Alt+z      Zoom / unzoom\\n';\
    printf '  Alt+x      Close pane (confirm)\\n';\
    printf '  Alt+K      Force kill process\\n';\
    printf '  Alt+R      Respawn pane (fresh)\\n';\
    printf '\\n';\
    printf '  \\033[1;38;5;208mOTHER\\033[0m\\n';\
    printf '  Alt+b      Scroll mode\\n';\
    printf '  Alt+k      Unfreeze (Ctrl+C x2)\\n';\
    printf '  Alt+h      This help\\n';\
    printf '\\n';\
    read -n 1 -s -r -p '  Press any key to close'"
}

# Handle --refresh flag — re-apply config to all existing claude-* sessions
if [ "$REFRESH_CONFIG" = true ]; then
  REFRESHED=0
  for sid in $(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep "^claude-"); do
    configure_tmux_session "$sid"
    # Ensure AGILEFLOW_SCRIPTS is set (needed by Alt+S keybind)
    tmux set-environment -t "$sid" AGILEFLOW_SCRIPTS "$SCRIPT_DIR" 2>/dev/null || true
    # (Re)start watchdog if not running for this session
    _EXISTING_WD=$(tmux show-environment -t "$sid" WATCHDOG_PID 2>/dev/null | cut -d= -f2)
    if [ -z "$_EXISTING_WD" ] || ! kill -0 "$_EXISTING_WD" 2>/dev/null; then
      "$SCRIPT_DIR/claude-watchdog.sh" "$sid" &
      _WD_PID=$!
      tmux set-environment -t "$sid" WATCHDOG_PID "$_WD_PID"
      disown "$_WD_PID"
    fi
    REFRESHED=$((REFRESHED + 1))
  done
  if [ "$REFRESHED" -gt 0 ]; then
    echo "Refreshed config on $REFRESHED session(s)."
  else
    echo "No claude-* sessions found to refresh."
  fi
  exit 0
fi

# Check if we're already inside tmux — use smart wrapper instead of session management
if [ -n "$TMUX" ]; then
  # shellcheck disable=SC2086
  exec "$SCRIPT_DIR/claude-smart.sh" $CLAUDE_SESSION_FLAGS "$@"
fi

# Generate directory name (used for session name patterns)
DIR_NAME=$(basename "$(pwd)")

# Handle --kill flag — kill ALL sessions for this directory
if [ "$KILL_SESSION" = true ]; then
  SESSION_BASE="claude-${DIR_NAME}"
  KILLED=0
  # Kill exact base session
  if tmux has-session -t "$SESSION_BASE" 2>/dev/null; then
    tmux kill-session -t "$SESSION_BASE" 2>/dev/null || true
    KILLED=$((KILLED + 1))
  fi
  # Kill numbered sessions (claude-dir-2, claude-dir-3, etc.)
  for sid in $(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep "^${SESSION_BASE}-[0-9]*$"); do
    tmux kill-session -t "$sid" 2>/dev/null || true
    KILLED=$((KILLED + 1))
  done
  if [ "$KILLED" -gt 0 ]; then
    echo "Killed $KILLED session(s) for $DIR_NAME."
  else
    echo "No sessions found for '$DIR_NAME'."
  fi
  exit 0
fi

# Handle --attach flag (reattach to most recent session for this directory)
if [ "$ATTACH_ONLY" = true ]; then
  SESSION_BASE="claude-${DIR_NAME}"
  # Find the highest-numbered existing session
  LATEST=""
  if tmux has-session -t "$SESSION_BASE" 2>/dev/null; then
    LATEST="$SESSION_BASE"
  fi
  for sid in $(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep "^${SESSION_BASE}-[0-9]*$" | sort -t- -k3 -n); do
    LATEST="$sid"
  done
  if [ -n "$LATEST" ]; then
    echo "Attaching to session: $LATEST"
    exec tmux attach-session -t "$LATEST"
  else
    echo "No existing session. Creating new one..."
    # Fall through to create new session
  fi
fi

# ── Auto-cleanup dead sessions ────────────────────────────────────────────
# Silently remove sessions where all panes have exited (dead/empty shells).
# This prevents accumulation of orphan sessions over time.
SESSION_BASE="claude-${DIR_NAME}"
for sid in $(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E "^${SESSION_BASE}($|-[0-9]+$)"); do
  # Count alive panes (pane_dead=0 means alive)
  ALIVE=$(tmux list-panes -t "$sid" -F '#{pane_dead}' 2>/dev/null | grep -c '^0$' || true)
  if [ "$ALIVE" = "0" ]; then
    tmux kill-session -t "$sid" 2>/dev/null || true
  fi
done

# ── Consolidate duplicate sessions ───────────────────────────────────────
# Kill numbered duplicates (e.g. claude-Acuide-2, -3) that were created by
# a previous bug. If the base session exists, duplicates are unnecessary.
# If only numbered sessions remain, promote the lowest to the base name.
if [ "$FORCE_NEW" = false ]; then
  HAS_BASE=false
  NUMBERED=()
  if tmux has-session -t "$SESSION_BASE" 2>/dev/null; then
    HAS_BASE=true
  fi
  while IFS= read -r sid; do
    [ -n "$sid" ] && NUMBERED+=("$sid")
  done < <(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E "^${SESSION_BASE}-[0-9]+$" | sort -t- -k3 -n)

  if [ "$HAS_BASE" = true ] && [ "${#NUMBERED[@]}" -gt 0 ]; then
    # Base exists — kill all numbered duplicates
    for sid in "${NUMBERED[@]}"; do
      tmux kill-session -t "$sid" 2>/dev/null || true
    done
  elif [ "$HAS_BASE" = false ] && [ "${#NUMBERED[@]}" -gt 0 ]; then
    # No base — promote lowest numbered session to base name
    PROMOTE="${NUMBERED[0]}"
    tmux rename-session -t "$PROMOTE" "$SESSION_BASE" 2>/dev/null || true
    # Kill remaining duplicates
    for sid in "${NUMBERED[@]:1}"; do
      tmux kill-session -t "$sid" 2>/dev/null || true
    done
  fi
fi

# ── Auto-reattach to detached session ──────────────────────────────────────
# When user does Alt+Q (detach) and then runs `af` again, reattach to the
# existing session instead of creating a new one. This preserves tmux windows,
# pane layout, and the live Claude chat session.
# If multiple detached sessions exist, show a picker so user can choose.
if [ "$FORCE_NEW" = false ]; then
  DETACHED=()
  while IFS= read -r sid; do
    [ -n "$sid" ] && DETACHED+=("$sid")
  done < <(tmux list-sessions -F '#{session_name} #{session_attached}' 2>/dev/null | awk '$2 == "0" {print $1}' | grep -E "^${SESSION_BASE}($|-[0-9]+$)")

  if [ "${#DETACHED[@]}" -eq 1 ]; then
    # Single detached session — just reattach
    echo "Reattaching to: ${DETACHED[0]}"
    exec tmux attach-session -t "${DETACHED[0]}"
  elif [ "${#DETACHED[@]}" -gt 1 ]; then
    # Multiple detached sessions — let user pick
    echo ""
    echo "  Multiple detached sessions found:"
    echo ""
    i=1
    for sid in "${DETACHED[@]}"; do
      WINS=$(tmux list-windows -t "$sid" -F '#{window_name}' 2>/dev/null | tr '\n' ',' | sed 's/,$//')
      printf "    %d) %s  (%s)\n" "$i" "$sid" "$WINS"
      i=$((i + 1))
    done
    printf "    %d) Create new session\n" "$i"
    echo ""
    printf "  Pick [1]: "
    read -r CHOICE
    CHOICE=${CHOICE:-1}
    if [ "$CHOICE" -ge 1 ] 2>/dev/null && [ "$CHOICE" -lt "$i" ] 2>/dev/null; then
      IDX=$((CHOICE - 1))
      echo "Reattaching to: ${DETACHED[$IDX]}"
      exec tmux attach-session -t "${DETACHED[$IDX]}"
    fi
    # Fall through to create new session
  fi
fi

# ── Reuse existing attached session ──────────────────────────────────────
# If a session exists but is attached in another terminal, attach to it
# as a second client rather than creating a duplicate session (e.g. -2).
# Use --new to force creating a separate session.
if [ "$FORCE_NEW" = false ]; then
  EXISTING=()
  while IFS= read -r sid; do
    [ -n "$sid" ] && EXISTING+=("$sid")
  done < <(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E "^${SESSION_BASE}($|-[0-9]+$)")

  if [ "${#EXISTING[@]}" -gt 0 ]; then
    # Prefer the base session, otherwise pick the first one
    TARGET="${EXISTING[0]}"
    for sid in "${EXISTING[@]}"; do
      if [ "$sid" = "$SESSION_BASE" ]; then
        TARGET="$sid"
        break
      fi
    done
    echo "Attaching to existing session: $TARGET"
    exec tmux attach-session -t "$TARGET"
  fi
fi

# No existing session found — create a new one
SESSION_NAME="$SESSION_BASE"
SESSION_NUM=1
while tmux has-session -t "$SESSION_NAME" 2>/dev/null; do
  SESSION_NUM=$((SESSION_NUM + 1))
  SESSION_NAME="${SESSION_BASE}-${SESSION_NUM}"
done

# Find the most recent conversation to resume
PROJ_DIR=$(pwd | sed 's|/|-|g' | sed 's|^-||')
SESSIONS_DIR="$HOME/.claude/projects/-$PROJ_DIR"

if [ -d "$SESSIONS_DIR" ]; then
  # Get most recent non-agent session (main conversations only)
  RECENT_SESSION=$(ls -t "$SESSIONS_DIR"/*.jsonl 2>/dev/null | grep -v "agent-" | head -1)
  if [ -n "$RECENT_SESSION" ] && [ -s "$RECENT_SESSION" ]; then
    RESUME_SESSION_ID=$(basename "$RECENT_SESSION" .jsonl)
    USE_RESUME=true
  fi
fi

# Check if tmux auto-spawn is disabled in config
METADATA_FILE="docs/00-meta/agileflow-metadata.json"
if [ -f "$METADATA_FILE" ]; then
  # Use node to parse JSON (more reliable than jq which may not be installed)
  TMUX_ENABLED=$(node -e "
    try {
      const meta = JSON.parse(require('fs').readFileSync('$METADATA_FILE', 'utf8'));
      // Default to true (enabled) if not explicitly set to false
      console.log(meta.features?.tmuxAutoSpawn?.enabled !== false ? 'true' : 'false');
    } catch (e) {
      console.log('true');  // Default to enabled on error
    }
  " 2>/dev/null || echo "true")

  if [ "$TMUX_ENABLED" = "false" ]; then
    exec claude "$@"
  fi
fi

# Check for default Claude flags from metadata (e.g., --dangerously-skip-permissions)
# Priority: 1) sessions.defaultStartupMode (from /configure), 2) features.claudeFlags
if [ -f "$METADATA_FILE" ]; then
  META_FLAGS=$(node -e "
    try {
      const meta = JSON.parse(require('fs').readFileSync('$METADATA_FILE', 'utf8'));
      // Check sessions config first (from /configure)
      const mode = meta.sessions?.defaultStartupMode;
      if (mode && mode !== 'normal') {
        const modeConfig = meta.sessions?.startupModes?.[mode];
        if (modeConfig?.flags) {
          // Normalize short flags to canonical form
          let flags = modeConfig.flags;
          if (flags === '--dangerous') flags = '--dangerously-skip-permissions';
          console.log(flags);
          process.exit(0);
        }
      }
      // Fallback to claudeFlags feature
      if (meta.features?.claudeFlags?.enabled) {
        let flags = meta.features.claudeFlags.defaultFlags || '';
        if (flags === '--dangerous') flags = '--dangerously-skip-permissions';
        console.log(flags);
      } else {
        console.log('');
      }
    } catch(e) { console.log(''); }
  " 2>/dev/null || echo "")
  if [ -n "$META_FLAGS" ]; then
    CLAUDE_SESSION_FLAGS="${CLAUDE_SESSION_FLAGS:+$CLAUDE_SESSION_FLAGS }$META_FLAGS"
    export CLAUDE_SESSION_FLAGS
  fi
fi

# Check if tmux is available
if ! command -v tmux &> /dev/null; then
  echo "tmux not found. Running claude without tmux."
  echo "Install tmux for parallel session support:"
  echo "  macOS:        brew install tmux"
  echo "  Ubuntu/Debian: sudo apt install tmux"
  echo ""
  exec claude "$@"
fi

# Create new tmux session with Claude
echo "Starting Claude in tmux session: $SESSION_NAME"

# Create session and set base-index in one atomic command.
# new-session starts the server (required after reboot when no server exists).
# Separate start-server/set-option calls fail because the server exits immediately
# when no sessions exist. The \; syntax chains commands on the same server instance.
tmux new-session -d -s "$SESSION_NAME" -n "main" \; set-option -g base-index 1
# Move window to index 1 if not already there (suppress stdout "same index"
# message when base-index was already 1 from a previous session)
tmux move-window -t "$SESSION_NAME":1 >/dev/null 2>&1 || true

# Apply tmux configuration
configure_tmux_session "$SESSION_NAME"

# Export scripts directory to tmux session environment (used by keybinds)
tmux set-environment -t "$SESSION_NAME" AGILEFLOW_SCRIPTS "$SCRIPT_DIR"
if [ -n "$CLAUDE_SESSION_FLAGS" ]; then
  tmux set-environment -t "$SESSION_NAME" CLAUDE_SESSION_FLAGS "$CLAUDE_SESSION_FLAGS"
fi

# Start watchdog to auto-detect and kill frozen Claude processes
EXISTING_WD=$(tmux show-environment -t "$SESSION_NAME" WATCHDOG_PID 2>/dev/null | cut -d= -f2)
if [ -z "$EXISTING_WD" ] || ! kill -0 "$EXISTING_WD" 2>/dev/null; then
  "$SCRIPT_DIR/claude-watchdog.sh" "$SESSION_NAME" &
  _WD_PID=$!
  tmux set-environment -t "$SESSION_NAME" WATCHDOG_PID "$_WD_PID"
  disown "$_WD_PID"
fi

# Pre-seed @claude_uuid on initial pane if we found a recent conversation
if [ "$USE_RESUME" = true ] && [ -n "$RESUME_SESSION_ID" ]; then
  tmux set-option -p -t "$SESSION_NAME" @claude_uuid "$RESUME_SESSION_ID" 2>/dev/null || true
fi

# Launch Claude via smart wrapper (handles resume from @claude_uuid)
SMART_CMD="\"$SCRIPT_DIR/claude-smart.sh\""
if [ -n "$CLAUDE_SESSION_FLAGS" ]; then
  SMART_CMD="$SMART_CMD $CLAUDE_SESSION_FLAGS"
fi
if [ $# -gt 0 ]; then
  SMART_CMD="$SMART_CMD $*"
fi

tmux send-keys -t "$SESSION_NAME" "$SMART_CMD" Enter

# Attach to the session
exec tmux attach-session -t "$SESSION_NAME"
