---
description: Show what's new in AgileFlow
argument-hint: (no arguments)
compact_context:
  priority: low
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:whats-new - Version reporter (display-only)"
    - "MUST display current version, last 3-5 versions from CHANGELOG.md"
    - "MUST check for updates via npm view agileflow version"
    - "MUST show GitHub link for full changelog"
    - "Display-only command (never writes files)"
  state_fields:
    - current_version
    - latest_available_version
---

# /agileflow:whats-new

Display recent AgileFlow updates and version history.

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:whats-new` - Show version history and updates (display-only)

**Quick Usage**:
```
/agileflow:whats-new
```

**What It Does**: Read CHANGELOG.md → Show last 3-5 versions → Check for updates → Display GitHub link

**Output**: Markdown display with version history (no file writes)

**Tool Usage**: None (display-only command)

<!-- COMPACT_SUMMARY_END -->

---

## Prompt

ROLE: AgileFlow Version Reporter

**STEP 1: Get current version and changelog**

Read the AgileFlow CHANGELOG.md:

```bash
cat .agileflow/CHANGELOG.md 2>/dev/null || echo "Changelog not found"
```

Also check the installed version from config.yaml:
```bash
cat .agileflow/config.yaml 2>/dev/null | grep 'version:' | head -1 || echo "Version unknown"
```

**STEP 2: Parse and display**

Parse the CHANGELOG.md and display:

1. **Current installed version** at the top
2. **Last 3-5 versions** with their changes
3. Use clear formatting with headers and bullets

**FORMAT:**

```
╭─────────────────────────────────────────────────────╮
│  AgileFlow Changelog                                │
│  Current: v2.57.0                                   │
╰─────────────────────────────────────────────────────╯

## v2.57.0 (2025-12-27)

### Added
• Auto-update system with configurable check frequency
• Update notifications in welcome message and status line
• Changelog display after updates

---

## v2.56.0 (2025-12-27)

### Added
• Dynamic IDE discovery - Codex CLI now in setup

### Changed
• Replaced hardcoded IDE list with dynamic loading

---

## v2.55.0 (2025-12-26)

### Changed
• Consolidated code improvements and debugging

---

📖 Full changelog: https://github.com/projectquestorg/AgileFlow/blob/main/packages/cli/CHANGELOG.md
🔄 Check for updates: npx agileflow update
⚙️  Configure auto-update: /agileflow:configure --auto-update
```

**STEP 3: Check for updates**

After displaying, check if an update is available:

```bash
npm view agileflow version 2>/dev/null
```

If a newer version exists, show:
```
⚡ Update available: v2.57.0 → v2.58.0
   Run: npx agileflow update
```

**RULES:**
- Show max 5 versions (most recent first)
- Use clear section headers
- Include dates if available
- Always show the GitHub link for full history
- Mention update availability if applicable
