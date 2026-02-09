#!/bin/bash
# claude-tmux.sh - Wrapper script that auto-starts Claude Code in a tmux session
#
# Usage:
#   ./claude-tmux.sh              # Create new tmux session (supports multiple from same dir)
#   ./claude-tmux.sh --attach     # Reattach to most recent session
#   ./claude-tmux.sh --no-tmux    # Start without tmux (regular claude)
#   ./claude-tmux.sh -n           # Same as --no-tmux
#   ./claude-tmux.sh --kill       # Kill ALL sessions for this directory
#   ./claude-tmux.sh --refresh    # Refresh tmux config on all existing sessions
#   ./claude-tmux.sh --help       # Show help with keybinds
#
# When already in tmux: Just runs claude normally
# When not in tmux: Creates a tmux session and runs claude inside it
#
# Multiple terminals can run `af` from the same directory simultaneously.
# Sessions are named: claude-<dir>, claude-<dir>-2, claude-<dir>-3, etc.
# Your Claude conversation is preserved via --resume regardless of tmux state.
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

# Parse arguments
NO_TMUX=false
KILL_SESSION=false
SHOW_HELP=false
ATTACH_ONLY=false
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
  --attach, -a     Reattach to most recent session for this directory
  --no-tmux, -n    Run claude without tmux
  --kill           Kill ALL sessions for this directory
  --refresh        Refresh tmux config on all existing sessions
  --help, -h       Show this help

By default, af creates a new tmux session. Multiple terminals can run
af from the same directory simultaneously (sessions: claude-dir,
claude-dir-2, claude-dir-3, etc.).

TMUX KEYBINDS:
  Alt+1-9          Switch to window N
  Alt+c            Create new window
  Alt+n/p          Next/previous window
  Alt+d            Split horizontally
  Alt+s            Split vertically
  Alt+arrows       Navigate panes
  Alt+z            Zoom/unzoom pane
  Alt+[            Enter copy mode (scroll)
  Alt+r            Rename window
  Alt+x            Close pane
  Alt+w            Close window
  Alt+q            Detach from tmux

SESSION CREATION:
  Alt+N            New worktree session (isolated branch + directory)
  Alt+S            Same-directory session (quick, no worktree)

FREEZE RECOVERY:
  Alt+k            Send Ctrl+C twice (soft interrupt)
  Alt+K            Force kill pane immediately
  Alt+R            Respawn pane with fresh shell
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

# Find next available session name (supports multiple from same directory)
SESSION_BASE="claude-${DIR_NAME}"
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

# Check if we're already inside tmux
if [ -n "$TMUX" ]; then
  # Already in tmux, just run claude
  exec claude "$@"
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

# ══════════════════════════════════════════════════════════════════════════════
# TMUX CONFIGURATION FUNCTION — applies theme, keybinds, and status bar
# Extracted so --refresh can re-apply to existing sessions
# ══════════════════════════════════════════════════════════════════════════════
configure_tmux_session() {
  local target_session="$1"

  # Enable mouse support
  tmux set-option -t "$target_session" mouse on

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

  # Capture git branch once (avoids spawning process every refresh)
  local git_branch
  git_branch=$(git branch --show-current 2>/dev/null || echo '-')

  # Line 0 (top): Session name (stripped of claude- prefix) + Keybinds + Git branch
  tmux set-option -t "$target_session" status-format[0] "#[bg=#1a1b26]  #[fg=#e8683a bold]#{s/claude-//:session_name}  #[fg=#3b4261]·  #[fg=#7aa2f7]󰘬 ${git_branch}  #[align=right]#[fg=#7a7e8a]Alt+N new session  Alt+k interrupt  Alt+q detach  "

  # Line 1 (bottom): Window tabs with smart truncation and brand color
  tmux set-option -t "$target_session" status-format[1] "#[bg=#1a1b26]#{W:#{?window_active,#[fg=#1a1b26 bg=#e8683a bold]  #I  #[fg=#e8683a bg=#2d2f3a]#[fg=#e0e0e0] #{=15:window_name} #[bg=#1a1b26 fg=#2d2f3a],#[fg=#8a8a8a]  #I:#{=|8|...:window_name}  }}"

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

  # Alt+d to split horizontally (side by side)
  tmux bind-key -n M-d split-window -h -c "#{pane_current_path}"

  # Alt+s to split vertically (top/bottom)
  tmux bind-key -n M-s split-window -v -c "#{pane_current_path}"

  # Alt+arrow to navigate panes
  tmux bind-key -n M-Left select-pane -L
  tmux bind-key -n M-Right select-pane -R
  tmux bind-key -n M-Up select-pane -U
  tmux bind-key -n M-Down select-pane -D

  # Alt+x to close current pane (with confirmation)
  tmux bind-key -n M-x confirm-before -p "Close pane? (y/n)" kill-pane

  # Alt+w to close current window (with confirmation)
  tmux bind-key -n M-w confirm-before -p "Close window? (y/n)" kill-window

  # Alt+n/p for next/previous window
  tmux bind-key -n M-n next-window
  tmux bind-key -n M-p previous-window

  # Alt+r to rename window
  tmux bind-key -n M-r command-prompt -I "#W" "rename-window '%%'"

  # Alt+z to zoom/unzoom pane (fullscreen toggle)
  tmux bind-key -n M-z resize-pane -Z

  # Alt+[ to enter copy mode (for scrolling)
  tmux bind-key -n M-[ copy-mode

  # ─── Session Creation Keybindings ──────────────────────────────────────────
  # Alt+N (shift+n) to create a new worktree session window
  tmux bind-key -n M-N run-shell "node .agileflow/scripts/spawn-parallel.js add-window --name auto-\$(date +%s) 2>/dev/null && tmux display-message 'New worktree session created' || tmux display-message 'Session creation failed'"

  # Alt+S (shift+s) to create a same-directory Claude window (no worktree)
  tmux bind-key -n M-S run-shell "tmux new-window -c '#{pane_current_path}' && tmux send-keys 'claude \$CLAUDE_SESSION_FLAGS' Enter && tmux display-message 'Same-dir session created'"

  # ─── Freeze Recovery Keybindings ───────────────────────────────────────────
  # Alt+k to send Ctrl+C twice (soft interrupt for frozen processes)
  tmux bind-key -n M-k run-shell "tmux send-keys C-c; sleep 0.5; tmux send-keys C-c"

  # Alt+K (shift+k) to force-kill pane immediately (nuclear option for hard freezes)
  tmux bind-key -n M-K kill-pane

  # Alt+R (shift+r) to respawn the pane (restart with a fresh shell)
  tmux bind-key -n M-R respawn-pane -k
}

# Handle --refresh flag — re-apply config to all existing claude-* sessions
if [ "$REFRESH_CONFIG" = true ]; then
  REFRESHED=0
  for sid in $(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep "^claude-"); do
    configure_tmux_session "$sid"
    REFRESHED=$((REFRESHED + 1))
  done
  if [ "$REFRESHED" -gt 0 ]; then
    echo "Refreshed config on $REFRESHED session(s)."
  else
    echo "No claude-* sessions found to refresh."
  fi
  exit 0
fi

# Create new tmux session with Claude
echo "Starting Claude in tmux session: $SESSION_NAME"

# Ensure tmux server is running (required for set-option when no sessions exist).
# Only new-session, start-server, and kill-server can start a server.
# Without this, set-option fails with "error connecting to..." after a reboot.
tmux start-server

# Set base-index globally BEFORE creating session so first window gets index 1
tmux set-option -g base-index 1

# Create session in detached mode first (will use base-index 1)
tmux new-session -d -s "$SESSION_NAME" -n "main"

# Apply tmux configuration
configure_tmux_session "$SESSION_NAME"

# Send the claude command to the first window
CLAUDE_CMD="claude"

# Check for inherited session flags (set by parent Claude session)
INHERITED_FLAGS=""
if [ -n "$CLAUDE_SESSION_FLAGS" ]; then
  INHERITED_FLAGS="$CLAUDE_SESSION_FLAGS"
fi

if [ "$USE_RESUME" = true ] && [ -n "$RESUME_SESSION_ID" ]; then
  # Fresh restart with specific conversation resume (skips picker)
  CLAUDE_CMD="claude --resume $RESUME_SESSION_ID"
elif [ "$USE_RESUME" = true ]; then
  # Fresh restart with conversation picker
  CLAUDE_CMD="claude --resume"
fi

# Add inherited flags if present (e.g., --dangerously-skip-permissions)
if [ -n "$INHERITED_FLAGS" ]; then
  CLAUDE_CMD="$CLAUDE_CMD $INHERITED_FLAGS"
fi

if [ $# -gt 0 ]; then
  # Pass any remaining arguments to claude
  CLAUDE_CMD="$CLAUDE_CMD $*"
fi
tmux send-keys -t "$SESSION_NAME" "$CLAUDE_CMD" Enter

# Attach to the session
exec tmux attach-session -t "$SESSION_NAME"
