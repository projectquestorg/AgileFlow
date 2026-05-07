# Workflow: Add Coverage to Existing Code

**Triggers:** "increase test coverage", "add tests to this file", "this module has no tests", user mentions low coverage percentages

**Goal:** Analyse an existing file or module, identify the highest-value untested paths, and add tests that meaningfully improve confidence — not just line counts.

---

## Inputs needed

| Input                              | Required | How to get it                                                   |
| ---------------------------------- | -------- | --------------------------------------------------------------- |
| Target file or module              | Yes      | User specifies; or ask                                          |
| Current coverage report            | No       | Run `npm test -- --coverage` or `pytest --cov` and paste output |
| Test framework                     | Yes      | Detect from config                                              |
| Existing test file for this module | No       | Search for `*.test.*` or `*_test.*` adjacent to the file        |

---

## Steps

### Step 1: Read the target file

Read the source file completely. Build a mental model of:

- Every exported function / class / method
- Every branch (if/else, switch, ternary, nullish coalescing)
- Every error path (throw, reject, catch, return null/undefined)
- Every async operation

### Step 2: Find (or analyse) what's already tested

If an existing test file exists, read it. Map each test to the branches it covers. Identify the gaps.

If no test file exists, every branch is untested.

If a coverage report is available, read it to find:

- Uncovered lines (marked with `|` in text reports)
- Uncovered branches (marked with `U` in branch summary)

### Step 3: Rank uncovered paths by value

Not all untested code is equally worth testing. Rank by:

| Priority | What to test                                                   | Rationale                         |
| -------- | -------------------------------------------------------------- | --------------------------------- |
| P0       | Error paths that could cause data loss or security holes       | Silent failure is dangerous       |
| P0       | All branches in auth / permission checks                       | Wrong result = security breach    |
| P1       | Branches in core business logic (pricing, routing, validation) | Bugs here cost real money         |
| P1       | Edge cases on public API inputs                                | API contracts matter              |
| P2       | Happy paths not yet covered                                    | Baseline confidence               |
| P3       | Simple getters / trivial branches                              | Low ROI; skip if time-constrained |

Present the prioritised list to the user if it's long (10+ items).

### Step 4: Choose the right test layer

For each gap:

- If the gap is in a pure function → unit test
- If the gap is in a database query / ORM call → integration test (with test DB)
- If the gap is in an HTTP handler → integration test (with supertest / httptest)
- If the gap is in a UI component → unit test with a render utility (React Testing Library, Vue Test Utils)

### Step 5: Write the tests

For each P0 and P1 gap:

1. Check if a factory or fixture exists for the required test data
2. Write the test in the existing test file (or create one next to the source file)
3. Follow the Arrange → Act → Assert pattern
4. Use specific assertions — not `toBeTruthy`

### Step 6: Estimate coverage improvement

After writing tests, estimate:

- Which lines / branches are now covered
- Expected new coverage % (rough estimate)
- What is still uncovered and why (e.g. infrastructure code, trivial getters excluded intentionally)

### Step 7: Present the result

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Coverage analysis complete for {filename}. Found {N} uncovered paths. Added {M} tests targeting the {K} highest-value gaps.",
  "header": "Next step",
  "multiSelect": false,
  "options": [
    {"label": "Write the updated test file now (Recommended)", "description": "I'll update {test-file-path} with the {M} new tests"},
    {"label": "Also cover the remaining {R} lower-priority paths", "description": "Full coverage pass — will add {R} more tests for trivial branches and getters"},
    {"label": "Review the test plan first", "description": "I'll show you each test I'm planning before writing anything"},
    {"label": "Run coverage to confirm the improvement", "description": "I'll write the file then run the test suite to show the before/after coverage delta"}
  ]
}]</parameter>
</invoke>
```

---

## Coverage gap analysis template

When presenting gaps to the user, use this format:

```
Coverage gaps in src/services/user-service.ts
──────────────────────────────────────────────
Estimated current: ~45% branch coverage

P0 gaps (write these first):
  ✗ Line 34-38: deleteUser() — no test for the DB error path (throws CascadeError)
  ✗ Line 67: checkPermission() — only 'admin' role tested; 'viewer' and 'editor' untested

P1 gaps:
  ✗ Line 102: updateEmail() — happy path exists but no test for duplicate email (409 case)
  ✗ Line 118-125: sendVerificationEmail() — called but never asserted on

P2 gaps:
  ✗ Line 77: getUser() — null return when user not found has no test
  ✗ Line 89: listUsers() — empty result set not tested

Skip (low ROI):
  ✗ Line 12: constructor — getter only, no logic
  ✗ Line 200-202: formatName() — trivial string concat

Estimated coverage after writing P0 + P1: ~78% branch coverage
```

---

## Iterative coverage improvement (brownfield strategy)

For large legacy files with very low coverage, don't try to cover everything at once. Use the ratchet approach:

1. **Today:** Write tests for all P0 and P1 gaps in the files you're currently touching
2. **Add a coverage gate:** Set the CI threshold to current coverage − 0% (no regression allowed)
3. **Each PR:** Add tests for new code + one cleanup pass on P1 gaps in touched files
4. **Never go backwards:** If coverage drops, it fails CI

This turns coverage improvement into an automatic side effect of regular development.

---

## When coverage is the wrong goal

Flag to the user when you detect:

- Tests that only check `expect(result).toBeDefined()` — this is coverage inflation, not real testing
- Tests that call the function but assert nothing useful
- 100% coverage on a file that has no assertions (this is possible!)

In these cases, improving assertion quality matters more than adding new tests.
