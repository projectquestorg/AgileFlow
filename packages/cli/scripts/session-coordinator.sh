#!/bin/bash
# session-coordinator.sh - Automatic multi-session coordination
# Detects concurrent Claude Code sessions and handles conflicts

set -e

SESSIONS_DIR=".agileflow/sessions"
LOCK_TIMEOUT=3600  # 1 hour - stale session threshold

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

# Get current session ID (PID + timestamp for uniqueness)
SESSION_ID="$$-$(date +%s)"
SESSION_FILE="$SESSIONS_DIR/session-$SESSION_ID.lock"

# Ensure sessions directory exists
mkdir -p "$SESSIONS_DIR"

# Function: Check if a PID is still running
is_pid_alive() {
    local pid=$1
    if [[ -z "$pid" ]]; then
        return 1
    fi
    kill -0 "$pid" 2>/dev/null
}

# Function: Clean up stale sessions
cleanup_stale_sessions() {
    local now=$(date +%s)

    for lockfile in "$SESSIONS_DIR"/session-*.lock; do
        [[ -f "$lockfile" ]] || continue

        # Read lock file
        local lock_pid=$(grep "^pid=" "$lockfile" 2>/dev/null | cut -d= -f2)
        local lock_time=$(grep "^started=" "$lockfile" 2>/dev/null | cut -d= -f2)

        # Check if stale (PID dead or too old)
        if ! is_pid_alive "$lock_pid"; then
            rm -f "$lockfile"
            continue
        fi

        # Check if expired
        if [[ -n "$lock_time" ]]; then
            local age=$((now - lock_time))
            if [[ $age -gt $LOCK_TIMEOUT ]]; then
                rm -f "$lockfile"
            fi
        fi
    done
}

# Function: Get list of active sessions
get_active_sessions() {
    local sessions=()

    for lockfile in "$SESSIONS_DIR"/session-*.lock; do
        [[ -f "$lockfile" ]] || continue

        local lock_pid=$(grep "^pid=" "$lockfile" 2>/dev/null | cut -d= -f2)

        if is_pid_alive "$lock_pid"; then
            local branch=$(grep "^branch=" "$lockfile" 2>/dev/null | cut -d= -f2)
            local worktree=$(grep "^worktree=" "$lockfile" 2>/dev/null | cut -d= -f2)
            local story=$(grep "^story=" "$lockfile" 2>/dev/null | cut -d= -f2)
            sessions+=("$lock_pid:$branch:$worktree:$story")
        fi
    done

    printf '%s\n' "${sessions[@]}"
}

# Function: Register this session
register_session() {
    local branch=$(git branch --show-current 2>/dev/null || echo "unknown")
    local worktree=$(pwd)
    local story=""

    # Try to get current story from status.json
    if [[ -f "docs/09-agents/status.json" ]]; then
        story=$(grep -o '"current_story"[[:space:]]*:[[:space:]]*"[^"]*"' docs/09-agents/status.json 2>/dev/null | cut -d'"' -f4 || echo "")
    fi

    cat > "$SESSION_FILE" << EOF
pid=$$
started=$(date +%s)
branch=$branch
worktree=$worktree
story=$story
user=$(whoami)
EOF
}

# Function: Unregister session (called on exit)
unregister_session() {
    rm -f "$SESSION_FILE"
}

# Function: Create worktree for parallel work
create_worktree() {
    local branch_name=$1
    local worktree_path="../$(basename $(pwd))-$branch_name"

    echo -e "${BLUE}Creating worktree at $worktree_path...${RESET}"

    # Create branch if it doesn't exist
    if ! git show-ref --verify --quiet "refs/heads/$branch_name"; then
        git branch "$branch_name"
    fi

    # Create worktree
    git worktree add "$worktree_path" "$branch_name" 2>/dev/null || {
        echo -e "${RED}Failed to create worktree${RESET}"
        return 1
    }

    echo -e "${GREEN}✓ Worktree created: $worktree_path${RESET}"
    echo -e "${CYAN}Run: cd $worktree_path && claude${RESET}"

    echo "$worktree_path"
}

# Function: Display session status
show_session_status() {
    local active_sessions=($(get_active_sessions))
    local count=${#active_sessions[@]}

    if [[ $count -eq 0 ]]; then
        echo -e "${GREEN}✓ No other active sessions${RESET}"
        return 0
    fi

    echo -e "${YELLOW}⚠ $count other session(s) active:${RESET}"
    echo ""

    for session in "${active_sessions[@]}"; do
        IFS=':' read -r pid branch worktree story <<< "$session"
        echo -e "  ${DIM}PID${RESET} $pid"
        echo -e "  ${DIM}Branch${RESET} $branch"
        [[ -n "$story" ]] && echo -e "  ${DIM}Story${RESET} $story"
        echo -e "  ${DIM}Path${RESET} $worktree"
        echo ""
    done

    return 1
}

# Function: Suggest worktree with command
suggest_worktree() {
    local suggested_branch="session-$(date +%Y%m%d-%H%M%S)"

    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "${YELLOW}To work in parallel without conflicts:${RESET}"
    echo ""
    echo -e "  ${GREEN}Option 1: Create isolated worktree (recommended)${RESET}"
    echo -e "  ${DIM}git worktree add ../${PWD##*/}-parallel $suggested_branch${RESET}"
    echo -e "  ${DIM}cd ../${PWD##*/}-parallel && claude${RESET}"
    echo ""
    echo -e "  ${GREEN}Option 2: Work on different branch${RESET}"
    echo -e "  ${DIM}git checkout -b $suggested_branch${RESET}"
    echo ""
    echo -e "  ${GREEN}Option 3: Continue anyway (risk conflicts)${RESET}"
    echo -e "  ${DIM}Touch different files than other session${RESET}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
}

# Main execution
main() {
    local mode="${1:-check}"

    case "$mode" in
        "check")
            # Clean up stale sessions first
            cleanup_stale_sessions

            # Check for active sessions
            if show_session_status; then
                # No conflicts - register and continue
                register_session
                trap unregister_session EXIT
            else
                # Conflicts detected - show options
                suggest_worktree

                # Still register (user may proceed anyway)
                register_session
                trap unregister_session EXIT
            fi
            ;;

        "register")
            register_session
            echo -e "${GREEN}✓ Session registered${RESET}"
            ;;

        "unregister")
            unregister_session
            echo -e "${GREEN}✓ Session unregistered${RESET}"
            ;;

        "status")
            cleanup_stale_sessions
            show_session_status
            ;;

        "worktree")
            local branch="${2:-session-$(date +%Y%m%d-%H%M%S)}"
            create_worktree "$branch"
            ;;

        "cleanup")
            cleanup_stale_sessions
            echo -e "${GREEN}✓ Stale sessions cleaned${RESET}"
            ;;

        *)
            echo "Usage: session-coordinator.sh [check|register|unregister|status|worktree|cleanup]"
            exit 1
            ;;
    esac
}

main "$@"
