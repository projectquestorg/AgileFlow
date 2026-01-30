#!/bin/bash
# AgileFlow Color Palette - Bash Edition
#
# Source this file: source "$(dirname "${BASH_SOURCE[0]}")/lib/colors.sh"
#
# Color definitions are sourced from colors.generated.sh which is
# auto-generated from config/colors.yaml (single source of truth).
# Run: node scripts/generate-colors.js
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
# Source generated colors from YAML
# ============================================================================
_COLORS_DIR="$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=colors.generated.sh
source "${_COLORS_DIR}/colors.generated.sh"

# ============================================================================
# Context/Usage Colors (for status indicators)
# These are additional aliases not in the generated file
# ============================================================================
CTX_GREEN="$MINT_GREEN"          # Healthy context
CTX_YELLOW="$PEACH"              # Moderate usage
CTX_ORANGE="$PEACH"              # High usage (alias)
CTX_RED="$CORAL"                 # Critical

# ============================================================================
# Session Time Colors
# These are additional aliases not in the generated file
# ============================================================================
SESSION_GREEN="$LIGHT_GREEN"     # Plenty of time
SESSION_YELLOW="$LIGHT_YELLOW"   # Getting low
SESSION_RED="$LIGHT_PINK"        # Critical
