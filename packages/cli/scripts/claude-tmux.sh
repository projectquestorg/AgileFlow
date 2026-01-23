#!/bin/bash
# claude-tmux.sh - Wrapper script that auto-starts Claude Code in a tmux session
#
# Usage:
#   ./claude-tmux.sh              # Start in tmux with default session
#   ./claude-tmux.sh --no-tmux    # Start without tmux (regular claude)
#   ./claude-tmux.sh -n           # Same as --no-tmux
#
# When already in tmux: Just runs claude normally
# When not in tmux: Creates a tmux session and runs claude inside it

set -e

# Check for --no-tmux flag
NO_TMUX=false
for arg in "$@"; do
  case $arg in
    --no-tmux|-n)
      NO_TMUX=true
      shift
      ;;
  esac
done

# If --no-tmux was specified, just run claude directly
if [ "$NO_TMUX" = true ]; then
  exec claude "$@"
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

# Generate session name based on current directory
DIR_NAME=$(basename "$(pwd)")
SESSION_NAME="claude-${DIR_NAME}"

# Check if session already exists
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "Attaching to existing session: $SESSION_NAME"
  exec tmux attach-session -t "$SESSION_NAME"
fi

# Create new tmux session with Claude
echo "Starting Claude in tmux session: $SESSION_NAME"

# Create session in detached mode first
tmux new-session -d -s "$SESSION_NAME" -n "main"

# Minimal config - mouse and scrolling only, no fancy styling
tmux set-option -t "$SESSION_NAME" mouse on

# Fix colors - proper terminal support
tmux set-option -t "$SESSION_NAME" default-terminal "xterm-256color"

# Sane scrolling - works properly with vim/nvim
tmux bind-key -n WheelUpPane if-shell -F -t = "#{mouse_any_flag}" "send-keys -M" "if -Ft= '#{pane_in_mode}' 'send-keys -M' 'select-pane -t=; copy-mode -e; send-keys -M'"
tmux bind-key -n WheelDownPane select-pane -t= \; send-keys -M

# Detach with Ctrl+b d (default tmux behavior, NOT 'q'!)

# Send the claude command to the first window
CLAUDE_CMD="claude"
if [ $# -gt 0 ]; then
  # Pass any remaining arguments to claude
  CLAUDE_CMD="claude $*"
fi
tmux send-keys -t "$SESSION_NAME" "$CLAUDE_CMD" Enter

# Attach to the session
exec tmux attach-session -t "$SESSION_NAME"
