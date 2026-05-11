---
name: agileflow-pr-reviewer
version: 1.0.0
category: agileflow/reviews
description: |
  Use when the user wants a structured review of a pull request, diff,
  or code change. Covers security vulnerabilities, logic correctness,
  test coverage gaps, API contract changes, breaking changes, and
  code style. Produces a prioritised findings list and a final
  recommendation: Approve, Request Changes, or Needs Discussion.
triggers:
  keywords:
    - review this pr
    - review my changes
    - code review
    - pr review
    - check my code
    - review this diff
    - look at my code
    - review before merge
    - review this branch
    - give me feedback on
  priority: 50
  exclude:
    - review this document (not a code review)
    - performance review (HR context)
    - design review
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/pr-reviewer.yaml
  maxEntries: 50
depends:
  skills: []
  plugins: [core]
---

# AgileFlow PR Reviewer

Systematic pull request review covering security, correctness, test coverage, API contracts, and style — with a prioritised findings list and a clear merge recommendation.

## When this skill activates

- User shares a diff, PR URL, branch name, or pastes code and asks for review
- User says "review before I merge", "check this", or "give me feedback"
- User wants a structured second opinion on their changes
- User is implementing security-sensitive changes (auth, payment, file upload, SQL queries)

## Opening discovery flow

**When invoked without a diff, ask once to gather what's needed.**

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[
  {
    "question": "What would you like me to review?",
    "header": "Review source",
    "multiSelect": false,
    "options": [
      {"label": "Paste the diff or changed files here (Recommended)", "description": "Copy from 'git diff' or paste the files you changed — I'll read them directly"},
      {"label": "I'll give you the file paths — read them from disk", "description": "Tell me which files changed and I'll read them and the originals"},
      {"label": "GitHub PR URL", "description": "Paste the PR URL and I'll fetch the diff via gh CLI"},
      {"label": "Current staged changes", "description": "I'll run 'git diff --staged' to see what's about to be committed"}
    ]
  },
  {
    "question": "What kind of review do you need?",
    "header": "Review focus",
    "multiSelect": true,
    "options": [
      {"label": "Full review — security + logic + tests + style (Recommended)", "description": "Comprehensive check across all dimensions"},
      {"label": "Security focus — OWASP top 10, injection, auth", "description": "Use for auth changes, API endpoints, file uploads, queries"},
      {"label": "Logic and correctness", "description": "Race conditions, null handling, off-by-one errors, incorrect assumptions"},
      {"label": "Test coverage", "description": "Are the right paths tested? Are assertions meaningful?"},
      {"label": "API contract / breaking changes", "description": "Will this break existing consumers? Is the contract preserved?"}
    ]
  }
]</parameter>
</invoke>
```

## Review dimensions

Run all dimensions for a full review, or the selected subset for a focused review.

### 1. Security

See `references/security-patterns.md` for the full checklist. Quick scan:

- [ ] SQL injection / NoSQL injection (raw queries with user input)
- [ ] Command injection (`exec`, `shell`, `subprocess` with user input)
- [ ] Path traversal (`../../../etc/passwd`)
- [ ] XSS (unsanitised user input rendered to HTML)
- [ ] Insecure direct object reference (access control by user-controlled ID)
- [ ] Authentication bypass (auth checks that can be skipped)
- [ ] Sensitive data in logs, errors, or URLs
- [ ] Hardcoded secrets or credentials
- [ ] Cryptography: weak algorithms (MD5, SHA1 for passwords), improper key handling
- [ ] CSRF on state-changing endpoints
- [ ] Mass assignment (binding user input directly to DB models)

### 2. Logic and correctness

- [ ] Off-by-one errors in loops and index access
- [ ] Null / undefined handling — does the code assume a value exists?
- [ ] Race conditions — shared mutable state accessed concurrently
- [ ] Error handling — are errors caught, logged, and propagated correctly?
- [ ] Edge cases — empty collections, zero values, max values, unicode strings
- [ ] Assumptions about data types — implicit type coercion, integer overflow
- [ ] Conditional logic coverage — are all branches reachable and correct?
- [ ] Async correctness — missing await, fire-and-forget, unhandled rejections

### 3. Test coverage

- [ ] Do the tests cover the new code paths?
- [ ] Are there tests for the sad paths and edge cases?
- [ ] Are assertions meaningful (not just `toBeTruthy`)?
- [ ] Are mocks correct — do they mock at the boundary?
- [ ] Would these tests catch a realistic regression?

### 4. API contract and breaking changes

- [ ] Does this change any public API endpoint signatures?
- [ ] Are new required fields added to existing responses?
- [ ] Are existing fields removed or renamed?
- [ ] Is backward compatibility maintained for API consumers?
- [ ] Are database migrations backward compatible (additive, not destructive)?
- [ ] Are event schemas or message formats preserved?

### 5. Code quality and style

- [ ] Is the code readable and self-documenting?
- [ ] Are variable and function names clear and consistent?
- [ ] Is there duplication that should be extracted?
- [ ] Are there comments explaining why (not what)?
- [ ] Is the change within a reasonable size (< 400 LOC diff; flag if larger)?
- [ ] Does it follow the project's established patterns?

## Findings format

Report each finding with a severity and actionable recommendation:

```
[P0] SECURITY — SQL Injection risk in user search
  File: src/repositories/user-repo.js, line 47
  Issue: User input interpolated directly into SQL query string
  Fix: Use parameterised query: db.query('SELECT * FROM users WHERE email = $1', [email])
  Reference: OWASP A03:2021 - Injection

[P1] LOGIC — Missing null check before property access
  File: src/services/order-service.js, line 112
  Issue: order.customer.email accessed without checking if customer is null
  Fix: Add guard: if (!order.customer) throw new OrderError('Customer not found')

[P2] TESTS — No test for the refund failure path
  File: tests/order.test.js
  Issue: The error branch on line 89 of order-service.js has no test
  Fix: Add test: 'throws RefundError when payment gateway returns 402'

[P3] STYLE — Magic number should be a named constant
  File: src/pricing/calculator.js, line 23
  Issue: 0.15 used directly — unclear if this is a tax rate or discount
  Fix: const DEFAULT_TAX_RATE = 0.15;
```

## Severity levels

| Level    | Meaning                                                                    | Action required before merge                                       |
| -------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **P0**   | Security vulnerability or data corruption risk                             | Block merge — must fix                                             |
| **P1**   | Logic error that will cause incorrect behaviour or crashes                 | Strong recommendation to fix before merge                          |
| **P2**   | Missing test coverage for important path                                   | Fix before merge on critical features; acceptable on minor changes |
| **P3**   | Code quality / style — won't cause a bug but makes code harder to maintain | Fix at author's discretion                                         |
| **NOTE** | Observation, question, or suggestion with no required action               | Informational only                                                 |

## Final recommendation

End every review with one of:

- **APPROVE** — No P0/P1 issues; P2/P3 are optional
- **REQUEST CHANGES** — One or more P0 or P1 issues must be addressed
- **NEEDS DISCUSSION** — Design concern that requires a conversation before code changes make sense

```
─────────────────────────────────────
REVIEW SUMMARY
─────────────────────────────────────
Files reviewed: 8 | Lines changed: +247 / -89
Findings: 1 P0, 2 P1, 3 P2, 1 P3

VERDICT: REQUEST CHANGES

Must fix before merge:
  1. [P0] SQL injection in user-repo.js:47
  2. [P1] Null dereference in order-service.js:112
  3. [P1] Auth check missing on DELETE /api/users/:id

Nice to have:
  4. [P2] No test for refund failure path
  5. [P3] Magic numbers should be constants

After addressing P0 and P1, this is ready to merge.
─────────────────────────────────────
```

## Self-improving learnings

`_learnings/pr-reviewer.yaml` records:

- Team's severity thresholds (e.g. P2 test coverage is a blocker on this team)
- Recurring patterns to watch for in this codebase
- Preferred fix patterns when issues are found
- Merge criteria the team has established

## Integration

- **agileflow-audit** — use audit for pre-release sweeps or milestone quality gates; use pr-reviewer for individual PR merge gates; they're complementary not duplicates
- **agileflow-debug** — when the reviewer finds a bug, hand off to debug for root cause analysis rather than patching inline
- **agileflow-refactor** — when the review surfaces structural problems (long files, poor naming, deep coupling), route a follow-up story to refactor
- **agileflow-test-writer** — when review finds missing test coverage, spawn test-writer to fill the gaps before approving the merge
- **agileflow-accessibility** — when review touches UI components or interactive elements, accessibility check is part of the review criteria
- **agileflow-performance** — when review touches query paths, rendering logic, or data processing, flag for performance review alongside the code review
- **agileflow-docs** — if the PR changes public APIs or exports, verify docs were updated; pr-reviewer flags the gap, docs fills it
- **agileflow-delivery** — pr-reviewer is a delivery gate; delivery orchestrates the overall release, pr-reviewer is one of its quality checkpoints
- **agileflow-security** — invoke agileflow-audit with security dimension for auth changes, permission logic, or data handling code that warrants deeper security review

## References

| File                              | When to load                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `references/review-checklist.md`  | Full review — comprehensive checklist across all dimensions                  |
| `references/security-patterns.md` | Security-focused review — OWASP patterns, injection, auth issues to scan for |

## Workflows

| File                           | When to follow                                                          |
| ------------------------------ | ----------------------------------------------------------------------- |
| `workflows/review-pr.md`       | Standard PR review — all dimensions, produces findings + recommendation |
| `workflows/security-review.md` | Security-focused review for auth changes, API endpoints, data handling  |
