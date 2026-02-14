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

# Claim file: marks which pane owns which session to prevent cross-contamination
CLAIM_DIR="/tmp/tmux-session-claims"

cleanup_claims() {
  [ -d "$CLAIM_DIR" ] || return 0
  for cf in "$CLAIM_DIR"/claim-*; do
    [ -f "$cf" ] || continue
    local claimer
    claimer=$(cat "$cf" 2>/dev/null || true)
    if [ "$claimer" = "$PANE_ID" ]; then
      rm -f "$cf"
    fi
  done
}

# --- Stop mode ---
if [ "$MODE" = "stop" ]; then
  if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm "$PID_FILE" 2>/dev/null || true
  fi
  cleanup_claims
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

# --- Session claim helpers ---
mkdir -p "$CLAIM_DIR" 2>/dev/null || true

claim_session() {
  local sid="$1"
  echo "$PANE_ID" > "$CLAIM_DIR/claim-${sid}" 2>/dev/null || true
}

is_claimed_by_other() {
  local sid="$1"
  local cf="$CLAIM_DIR/claim-${sid}"
  [ -f "$cf" ] || return 1  # not claimed
  local claimer
  claimer=$(cat "$cf" 2>/dev/null || true)
  # Empty or unreadable claim file - treat as unclaimed
  [ -n "$claimer" ] || return 1
  [ "$claimer" != "$PANE_ID" ] || return 1  # claimed by us = not "other"
  # Check if claimer pane is still alive
  if tmux list-panes -a -F '#{pane_id}' 2>/dev/null | grep -qF "$claimer"; then
    return 0  # claimed by another live pane
  fi
  # Claimer is dead - remove stale claim
  rm -f "$cf"
  return 1
}

# Find Claude PID running inside this tmux pane
find_claude_pid() {
  local pane_pid
  pane_pid=$(tmux display-message -p -t "$PANE_ID" '#{pane_pid}' 2>/dev/null || true)
  [ -n "$pane_pid" ] || return 1

  # Walk descendants of the pane shell looking for claude/claude-code process
  # Process tree: pane_shell -> (possibly bash/claude-smart.sh) -> claude
  local candidates
  candidates=$(ps -eo pid,ppid,comm 2>/dev/null | awk -v root="$pane_pid" '
    BEGIN { pids[root]=1 }
    { child=$1; parent=$2; comm=$3; children[parent]=children[parent] " " child; comms[child]=comm }
    END {
      # BFS through process tree
      queue[1]=root; qi=1; qn=1
      while (qi <= qn) {
        p = queue[qi++]
        n = split(children[p], kids, " ")
        for (i=1; i<=n; i++) {
          if (kids[i] != "") {
            qn++; queue[qn] = kids[i]
            pids[kids[i]] = 1
          }
        }
      }
      for (p in pids) {
        c = comms[p]
        if (c == "claude" || c == "claude-code" || c ~ /^node.*claude/) {
          print p
        }
      }
    }
  ' || true)

  # Return the first match
  echo "$candidates" | head -n1 | tr -d '[:space:]'
}

# Get process start time (epoch seconds) from /proc
get_pid_start_time() {
  local pid="$1"
  # /proc/<pid>/stat field 22 is starttime in clock ticks since boot
  # Simpler: use stat on /proc/<pid> - ctime ≈ process creation
  if [ -d "/proc/$pid" ]; then
    stat -c '%Z' "/proc/$pid" 2>/dev/null && return
  fi
  # Fallback: ps-based start time
  ps -o lstart= -p "$pid" 2>/dev/null | xargs -I{} date -d '{}' +%s 2>/dev/null || echo "0"
}

# --- 3-tier session finder ---
# Tier 1: Check tmux pane option (set by previous run or claude-smart.sh)
# Tier 2: Correlate Claude PID start time with JSONL birth time
# Tier 3: Newest unclaimed JSONL as fallback
find_session_id() {
  [ -d "$CLAUDE_PROJECT_DIR" ] || return 1

  # -- Tier 1: Cached pane option --
  local cached_id
  cached_id=$(tmux show-options -pqv @claude_session_id 2>/dev/null || true)
  if [ -n "$cached_id" ]; then
    local cached_dir="${HOME}/.claude/tasks/${cached_id}"
    if [ -d "$cached_dir" ] || [ -f "$CLAUDE_PROJECT_DIR/${cached_id}.jsonl" ]; then
      # Verify not claimed by another live pane
      if ! is_claimed_by_other "$cached_id"; then
        echo "$cached_id"
        return 0
      fi
    fi
  fi
  # Also check @claude_uuid (set by claude-smart.sh)
  cached_id=$(tmux show-options -pqv @claude_uuid 2>/dev/null || true)
  if [ -n "$cached_id" ] && [ -f "$CLAUDE_PROJECT_DIR/${cached_id}.jsonl" ]; then
    if ! is_claimed_by_other "$cached_id"; then
      echo "$cached_id"
      return 0
    fi
  fi

  # -- Tier 2: PID-to-JSONL time correlation --
  local claude_pid
  claude_pid=$(find_claude_pid || true)
  if [ -n "$claude_pid" ]; then
    local pid_start
    pid_start=$(get_pid_start_time "$claude_pid" || echo "0")
    if [ "$pid_start" -gt 0 ] 2>/dev/null; then
      local best_file="" best_delta=999999
      for f in "$CLAUDE_PROJECT_DIR"/*.jsonl; do
        [ -f "$f" ] || continue
        local birth
        birth=$(stat -c '%W' "$f" 2>/dev/null || echo "0")
        [ "$birth" -gt 0 ] 2>/dev/null || continue
        # JSONL should be born AFTER the PID started (within 120s window)
        local delta=$(( birth - pid_start ))
        if [ "$delta" -ge 0 ] && [ "$delta" -le 120 ] && [ "$delta" -lt "$best_delta" ]; then
          best_delta=$delta
          best_file=$f
        fi
      done
      if [ -n "$best_file" ]; then
        basename "$best_file" .jsonl
        return 0
      fi
    fi
  fi

  # -- Tier 3: Newest unclaimed JSONL --
  local best_file="" best_birth=0
  for f in "$CLAUDE_PROJECT_DIR"/*.jsonl; do
    [ -f "$f" ] || continue
    local sid
    sid=$(basename "$f" .jsonl)
    # Skip if claimed by another live pane
    if is_claimed_by_other "$sid"; then
      continue
    fi
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

# Store session ID and claim it for this pane
if [ -n "$SESSION_ID" ]; then
  tmux set-option -p @claude_session_id "$SESSION_ID" 2>/dev/null || true
  claim_session "$SESSION_ID"
fi

# Only set TASKS_DIR if we have a valid session (avoid scanning parent dir)
TASKS_DIR=""
if [ -n "$SESSION_ID" ]; then
  TASKS_DIR="${HOME}/.claude/tasks/${SESSION_ID}"
fi
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

  # Re-validate that our session hasn't been claimed by another pane
  if [ -n "$SESSION_ID" ] && is_claimed_by_other "$SESSION_ID"; then
    SESSION_ID=""
    TASKS_DIR=""
  fi

  # If we don't have a session ID yet, retry finding it
  if [ -z "$SESSION_ID" ]; then
    SESSION_ID=$(find_session_id || true)
    if [ -n "$SESSION_ID" ]; then
      tmux set-option -p @claude_session_id "$SESSION_ID" 2>/dev/null || true
      claim_session "$SESSION_ID"
      TASKS_DIR="${HOME}/.claude/tasks/${SESSION_ID}"
    fi
  fi

  # Get active task subject (only if we have a valid session)
  ACTIVE_TASK=""
  if [ -n "$TASKS_DIR" ]; then
    ACTIVE_TASK=$(get_active_task 2>/dev/null || true)
  fi

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
cleanup_claims
rm -f "$PID_FILE"
