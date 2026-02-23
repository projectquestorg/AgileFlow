#!/bin/bash
# tmux-save-closed-window.sh - Capture window state before closing
#
# Called by Alt+W keybind before kill-window. Saves the current window's
# name, working directory, and Claude conversation UUID to a stack file
# so Alt+T can restore it later.
#
# Stack file: ~/.tmux_closed_windows.log (pipe-delimited, newest at bottom)
# Format: window_name|pane_current_path|claude_uuid|timestamp

STACK_FILE="$HOME/.tmux_closed_windows.log"
MAX_ENTRIES=20

# Capture current window/pane state from tmux
WINDOW_NAME=$(tmux display-message -p '#{window_name}' 2>/dev/null || echo '')
PANE_PATH=$(tmux display-message -p '#{pane_current_path}' 2>/dev/null || echo "$HOME")
CLAUDE_UUID=$(tmux show-options -pqv @claude_uuid 2>/dev/null || echo '')
TIMESTAMP=$(date +%s)

# Don't save if we couldn't get basic info
if [ -z "$WINDOW_NAME" ] && [ -z "$PANE_PATH" ]; then
  exit 0
fi

# Append entry to stack
echo "${WINDOW_NAME}|${PANE_PATH}|${CLAUDE_UUID}|${TIMESTAMP}" >> "$STACK_FILE"

# Prune to MAX_ENTRIES (keep newest)
if [ -f "$STACK_FILE" ]; then
  LINE_COUNT=$(wc -l < "$STACK_FILE")
  if [ "$LINE_COUNT" -gt "$MAX_ENTRIES" ]; then
    TAIL_COUNT=$MAX_ENTRIES
    tail -n "$TAIL_COUNT" "$STACK_FILE" > "${STACK_FILE}.tmp" && mv "${STACK_FILE}.tmp" "$STACK_FILE"
  fi
fi
