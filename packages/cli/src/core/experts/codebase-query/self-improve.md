---
description: Update codebase-query expertise after making changes
argument-hint: [optional context about what changed]
variables:
  EXPERTISE_FILE: packages/cli/src/core/experts/codebase-query/expertise.yaml
---

# Codebase Query Expert - Self-Improve

You are updating your mental model (expertise file) to reflect changes in the codebase. This keeps your expertise accurate and useful for future tasks.

## CRITICAL: Self-Improve Workflow

### Step 1: Read Current Expertise
Load your expertise file at `packages/cli/src/core/experts/codebase-query/expertise.yaml`.

Understand what you currently know about:
- Query types and translations
- Available tags
- Natural language patterns
- Fallback strategies

### Step 2: Analyze What Changed

**If git diff available:**
```bash
git diff HEAD~1 --name-only | grep -E "(codebase-indexer|query-codebase)"
```

**If context provided:**
Use the argument/context to understand what changed.

**If neither:**
Compare expertise file against actual codebase state.

### Step 3: Update Expertise

**Update `query_types` section if:**
- New query flags added
- Query behavior changed
- New examples discovered

**Update `available_tags` section if:**
- New tags added to TAG_PATTERNS
- Tag patterns changed
- Tag descriptions updated

**Update `nl_patterns` section if:**
- New natural language patterns discovered
- Better translations found
- User preferences learned

**Update `fallbacks` section if:**
- New fallback strategies needed
- Edge cases discovered
- Error handling improved

**ALWAYS add to `learnings` section:**
```yaml
learnings:
  - date: YYYY-MM-DD
    context: "What prompted this update"
    insight: "What you learned"
    source: "Where you learned it"
```

### Step 4: Save Updated Expertise
Edit the expertise file with your updates.

### Learning Signals

**High-confidence signals** (definitely add to learnings):
- User explicitly corrected a translation
- Query returned wrong results
- New query pattern worked well
- Index build revealed new patterns

**Medium-confidence signals** (consider adding):
- User rephrased query differently
- Multiple query types combined
- Fallback strategy used

**Low-confidence signals** (observe but don't add yet):
- Single-use query patterns
- Unusual file structures

### Example Learning Entry

```yaml
learnings:
  - date: 2026-01-19
    context: "User asked for 'authentication middleware'"
    insight: "Combine --tag='auth' with --query='middleware' for auth middleware files"
    source: "User query feedback"
```

## Output Format

After updating, confirm:
```
Updated expertise.yaml:
- Added learning: [brief description]
- Updated [section]: [what changed]
- Version: [new version]
```
