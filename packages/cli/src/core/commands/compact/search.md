---
description: Search compaction history by keyword, story ID, or date range
argument-hint: "[KEYWORD|US-XXXX|--since 2d|--session N]"
type: output-only
---

# /agileflow:compact:search

Search over compaction history to find what was happening during past context compactions.

## Usage

```
/agileflow:compact:search <keyword>           # Search summaries, stories, branches
/agileflow:compact:search US-0425             # Find compactions involving a story
/agileflow:compact:search --since 2d          # Last 2 days of compactions
/agileflow:compact:search --session 3         # Compactions from session 3
```

## FIRST ACTION

Run the search helper script with the user's arguments:

```bash
node .agileflow/scripts/compaction-search.js <ARGUMENTS>
```

If the compaction tree file doesn't exist (`.agileflow/state/compaction-tree.json`), inform the user:
- Hierarchical compaction is not enabled or no compactions have been recorded yet
- Enable with `/agileflow:configure --enable=hierarchicalcompaction`

## Output Format

Display results as a readable list showing:
- Timestamp and relative time
- Branch and active stories
- Summary of what was happening
- Session ID if available

If no results, suggest alternative search terms.
