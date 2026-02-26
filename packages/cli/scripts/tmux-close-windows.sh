#!/bin/bash
# tmux-close-windows.sh - Batch close tmux windows via multi-select picker
#
# Called by Alt+W (Shift+Alt+w) keybind. Opens an fzf multi-select picker
# (or bash fallback) to close multiple windows at once. Each closed window
# is saved to the restore stack for Alt+T recovery.
#
# Usage: Run inside a tmux popup (display-popup -E)

STACK_FILE="$HOME/.tmux_closed_windows.log"
MAX_ENTRIES=20
SESSION=$(tmux display-message -p '#{session_name}' 2>/dev/null)
CURRENT_IDX=$(tmux display-message -p '#{window_index}' 2>/dev/null)

if [ -z "$SESSION" ]; then
  echo "Error: not in a tmux session"
  exit 1
fi

# Build window list (excluding current window)
WINDOWS=()
while IFS=$'\t' read -r idx name path pane_count; do
  [ "$idx" = "$CURRENT_IDX" ] && continue
  WINDOWS+=("$idx"$'\t'"$name"$'\t'"$path"$'\t'"$pane_count")
done < <(tmux list-windows -t "$SESSION" -F '#{window_index}	#{window_name}	#{pane_current_path}	#{window_panes}' 2>/dev/null)

if [ "${#WINDOWS[@]}" -eq 0 ]; then
  echo "No other windows to close"
  sleep 1
  exit 0
fi

# Save a window's state to the restore stack (same format as tmux-save-closed-window.sh)
save_window() {
  local idx="$1"
  local win_name pane_path claude_uuid timestamp

  win_name=$(tmux display-message -t "$SESSION:$idx" -p '#{window_name}' 2>/dev/null || echo '')
  pane_path=$(tmux display-message -t "$SESSION:$idx" -p '#{pane_current_path}' 2>/dev/null || echo "$HOME")
  claude_uuid=$(tmux show-options -p -t "$SESSION:$idx" -qv @claude_uuid 2>/dev/null || echo '')
  timestamp=$(date +%s)

  echo "${win_name}|${pane_path}|${claude_uuid}|${timestamp}" >> "$STACK_FILE"

  # Prune to MAX_ENTRIES
  if [ -f "$STACK_FILE" ]; then
    local line_count
    line_count=$(wc -l < "$STACK_FILE")
    if [ "$line_count" -gt "$MAX_ENTRIES" ]; then
      tail -n "$MAX_ENTRIES" "$STACK_FILE" > "${STACK_FILE}.tmp" && mv "${STACK_FILE}.tmp" "$STACK_FILE"
    fi
  fi
}

# Format window list for display
format_entry() {
  local idx="$1" name="$2" path="$3"
  local short_path
  short_path=$(echo "$path" | sed "s|^$HOME|~|")
  printf '[%s] %-14s %s' "$idx" "$name" "$short_path"
}

# ── fzf path ────────────────────────────────────────────────────────────────
if command -v fzf &>/dev/null; then
  # Build fzf input
  FZF_INPUT=""
  for entry in "${WINDOWS[@]}"; do
    IFS=$'\t' read -r idx name path pane_count <<< "$entry"
    FZF_INPUT+="$(format_entry "$idx" "$name" "$path")"$'\n'
  done

  SELECTED=$(printf '%s' "$FZF_INPUT" | fzf --multi \
    --header="TAB=select  ENTER=close selected  ESC=cancel" \
    --prompt="Close windows> " \
    --color="fg:#a9b1d6,bg:#1a1b26,hl:#e8683a,fg+:#e0e0e0,bg+:#2d2f3a,hl+:#e8683a,pointer:#e8683a,marker:#e8683a,prompt:#7aa2f7" \
    2>/dev/null)

  if [ -z "$SELECTED" ]; then
    exit 0
  fi

  # Extract window indices from selection, sort descending to avoid renumbering
  INDICES=()
  while IFS= read -r line; do
    idx=$(echo "$line" | sed 's/^\[//' | sed 's/\].*//')
    INDICES+=("$idx")
  done <<< "$SELECTED"

  # Sort indices in reverse order (highest first)
  IFS=$'\n' SORTED=($(printf '%s\n' "${INDICES[@]}" | sort -rn)); unset IFS

  CLOSED=0
  for idx in "${SORTED[@]}"; do
    save_window "$idx"
    tmux kill-window -t "$SESSION:$idx" 2>/dev/null && CLOSED=$((CLOSED + 1))
  done

  tmux display-message "Closed $CLOSED window(s)"
  exit 0
fi

# ── Bash fallback (no fzf) ──────────────────────────────────────────────────
SELECTED_FLAGS=()
for _ in "${WINDOWS[@]}"; do
  SELECTED_FLAGS+=(0)
done

while true; do
  clear
  printf '\n  \033[1;38;5;208mClose Windows\033[0m  (type numbers to toggle, Enter=close, q=cancel)\n\n'

  i=0
  for entry in "${WINDOWS[@]}"; do
    IFS=$'\t' read -r idx name path pane_count <<< "$entry"
    short_path=$(echo "$path" | sed "s|^$HOME|~|")
    if [ "${SELECTED_FLAGS[$i]}" = "1" ]; then
      printf '    \033[38;5;208m%d) [x] %-14s %s\033[0m\n' "$((i + 1))" "$name" "$short_path"
    else
      printf '    %d) [ ] %-14s %s\n' "$((i + 1))" "$name" "$short_path"
    fi
    i=$((i + 1))
  done

  # Count selected
  SEL_COUNT=0
  for f in "${SELECTED_FLAGS[@]}"; do
    [ "$f" = "1" ] && SEL_COUNT=$((SEL_COUNT + 1))
  done

  printf '\n  Selected: %d\n' "$SEL_COUNT"
  printf '  Toggle> '
  read -r INPUT

  if [ "$INPUT" = "q" ] || [ "$INPUT" = "Q" ]; then
    exit 0
  fi

  if [ -z "$INPUT" ]; then
    # Enter pressed — close selected windows
    if [ "$SEL_COUNT" -eq 0 ]; then
      printf '  No windows selected.\n'
      sleep 1
      continue
    fi

    # Collect selected indices in reverse order
    INDICES=()
    i=0
    for entry in "${WINDOWS[@]}"; do
      if [ "${SELECTED_FLAGS[$i]}" = "1" ]; then
        IFS=$'\t' read -r idx _ _ _ <<< "$entry"
        INDICES+=("$idx")
      fi
      i=$((i + 1))
    done

    IFS=$'\n' SORTED=($(printf '%s\n' "${INDICES[@]}" | sort -rn)); unset IFS

    CLOSED=0
    for idx in "${SORTED[@]}"; do
      save_window "$idx"
      tmux kill-window -t "$SESSION:$idx" 2>/dev/null && CLOSED=$((CLOSED + 1))
    done

    tmux display-message "Closed $CLOSED window(s)"
    exit 0
  fi

  # Toggle numbers from input (space-separated)
  for num in $INPUT; do
    if [[ "$num" =~ ^[0-9]+$ ]] && [ "$num" -ge 1 ] && [ "$num" -le "${#WINDOWS[@]}" ]; then
      idx=$((num - 1))
      if [ "${SELECTED_FLAGS[$idx]}" = "0" ]; then
        SELECTED_FLAGS[$idx]=1
      else
        SELECTED_FLAGS[$idx]=0
      fi
    fi
  done
done
