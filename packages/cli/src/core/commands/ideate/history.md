---
description: Query ideation history and idea status
argument-hint: "[IDEA-XXXX] [STATUS=pending|in-progress|implemented|recurring] [MODE=trends] [COMPARE=report1,report2]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ideate:history - Query ideation history"
    - "Read ideation index from docs/00-meta/ideation-index.json"
    - "Support filtering by status, category, or specific IDEA-XXXX"
    - "Show recurring ideas (appeared 2+ times) prominently"
    - "MODE=trends: Show aggregate statistics across all reports"
    - "COMPARE=r1,r2: Diff two reports (Resolved/New/Persisted/Dropped)"
---

# /agileflow:ideate:history

Query ideation history and track idea status across all previous ideation reports.

---

## Quick Usage

```
/agileflow:ideate:history                      # Show summary
/agileflow:ideate:history IDEA-0023            # View specific idea
/agileflow:ideate:history STATUS=pending       # Filter by status
/agileflow:ideate:history STATUS=recurring     # Show recurring ideas (2+ occurrences)
/agileflow:ideate:history CATEGORY=Security    # Filter by category
/agileflow:ideate:history MODE=trends          # Show trend analysis across all reports
/agileflow:ideate:history COMPARE=20260114,20260130  # Compare two reports
```

---

## How It Works

This command reads the ideation index (`docs/00-meta/ideation-index.json`) which tracks all ideas generated across ideation sessions. Each idea has:
- Unique ID (IDEA-XXXX)
- Status (pending, in-progress, implemented, rejected)
- Occurrence count (how many times it appeared)
- Linked story/epic (if implemented)
- First seen date and source report

---

## Prompt

ROLE: Ideation History Query Tool

You help users explore their ideation history and find actionable insights from past ideation reports.

### STEP 1: LOAD INDEX

Read the ideation index:
```
Read file: docs/00-meta/ideation-index.json
```

If the file doesn't exist:
```
The ideation index hasn't been created yet.

To populate it, either:
1. Run /agileflow:ideate:new to generate new ideas (index created automatically)
2. Run the migration script to backfill from existing reports:
   node .agileflow/scripts/migrate-ideation-index.js
```

### STEP 2: PARSE ARGUMENTS

**Arguments**:
- `IDEA-XXXX`: Show details for a specific idea
- `STATUS=<status>`: Filter by status
  - `pending`: Ideas not yet addressed
  - `in-progress`: Ideas being worked on
  - `implemented`: Ideas that have been completed
  - `rejected`: Ideas that were rejected
  - `recurring`: Special filter for ideas seen 2+ times
- `CATEGORY=<category>`: Filter by category (Security, Performance, Code Quality, UX/Design, Testing, API/Architecture)
- `MODE=trends`: Show aggregate trend analysis across all reports (US-0210)
- `COMPARE=<r1>,<r2>`: Compare two reports to see progress (US-0211)

### STEP 3: GENERATE OUTPUT

**Default Output (Summary)**:

```
IDEATION HISTORY
════════════════════════════════════════════════════════════════

📊 Overview
  Total Ideas:     {N}
  Total Reports:   {M}
  Recurring Ideas: {R} (appeared 2+ times)

📈 By Status
  ✅ Implemented:  {X} ({P}%)
  🚧 In Progress:  {Y} ({P}%)
  ⏳ Pending:      {Z} ({P}%)
  ❌ Rejected:     {W} ({P}%)

📂 By Category
  🔒 Security:       {N}
  ⚡ Performance:    {N}
  🧹 Code Quality:   {N}
  🎨 UX/Design:      {N}
  🧪 Testing:        {N}
  🏗️ API/Architecture: {N}

════════════════════════════════════════════════════════════════

🔥 Top Recurring Ideas (Not Yet Addressed)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. [IDEA-0023] Error Handling Consolidation
   Category: Code Quality | Occurrences: 4
   First seen: ideation-20260106.md
   Status: pending

2. [IDEA-0045] Path Traversal Protection
   Category: Security | Occurrences: 3
   First seen: ideation-20260109.md
   Status: pending

3. [IDEA-0067] Terminal Width Adaptation
   Category: UX/Design | Occurrences: 3
   First seen: ideation-20260112.md
   Status: pending

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Quick Actions:
  • /agileflow:ideate:history STATUS=pending    - View all pending ideas
  • /agileflow:ideate:history STATUS=recurring  - View all recurring ideas
  • /agileflow:ideate:history IDEA-0023         - View specific idea details
  • /agileflow:ideate:new                       - Generate new ideas
```

**Specific Idea Output** (when IDEA-XXXX provided):

```
IDEA DETAILS: IDEA-0023
════════════════════════════════════════════════════════════════

📋 Error Handling Consolidation

Status:      ⏳ Pending
Category:    Code Quality
Impact:      High
Confidence:  HIGH (3 experts agreed)

📁 Files Affected:
  • packages/cli/lib/errors.js
  • packages/cli/tools/cli/lib/ide-errors.js
  • packages/cli/tools/cli/lib/error-handler.js

📝 Description:
Three separate error systems exist with inconsistent patterns.
Consolidate into unified error handling with typed exceptions.

📊 Occurrence History:
  1. ideation-20260106.md (2026-01-06) - Experts: Code Quality, API
  2. ideation-20260114.md (2026-01-14) - Experts: Security, Code Quality, API
  3. ideation-20260121.md (2026-01-21) - Experts: Code Quality
  4. ideation-20260130.md (2026-01-30) - Experts: Code Quality, UX

🔗 Linked Items:
  Story: None
  Epic:  None

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Actions:
  • Create story: /agileflow:story "Error Handling Consolidation"
  • Mark in progress: Update ideation index manually
  • View original report: Read docs/08-project/ideation/ideation-20260106.md
```

**Status Filter Output** (when STATUS=pending):

```
PENDING IDEAS ({N} total)
════════════════════════════════════════════════════════════════

High Priority (Recurring)
━━━━━━━━━━━━━━━━━━━━━━━━━

[IDEA-0023] Error Handling Consolidation
  Category: Code Quality | Occurrences: 4 | First: 2026-01-06

[IDEA-0045] Path Traversal Protection
  Category: Security | Occurrences: 3 | First: 2026-01-09

Standard Priority
━━━━━━━━━━━━━━━━━

[IDEA-0089] Add Redis Caching
  Category: Performance | Occurrences: 1 | First: 2026-01-14

[IDEA-0091] TypeScript Strict Mode
  Category: Code Quality | Occurrences: 1 | First: 2026-01-14

... (showing first 10 of {N})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use /agileflow:ideate:history IDEA-XXXX for details on any idea
```

**Trend Analysis Output** (when MODE=trends):

Use helper script: `node .agileflow/scripts/lib/ideation-index.js trends`

```
IDEATION TREND ANALYSIS
════════════════════════════════════════════════════════════════

📊 Overview ({N} ideas across {M} reports)
  Implementation Rate: {P}% ({X}/{N} ideas implemented)
  Avg. Velocity: {V} ideas/month resolved

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 Category Hotspots (by implementation success)
  ⚡ Performance:      76% resolved (16/21 ideas)
  🧪 Testing:         57% resolved (16/28 ideas)
  🔒 Security:        74% resolved (14/19 ideas)
  🧹 Code Quality:    56% resolved (14/25 ideas)
  🏗️ API/Architecture: 20% resolved (1/5 ideas)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ Stale Ideas (appeared 4+ times, never addressed)
These ideas keep appearing but aren't being worked on:

1. [IDEA-XXXX] {Title} (appeared {N}x)
   First seen: {date} ({D} days ago)
   Category: {category}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤝 Expert Agreement Patterns
These expert pairs frequently agree on the same ideas:

  AG-REFACTOR + AG-API:       {N} shared ideas
  AG-TESTING + AG-SECURITY:   {N} shared ideas
  AG-PERFORMANCE + AG-API:    {N} shared ideas

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 Implementation Velocity by Month
  2026-01: +{new} new, {impl} resolved
  2026-02: +{new} new, {impl} resolved

════════════════════════════════════════════════════════════════
💡 Insights:
  • Performance ideas have highest success rate - consider prioritizing these
  • {N} ideas stale for 4+ occurrences - need attention
  • Most common expert agreement: {pair} ({N} ideas)
```

**Comparison Output** (when COMPARE=report1,report2):

Use helper script: `node .agileflow/scripts/lib/ideation-index.js compare {r1} {r2}`

```
REPORT COMPARISON
════════════════════════════════════════════════════════════════

📅 Comparing: ideation-{r1}.md → ideation-{r2}.md
   {date1}  →  {date2}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ RESOLVED ({N} ideas)
Ideas from {r1} that have since been implemented:

1. [IDEA-0095] Unified Error Handling API
   Implemented via: EP-0018
   Category: API/Architecture + Security

2. [IDEA-0099] Unified Progress Feedback System
   Implemented via: EP-0018
   Category: UX/Design + Performance

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🆕 NEW ({N} ideas)
Ideas that first appeared in {r2}:

1. [IDEA-0180] New Performance Optimization
   Category: Performance | Confidence: HIGH

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔄 PERSISTED ({N} ideas)
Ideas that appeared in both reports (recurring):

1. [IDEA-0023] Error Handling Consolidation
   Status: pending | Occurrences: 4

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📉 DROPPED ({N} ideas)
Ideas from {r1} that didn't recur and weren't implemented:

1. [IDEA-0087] Low-priority suggestion
   Category: Code Quality | Status: pending

════════════════════════════════════════════════════════════════
Summary:
  ✅ Resolved: {X} ideas addressed since {r1}
  🆕 New: {Y} fresh ideas in {r2}
  🔄 Persisted: {Z} recurring concerns
  📉 Dropped: {W} one-time ideas (may be low priority)
```

### STEP 4: OFFER NEXT STEPS

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do with these ideas?",
  "header": "Next Steps",
  "multiSelect": false,
  "options": [
    {"label": "Create story for top recurring idea", "description": "Generate a story for the most recurring pending idea"},
    {"label": "View pending ideas by category", "description": "Filter by Security, Performance, etc."},
    {"label": "Run new ideation", "description": "Generate fresh ideas with /agileflow:ideate:new"},
    {"label": "Done", "description": "No further action needed"}
  ]
}]</parameter>
</invoke>
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| IDEA-XXXX | Idea ID | - | Show details for specific idea |
| STATUS | pending, in-progress, implemented, rejected, recurring | - | Filter by status |
| CATEGORY | Security, Performance, Code Quality, UX/Design, Testing, API/Architecture | - | Filter by category |
| MODE | trends | - | Show aggregate trend analysis across all reports |
| COMPARE | report1,report2 | - | Compare two reports (e.g., COMPARE=20260114,20260130) |
| LIMIT | number | 10 | Maximum ideas to show in list views |

---

## Example Execution

**User**: `/agileflow:ideate:history STATUS=recurring`

**Output**:
```
RECURRING IDEAS (Appeared 2+ Times)
════════════════════════════════════════════════════════════════

These ideas keep appearing across ideation sessions. Consider prioritizing them!

🔴 Not Addressed (5 ideas)
━━━━━━━━━━━━━━━━━━━━━━━━━

1. [IDEA-0023] Error Handling Consolidation (4x)
   Category: Code Quality | Status: pending

2. [IDEA-0045] Path Traversal Protection (3x)
   Category: Security | Status: pending

3. [IDEA-0067] Terminal Width Adaptation (3x)
   Category: UX/Design | Status: pending

4. [IDEA-0012] YAML Safe Loading (2x)
   Category: Security | Status: pending

5. [IDEA-0089] IDE Handler Interface (2x)
   Category: API/Architecture | Status: pending


🟢 Already Addressed (3 ideas)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. [IDEA-0005] Unified Progress Feedback (4x)
   Implemented via: US-0099 in EP-0017

2. [IDEA-0008] Content Injection Security (3x)
   Implemented via: US-0100 in EP-0017

3. [IDEA-0011] Test Suite Reliability (2x)
   Implemented via: US-0102 in EP-0017

════════════════════════════════════════════════════════════════
Total: 8 recurring ideas (5 pending, 3 implemented)
```

---

## Related Commands

- `/agileflow:ideate:new` - Generate new improvement ideas
- `/agileflow:story` - Create user stories from ideas
- `/agileflow:epic` - Create epic for grouped improvements
- `/agileflow:debt` - Track technical debt items
