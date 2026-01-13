#!/bin/bash
# AgileFlow Status Line for Claude Code
# Displays contextual information from status.json and session data
#
# This script is called by Claude Code and receives JSON via stdin.
# Customize this script to change what's displayed in your status line.
#
# Available data from stdin JSON:
#   .model.display_name          - Model name (Opus, Sonnet, etc.)
#   .cost.total_cost_usd         - Session cost in USD
#   .context_window.context_window_size - Total context window size
#   .context_window.current_usage.input_tokens - Current input tokens
#   .workspace.current_dir       - Current working directory

# ============================================================================
# Load Shared Color Palette
# ============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/colors.sh
source "$SCRIPT_DIR/lib/colors.sh"

# ============================================================================
# Helper Functions
# ============================================================================

# Progress bar with custom characters: ▓ (filled) ░ (empty)
# Usage: progress_bar <percent> <width>
# Example: progress_bar 75 10 → "▓▓▓▓▓▓▓░░░"
progress_bar() {
  local pct="${1:-0}"
  local width="${2:-10}"

  # Validate and clamp percentage
  [[ "$pct" =~ ^[0-9]+$ ]] || pct=0
  ((pct < 0)) && pct=0
  ((pct > 100)) && pct=100

  local filled=$(( pct * width / 100 ))
  local empty=$(( width - filled ))

  # Build bar with custom characters
  local bar=""
  for ((i=0; i<filled; i++)); do bar+="▓"; done
  for ((i=0; i<empty; i++)); do bar+="░"; done

  echo "$bar"
}

# Convert ISO timestamp to epoch seconds (cross-platform)
to_epoch() {
  local ts="$1"
  # Try gdate first (macOS with coreutils)
  if command -v gdate >/dev/null 2>&1; then
    gdate -d "$ts" +%s 2>/dev/null && return
  fi
  # Try BSD date (macOS)
  date -u -j -f "%Y-%m-%dT%H:%M:%S%z" "${ts/Z/+0000}" +%s 2>/dev/null && return
  # Fallback to Python
  python3 - "$ts" <<'PY' 2>/dev/null
import sys, datetime
s=sys.argv[1].replace('Z','+00:00')
print(int(datetime.datetime.fromisoformat(s).timestamp()))
PY
}

# Format epoch to HH:MM
fmt_time_hm() {
  local epoch="$1"
  if date -r 0 +%s >/dev/null 2>&1; then
    date -r "$epoch" +"%H:%M"
  else
    date -d "@$epoch" +"%H:%M"
  fi
}

# ============================================================================
# Read Component Configuration
# ============================================================================
# Default: all components enabled
SHOW_AGILEFLOW=true
SHOW_MODEL=true
SHOW_STORY=true
SHOW_EPIC=true
SHOW_WIP=true
SHOW_CONTEXT=true
SHOW_CONTEXT_BAR=true
SHOW_SESSION_TIME=true
SHOW_COST=true
SHOW_GIT=true

# Check agileflow-metadata.json for component settings
if [ -f "docs/00-meta/agileflow-metadata.json" ]; then
  COMPONENTS=$(jq '.features.statusline.components // null' docs/00-meta/agileflow-metadata.json 2>/dev/null)
  if [ "$COMPONENTS" != "null" ] && [ -n "$COMPONENTS" ]; then
    # Use 'if . == null then true else . end' to properly handle false values
    # (jq's // operator treats false as falsy and applies the fallback)
    SHOW_AGILEFLOW=$(echo "$COMPONENTS" | jq -r '.agileflow | if . == null then true else . end')
    SHOW_MODEL=$(echo "$COMPONENTS" | jq -r '.model | if . == null then true else . end')
    SHOW_STORY=$(echo "$COMPONENTS" | jq -r '.story | if . == null then true else . end')
    SHOW_EPIC=$(echo "$COMPONENTS" | jq -r '.epic | if . == null then true else . end')
    SHOW_WIP=$(echo "$COMPONENTS" | jq -r '.wip | if . == null then true else . end')
    SHOW_CONTEXT=$(echo "$COMPONENTS" | jq -r '.context | if . == null then true else . end')
    SHOW_CONTEXT_BAR=$(echo "$COMPONENTS" | jq -r '.context_bar | if . == null then true else . end')
    SHOW_SESSION_TIME=$(echo "$COMPONENTS" | jq -r '.session_time | if . == null then true else . end')
    SHOW_COST=$(echo "$COMPONENTS" | jq -r '.cost | if . == null then true else . end')
    SHOW_GIT=$(echo "$COMPONENTS" | jq -r '.git | if . == null then true else . end')
  fi
fi

# ============================================================================
# AgileFlow Version & Update Check
# ============================================================================
AGILEFLOW_DISPLAY=""
if [ "$SHOW_AGILEFLOW" = "true" ]; then
  # Get local version from package.json or metadata
  LOCAL_VERSION=""
  if [ -f ".agileflow/package.json" ]; then
    LOCAL_VERSION=$(jq -r '.version // ""' .agileflow/package.json 2>/dev/null)
  elif [ -f "docs/00-meta/agileflow-metadata.json" ]; then
    LOCAL_VERSION=$(jq -r '.version // ""' docs/00-meta/agileflow-metadata.json 2>/dev/null)
  fi

  if [ -n "$LOCAL_VERSION" ] && [ "$LOCAL_VERSION" != "null" ]; then
    # Check for updates (cached for 1 hour to avoid rate limiting)
    UPDATE_CACHE="/tmp/agileflow-update-check"
    UPDATE_AVAILABLE=""
    LATEST_VERSION=""

    # Only check npm if cache is stale (older than 1 hour)
    if [ ! -f "$UPDATE_CACHE" ] || [ "$(find "$UPDATE_CACHE" -mmin +60 2>/dev/null)" ]; then
      # Quick npm check (timeout after 2 seconds)
      LATEST_VERSION=$(timeout 2 npm view agileflow version 2>/dev/null || echo "")
      if [ -n "$LATEST_VERSION" ]; then
        echo "$LATEST_VERSION" > "$UPDATE_CACHE"
      fi
    else
      LATEST_VERSION=$(cat "$UPDATE_CACHE" 2>/dev/null)
    fi

    # Compare versions
    if [ -n "$LATEST_VERSION" ] && [ "$LATEST_VERSION" != "$LOCAL_VERSION" ]; then
      # Simple version comparison (works for semver)
      if [ "$(printf '%s\n' "$LOCAL_VERSION" "$LATEST_VERSION" | sort -V | tail -n1)" = "$LATEST_VERSION" ] && [ "$LOCAL_VERSION" != "$LATEST_VERSION" ]; then
        UPDATE_AVAILABLE="$LATEST_VERSION"
      fi
    fi

    # Build display
    if [ -n "$UPDATE_AVAILABLE" ]; then
      AGILEFLOW_DISPLAY="${BRAND}agileflow${RESET} ${DIM}v${LOCAL_VERSION}${RESET} ${YELLOW}↑${UPDATE_AVAILABLE}${RESET}"
    else
      AGILEFLOW_DISPLAY="${BRAND}agileflow${RESET} ${DIM}v${LOCAL_VERSION}${RESET}"
    fi
  else
    AGILEFLOW_DISPLAY="${BRAND}agileflow${RESET}"
  fi
fi

# ============================================================================
# Parse Input JSON
# ============================================================================
input=$(cat)

# Parse model info (fallback to empty if no input)
MODEL_DISPLAY=$(echo "$input" | jq -r '.model.display_name // empty' 2>/dev/null)
[ -z "$MODEL_DISPLAY" ] && MODEL_DISPLAY=""

# ============================================================================
# Context Window Usage (reads from session JSONL file like cc-statusline)
# ============================================================================
# Claude Code doesn't pass context usage via stdin reliably, so we read it
# directly from the session's JSONL file (same approach as cc-statusline)

CTX_DISPLAY=""
CTX_BAR_DISPLAY=""
CTX_COLOR="$CTX_GREEN"
PERCENT_USED=0

# Get session_id and current_dir from input
SESSION_ID=$(echo "$input" | jq -r '.session_id // empty' 2>/dev/null)
CURRENT_DIR=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // empty' 2>/dev/null)

# Determine max context based on model (all modern models use 200K)
get_max_context() {
  local model="$1"
  case "$model" in
    *"Claude 3 Haiku"*|*"claude 3 haiku"*)
      echo "100000"  # 100K for original Claude 3 Haiku
      ;;
    *)
      echo "200000"  # 200K for Opus, Sonnet, modern Haiku
      ;;
  esac
}

MAX_CONTEXT=$(get_max_context "$MODEL_DISPLAY")

if [ -n "$SESSION_ID" ] && [ -n "$CURRENT_DIR" ]; then
  # Convert current dir to session file path (same as cc-statusline)
  # e.g., /home/coder/AgileFlow -> home-coder-AgileFlow
  PROJECT_DIR=$(echo "$CURRENT_DIR" | sed "s|^$HOME|~|g" | sed "s|~|$HOME|g" | sed 's|/|-|g' | sed 's|^-||')
  SESSION_FILE="$HOME/.claude/projects/-${PROJECT_DIR}/${SESSION_ID}.jsonl"

  if [ -f "$SESSION_FILE" ]; then
    # Get the latest input token count from the session file (last 20 lines)
    LATEST_TOKENS=$(tail -20 "$SESSION_FILE" | jq -r 'select(.message.usage) | .message.usage | ((.input_tokens // 0) + (.cache_read_input_tokens // 0))' 2>/dev/null | tail -1)

    if [ -n "$LATEST_TOKENS" ] && [ "$LATEST_TOKENS" -gt 0 ] 2>/dev/null; then
      PERCENT_USED=$((LATEST_TOKENS * 100 / MAX_CONTEXT))
      # Cap at 100%
      [ "$PERCENT_USED" -gt 100 ] && PERCENT_USED=100
    fi
  fi
fi

# Color based on usage level (RPI research: "dumb zone" starts at ~40%)
# See: docs/02-practices/context-engineering-rpi.md
#
# | Context Utilization | Zone                  | Performance           |
# |--------------------|-----------------------|-----------------------|
# | 0-40%              | Smart Zone            | Full reasoning        |
# | 40-70%             | Diminishing Returns   | Reduced quality       |
# | 70%+               | Dumb Zone             | Significant degradation|
#
CTX_ZONE=""
if [ "$PERCENT_USED" -ge 70 ]; then
  CTX_COLOR="$CTX_RED"      # Dumb zone - significant degradation
  CTX_ZONE="DUMB"
elif [ "$PERCENT_USED" -ge 40 ]; then
  CTX_COLOR="$CTX_YELLOW"   # Diminishing returns - reduced quality
  CTX_ZONE="DIM"
else
  CTX_COLOR="$CTX_GREEN"    # Smart zone - full capability
  CTX_ZONE="OK"
fi

# Build context display with optional zone indicator
if [ "$CTX_ZONE" = "DUMB" ]; then
  # Critical: show warning with zone label
  CTX_DISPLAY="${CTX_RED}⚠${RESET}${CTX_COLOR}${PERCENT_USED}%${RESET}"
elif [ "$CTX_ZONE" = "DIM" ]; then
  # Warning: show caution indicator
  CTX_DISPLAY="${CTX_YELLOW}↓${RESET}${CTX_COLOR}${PERCENT_USED}%${RESET}"
else
  CTX_DISPLAY="${CTX_COLOR}${PERCENT_USED}%${RESET}"
fi

# Generate progress bar (8 chars wide for compactness)
CTX_BAR=$(progress_bar "$PERCENT_USED" 8)
CTX_BAR_DISPLAY="${DIM}[${RESET}${CTX_COLOR}${CTX_BAR}${RESET}${DIM}]${RESET}"

# Parse cost
TOTAL_COST=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')
COST_DISPLAY=""
if [ "$TOTAL_COST" != "0" ] && [ "$TOTAL_COST" != "null" ]; then
  COST_CENTS=$(echo "$TOTAL_COST * 100" | bc 2>/dev/null | cut -d. -f1)
  if [ -n "$COST_CENTS" ] && [ "$COST_CENTS" -gt 100 ]; then
    # Over $1 - show in yellow
    COST_DISPLAY="${YELLOW}$(printf '$%.2f' "$TOTAL_COST")${RESET}"
  else
    COST_DISPLAY="${DIM}$(printf '$%.2f' "$TOTAL_COST")${RESET}"
  fi
fi

# ============================================================================
# Session Time Remaining (Native - reads Claude Code's local JSONL files)
# ============================================================================
# Claude Code uses 5-hour billing blocks. Block starts with first message activity.
# We scan ~/.claude/projects/*/*.jsonl to find the earliest message in the current
# 5-hour window and calculate remaining time.
#
# Algorithm (like ccusage):
# 1. Find all timestamps from JSONL files modified in last 5 hours
# 2. Sort and find the earliest timestamp >= (now - 5 hours)
# 3. That's the block start; block end = block start + 5 hours
# 4. Remaining = block end - now
#
# Optimization: Cache result for 60 seconds to avoid repeated scans
SESSION_DISPLAY=""
if [ "$SHOW_SESSION_TIME" = "true" ]; then
  SESSION_CACHE="/tmp/agileflow-session-cache"
  CACHE_MAX_AGE=60  # seconds
  NOW_SEC=$(date +%s)

  # Check cache first
  CACHED_BLOCK_START=""
  if [ -f "$SESSION_CACHE" ]; then
    CACHE_DATA=$(cat "$SESSION_CACHE" 2>/dev/null)
    CACHE_TIME=$(echo "$CACHE_DATA" | cut -d: -f1)
    CACHE_VALUE=$(echo "$CACHE_DATA" | cut -d: -f2)
    if [ -n "$CACHE_TIME" ] && [ $((NOW_SEC - CACHE_TIME)) -lt "$CACHE_MAX_AGE" ] 2>/dev/null; then
      CACHED_BLOCK_START="$CACHE_VALUE"
    fi
  fi

  BLOCK_START_SEC=""

  if [ -n "$CACHED_BLOCK_START" ] && [ "$CACHED_BLOCK_START" != "none" ]; then
    BLOCK_START_SEC="$CACHED_BLOCK_START"
  elif [ "$CACHED_BLOCK_START" != "none" ]; then
    # Need to scan - use Python for speed (handles ISO timestamps natively)
    CLAUDE_DATA_DIR="$HOME/.claude/projects"
    BLOCK_DURATION=$((5 * 60 * 60))  # 5 hours in seconds
    WINDOW_START=$((NOW_SEC - BLOCK_DURATION))

    if [ -d "$CLAUDE_DATA_DIR" ]; then
      BLOCK_START_SEC=$(python3 - "$CLAUDE_DATA_DIR" "$WINDOW_START" <<'PYTHON' 2>/dev/null
import sys, os, json, glob
from datetime import datetime

data_dir = sys.argv[1]
window_start = int(sys.argv[2])

earliest = None
# Only check files modified in last 5 hours (300 minutes)
for jsonl_path in glob.glob(f"{data_dir}/*/*.jsonl"):
    try:
        mtime = os.path.getmtime(jsonl_path)
        if mtime < window_start:
            continue  # Skip old files
        with open(jsonl_path, 'r') as f:
            for line in f:
                if '"timestamp"' not in line:
                    continue
                try:
                    data = json.loads(line)
                    ts_str = data.get('timestamp', '')
                    if ts_str:
                        # Parse ISO timestamp
                        ts_str = ts_str.replace('Z', '+00:00')
                        dt = datetime.fromisoformat(ts_str)
                        epoch = int(dt.timestamp())
                        if epoch >= window_start:
                            if earliest is None or epoch < earliest:
                                earliest = epoch
                except:
                    pass
    except:
        pass

if earliest:
    print(earliest)
PYTHON
)

      # Cache the result
      if [ -n "$BLOCK_START_SEC" ] && [ "$BLOCK_START_SEC" -gt 0 ] 2>/dev/null; then
        echo "${NOW_SEC}:${BLOCK_START_SEC}" > "$SESSION_CACHE"
      else
        echo "${NOW_SEC}:none" > "$SESSION_CACHE"
      fi
    fi
  fi

  # Calculate remaining time if we found a block start
  if [ -n "$BLOCK_START_SEC" ] && [ "$BLOCK_START_SEC" -gt 0 ] 2>/dev/null; then
    BLOCK_DURATION=$((5 * 60 * 60))
    BLOCK_END_SEC=$((BLOCK_START_SEC + BLOCK_DURATION))
    REMAINING=$((BLOCK_END_SEC - NOW_SEC))
    [ "$REMAINING" -lt 0 ] && REMAINING=0

    # Format remaining time
    RH=$((REMAINING / 3600))
    RM=$(((REMAINING % 3600) / 60))

    # Color based on time remaining (using vibrant 256-color palette)
    if [ "$RH" -eq 0 ] && [ "$RM" -lt 30 ]; then
      SESSION_COLOR="$SESSION_RED"     # Light pink - critical
    elif [ "$RH" -eq 0 ]; then
      SESSION_COLOR="$SESSION_YELLOW"  # Light yellow - getting low
    else
      SESSION_COLOR="$SESSION_GREEN"   # Light green - plenty of time
    fi

    # Build compact display: "⧗2h15m" or "⧗45m" (hourglass indicates remaining time)
    if [ "$RH" -gt 0 ]; then
      SESSION_DISPLAY="${SESSION_COLOR}⧗${RH}h${RM}m${RESET}"
    else
      SESSION_DISPLAY="${SESSION_COLOR}⧗${RM}m${RESET}"
    fi
  fi
fi

# ============================================================================
# AgileFlow Status - Read from status.json
# ============================================================================
STORY_DISPLAY=""
EPIC_DISPLAY=""
NEXT_STORY=""
WIP_DISPLAY=""

if [ -f "docs/09-agents/status.json" ]; then
  STATUS_JSON=$(cat docs/09-agents/status.json 2>/dev/null)

  # Find first in-progress story and its epic
  STORY_ID=$(echo "$STATUS_JSON" | jq -r '.stories | to_entries | map(select(.value.status == "in-progress")) | .[0].key // empty')

  if [ -n "$STORY_ID" ] && [ "$STORY_ID" != "null" ]; then
    STORY_TITLE=$(echo "$STATUS_JSON" | jq -r ".stories[\"$STORY_ID\"].title // \"\"")
    EPIC_ID=$(echo "$STATUS_JSON" | jq -r ".stories[\"$STORY_ID\"].epic // \"\"")

    if [ -n "$STORY_TITLE" ] && [ "$STORY_TITLE" != "null" ]; then
      # Truncate title if too long (max 25 chars)
      if [ ${#STORY_TITLE} -gt 25 ]; then
        STORY_TITLE="${STORY_TITLE:0:22}..."
      fi
      STORY_DISPLAY="${CYAN}${STORY_ID}${RESET}${DIM}:${RESET} ${STORY_TITLE}"
    fi

    # Get epic progress if we have an epic
    if [ -n "$EPIC_ID" ] && [ "$EPIC_ID" != "null" ]; then
      # Count total stories in this epic
      TOTAL_IN_EPIC=$(echo "$STATUS_JSON" | jq "[.stories | to_entries[] | select(.value.epic == \"$EPIC_ID\")] | length")
      # Count done stories in this epic
      DONE_IN_EPIC=$(echo "$STATUS_JSON" | jq "[.stories | to_entries[] | select(.value.epic == \"$EPIC_ID\" and .value.status == \"done\")] | length")

      if [ "$TOTAL_IN_EPIC" -gt 0 ] 2>/dev/null; then
        EPIC_PCT=$((DONE_IN_EPIC * 100 / TOTAL_IN_EPIC))

        # Color epic progress based on completion
        if [ "$EPIC_PCT" -ge 80 ]; then
          EPIC_COLOR="$GREEN"
        elif [ "$EPIC_PCT" -ge 50 ]; then
          EPIC_COLOR="$YELLOW"
        else
          EPIC_COLOR="$DIM"
        fi
        EPIC_DISPLAY="${MAGENTA}${EPIC_ID}${RESET} ${EPIC_COLOR}${DONE_IN_EPIC}/${TOTAL_IN_EPIC}${RESET}"
      fi
    fi
  else
    # No story in-progress - find next READY story (priority: high > medium > low)
    NEXT_ID=$(echo "$STATUS_JSON" | jq -r '
      .stories | to_entries
      | map(select(.value.status == "ready" or .value.status == "backlog" or .value.status == "draft"))
      | sort_by(
          if .value.priority == "high" then 0
          elif .value.priority == "medium" then 1
          else 2
          end
        )
      | .[0].key // empty
    ')

    if [ -n "$NEXT_ID" ] && [ "$NEXT_ID" != "null" ]; then
      NEXT_PRIORITY=$(echo "$STATUS_JSON" | jq -r ".stories[\"$NEXT_ID\"].priority // \"\"")
      # Color based on priority
      case "$NEXT_PRIORITY" in
        high) PRIORITY_COLOR="$RED" ;;
        medium) PRIORITY_COLOR="$YELLOW" ;;
        *) PRIORITY_COLOR="$GREEN" ;;
      esac
      NEXT_STORY="${DIM}Next:${RESET} ${PRIORITY_COLOR}${NEXT_ID}${RESET}"
    fi
  fi

  # Calculate WIP count
  WIP_COUNT=$(echo "$STATUS_JSON" | jq '[.stories | to_entries[] | select(.value.status == "in-progress" or .value.status == "in-review")] | length')
  WIP_LIMIT=3  # Default WIP limit
  if [ -n "$WIP_COUNT" ] && [ "$WIP_COUNT" != "null" ] && [ "$WIP_COUNT" -gt 0 ] 2>/dev/null; then
    # Color WIP based on limit
    if [ "$WIP_COUNT" -gt "$WIP_LIMIT" ]; then
      WIP_COLOR="$RED"
    elif [ "$WIP_COUNT" -eq "$WIP_LIMIT" ]; then
      WIP_COLOR="$YELLOW"
    else
      WIP_COLOR="$GREEN"
    fi
    WIP_DISPLAY="${DIM}WIP${RESET} ${WIP_COLOR}${WIP_COUNT}${RESET}"
  fi
fi

# ============================================================================
# Git Branch with Colors
# ============================================================================
GIT_DISPLAY=""
if git rev-parse --git-dir > /dev/null 2>&1; then
  BRANCH=$(git branch --show-current 2>/dev/null)
  if [ -n "$BRANCH" ]; then
    # Color based on branch type
    case "$BRANCH" in
      main|master)
        GIT_COLOR="$GREEN"
        ;;
      develop|dev)
        GIT_COLOR="$BLUE"
        ;;
      feature/*|feat/*)
        GIT_COLOR="$CYAN"
        ;;
      fix/*|bugfix/*|hotfix/*)
        GIT_COLOR="$RED"
        ;;
      release/*)
        GIT_COLOR="$MAGENTA"
        ;;
      *)
        GIT_COLOR="$DIM"
        ;;
    esac

    # Truncate long branch names
    if [ ${#BRANCH} -gt 20 ]; then
      BRANCH="${BRANCH:0:17}..."
    fi
    GIT_DISPLAY="${GIT_COLOR}${BRANCH}${RESET}"
  fi
fi

# ============================================================================
# Session Info (Multi-session awareness)
# ============================================================================
# Show current session info for ALL sessions (main and non-main)
SESSION_INFO=""
OTHER_SESSIONS=""
SHOW_SESSION=true  # New component - default enabled

# Check component setting
if [ "$COMPONENTS" != "null" ] && [ -n "$COMPONENTS" ]; then
  SHOW_SESSION=$(echo "$COMPONENTS" | jq -r '.session | if . == null then true else . end')
fi

if [ "$SHOW_SESSION" = "true" ]; then
  REGISTRY_FILE=".agileflow/sessions/registry.json"
  if [ -f "$REGISTRY_FILE" ]; then
    # Get current working directory
    CWD=$(pwd)

    # Find session matching current directory
    SESSION_DATA=$(jq -r --arg cwd "$CWD" '
      .sessions | to_entries[] | select(.value.path == $cwd) |
      {id: .key, nickname: .value.nickname, is_main: .value.is_main}
    ' "$REGISTRY_FILE" 2>/dev/null)

    # Count total sessions and other active sessions (sessions with lock files)
    TOTAL_SESSIONS=$(jq '.sessions | length' "$REGISTRY_FILE" 2>/dev/null)

    if [ -n "$SESSION_DATA" ]; then
      SESSION_NUM=$(echo "$SESSION_DATA" | jq -r '.id')
      SESSION_NICK=$(echo "$SESSION_DATA" | jq -r '.nickname // empty')
      IS_MAIN=$(echo "$SESSION_DATA" | jq -r '.is_main // false')

      # Only show session info for non-main sessions (main is default, no need to show)
      if [ -n "$SESSION_NUM" ] && [ "$IS_MAIN" != "true" ]; then
        if [ -n "$SESSION_NICK" ] && [ "$SESSION_NICK" != "null" ]; then
          # With nickname
          SESSION_INFO="${DIM}⎇${RESET} ${MAGENTA}Session ${SESSION_NUM}${RESET}${DIM}:${RESET}${SESSION_NICK}"
        else
          # Without nickname - show simple
          SESSION_INFO="${DIM}⎇${RESET} ${MAGENTA}Session ${SESSION_NUM}${RESET}"
        fi

        # Show other sessions count if > 1 (only relevant for non-main)
        if [ -n "$TOTAL_SESSIONS" ] && [ "$TOTAL_SESSIONS" -gt 1 ] 2>/dev/null; then
          OTHER_COUNT=$((TOTAL_SESSIONS - 1))
          OTHER_SESSIONS="${DIM} +${OTHER_COUNT}${RESET}"
        fi
      fi
    fi
  fi
fi

# ============================================================================
# Build Status Line
# ============================================================================
OUTPUT=""

# Separator
SEP=" ${DIM}│${RESET} "

# AgileFlow branding (if enabled)
if [ "$SHOW_AGILEFLOW" = "true" ] && [ -n "$AGILEFLOW_DISPLAY" ]; then
  OUTPUT="${AGILEFLOW_DISPLAY}"
fi

# Session info (always show when available, with other sessions count)
if [ "$SHOW_SESSION" = "true" ] && [ -n "$SESSION_INFO" ]; then
  [ -n "$OUTPUT" ] && OUTPUT="${OUTPUT}${SEP}"
  OUTPUT="${OUTPUT}${SESSION_INFO}"
  # Append other sessions count if there are parallel sessions
  if [ -n "$OTHER_SESSIONS" ]; then
    OUTPUT="${OUTPUT}${OTHER_SESSIONS}"
  fi
fi

# Model with subtle styling (if enabled and available)
if [ "$SHOW_MODEL" = "true" ] && [ -n "$MODEL_DISPLAY" ]; then
  [ -n "$OUTPUT" ] && OUTPUT="${OUTPUT}${SEP}"
  OUTPUT="${OUTPUT}${DIM}[${RESET}${BOLD}${MODEL_DISPLAY}${RESET}${DIM}]${RESET}"
fi

# Add current story OR next story suggestion (if enabled)
if [ "$SHOW_STORY" = "true" ]; then
  if [ -n "$STORY_DISPLAY" ]; then
    [ -n "$OUTPUT" ] && OUTPUT="${OUTPUT}${SEP}"
    OUTPUT="${OUTPUT}${STORY_DISPLAY}"
  elif [ -n "$NEXT_STORY" ]; then
    [ -n "$OUTPUT" ] && OUTPUT="${OUTPUT}${SEP}"
    OUTPUT="${OUTPUT}${NEXT_STORY}"
  fi
fi

# Add epic progress (if enabled and working on a story in an epic)
if [ "$SHOW_EPIC" = "true" ] && [ -n "$EPIC_DISPLAY" ]; then
  [ -n "$OUTPUT" ] && OUTPUT="${OUTPUT}${SEP}"
  OUTPUT="${OUTPUT}${EPIC_DISPLAY}"
fi

# Add WIP count (if enabled)
if [ "$SHOW_WIP" = "true" ] && [ -n "$WIP_DISPLAY" ]; then
  [ -n "$OUTPUT" ] && OUTPUT="${OUTPUT}${SEP}"
  OUTPUT="${OUTPUT}${WIP_DISPLAY}"
fi

# Add context usage (if enabled) - percentage and/or bar
if [ "$SHOW_CONTEXT" = "true" ] && [ -n "$CTX_DISPLAY" ]; then
  [ -n "$OUTPUT" ] && OUTPUT="${OUTPUT}${SEP}"
  if [ "$SHOW_CONTEXT_BAR" = "true" ] && [ -n "$CTX_BAR_DISPLAY" ]; then
    # Show both percentage and bar: "45% [▓▓▓▓░░░░]"
    OUTPUT="${OUTPUT}${CTX_DISPLAY} ${CTX_BAR_DISPLAY}"
  else
    OUTPUT="${OUTPUT}${CTX_DISPLAY}"
  fi
fi

# Add session time remaining (if enabled and available)
if [ "$SHOW_SESSION_TIME" = "true" ] && [ -n "$SESSION_DISPLAY" ]; then
  [ -n "$OUTPUT" ] && OUTPUT="${OUTPUT}${SEP}"
  OUTPUT="${OUTPUT}${SESSION_DISPLAY}"
fi

# Add cost (if enabled)
if [ "$SHOW_COST" = "true" ] && [ -n "$COST_DISPLAY" ]; then
  [ -n "$OUTPUT" ] && OUTPUT="${OUTPUT}${SEP}"
  OUTPUT="${OUTPUT}${COST_DISPLAY}"
fi

# Add git branch (if enabled)
if [ "$SHOW_GIT" = "true" ] && [ -n "$GIT_DISPLAY" ]; then
  [ -n "$OUTPUT" ] && OUTPUT="${OUTPUT}${SEP}"
  OUTPUT="${OUTPUT}${GIT_DISPLAY}"
fi

echo -e "$OUTPUT"
