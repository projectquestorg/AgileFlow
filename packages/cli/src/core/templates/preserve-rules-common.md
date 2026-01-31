# Common Preserve Rules

This template provides standardized preserve rules that can be injected into command frontmatter.
Commands reference rule sets using `{{RULES:<category>}}` syntax in their preserve_rules.

## Usage

In command frontmatter:
```yaml
compact_context:
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:command-name"
    - "{{RULES:json_operations}}"
    - "{{RULES:file_preview}}"
    - "Command-specific rule here"
```

---

## Rule Categories

### json_operations
Rules for safe JSON file modifications (status.json, etc.)

```
- "MUST use Edit tool or jq for JSON operations (never echo/cat > file.json)"
- "MUST validate JSON after every modification (jq . file.json)"
```

### file_preview
Rules for showing previews before writing files

```
- "MUST show diff preview before confirming writes (diff-first pattern)"
- "Wait for YES/NO confirmation BEFORE writing any file"
```

### user_confirmation
Rules for using AskUserQuestion tool

```
- "MUST use AskUserQuestion tool for user decisions (not text prompts)"
- "Options: YES to confirm, NO to cancel, or specific choices"
```

### task_tracking
Rules for using Task management tools (TaskCreate, TaskUpdate, TaskList, TaskGet)

```
- "MUST use TaskCreate for 3+ step workflows, TaskUpdate to mark progress"
- "Set status: in_progress when starting, completed when done"
```

### bus_messaging
Rules for bus message logging

```
- "MUST append status update to docs/09-agents/bus/log.jsonl"
- "Bus format: {ts, from, type, story, text} as single-line JSON"
```

### plan_mode
Rules for using EnterPlanMode

```
- "MUST use EnterPlanMode for non-trivial implementation tasks"
- "Plan first, get approval, then implement"
```

### commit_approval
Rules about git commits

```
- "NEVER auto-commit without explicit user approval"
- "Always show diff and ask before committing"
```

### delegation
Rules for expert delegation

```
- "Delegate complex work to domain experts (don't do everything yourself)"
- "Simple task -> do yourself | Complex single-domain -> spawn expert"
```

---

## How Injection Works

The content-injector.js processes preserve_rules arrays and expands
`{{RULES:category}}` markers into the actual rule strings.

Example:
```yaml
# Before injection
preserve_rules:
  - "ACTIVE COMMAND: /agileflow:story"
  - "{{RULES:json_operations}}"

# After injection
preserve_rules:
  - "ACTIVE COMMAND: /agileflow:story"
  - "MUST use Edit tool or jq for JSON operations (never echo/cat > file.json)"
  - "MUST validate JSON after every modification (jq . file.json)"
```

This eliminates duplication while maintaining readability.
