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

# Configure the session with user-friendly settings
tmux set-option -t "$SESSION_NAME" status on
tmux set-option -t "$SESSION_NAME" status-position bottom
tmux set-option -t "$SESSION_NAME" status-style 'bg=#282c34,fg=#abb2bf'
tmux set-option -t "$SESSION_NAME" status-left '#[fg=#61afef,bold] Claude '
tmux set-option -t "$SESSION_NAME" status-left-length 15
tmux set-option -t "$SESSION_NAME" status-right '#[fg=#98c379] Alt+1/2/3 to switch | q=quit '
tmux set-option -t "$SESSION_NAME" status-right-length 45
tmux set-option -t "$SESSION_NAME" window-status-format '#[fg=#5c6370] [#I] #W '
tmux set-option -t "$SESSION_NAME" window-status-current-format '#[fg=#61afef,bold,bg=#3e4452] [#I] #W '
tmux set-option -t "$SESSION_NAME" window-status-separator ''

# Set up keybindings - Alt+number to switch windows
for i in 1 2 3 4 5 6 7 8 9; do
  tmux bind-key -n "M-$i" select-window -t ":$((i-1))"
done
tmux bind-key -n q detach-client

# Send the claude command to the first window
CLAUDE_CMD="claude"
if [ $# -gt 0 ]; then
  # Pass any remaining arguments to claude
  CLAUDE_CMD="claude $*"
fi
tmux send-keys -t "$SESSION_NAME" "$CLAUDE_CMD" Enter

# Attach to the session
exec tmux attach-session -t "$SESSION_NAME"
