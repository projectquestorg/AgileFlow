---
description: Plan and execute code migrations - scan for deprecated APIs, generate codemods, validate changes
argument-hint: "[scan|plan|codemods|validate]"
---

# migrate

Plan and execute code migrations with automated scanning, codemod generation, and validation.

## Subcommands

| Command | Description |
|---------|-------------|
| `/agileflow:migrate:scan` | Detect deprecated APIs, outdated patterns, breaking changes |
| `/agileflow:migrate:plan` | Generate a migration plan with steps and risk assessment |
| `/agileflow:migrate:codemods` | Generate and apply automated codemods |
| `/agileflow:migrate:validate` | Validate migration completeness and correctness |

## Quick Start

```
/agileflow:migrate:scan .                        # Scan for migration opportunities
/agileflow:migrate:plan FOCUS=deps               # Plan dependency migrations
/agileflow:migrate:codemods                      # Generate codemods from plan
/agileflow:migrate:validate                      # Validate after applying changes
```

Typical workflow: scan -> plan -> codemods -> validate.
