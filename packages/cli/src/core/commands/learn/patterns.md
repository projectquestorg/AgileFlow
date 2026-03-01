---
description: Catalog and explain design patterns actually used in the codebase with real code examples and rationale
argument-hint: "[pattern-name|category] [--generate]"
---

# /agileflow:learn:patterns

Discover and catalog the design patterns actually used in the codebase. Shows real code examples, explains why each pattern was chosen, and documents the project's architectural vocabulary.

---

## Quick Reference

```
/agileflow:learn:patterns                                  # Discover all patterns
/agileflow:learn:patterns "repository"                     # Find repository pattern usage
/agileflow:learn:patterns --generate                       # Generate full pattern catalog
/agileflow:learn:patterns "error handling"                  # How errors are handled
/agileflow:learn:patterns creational                       # Creational patterns only
```

---

## How It Works

1. **Scan codebase** - Identify design patterns in use
2. **Extract examples** - Find real code examples of each pattern
3. **Document rationale** - Explain why each pattern was chosen
4. **Categorize** - Group by pattern category
5. **Generate catalog** - Create a reference document

---

## Step-by-Step Process

### STEP 1: Parse Arguments

```
TARGET = specific pattern name, category, or "all"
GENERATE = --generate flag to create/update catalog file
```

### STEP 2: Scan for Patterns

Use `Explore` agent to identify patterns:

| Category | Patterns to Detect |
|----------|-------------------|
| **Creational** | Factory, Builder, Singleton, Module |
| **Structural** | Adapter, Facade, Proxy, Decorator, Composite |
| **Behavioral** | Observer/PubSub, Strategy, Command, Middleware, State Machine |
| **Architectural** | MVC, Repository, Service Layer, CQRS, Event Sourcing |
| **Frontend** | Container/Presenter, HOC, Render Props, Custom Hooks, Compound Components |
| **Error Handling** | Error Boundary, Result Type, Error Middleware, Retry |
| **Data** | DAO, Active Record, Data Mapper, Unit of Work |

### STEP 3: Extract Examples

For each detected pattern:

```markdown
## {Pattern Name}

**Category**: {Creational/Structural/Behavioral/etc.}
**Used in**: {N} places
**Key files**: {list}

### What It Is
{Brief pattern description}

### How We Use It
{Explanation specific to this codebase}

### Real Example
\`\`\`{language}
// {file_path}:{line}
{actual code from the project}
\`\`\`

### Why This Pattern
{Rationale for choosing this pattern over alternatives}

### When to Use
{Guidelines for when to apply this pattern in new code}
```

### STEP 4: Generate Catalog (if --generate)

```markdown
# Design Patterns Catalog

**Project**: {project name}
**Generated**: {date}
**Patterns Found**: {N}

## Pattern Overview

| Pattern | Category | Usage Count | Key File |
|---------|----------|-------------|----------|
| {name} | {category} | {count} | {file} |

## Detailed Patterns

{Each pattern with full documentation}

## Patterns NOT Used (and Why)

| Pattern | Reason |
|---------|--------|
| {name} | {why it's not used or not appropriate} |

## Conventions

{Project-specific conventions for applying patterns}
```

Save to `docs/08-project/patterns/pattern-catalog-{YYYYMMDD}.md`

### STEP 5: Offer Follow-Up

```
Pattern catalog: [N] patterns found across [M] files.

Options:
- Explain a specific pattern in more detail
- See where to apply a pattern in new code
- Generate full catalog document
- Done
```

---

## Related Commands

- `/agileflow:learn:tour` - Guided codebase walkthrough
- `/agileflow:learn:explain` - Deep code explanation
- `/agileflow:learn:glossary` - Domain terminology
- `/agileflow:code:architecture` - Architecture health audit
