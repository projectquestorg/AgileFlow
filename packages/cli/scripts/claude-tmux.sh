#!/bin/bash
# claude-tmux.sh - Wrapper script that auto-starts Claude Code in a tmux session
#
# Usage:
#   ./claude-tmux.sh              # Start in tmux with default session
#   ./claude-tmux.sh --no-tmux    # Start without tmux (regular claude)
#   ./claude-tmux.sh -n           # Same as --no-tmux
#   ./claude-tmux.sh --fresh      # Kill and restart with latest scripts
#   ./claude-tmux.sh -f           # Same as --fresh
#   ./claude-tmux.sh --rescue     # Kill frozen session and restart fresh
#   ./claude-tmux.sh --kill       # Kill existing session completely
#   ./claude-tmux.sh --help       # Show help with keybinds
#
# When already in tmux: Just runs claude normally
# When not in tmux: Creates a tmux session and runs claude inside it
#
# FREEZE RECOVERY:
#   If Claude freezes inside tmux, use these keybinds:
#   - Alt+k     Send Ctrl+C twice (soft interrupt)
#   - Alt+K     Force kill the pane immediately
#   - Alt+R     Respawn pane with fresh shell
#   - Alt+q     Detach from tmux (session stays alive)

set -e

# Parse arguments
NO_TMUX=false
RESCUE=false
KILL_SESSION=false
SHOW_HELP=false
FRESH_START=false
USE_RESUME=false
RESUME_SESSION_ID=""

for arg in "$@"; do
  case $arg in
    --no-tmux|-n)
      NO_TMUX=true
      shift
      ;;
    --fresh|-f)
      FRESH_START=true
      shift
      ;;
    --rescue|-r)
      RESCUE=true
      shift
      ;;
    --kill)
      KILL_SESSION=true
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
  --fresh, -f      Kill existing session and start fresh (use after updates)
  --no-tmux, -n    Run claude without tmux
  --rescue, -r     Kill frozen session and restart fresh
  --kill           Kill existing session completely
  --help, -h       Show this help

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

FREEZE RECOVERY:
  Alt+k            Send Ctrl+C twice (soft interrupt)
  Alt+K            Force kill pane immediately
  Alt+R            Respawn pane with fresh shell

If Claude is completely frozen and keybinds don't work:
  1. Open a new terminal
  2. Run: af --rescue   (kills and restarts)
  3. Or:  af --kill     (just kills, doesn't restart)
EOF
  exit 0
fi

# If --no-tmux was specified, just run claude directly
if [ "$NO_TMUX" = true ]; then
  exec claude "$@"
fi

# Generate session name based on current directory (needed for rescue/kill)
DIR_NAME=$(basename "$(pwd)")
SESSION_NAME="claude-${DIR_NAME}"

# Handle --kill flag
if [ "$KILL_SESSION" = true ]; then
  if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Killing session: $SESSION_NAME"
    tmux kill-session -t "$SESSION_NAME"
    echo "Session killed."
  else
    echo "No session named '$SESSION_NAME' found."
  fi
  exit 0
fi

# Handle --rescue flag (kill and restart)
if [ "$RESCUE" = true ]; then
  if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Killing frozen session: $SESSION_NAME"
    tmux kill-session -t "$SESSION_NAME"
    echo "Session killed. Restarting..."
    sleep 0.5
  else
    echo "No existing session to rescue. Starting fresh..."
  fi
  # Continue to create new session below
fi

# Handle --fresh flag (kill old session and start fresh with latest scripts + resume conversation)
if [ "$FRESH_START" = true ]; then
  if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Killing old session: $SESSION_NAME"
    tmux kill-session -t "$SESSION_NAME"
    echo "Starting fresh with latest scripts..."
    sleep 0.3
  else
    echo "No existing session. Starting fresh..."
  fi

  # Find the most recent session for this directory
  PROJ_DIR=$(pwd | sed 's|/|-|g' | sed 's|^-||')
  SESSIONS_DIR="$HOME/.claude/projects/-$PROJ_DIR"

  if [ -d "$SESSIONS_DIR" ]; then
    # Get most recent non-agent session (main conversations only)
    RECENT_SESSION=$(ls -t "$SESSIONS_DIR"/*.jsonl 2>/dev/null | grep -v "agent-" | head -1)
    if [ -n "$RECENT_SESSION" ] && [ -s "$RECENT_SESSION" ]; then
      # Extract session ID from filename (remove path and .jsonl extension)
      RESUME_SESSION_ID=$(basename "$RECENT_SESSION" .jsonl)
      echo "Found recent conversation: $RESUME_SESSION_ID"
      USE_RESUME=true
    else
      echo "No previous conversation found. Starting fresh."
    fi
  else
    echo "No session history found. Starting fresh."
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

# SESSION_NAME already generated above (needed for --rescue and --kill)

# Check if session already exists
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "Attaching to existing session: $SESSION_NAME"
  exec tmux attach-session -t "$SESSION_NAME"
fi

# Create new tmux session with Claude
echo "Starting Claude in tmux session: $SESSION_NAME"

# Create session in detached mode first
tmux new-session -d -s "$SESSION_NAME" -n "main"

# ══════════════════════════════════════════════════════════════════════════════
# TMUX CONFIGURATION - Modern status bar with keybinds
# ══════════════════════════════════════════════════════════════════════════════

# Enable mouse support
tmux set-option -t "$SESSION_NAME" mouse on

# Fix colors - proper terminal support
tmux set-option -t "$SESSION_NAME" default-terminal "xterm-256color"
tmux set-option -t "$SESSION_NAME" -ga terminal-overrides ",xterm-256color:Tc"

# ─── Status Bar Styling (2-line) ──────────────────────────────────────────────

# Status bar position and refresh
tmux set-option -t "$SESSION_NAME" status-position bottom
tmux set-option -t "$SESSION_NAME" status-interval 5

# Enable 2-line status bar
tmux set-option -t "$SESSION_NAME" status 2

# Base styling - Tokyo Night inspired dark theme
tmux set-option -t "$SESSION_NAME" status-style "bg=#1a1b26,fg=#a9b1d6"

# Line 0 (top): Session name (stripped of claude- prefix) + Keybinds + Git branch
# Shows freeze recovery keys: Alt+k (soft kill), Alt+K (hard kill)
tmux set-option -t "$SESSION_NAME" status-format[0] "#[bg=#1a1b26]  #[fg=#e8683a bold]#{s/claude-//:session_name}  #[fg=#3b4261]·  #[fg=#7aa2f7]󰘬 #(git branch --show-current 2>/dev/null || echo '-')  #[align=right]#[fg=#7a7e8a]Alt+k freeze  Alt+x close  Alt+q detach  "

# Line 1 (bottom): Window tabs with smart truncation and brand color
# - Active window: full name (max 15 chars), brand orange highlight
# - Inactive windows: truncate to 8 chars with ... suffix, warm gray
tmux set-option -t "$SESSION_NAME" status-format[1] "#[bg=#1a1b26]#{W:#{?window_active,#[fg=#1a1b26 bg=#e8683a bold]  #I  #[fg=#e8683a bg=#2d2f3a]#[fg=#e0e0e0] #{=15:window_name} #[bg=#1a1b26 fg=#2d2f3a],#[fg=#8a8a8a]  #I:#{=|8|...:window_name}  }}"

# Pane border styling - blue inactive, orange active
tmux set-option -t "$SESSION_NAME" pane-border-style "fg=#3d59a1"
tmux set-option -t "$SESSION_NAME" pane-active-border-style "fg=#e8683a"

# Message styling - orange highlight
tmux set-option -t "$SESSION_NAME" message-style "bg=#e8683a,fg=#1a1b26,bold"

# ─── Keybindings ──────────────────────────────────────────────────────────────

# Window numbering starts at 1 (not 0)
tmux set-option -t "$SESSION_NAME" base-index 1

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

# ─── Freeze Recovery Keybindings ─────────────────────────────────────────────
# Alt+k to send Ctrl+C twice (soft interrupt for frozen processes)
tmux bind-key -n M-k run-shell "tmux send-keys C-c; sleep 0.5; tmux send-keys C-c"

# Alt+K (shift+k) to force-kill pane immediately (nuclear option for hard freezes)
tmux bind-key -n M-K kill-pane

# Alt+R (shift+r) to respawn the pane (restart with a fresh shell)
tmux bind-key -n M-R respawn-pane -k

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
