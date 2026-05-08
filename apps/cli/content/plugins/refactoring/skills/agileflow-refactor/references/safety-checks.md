# Refactoring Safety Checks

**Load this when:** assessing the risk of a refactoring before starting, or verifying a refactoring is complete and safe to commit.

---

## Why safety matters

Refactoring without adequate safety measures creates two common failure modes:

1. **Behaviour changes silently** — the refactoring introduced a subtle difference (different error type, changed evaluation order, missing case) that wasn't caught
2. **Tests weren't sufficient** — tests passed, but they weren't testing the right thing; the regression only shows up in production

The checklists here mitigate both.

---

## Pre-refactoring checklist

Work through this before touching any code.

### 1. Tests exist and pass

- [ ] There are tests for the code being refactored
- [ ] The tests are passing right now (before any change)
- [ ] The tests are in the correct layer (unit, integration) for the code being changed
- [ ] If tests don't exist: STOP — write characterisation tests first

**Minimum test coverage required before refactoring:**

- All public method happy paths
- At least one error/exception path
- Any code paths that will be structurally affected by the refactoring

### 2. Impact analysis

- [ ] I know which callers/consumers use the code being changed
- [ ] For functions: searched for all call sites with `grep -r "functionName"`
- [ ] For modules: searched for all imports with `grep -r "from './module'"`
- [ ] For types/interfaces: TypeScript compiler will catch violations; ESLint for JS
- [ ] For exported symbols: not used by external packages/consumers

### 3. Public API check

Is the code being changed part of a public API (consumed externally)?

| API type             | Risk      | Required action                             |
| -------------------- | --------- | ------------------------------------------- |
| Internal function    | Low       | Proceed with care                           |
| Public module export | Medium    | Ensure same external interface is preserved |
| HTTP endpoint        | High      | Ensure same request/response schema         |
| SDK / library API    | Very high | Requires deprecation + major version bump   |
| Database schema      | High      | Requires migration + backward compatibility |

If changing a public API: use **Parallel Change** pattern (expand → migrate → contract) rather than a direct replacement.

### 4. Scope check

- [ ] This refactoring does only ONE type of change (extract, rename, restructure — not all three)
- [ ] The change can be committed independently (doesn't depend on other uncommitted work)
- [ ] The change is not bundled with a feature addition or bug fix

If you find yourself doing more than one type of refactoring: split into separate commits.

### 5. Risk assessment

| Factor             | Low risk                     | High risk                                               |
| ------------------ | ---------------------------- | ------------------------------------------------------- |
| Code coverage      | > 80%                        | < 40%                                                   |
| Callers            | Few (< 5)                    | Many (> 20)                                             |
| Code age           | Recently written             | Legacy, rarely touched                                  |
| Code clarity       | Easy to understand           | Hard to understand (which is why you're refactoring it) |
| Team familiarity   | Author or recent contributor | Nobody remembers writing it                             |
| Production traffic | Low                          | High (hot path)                                         |

For high-risk refactoring: do it in a feature branch, get a review before merging.

---

## Post-refactoring checklist

After every refactoring, confirm these before committing.

### 1. Behaviour preservation

- [ ] All existing tests pass with zero modifications to test expectations
- [ ] Any test that needed to change: verify it's because the test was wrong, not because behaviour changed
- [ ] No new linting errors introduced

**Red flags — investigate before proceeding:**

- A test now passes that was previously failing
- A test needed to be deleted (not just reorganised)
- A test expectation changed (not just the structure of the test)

### 2. Performance (for hot paths)

For code in a frequently-called code path:

- [ ] No new synchronous I/O introduced
- [ ] No N+1 query introduced (loop calling DB in each iteration)
- [ ] No algorithm complexity regression (O(n) → O(n²))

### 3. Error handling preserved

- [ ] Error types thrown are the same (callers may catch specific error types)
- [ ] Error messages still contain the same diagnostic information
- [ ] No errors are now silently swallowed that were previously propagated

### 4. Type correctness (TypeScript)

- [ ] `tsc --noEmit` runs clean (no new type errors)
- [ ] No `any` casts introduced to work around type issues

### 5. API contract preserved

If the refactoring touched an API handler:

- [ ] Request schema unchanged
- [ ] Response schema unchanged
- [ ] HTTP status codes unchanged
- [ ] Header behaviour unchanged

### 6. Commit quality

- [ ] Commit message describes the refactoring pattern: "refactor: extract calculateOrderTotal function"
- [ ] Commit contains only the refactoring (no feature changes mixed in)
- [ ] PR description explains what was refactored and why (technical debt? readability? preparation for a feature?)

---

## Characterisation tests (when tests don't exist)

Before refactoring code with no tests, write **characterisation tests** — tests that document the current behaviour (even if that behaviour is wrong or ugly).

```js
// Characterisation test — tests what the code DOES NOW,
// not necessarily what it SHOULD do
describe("LegacyPricingEngine.compute — characterisation", () => {
  it("returns the price with tax for a standard product", () => {
    const result = engine.compute({ sku: "PROD-1", qty: 2 });
    // The exact value — not ideal, but documents current behaviour
    expect(result.total).toBe(24.2);
  });

  it("returns 0 for qty of 0", () => {
    const result = engine.compute({ sku: "PROD-1", qty: 0 });
    expect(result.total).toBe(0);
  });

  it("throws for negative qty (current behaviour)", () => {
    // This might be wrong behaviour, but we document it before changing
    expect(() => engine.compute({ sku: "PROD-1", qty: -1 })).toThrow();
  });
});
```

These tests protect you from accidentally changing observable behaviour during the refactoring. After the refactoring, you can improve the tests to reflect what the code should do.

---

## Rollback plan

For high-risk refactoring:

1. **Work in a branch** — you can discard without affecting main
2. **Small commits** — each step can be reverted independently
3. **Feature flag** — if refactoring a hot path, wrap with a flag to revert at runtime without a deploy

```js
// Feature flag for refactoring rollback
const result = featureFlags.useRefactoredPricingEngine
  ? newPricingEngine.compute(params)
  : legacyPricingEngine.compute(params);
```

Remove the flag once confidence is established (after a few days in production with monitoring).
