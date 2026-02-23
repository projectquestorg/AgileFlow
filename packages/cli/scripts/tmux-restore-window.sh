#!/bin/bash
# tmux-restore-window.sh - Restore the most recently closed tmux window
#
# Called by Alt+T keybind. Pops the last entry from the closed windows
# stack and creates a new window with the saved name, directory, and
# Claude conversation UUID.
#
# Edge cases:
#   - Empty stack: shows "No closed windows" message
#   - Deleted directory: falls back to $HOME
#   - No UUID: opens window with shell only (no Claude launch)
#   - Deleted .jsonl: claude-smart.sh handles this (starts fresh)

STACK_FILE="$HOME/.tmux_closed_windows.log"

# Check if stack file exists and has entries
if [ ! -f "$STACK_FILE" ] || [ ! -s "$STACK_FILE" ]; then
  tmux display-message "No closed windows to restore"
  exit 0
fi

# Pop the last entry
LAST_LINE=$(tail -1 "$STACK_FILE")

# Remove the last line from the file
# Use sed to delete last line in-place
if [ "$(wc -l < "$STACK_FILE")" -le 1 ]; then
  # Only one line — just empty the file
  : > "$STACK_FILE"
else
  sed -i '$ d' "$STACK_FILE"
fi

# Parse pipe-delimited fields
IFS='|' read -r WINDOW_NAME PANE_PATH CLAUDE_UUID TIMESTAMP <<< "$LAST_LINE"

# Validate directory — fall back to $HOME if missing
if [ ! -d "$PANE_PATH" ]; then
  PANE_PATH="$HOME"
fi

# Default window name if empty
if [ -z "$WINDOW_NAME" ]; then
  WINDOW_NAME="restored"
fi

# Create new window with saved name and directory
tmux new-window -n "$WINDOW_NAME" -c "$PANE_PATH"

# If we have a UUID, set it on the pane and launch Claude
if [ -n "$CLAUDE_UUID" ]; then
  tmux set-option -p @claude_uuid "$CLAUDE_UUID" 2>/dev/null || true

  # Resolve scripts directory from environment or relative to this script
  SCRIPTS_DIR="${AGILEFLOW_SCRIPTS:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"

  # Launch Claude via smart wrapper (will auto-resume from @claude_uuid)
  SMART_CMD="\"$SCRIPTS_DIR/claude-smart.sh\""
  if [ -n "$CLAUDE_SESSION_FLAGS" ]; then
    SMART_CMD="$SMART_CMD $CLAUDE_SESSION_FLAGS"
  fi
  tmux send-keys "$SMART_CMD" Enter

  tmux display-message "Restored: $WINDOW_NAME (conversation resumed)"
else
  tmux display-message "Restored: $WINDOW_NAME (no conversation)"
fi
