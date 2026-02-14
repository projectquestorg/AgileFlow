#!/usr/bin/env bash
# tmux-task-watcher.sh - Auto-rename tmux window based on Claude Code tasks
#
# Launched automatically by SessionStart hook. Self-backgrounds immediately.
# Polls ~/.claude/tasks/<session-id>/ for in-progress tasks every few seconds.
# Renames the tmux window to match the active task subject.
#
# Usage:
#   tmux-task-watcher.sh           # Start watcher (backgrounds itself)
#   tmux-task-watcher.sh stop      # Stop watcher for current pane
#
# Requirements:
#   - Must be inside tmux ($TMUX set)
#   - Node.js available (for JSON parsing)
#   - Claude Code session active ($CLAUDECODE=1)

set -euo pipefail

# Only run inside tmux
[ -n "${TMUX:-}" ] || exit 0

MODE="${1:-start}"
MAX_LEN=30

# Get current pane ID for per-pane tracking
PANE_ID=$(tmux display-message -p '#{pane_id}' 2>/dev/null || true)
[ -n "$PANE_ID" ] || exit 0

# PID file keyed by pane to allow multiple watchers (one per window)
SAFE_PANE_ID="${PANE_ID//[^a-zA-Z0-9]/_}"
PID_FILE="/tmp/tmux-task-watcher-${SAFE_PANE_ID}.pid"

# --- Stop mode ---
if [ "$MODE" = "stop" ]; then
  if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm "$PID_FILE" 2>/dev/null || true
  fi
  exit 0
fi

# --- Start mode ---
if [ "$MODE" = "start" ]; then
  # Kill any existing watcher for this pane first
  if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm "$PID_FILE" 2>/dev/null || true
  fi

  # Self-background: parent exits immediately so hook completes fast
  _WATCHER_BG=1 nohup "$0" "_run" >/dev/null 2>&1 &
  echo $! > "$PID_FILE"
  exit 0
fi

# --- _run mode: skip to background worker below ---

# ============================================================
# Background watcher logic (runs in forked process)
# ============================================================

# Disable strict mode for background worker - we handle errors ourselves
set +eu

# Derive Claude Code project dir from PWD
CLAUDE_PROJECT_DIR="${HOME}/.claude/projects/$(pwd | sed 's|/|-|g')"

# Find current session ID: most recently CREATED JSONL in project dir
# Uses birth time (stat %W) to avoid picking up other sessions' modified files
find_session_id() {
  [ -d "$CLAUDE_PROJECT_DIR" ] || return 1
  local best_file="" best_birth=0
  for f in "$CLAUDE_PROJECT_DIR"/*.jsonl; do
    [ -f "$f" ] || continue
    local birth
    birth=$(stat -c '%W' "$f" 2>/dev/null || echo "0")
    if [ "$birth" -gt "$best_birth" ] 2>/dev/null; then
      best_birth=$birth
      best_file=$f
    fi
  done
  [ -n "$best_file" ] || return 1
  basename "$best_file" .jsonl
}

# Wait briefly for session file to be created/updated
sleep 2

SESSION_ID=$(find_session_id || true)
if [ -z "$SESSION_ID" ]; then
  # Retry after a longer wait
  sleep 5
  SESSION_ID=$(find_session_id || true)
fi

# Store session ID as tmux pane option (for debugging/other scripts)
if [ -n "$SESSION_ID" ]; then
  tmux set-option -p @claude_session_id "$SESSION_ID" 2>/dev/null || true
fi

TASKS_DIR="${HOME}/.claude/tasks/${SESSION_ID}"
LAST_WINDOW_NAME=""
POLL_INTERVAL=5
MAX_RUNTIME=$((12 * 3600))  # 12 hours safety limit
START_TIME=$(date +%s)

# Parse task files and find the most recent in-progress task subject
get_active_task() {
  [ -d "$TASKS_DIR" ] || return
  node -e "
    const fs = require('fs'), path = require('path');
    const dir = process.argv[1];
    let best = { mtime: 0, subject: '' };
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.json') || f === '.lock') continue;
        const fp = path.join(dir, f);
        const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
        if (data.status === 'in_progress') {
          const mt = fs.statSync(fp).mtimeMs;
          if (mt > best.mtime) {
            best = { mtime: mt, subject: data.subject || data.activeForm || '' };
          }
        }
      }
    } catch(e) {}
    if (best.subject) process.stdout.write(best.subject);
  " "$TASKS_DIR" 2>/dev/null || true
}

truncate_name() {
  local name="$1"
  if [ ${#name} -gt $MAX_LEN ]; then
    printf '%s' "${name:0:$((MAX_LEN - 1))}"
  else
    printf '%s' "$name"
  fi
}

# Main polling loop
while true; do
  # Safety timeout
  NOW=$(date +%s)
  if [ $((NOW - START_TIME)) -gt $MAX_RUNTIME ]; then
    break
  fi

  # Check if our pane is still alive
  if ! tmux list-panes -a -F '#{pane_id}' 2>/dev/null | grep -qF "$PANE_ID"; then
    break
  fi

  # If we don't have a session ID yet, retry finding it
  if [ -z "$SESSION_ID" ]; then
    SESSION_ID=$(find_session_id || true)
    if [ -n "$SESSION_ID" ]; then
      tmux set-option -p @claude_session_id "$SESSION_ID" 2>/dev/null || true
      TASKS_DIR="${HOME}/.claude/tasks/${SESSION_ID}"
    fi
  fi

  # Get active task subject
  ACTIVE_TASK=$(get_active_task 2>/dev/null || true)

  if [ -n "$ACTIVE_TASK" ]; then
    NEW_NAME=$(truncate_name "$ACTIVE_TASK")
    if [ "$NEW_NAME" != "$LAST_WINDOW_NAME" ]; then
      tmux rename-window -t "$PANE_ID" "$NEW_NAME" 2>/dev/null || true
      LAST_WINDOW_NAME="$NEW_NAME"
    fi
  fi

  sleep "$POLL_INTERVAL"
done

# Cleanup
rm -f "$PID_FILE"
