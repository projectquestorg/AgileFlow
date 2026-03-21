---
description: Discover and ideate features - brainstorm, research, and generate product briefs
argument-hint: "[discover|new|brief|history|features]"
---

# ideate

Feature discovery and ideation suite - brainstorm ideas, run research, generate product briefs, and track ideation history.

## Subcommands

| Command | Description |
|---------|-------------|
| `/agileflow:ideate:discover` | Run structured discovery workflow (brainstorm + research + brief) |
| `/agileflow:ideate:new` | Brainstorm new feature ideas for the codebase |
| `/agileflow:ideate:brief` | Generate a product brief from an idea |
| `/agileflow:ideate:history` | Browse past ideation sessions |
| `/agileflow:ideate:features` | View and manage discovered features |

## Quick Start

```
/agileflow:ideate:discover TOPIC="user onboarding"    # Full discovery workflow
/agileflow:ideate:new SCOPE=all                        # Brainstorm all areas
/agileflow:ideate:brief IDEA="dark mode"               # Generate product brief
/agileflow:ideate:history                              # Browse past sessions
```

Typical workflow: discover (brainstorm + research) -> brief -> epic planning.
