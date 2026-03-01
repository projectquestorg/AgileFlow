---
description: Detect deprecated APIs, outdated patterns, breaking dependency changes, and migration opportunities in your codebase
argument-hint: "[file|directory] [FOCUS=deps|patterns|apis|all]"
---

# /agileflow:migrate:scan

Scan the codebase for migration opportunities - deprecated APIs, outdated patterns, breaking dependency changes, and version-specific issues that need attention.

---

## Quick Reference

```
/agileflow:migrate:scan                        # Scan entire project
/agileflow:migrate:scan src/                   # Scan specific directory
/agileflow:migrate:scan . FOCUS=deps           # Focus on dependency changes only
/agileflow:migrate:scan . FOCUS=patterns       # Focus on outdated code patterns
/agileflow:migrate:scan . FOCUS=apis           # Focus on deprecated API usage
```

---

## How It Works

1. **Dependency analysis**: Check package.json for outdated deps, breaking version jumps, deprecated packages
2. **Pattern detection**: Find outdated coding patterns (old React class components, CommonJS in ESM projects, etc.)
3. **API deprecation**: Find usage of deprecated APIs (Node.js, browser, framework-specific)
4. **Version incompatibility**: Detect code that won't work with newer versions of dependencies
5. **Migration urgency**: Score each finding by urgency (security fix, breaking change, deprecation timeline)

---

## Step-by-Step Process

### STEP 1: Parse Arguments

```
TARGET = first argument or current directory
FOCUS = all (default) or deps|patterns|apis
```

### STEP 2: Analyze Dependencies

Use the `agileflow-devops` agent to:
- Run `npm outdated` or equivalent
- Check for deprecated packages (`npm info <pkg> deprecated`)
- Identify major version jumps with breaking changes
- Check for known vulnerabilities (`npm audit`)

### STEP 3: Scan for Outdated Patterns

Use the `agileflow-refactor` agent to find:
- Deprecated framework patterns (React class components, Vue Options API in Vue 3+, etc.)
- Old module systems (CommonJS `require()` in ESM projects)
- Deprecated Node.js APIs (`fs.exists`, `url.parse`, `new Buffer()`)
- Old test patterns (enzyme vs testing-library)
- Legacy build tool configurations

### STEP 4: Detect Deprecated API Usage

Use the `agileflow-research` agent to:
- Check framework changelogs for deprecated features
- Find deprecated browser APIs (e.g., `document.write`, synchronous XHR)
- Identify Node.js deprecated APIs by version

### STEP 5: Generate Scan Report

Output a prioritized list of migration opportunities:

```markdown
# Migration Scan Report

**Generated**: {date}
**Target**: {directory}
**Total Opportunities**: {N}

## Critical (Security/Breaking)
| Package/Pattern | Current | Target | Risk | Effort |
|-----------------|---------|--------|------|--------|
| {name} | {version} | {version} | {desc} | {est} |

## High Priority (Deprecation Deadline)
...

## Medium Priority (Tech Debt)
...

## Low Priority (Improvements)
...
```

Save to `docs/08-project/migrations/scan-{YYYYMMDD}.md`

### STEP 6: Offer Next Steps

```
Scan complete: [N] migration opportunities found ([critical] critical, [high] high priority).

Options:
- Generate migration plan for critical items (Recommended)
- Create stories for all findings
- Re-scan with different focus
- Save report and done
```

---

## Related Commands

- `/agileflow:migrate:plan` - Generate step-by-step migration roadmap
- `/agileflow:migrate:codemods` - Generate AST-based codemods
- `/agileflow:migrate:validate` - Post-migration verification
- `/agileflow:packages` - Dependency management
