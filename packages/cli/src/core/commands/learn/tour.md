---
description: Guided interactive codebase walkthrough with annotated stops explaining architecture, data flow, and key design decisions
argument-hint: "[topic|feature] [DEPTH=overview|detailed|deep-dive]"
---

# /agileflow:learn:tour

Take an interactive guided tour through the codebase. The tour visits key files and explains architecture, data flow, and design decisions with annotated stops.

---

## Quick Reference

```
/agileflow:learn:tour                                     # Full architecture tour
/agileflow:learn:tour authentication                      # Tour the auth system
/agileflow:learn:tour "data flow"                         # Follow data through the system
/agileflow:learn:tour api DEPTH=deep-dive                 # Deep dive into API layer
/agileflow:learn:tour "new developer"                     # Onboarding tour
```

---

## How It Works

1. **Discover project structure** - Map the codebase architecture
2. **Generate tour route** - Plan stops based on topic and depth
3. **Interactive walkthrough** - Visit each stop with explanation
4. **Ask questions** - Pause at each stop for user questions
5. **Generate tour notes** - Save the tour as a reference document

---

## Step-by-Step Process

### STEP 1: Parse Arguments

```
TOPIC = specific feature/area or "full" for complete tour
DEPTH = overview (5-8 stops) | detailed (10-15 stops) | deep-dive (15-25 stops)
```

### STEP 2: Discover Project Structure

Use `Explore` agent to:
- Map directory structure and architecture pattern
- Identify entry points (main, index, app)
- Find key configuration files
- Detect framework and key libraries

### STEP 3: Plan Tour Route

Generate a sequence of stops based on topic:

**Full Tour Route**:
1. Entry point (main app file)
2. Configuration and environment
3. Routing/navigation structure
4. Data models/schema
5. API/service layer
6. UI components (key ones)
7. State management
8. Authentication/authorization
9. Testing approach

**Feature-Specific Tour**: Follow the feature through:
1. Entry point (where user triggers it)
2. Route/handler
3. Business logic
4. Data access
5. Side effects (email, queue, etc.)
6. UI rendering

### STEP 4: Interactive Walkthrough

At each stop:

```markdown
## Stop {N}/{Total}: {Title}
📍 `{file_path}`

{Read and explain the key code in this file}

**Why it matters**: {explanation of role in the system}
**Key patterns**: {design patterns used}
**Connected to**: {what files/modules this connects to}

---
Continue to next stop? [Next | Ask a question | Jump to specific stop | End tour]
```

### STEP 5: Generate Tour Notes

Save a reference document:

```markdown
# Codebase Tour: {Topic}

**Date**: {date}
**Stops**: {N}
**Coverage**: {files visited}

## Tour Map
1. {file} - {one-line summary}
2. {file} - {one-line summary}
...

## Key Takeaways
- {insight 1}
- {insight 2}
...

## Architecture Diagram
{Mermaid diagram of the system}
```

Save to `docs/08-project/tours/tour-{topic}-{YYYYMMDD}.md`

---

## Related Commands

- `/agileflow:learn:explain` - Deep "why" explanation of specific code
- `/agileflow:learn:patterns` - Catalog of design patterns used
- `/agileflow:learn:glossary` - Domain terminology reference
- `/agileflow:context:full` - Generate full project context
