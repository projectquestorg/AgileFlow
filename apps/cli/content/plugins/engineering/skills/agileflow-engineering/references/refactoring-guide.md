# Refactoring Guide

**Load this when:** Deciding whether to refactor, choosing a refactoring technique, or reviewing a refactoring PR.

## When to Refactor

### Strong signals (do it)

- [ ] Same logic copy-pasted in 3+ places
- [ ] Function >50 lines doing multiple things
- [ ] Adding a feature requires understanding >200 lines of tangled code first
- [ ] Tests are brittle because they depend on implementation details
- [ ] Name of function/variable no longer describes what it does

### Weak signals (consider it)

- Code works but feels awkward to navigate
- New team members consistently get confused in this area
- The same area keeps appearing in bug reports

### Do NOT refactor when

- You're in a code freeze or release window
- You don't have test coverage to verify behavior is preserved
- The refactoring would touch >500 lines without a clear benefit
- You're on a deadline and the code works

**Rule of three:** Fix inline once, extract on the second instance, refactor on the third.

---

## Extract vs. Inline Decision

### Extract (create a new function/module) when

- Logic is reused in 2+ places
- A block of code has a single, nameable purpose
- The function is testable in isolation
- The enclosing function is doing too many things

### Inline (collapse a function/variable back) when

- The function is called from exactly one place
- The abstraction adds no clarity — you have to read the definition to understand the call
- A variable just aliases another variable (`const x = y; doThing(x)`)

---

## Core Refactoring Techniques

| Technique                                      | When to use                               | Risk   |
| ---------------------------------------------- | ----------------------------------------- | ------ |
| Extract function                               | Block of code with a clear single purpose | Low    |
| Rename                                         | Name no longer reflects purpose           | Low    |
| Extract variable                               | Complex expression used multiple times    | Low    |
| Inline function                                | One-use wrapper adds no clarity           | Low    |
| Move function                                  | Function belongs in a different module    | Medium |
| Replace conditional with polymorphism          | Long if/switch on type                    | Medium |
| Extract class/module                           | File doing unrelated things               | Medium |
| Replace magic number with named constant       | Unexplained literal values                | Low    |
| Introduce parameter object                     | Function with >3 related params           | Low    |
| Replace nested conditionals with guard clauses | Deep nesting                              | Low    |

---

## Guard Clause Pattern (flatten nesting)

**Before:**

```js
function process(user) {
  if (user) {
    if (user.isActive) {
      if (user.hasPermission("admin")) {
        // actual logic
      }
    }
  }
}
```

**After:**

```js
function process(user) {
  if (!user) return;
  if (!user.isActive) return;
  if (!user.hasPermission("admin")) return;
  // actual logic — unindented, readable
}
```

---

## Naming Conventions

| Pattern                      | Wrong                       | Right                                    |
| ---------------------------- | --------------------------- | ---------------------------------------- |
| Boolean variables            | `flag`, `status`, `data`    | `isActive`, `hasPermission`, `canEdit`   |
| Functions that return values | `userData()`, `processIt()` | `getUser()`, `formatDate()`              |
| Event handlers               | `click()`, `handler()`      | `handleSubmit()`, `onUserCreated()`      |
| Async functions              | Same as sync                | `fetchUser()`, `loadConfig()`            |
| Generic array names          | `list`, `arr`, `items`      | `users`, `activeOrders`, `errorMessages` |

---

## Refactoring Safely

### Required before starting

1. Ensure test coverage for the area being refactored
2. Commit current state ("before" snapshot)
3. Define what "done" looks like — what are you making better?

### During

- One refactoring technique at a time
- Commit after each atomic change
- Run tests after each commit (never let tests break between commits)

### After

- All existing tests still pass
- New tests cover any previously untested behavior
- Code review confirms intent is clear

---

## Refactoring PR Checklist

- [ ] No behavior changes — only structure
- [ ] Tests pass without modification (or test names updated to match new names)
- [ ] PR description explains _why_ this refactoring, not just what changed
- [ ] No new features bundled in (keep refactoring PRs pure)
- [ ] Performance not degraded (run benchmarks if relevant)
- [ ] PR is reviewable (not 2,000 lines of renames — consider splitting)
