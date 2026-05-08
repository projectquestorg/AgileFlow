# Workflow: Safe Refactor

**Triggers:** "refactor this", "clean this up", "this is too complex", user identifies technical debt or asks to improve code quality

**Goal:** Apply a refactoring pattern safely — with tests confirmed, impact analysed, pattern applied, and behaviour verified.

---

## Inputs needed

| Input           | Required  | How to get it                                               |
| --------------- | --------- | ----------------------------------------------------------- |
| Target code     | Yes       | File path or paste the code                                 |
| Motivation      | Preferred | Why does this need refactoring? What problem does it solve? |
| Existing tests  | Check     | Search for adjacent test file                               |
| Desired outcome | No        | What should the code feel like after?                       |

---

## Steps

### Step 1: Read and understand the code

Read the target file completely. Build a mental model of:

- What does this code do?
- What are the inputs and outputs?
- What side effects does it have?
- What are the callers? (do a quick search)

Don't propose a refactoring until you fully understand what the code is doing.

### Step 2: Identify the code smells

Cross-reference with `references/refactoring-patterns.md` to match the code to named smells:

```
Smells detected in src/services/order-service.js:
  - Long method: processOrder() is 87 lines
  - Magic numbers: 0.1 used on line 34 (tax rate?), 86400000 on line 62 (ms in a day?)
  - Duplicate code: email validation on lines 12 and 45 — same logic
  - Missing early returns: 4 levels of nesting on line 28–61
```

### Step 3: Check the safety preconditions

Work through `references/safety-checks.md` — pre-refactoring checklist:

- [ ] Tests exist?
- [ ] Tests pass right now?
- [ ] Impact analysis complete?
- [ ] Not a public API change without a plan?

**If tests don't exist:**

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "No tests found for this code. Safe refactoring requires a test safety net.",
  "header": "How to proceed",
  "multiSelect": false,
  "options": [
    {"label": "Write characterisation tests first (Recommended)", "description": "I'll write tests that document the current behaviour — then we refactor safely"},
    {"label": "Write proper tests based on expected behaviour", "description": "Better for greenfield or well-understood code — takes longer but produces better tests"},
    {"label": "Proceed without tests (I accept the risk)", "description": "Only for trivial renames or obvious dead code — I'll flag any risks"}
  ]
}]</parameter>
</invoke>
```

### Step 4: Propose the refactoring plan

Before writing any code, present the plan:

```
Proposed refactoring for src/services/order-service.js:

1. Extract `calculateOrderTotal(order)` from processOrder() (lines 28–47)
   Pattern: Extract Function
   Risk: Low — pure function, well-tested path

2. Replace tax magic number 0.1 with named constant TAX_RATE
   Pattern: Replace Magic Number
   Risk: Very low — rename only

3. Replace nested conditional on lines 28–61 with guard clauses
   Pattern: Guard Clause
   Risk: Low — same logic, different structure; tests will verify

4. Extract duplicate email validation to shared validateEmail() utility
   Pattern: Consolidate Duplicate Code
   Risk: Low — two call sites, both covered by tests

Each step will be a separate commit. Shall I proceed?
```

Show this plan and get confirmation before writing code.

### Step 5: Apply refactorings one at a time

For each step:

1. Make the specific change
2. Run tests (or ask the user to run them)
3. Confirm tests still pass
4. Commit with a descriptive message: `refactor: extract calculateOrderTotal function`

**Do not proceed to the next step if tests fail.**

### Step 6: Final verification

After all steps are complete:

- [ ] All tests pass
- [ ] No new linting errors
- [ ] Code reads as intended (spot-check the key sections)
- [ ] Commit history is clean (each commit is one pattern, one purpose)

### Step 7: Offer next steps

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Refactoring complete. Applied {N} patterns to {file}. All tests pass.",
  "header": "Next step",
  "multiSelect": false,
  "options": [
    {"label": "Review the final diff (Recommended)", "description": "I'll show the before/after comparison so you can confirm it looks right"},
    {"label": "Run the tests to confirm", "description": "Run the test suite and show the output"},
    {"label": "Continue refactoring — there are more issues", "description": "I found {M} additional smells — want me to plan the next pass?"},
    {"label": "That's enough for now", "description": "Commit and move on"}
  ]
}]</parameter>
</invoke>
```

---

## Quick refactoring (trivial changes)

For very low-risk refactorings (rename a variable, extract a constant), skip the full flow:

1. Make the change
2. Confirm tests pass
3. Done

Flag: "This is a trivial rename — no plan needed. Proceeding directly."

---

## Fallbacks

**If AskUserQuestion is unavailable:**

Present the plan as a numbered list and ask for confirmation:

```
Proposed refactoring plan for {file}:

1. Extract calculateOrderTotal() — Extract Function pattern
2. Replace magic number 0.1 with TAX_RATE constant
3. Replace nested conditional with guard clauses
4. Extract duplicate email validation to shared utility

Reply with:
- "proceed" — I'll apply all steps sequentially, one commit each
- "just step N" — I'll apply only that step
- "revise" — tell me what to change about the plan
```
