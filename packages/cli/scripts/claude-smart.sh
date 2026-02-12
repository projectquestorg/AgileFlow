#!/bin/bash
# claude-smart.sh - Smart resume wrapper for Claude in tmux
#
# Uses per-pane tmux option @claude_uuid to track conversation identity.
# New windows start fresh; re-running in the same pane resumes the conversation.
#
# Usage:
#   claude-smart.sh              # Resume if UUID stored, else fresh
#   claude-smart.sh --fresh      # Force fresh start (ignore stored UUID)
#   claude-smart.sh [flags...]   # Pass-through flags to claude
#
# NO set -e: UUID capture must run even after Ctrl+C / non-zero exit

FRESH=false
ARGS=()

for arg in "$@"; do
  case $arg in
    --fresh)
      FRESH=true
      ;;
    *)
      ARGS+=("$arg")
      ;;
  esac
done

# ── Resolve conversation UUID ──────────────────────────────────────────────
STORED_UUID=""
if [ "$FRESH" = false ] && [ -n "$TMUX" ]; then
  STORED_UUID=$(tmux show-options -pqv @claude_uuid 2>/dev/null || true)
fi

# Validate: the .jsonl file must still exist
if [ -n "$STORED_UUID" ]; then
  PROJ_DIR=$(pwd | sed 's|/|-|g' | sed 's|^-||')
  SESSIONS_DIR="$HOME/.claude/projects/-$PROJ_DIR"
  if [ ! -f "$SESSIONS_DIR/$STORED_UUID.jsonl" ]; then
    STORED_UUID=""  # File gone, start fresh
  fi
fi

# ── Build and run Claude command ───────────────────────────────────────────
CMD=(claude)
if [ -n "$STORED_UUID" ]; then
  CMD+=(--resume "$STORED_UUID")
fi
CMD+=("${ARGS[@]}")

"${CMD[@]}"
EXIT_CODE=$?

# ── Capture UUID after exit ────────────────────────────────────────────────
# Store the most recent non-agent .jsonl as the pane's conversation UUID
if [ -n "$TMUX" ]; then
  PROJ_DIR=${PROJ_DIR:-$(pwd | sed 's|/|-|g' | sed 's|^-||')}
  SESSIONS_DIR=${SESSIONS_DIR:-"$HOME/.claude/projects/-$PROJ_DIR"}
  if [ -d "$SESSIONS_DIR" ]; then
    NEWEST=$(ls -t "$SESSIONS_DIR"/*.jsonl 2>/dev/null | grep -v "agent-" | head -1)
    if [ -n "$NEWEST" ]; then
      NEW_UUID=$(basename "$NEWEST" .jsonl)
      tmux set-option -p @claude_uuid "$NEW_UUID" 2>/dev/null || true
    fi
  fi
fi

exit $EXIT_CODE
