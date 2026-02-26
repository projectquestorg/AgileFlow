#!/bin/bash
# claude-watchdog.sh - Background watchdog that detects and kills frozen Claude processes
#
# Usage: claude-watchdog.sh <session-name>
#
# Runs in the background, checking every WATCHDOG_INTERVAL seconds for Claude
# processes that appear frozen. A process is considered frozen when ALL of:
#   1. Running for > WATCHDOG_MAX_AGE_HOURS hours
#   2. Using > WATCHDOG_MAX_MEMORY_MB megabytes of RSS
#   3. No JSONL file modification in > WATCHDOG_MAX_IDLE_MINUTES minutes
#
# Recovery sequence: Ctrl+C x2 (5s wait) → SIGTERM (5s wait) → SIGKILL
# After kill, the pane stays open with a shell prompt (tab is NOT closed).
#
# Logs kills to ~/.claude/watchdog.log
#
# Environment variable configuration:
#   WATCHDOG_INTERVAL           Check interval in seconds (default: 120)
#   WATCHDOG_MAX_AGE_HOURS      Minimum process age to consider (default: 6)
#   WATCHDOG_MAX_MEMORY_MB      Minimum RSS in MB to consider (default: 400)
#   WATCHDOG_MAX_IDLE_MINUTES   Minutes since last JSONL write (default: 60)
#
# NOTE: Linux-only (requires /proc filesystem and GNU ps). macOS not supported.

set -euo pipefail

SESSION_NAME="${1:-}"
if [ -z "$SESSION_NAME" ]; then
  echo "Usage: claude-watchdog.sh <session-name>" >&2
  exit 1
fi

# Configuration (all overridable via environment)
INTERVAL="${WATCHDOG_INTERVAL:-120}"
MAX_AGE_HOURS="${WATCHDOG_MAX_AGE_HOURS:-6}"
MAX_MEMORY_MB="${WATCHDOG_MAX_MEMORY_MB:-400}"
MAX_IDLE_MINUTES="${WATCHDOG_MAX_IDLE_MINUTES:-60}"

# Validate numeric configuration
for _var_name in INTERVAL MAX_AGE_HOURS MAX_MEMORY_MB MAX_IDLE_MINUTES; do
  _var_val="${!_var_name}"
  if ! [[ "$_var_val" =~ ^[0-9]+$ ]]; then
    echo "ERROR: $_var_name must be a positive integer, got: '$_var_val'" >&2
    exit 1
  fi
done

LOG_FILE="$HOME/.claude/watchdog.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$timestamp] [watchdog:$SESSION_NAME] $*" >> "$LOG_FILE"
}

log "Started (interval=${INTERVAL}s, max_age=${MAX_AGE_HOURS}h, max_mem=${MAX_MEMORY_MB}MB, max_idle=${MAX_IDLE_MINUTES}m)"

# Clean exit when session is destroyed
cleanup() {
  log "Stopping (session gone or signal received)" || true
  exit 0
}
trap cleanup INT TERM

# Check if a process's JSONL files have been modified recently
# Returns 0 if idle (no recent writes), 1 if active
is_process_idle() {
  local pid="$1"
  local idle_minutes="$2"

  # Find the working directory of the process to locate .claude/ project dirs
  local cwd
  cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null) || return 1

  # Build the project path Claude Code uses for JSONL session files
  local proj_dir
  proj_dir=$(echo "$cwd" | sed 's|/|-|g' | sed 's|^-||')
  local sessions_dir="$HOME/.claude/projects/-$proj_dir"

  if [ ! -d "$sessions_dir" ]; then
    # No session dir means no activity tracking — assume idle
    return 0
  fi

  # Check if any JSONL file was modified within idle_minutes
  local recent_file
  recent_file=$(find "$sessions_dir" -name '*.jsonl' -mmin "-$idle_minutes" -print -quit 2>/dev/null)

  if [ -n "$recent_file" ]; then
    # Recently modified — process is active
    return 1
  fi

  # No recent modifications — process is idle
  return 0
}

# Get process RSS in MB (Linux /proc-based, ps fallback)
get_rss_mb() {
  local pid="$1"
  local rss_kb
  if [ -f "/proc/$pid/status" ]; then
    rss_kb=$(awk '/^VmRSS:/ { print $2 }' "/proc/$pid/status" 2>/dev/null) || return 1
    [ -z "$rss_kb" ] && return 1  # process died between stat and read
    echo $(( rss_kb / 1024 ))
  else
    rss_kb=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ') || return 1
    [ -z "$rss_kb" ] && return 1
    echo $(( rss_kb / 1024 ))
  fi
}

# Get process age in hours
get_age_hours() {
  local pid="$1"
  local elapsed_seconds
  elapsed_seconds=$(ps -o etimes= -p "$pid" 2>/dev/null | tr -d ' ') || return 1
  [ -z "$elapsed_seconds" ] && return 1
  echo $(( elapsed_seconds / 3600 ))
}

# Gracefully kill a frozen process with escalating signals
kill_frozen_process() {
  local pid="$1"
  local pane_id="$2"
  local age_h="$3"
  local mem_mb="$4"

  log "FROZEN DETECTED: PID=$pid pane=$pane_id age=${age_h}h mem=${mem_mb}MB"
  log "Recovery: sending Ctrl+C x2 to pane $pane_id"

  # Step 1: Try Ctrl+C twice via tmux (gentlest approach)
  tmux send-keys -t "$pane_id" C-c 2>/dev/null || true
  sleep 1
  tmux send-keys -t "$pane_id" C-c 2>/dev/null || true
  sleep 4

  # Check if process is still alive
  if ! kill -0 "$pid" 2>/dev/null; then
    log "Process $pid terminated after Ctrl+C"
    return 0
  fi

  # Step 2: SIGTERM
  log "Recovery: sending SIGTERM to PID $pid"
  kill -TERM "$pid" 2>/dev/null || true
  sleep 5

  if ! kill -0 "$pid" 2>/dev/null; then
    log "Process $pid terminated after SIGTERM"
    return 0
  fi

  # Step 3: SIGKILL (last resort)
  log "Recovery: sending SIGKILL to PID $pid"
  kill -KILL "$pid" 2>/dev/null || true
  sleep 1

  if ! kill -0 "$pid" 2>/dev/null; then
    log "Process $pid terminated after SIGKILL"
  else
    log "WARNING: Process $pid survived SIGKILL — zombie or kernel issue"
  fi

  return 0
}

# Main check loop
while true; do
  # Exit if session no longer exists
  if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    log "Session '$SESSION_NAME' no longer exists"
    break
  fi

  # Iterate over all panes in the session
  while IFS= read -r pane_info; do
    [ -z "$pane_info" ] && continue

    pane_id="${pane_info%% *}"
    pane_pid="${pane_info#* }"

    # Find claude child processes under this pane's shell
    # Look for processes whose command contains "claude" under the pane PID
    while IFS= read -r child_line; do
      [ -z "$child_line" ] && continue

      child_pid="${child_line%% *}"
      child_cmd="${child_line#* }"

      # Skip non-claude processes and skip ourselves
      case "$child_cmd" in
        *claude-watchdog*|*watchdog*) continue ;;
        *claude*) ;;  # This is a Claude process — check it
        *) continue ;;
      esac

      # Criterion 1: Age check
      age_h=$(get_age_hours "$child_pid" 2>/dev/null) || continue
      if [ "$age_h" -lt "$MAX_AGE_HOURS" ]; then
        continue
      fi

      # Criterion 2: Memory check
      mem_mb=$(get_rss_mb "$child_pid" 2>/dev/null) || continue
      if [ "$mem_mb" -lt "$MAX_MEMORY_MB" ]; then
        continue
      fi

      # Criterion 3: Idle check (most important — prevents killing active work)
      if ! is_process_idle "$child_pid" "$MAX_IDLE_MINUTES"; then
        # Process has recent JSONL activity — NOT frozen, just long-running
        continue
      fi

      # All three criteria met — this process is frozen
      kill_frozen_process "$child_pid" "$pane_id" "$age_h" "$mem_mb"

    done < <(ps --ppid "$pane_pid" -o pid=,args= 2>/dev/null || true)

  done < <(tmux list-panes -t "$SESSION_NAME" -F '#{pane_id} #{pane_pid}' 2>/dev/null || true)

  sleep "$INTERVAL"
done
