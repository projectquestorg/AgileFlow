#!/usr/bin/env bash
# tmux-task-name.sh - Rename current tmux window based on task/work description
#
# Called by Claude Code when starting work on a task (via TaskCreate/TaskUpdate).
# Reads the task subject from ~/.claude/tasks/ or accepts it as an argument.
#
# Usage:
#   tmux-task-name.sh "Fix auth middleware"    # Rename to task subject
#   tmux-task-name.sh --scan                   # Auto-detect from task files
#   tmux-task-name.sh --reset                  # Reset to default "claude-N"
#
# The script is best-effort: silently exits if not inside tmux.

set -euo pipefail

# Exit silently if not in tmux
[ -n "${TMUX:-}" ] || exit 0

MAX_LEN=30

truncate_name() {
  local name="$1"
  if [ ${#name} -gt $MAX_LEN ]; then
    echo "${name:0:$((MAX_LEN - 1))}…"
  else
    echo "$name"
  fi
}

# Mode: reset to default sequential name
if [ "${1:-}" = "--reset" ]; then
  N=$(( $(tmux list-windows -F '#{window_name}' 2>/dev/null | grep -c '^claude') ))
  [ "$N" -eq 0 ] && N=1
  tmux rename-window "claude-$N" 2>/dev/null || true
  exit 0
fi

# Mode: scan ~/.claude/tasks/ for most recently modified in-progress task
if [ "${1:-}" = "--scan" ]; then
  TASKS_DIR="${HOME}/.claude/tasks"
  [ -d "$TASKS_DIR" ] || exit 0

  BEST_SUBJECT=""
  BEST_MTIME=0

  for dir in "$TASKS_DIR"/*/; do
    [ -d "$dir" ] || continue
    for f in "$dir"*.json; do
      [ -f "$f" ] || continue
      # Check if task is in_progress and get subject
      status=$(python3 -c "import json,sys; d=json.load(open('$f')); print(d.get('status',''))" 2>/dev/null || echo "")
      if [ "$status" = "in_progress" ]; then
        mtime=$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f" 2>/dev/null || echo "0")
        if [ "$mtime" -gt "$BEST_MTIME" ]; then
          BEST_MTIME=$mtime
          BEST_SUBJECT=$(python3 -c "import json; d=json.load(open('$f')); print(d.get('subject',''))" 2>/dev/null || echo "")
        fi
      fi
    done
  done

  if [ -n "$BEST_SUBJECT" ]; then
    tmux rename-window "$(truncate_name "$BEST_SUBJECT")" 2>/dev/null || true
  fi
  exit 0
fi

# Mode: direct - rename to provided argument
if [ -n "${1:-}" ]; then
  tmux rename-window "$(truncate_name "$1")" 2>/dev/null || true
  exit 0
fi

echo "Usage: tmux-task-name.sh <task-subject> | --scan | --reset" >&2
exit 1
