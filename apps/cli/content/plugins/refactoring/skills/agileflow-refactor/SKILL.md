---
name: agileflow-refactor
version: 1.0.0
category: agileflow/refactoring
description: |
  Use when the user wants to improve existing code without changing its
  observable behaviour. Applies safe refactoring patterns — extract
  method/class, simplify conditionals, remove dead code, rename for
  clarity — with an impact analysis and test-gate verification before
  any change is made.
triggers:
  keywords:
    - refactor
    - clean up
    - extract
    - simplify
    - too complex
    - technical debt
    - dead code
    - rename
    - restructure
    - improve readability
    - this is a mess
    - hard to understand
    - duplicate code
    - god class
    - long method
  priority: 50
  exclude:
    - refactor to a new framework (migration, not refactoring)
    - extract requirements (product management context)
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/refactor.yaml
  maxEntries: 50
depends:
  skills: []
  plugins: [core]
---

# AgileFlow Refactor

Safe, systematic refactoring with impact analysis, test gates, and incremental change — improves code quality without breaking behaviour.

## When this skill activates

- User wants to clean up, simplify, or restructure code
- User identifies technical debt or hard-to-maintain code
- User wants to extract a reusable module or function
- User says a function or class is "too complex" or "too long"
- User wants to remove dead code or duplicate logic
- User wants to rename for clarity
- User is preparing code for a feature addition (make it easy to change, then change it)

## Opening discovery flow

**When invoked without a specific target, ask once to understand scope and intent.**

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[
  {
    "question": "What would you like to refactor?",
    "header": "Refactoring target",
    "multiSelect": false,
    "options": [
      {"label": "A specific function or method that's too long or complex (Recommended)", "description": "Paste the function and I'll suggest extractions, simplifications, and naming improvements"},
      {"label": "A class or module with too many responsibilities", "description": "Point me at the file — I'll identify which responsibilities should move to their own class"},
      {"label": "Duplicate code across multiple files", "description": "Show me the duplication and I'll design a shared abstraction"},
      {"label": "Clean up dead code or unused exports", "description": "I'll analyse the codebase for unused functions, variables, and modules"},
      {"label": "Rename for clarity (variables, functions, files)", "description": "Tell me what feels poorly named and I'll suggest better names with impact analysis"},
      {"label": "Reduce cyclomatic complexity in a function", "description": "I'll restructure conditionals using guard clauses, early returns, and strategy pattern"}
    ]
  }
]</parameter>
</invoke>
```

## Refactoring principles

### 1. Tests first

**Never refactor without a test safety net.** If the code doesn't have tests, write characterisation tests before touching anything.

> "Make it easy to change, then change it."

```
Step 1: Write/confirm tests exist → they pass
Step 2: Refactor
Step 3: Tests still pass → behaviour preserved
```

If tests don't exist: offer to write them first (use `agileflow-test-writer`), or at minimum characterise the current behaviour.

### 2. One refactoring at a time

Don't rename AND restructure AND extract in one change. Small, focused refactors are safer and easier to review. Each step should:

- Be independently committtable
- Leave the tests green
- Do exactly one kind of improvement

### 3. Boy Scout Rule

"Always leave the code a little better than you found it." When touching a file for another purpose, fix obvious issues:

- Rename a confusing variable
- Extract a magic number to a constant
- Remove a dead branch

But don't go beyond what's proportionate to the change at hand.

### 4. No behaviour changes

A refactoring, by definition, does not change observable behaviour. If the change would alter:

- Function inputs/outputs
- Error types thrown
- Side effects
- Performance characteristics in a user-visible way

...then it is not a pure refactoring — it is a feature change. Flag this to the user.

## Impact analysis before every refactoring

Before making any change, assess:

| Question                                                        | Why it matters                          |
| --------------------------------------------------------------- | --------------------------------------- |
| What calls this function/uses this module?                      | Determines blast radius                 |
| Are there tests covering this code?                             | Determines safety of the change         |
| Is this a public API (used by consumers outside this codebase)? | Determines if this is a breaking change |
| Are there feature flags or A/B tests touching this code?        | Could change which variant runs         |
| Are there any type definitions that reference this?             | Types may need updating too             |

Run a quick search before refactoring:

- Find all usages: `grep -r "functionName" src/`
- Find all imports: `grep -r "from './module'" src/`
- Check for dynamic calls: `functionName\(` as a pattern

## Common refactoring patterns

See `references/refactoring-patterns.md` for the full catalogue. Quick reference:

| Pattern                               | When to apply                                              |
| ------------------------------------- | ---------------------------------------------------------- |
| Extract function                      | Function > 20 lines, or section has a clear single purpose |
| Extract class                         | Class has > 2 responsibilities, or file > 300 lines        |
| Replace conditional with guard clause | Nested if/else with happy path buried in conditions        |
| Replace magic number with constant    | Numeric literal used without explanation                   |
| Extract variable                      | Complex expression used more than once                     |
| Rename for clarity                    | Variable/function name doesn't describe what it does       |
| Dead code removal                     | Function never called; variable never read                 |
| Consolidate duplicate conditionals    | Same condition checked in multiple places                  |
| Replace inheritance with composition  | Subclass only uses 10% of the parent's interface           |
| Introduce parameter object            | Function takes > 4 parameters                              |

## Code smell signals

| Smell                      | Typical pattern                                         | Refactoring to apply                           |
| -------------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| Long method                | > 30 lines                                              | Extract function                               |
| Large class                | > 300 lines or > 5 public methods                       | Extract class                                  |
| Duplicate code             | Same block in 2+ places                                 | Extract function or module                     |
| Long parameter list        | > 4 parameters                                          | Introduce parameter object                     |
| Deeply nested conditionals | > 3 levels of nesting                                   | Guard clauses, early returns                   |
| Magic numbers              | `if (status === 3)`                                     | Named constant `if (status === ORDER_SHIPPED)` |
| Dead code                  | Function defined but never called                       | Delete (with a search to confirm)              |
| Inconsistent naming        | `getUser`, `fetchAccount`, `loadProfile` for same thing | Normalise naming convention                    |
| God object                 | One class doing everything                              | Extract multiple focused classes               |
| Shotgun surgery            | One change requires edits in 10 files                   | Consolidate into a single place                |

## Refactoring safety checklist

See `references/safety-checks.md` for the full checklist. Before any refactoring:

- [ ] Tests exist and pass
- [ ] Impact analysis complete (know who calls this)
- [ ] Not a public API without a deprecation plan
- [ ] Change is scoped to one pattern at a time
- [ ] Can be committed independently (doesn't depend on other uncommitted changes)

After refactoring:

- [ ] Tests still pass
- [ ] No new linting errors introduced
- [ ] PR diff is readable (reviewer can understand what changed and why)
- [ ] Commit message describes the refactoring pattern used

## SOLID principles as refactoring targets

| Principle                   | Violation signal                                    | Refactoring                         |
| --------------------------- | --------------------------------------------------- | ----------------------------------- |
| **S** Single Responsibility | Class does X and Y and Z                            | Extract class per responsibility    |
| **O** Open/Closed           | Adding a feature requires modifying existing code   | Introduce strategy / plugin pattern |
| **L** Liskov Substitution   | Subclass overrides parent method to throw           | Prefer composition over inheritance |
| **I** Interface Segregation | Interface has methods most implementors don't need  | Split interface                     |
| **D** Dependency Inversion  | High-level module imports concrete low-level module | Inject dependency via interface     |

## Self-improving learnings

`_learnings/refactor.yaml` records:

- Preferred naming conventions for this project (camelCase, snake_case, etc.)
- Established module boundaries (what belongs where)
- Patterns the team uses (e.g. repository pattern, service layer)
- Previous refactoring outcomes — what was improved and how

## Integration

- **agileflow-test-writer** — write or verify tests before any refactor begins; tests are the safety net that lets refactoring proceed without fear
- **agileflow-audit** — use the audit skill to identify what needs refactoring; audit finds the code quality, duplication, and complexity issues, refactor fixes them
- **agileflow-engineering** — when refactoring is part of a feature story, coordinate with engineering so the feature lands in already-cleaned code
- **agileflow-pr-reviewer** — invoke after refactoring to confirm the changes preserved observable behaviour and meet style standards
- **agileflow-performance** — when a refactor is performance-motivated (N+1 queries, blocking renders), pair with performance to measure before and after
- **agileflow-debug** — if a refactor introduces a regression, hand off immediately to debug rather than reverting blindly
- **agileflow-adr** — document significant refactoring decisions (module boundary changes, pattern migrations) as ADRs before executing them on large codebases
- **agileflow-migration** — when a refactor involves a library upgrade or API migration alongside the structural cleanup, use migration to handle the version-specific steps

## References

| File                                 | When to load                                                               |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `references/refactoring-patterns.md` | Detailed catalogue of refactoring patterns with before/after code examples |
| `references/safety-checks.md`        | Pre/post refactoring safety checklist and risk assessment                  |

## Workflows

| File                          | When to follow                                                           |
| ----------------------------- | ------------------------------------------------------------------------ |
| `workflows/safe-refactor.md`  | Any refactoring task — assess safety, write tests, apply pattern, verify |
| `workflows/extract-module.md` | Extracting a reusable module or function from a large file or class      |
