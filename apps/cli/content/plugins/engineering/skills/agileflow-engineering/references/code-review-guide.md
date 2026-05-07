# Code Review Guide

**Load this when:** Conducting a code review, giving review feedback, or setting review standards.

## Review Layers (check in this order)

### 1. Correctness (blocking)

- [ ] Does it do what the story/ticket describes?
- [ ] Edge cases handled: null, empty, zero, max values, concurrent access
- [ ] Error paths handled and errors surfaced appropriately
- [ ] No silent failures (swallowed exceptions, unchecked return values)
- [ ] State mutations are intentional and safe

### 2. Security (blocking)

- [ ] No secrets, tokens, or PII in code or logs
- [ ] User input validated/sanitized before use
- [ ] SQL: parameterized queries only
- [ ] Auth checks present on new endpoints/routes
- [ ] File paths constructed safely (no traversal risk)

### 3. Tests (blocking)

- [ ] New behavior has tests
- [ ] Tests test behavior, not implementation
- [ ] No tests commented out or skipped without explanation
- [ ] Unhappy paths tested (errors, empty state, unauthorized)

### 4. Design (non-blocking by default, blocking if severe)

- [ ] Follows existing patterns in the codebase
- [ ] No unnecessary abstraction (YAGNI)
- [ ] No obvious performance issues (N+1 queries, unbounded loops)
- [ ] Dependencies justified (not adding a package for one utility function)

### 5. Readability (non-blocking, suggestions)

- [ ] Variable/function names reveal intent
- [ ] Complex logic has a comment explaining _why_, not _what_
- [ ] Function length appropriate (suggest refactor if >50 lines)
- [ ] Magic numbers/strings have named constants

---

## Feedback Tone Guide

### Framing principles

- Critique the code, never the person
- Ask questions before asserting problems ("Could this be null here, or is it always set?")
- Explain the _why_ behind every blocking comment
- Lead with the positive when the overall PR is good

### Blocking vs. Non-blocking

| Label         | Meaning                | PR can merge?     |
| ------------- | ---------------------- | ----------------- |
| `blocking:`   | Must fix before merge  | No                |
| `suggestion:` | Preferred but optional | Yes               |
| `nit:`        | Tiny style preference  | Yes               |
| `question:`   | Seeking understanding  | Yes, after answer |
| `praise:`     | Call out good work     | Yes               |

**Use inline labels.** Example:

```
blocking: This will throw if `user` is undefined. Add a null check or early return.

suggestion: This could use `Array.from()` instead of `[...spread]` for clarity.

nit: Missing semicolon on line 42.

question: Is there a reason we're not using the existing `formatDate` utility here?
```

---

## What NOT to Block On

| Topic                                        | Handle it differently                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| Formatting / whitespace                      | Enforce with a formatter (Prettier, ESLint). Never block PRs manually. |
| Pure style preference                        | Use `nit:` or `suggestion:`, never `blocking:`                         |
| "I would have done it differently"           | Only block if the approach has a concrete defect                       |
| Missing tests for pre-existing untested code | Add a tech debt ticket; don't block the PR                             |

---

## Reviewer Efficiency Heuristics

| PR size       | Suggested approach                                                          |
| ------------- | --------------------------------------------------------------------------- |
| <100 lines    | Full review all layers                                                      |
| 100–400 lines | All layers; read all code                                                   |
| 400–800 lines | All layers; focus on structure and interface design                         |
| >800 lines    | Request split. If urgent: review architecture + security, defer readability |

**Time budget:** ~1 hour per 400 lines. If taking longer, scope is too large.

---

## Common Code Smells to Flag

| Smell                       | Blocking?  | Typical fix                                |
| --------------------------- | ---------- | ------------------------------------------ |
| `any` type in TypeScript    | Suggestion | Proper type or `unknown`                   |
| `console.log` in prod code  | Blocking   | Remove or use logger                       |
| Hardcoded URL/env value     | Blocking   | Move to config/env                         |
| Commented-out code block    | Nit        | Delete it                                  |
| Function with >3 parameters | Suggestion | Options object                             |
| Deep nesting (>3 levels)    | Suggestion | Early return / extract function            |
| Boolean parameter flags     | Suggestion | Named options object or separate functions |
| `TODO` without issue link   | Nit        | Add issue reference                        |

---

## Approving a PR

Approve when:

- All blocking issues resolved
- You understand what the code does and why
- You'd be comfortable being woken up at 2am if it causes an incident

Do NOT approve just to unblock — a ship-it with unresolved blocking issues is worse than a delay.
