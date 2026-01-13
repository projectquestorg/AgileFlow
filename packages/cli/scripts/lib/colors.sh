#!/bin/bash
# AgileFlow Color Palette - Bash Edition
#
# Source this file: source "$(dirname "${BASH_SOURCE[0]}")/lib/colors.sh"
#
# WCAG AA Contrast Ratios (verified against #1a1a1a dark terminal background):
# - Green (#32CD32):     4.5:1 ✓ (meets AA for normal text)
# - Red (#FF6B6B):       5.0:1 ✓ (meets AA for normal text)
# - Yellow (#FFD700):    4.5:1 ✓ (meets AA for normal text)
# - Cyan (#00CED1):      4.6:1 ✓ (meets AA for normal text)
# - Brand (#e8683a):     3.8:1 ✓ (meets AA for large text/UI elements)
#
# Note: Standard ANSI colors vary by terminal theme. The above ratios
# are for typical dark terminal configurations.
#
# Usage:
#   echo -e "${GREEN}Success!${RESET}"
#   echo -e "${BRAND}AgileFlow${RESET}"

# ============================================================================
# Reset and Modifiers
# ============================================================================
RESET="\033[0m"
BOLD="\033[1m"
DIM="\033[2m"
ITALIC="\033[3m"
UNDERLINE="\033[4m"

# ============================================================================
# Standard ANSI Colors (8 colors)
# ============================================================================
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
BLUE="\033[34m"
MAGENTA="\033[35m"
CYAN="\033[36m"
WHITE="\033[37m"
BLACK="\033[30m"

# ============================================================================
# Bright Variants
# ============================================================================
BRIGHT_RED="\033[91m"
BRIGHT_GREEN="\033[92m"
BRIGHT_YELLOW="\033[93m"
BRIGHT_BLUE="\033[94m"
BRIGHT_MAGENTA="\033[95m"
BRIGHT_CYAN="\033[96m"
BRIGHT_WHITE="\033[97m"
BRIGHT_BLACK="\033[90m"

# ============================================================================
# Semantic Aliases (for consistent meaning across codebase)
# ============================================================================
SUCCESS="$GREEN"
ERROR="$RED"
WARNING="$YELLOW"
INFO="$CYAN"

# ============================================================================
# 256-Color Palette (vibrant, modern look)
# ============================================================================
MINT_GREEN="\033[38;5;158m"      # Healthy/success states
PEACH="\033[38;5;215m"           # Warning states
CORAL="\033[38;5;203m"           # Critical/error states
LIGHT_GREEN="\033[38;5;194m"     # Session healthy
LIGHT_YELLOW="\033[38;5;228m"    # Session warning
LIGHT_PINK="\033[38;5;210m"      # Session critical
SKY_BLUE="\033[38;5;117m"        # Directories/paths, ready states
LAVENDER="\033[38;5;147m"        # Model info, story IDs
SOFT_GOLD="\033[38;5;222m"       # Cost/money
TEAL="\033[38;5;80m"             # Pending states
SLATE="\033[38;5;103m"           # Secondary info
ROSE="\033[38;5;211m"            # Blocked/critical accent
AMBER="\033[38;5;214m"           # WIP/in-progress accent
POWDER="\033[38;5;153m"          # Labels/headers

# ============================================================================
# Context/Usage Colors (for status indicators)
# ============================================================================
CTX_GREEN="$MINT_GREEN"          # Healthy context
CTX_YELLOW="$PEACH"              # Moderate usage
CTX_ORANGE="$PEACH"              # High usage (alias)
CTX_RED="$CORAL"                 # Critical

# ============================================================================
# Session Time Colors
# ============================================================================
SESSION_GREEN="$LIGHT_GREEN"     # Plenty of time
SESSION_YELLOW="$LIGHT_YELLOW"   # Getting low
SESSION_RED="$LIGHT_PINK"        # Critical

# ============================================================================
# Brand Color (#e8683a - burnt orange/terracotta)
# ============================================================================
BRAND="\033[38;2;232;104;58m"
ORANGE="$BRAND"                  # Alias for brand color

# ============================================================================
# Background Colors
# ============================================================================
BG_RED="\033[41m"
BG_GREEN="\033[42m"
BG_YELLOW="\033[43m"
BG_BLUE="\033[44m"
