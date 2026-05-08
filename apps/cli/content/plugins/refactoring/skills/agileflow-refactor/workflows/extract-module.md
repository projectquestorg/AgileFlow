# Workflow: Extract Module

**Triggers:** "extract this to its own file", "this class is too big", "make this reusable", "this code belongs in a shared utility", user identifies a function or class that should live somewhere else

**Goal:** Extract a cohesive set of functions or a class from a large file into its own well-named module, with correct imports updated across all callers.

---

## When to extract a module

| Signal                                                   | Extraction candidate                                |
| -------------------------------------------------------- | --------------------------------------------------- |
| A class handles multiple concerns                        | Split by responsibility (see Extract Class pattern) |
| A utility function is duplicated across files            | Extract to `utils/` or `lib/`                       |
| A domain concept is embedded in infrastructure code      | Extract domain object                               |
| A file is > 300 lines                                    | Candidate for splitting                             |
| Other files are copying the same logic                   | Extract shared module                               |
| A function group doesn't depend on the class it lives in | Extract to standalone module                        |

---

## Inputs needed

| Input           | Required | How to get it                                   |
| --------------- | -------- | ----------------------------------------------- |
| Source file     | Yes      | File path                                       |
| What to extract | Yes      | Function names, class section, or "the X logic" |
| Target location | No       | I'll suggest based on project conventions       |
| Existing tests  | Check    | Find adjacent test file                         |

---

## Steps

### Step 1: Understand the current dependencies

Before extracting, map what the candidate code depends on:

```
What will move:
  - calculateOrderTotal(order)
  - applyDiscount(subtotal, couponCode)
  - TAX_RATE constant

What it depends on:
  - Coupon model (from '../models/coupon')
  - formatCurrency() utility (from '../utils/format')
  - Logger (from '../lib/logger')

What depends on it (callers in the current file):
  - processOrder() calls calculateOrderTotal()

Other callers (outside the current file):
  - grep -r "calculateOrderTotal" → none (only internal)
```

This map becomes the new module's import list.

### Step 2: Determine the target location

Follow the project's existing conventions:

| What you're extracting                 | Likely destination                     |
| -------------------------------------- | -------------------------------------- |
| General utility function               | `src/utils/`                           |
| Domain logic (pricing, shipping, etc.) | `src/domain/` or `src/lib/`            |
| Data access / query                    | `src/repositories/`                    |
| External service adapter               | `src/integrations/` or `src/adapters/` |
| Type definitions                       | `src/types/`                           |
| Configuration                          | `src/config/`                          |

If the project doesn't have clear conventions, use the location closest to where the extracted code is most heavily used.

### Step 3: Write the new module file

1. Create the new file at the target path
2. Copy (don't yet delete) the code from the source
3. Add the necessary imports the code needs
4. Export everything that callers will need

```js
// src/pricing/order-total.js (extracted from src/services/order-service.js)

import { Coupon } from "../models/coupon.js";
import { logger } from "../lib/logger.js";

export const TAX_RATE = 0.1;

export async function calculateOrderTotal(order) {
  const subtotal = order.lineItems.reduce(
    (sum, item) => sum + item.price * item.qty,
    0,
  );
  const discounted = await applyDiscount(subtotal, order.couponCode);
  return discounted * (1 + TAX_RATE);
}

async function applyDiscount(subtotal, couponCode) {
  if (!couponCode) return subtotal;
  const coupon = await Coupon.findByCode(couponCode);
  if (!coupon || !coupon.isValid) return subtotal;
  return subtotal * (1 - coupon.discountPct / 100);
}
```

### Step 4: Update the source file to import from the new module

In the original file:

```js
// Before (in src/services/order-service.js):
// ... calculateOrderTotal and applyDiscount defined here (40 lines) ...

// After:
import { calculateOrderTotal, TAX_RATE } from "../pricing/order-total.js";
// ... rest of the file unchanged, the function calls work as before ...
```

### Step 5: Update all other callers

Search for all usages of the extracted symbols outside the source file:

```bash
grep -r "calculateOrderTotal" src/
grep -r "TAX_RATE" src/
```

Update each import to point to the new module.

### Step 6: Run tests

Run the full test suite. All tests should pass without modification — if tests break, the extraction changed observable behaviour (find and fix before continuing).

### Step 7: Write or update tests for the new module

The extracted module should have its own test file:

```
src/pricing/order-total.js       (new module)
src/pricing/order-total.test.js  (new test file)
```

If the original tests covered this code through integration tests, those still pass. But also add direct unit tests for the new module — they're now fast and isolated.

### Step 8: Delete the original code

Only after:

- [ ] New module file created and tested
- [ ] Source file imports from the new module
- [ ] All other callers updated
- [ ] All tests pass

Delete (or remove) the original code from the source file.

### Step 9: Final verification

```bash
# No broken imports
npx tsc --noEmit    # TypeScript
# or
node --check src/services/order-service.js  # Node.js ESM

# Tests pass
npm test

# No references to old location remain
grep -r "calculateOrderTotal" src/   # should all point to new location
```

### Step 10: Commit

Commit in two parts for cleaner history:

```bash
git add src/pricing/order-total.js src/pricing/order-total.test.js
git commit -m "refactor: extract order total calculation to pricing module"

git add src/services/order-service.js src/  # remaining callers
git commit -m "refactor: update callers to import from pricing/order-total"
```

Or a single commit if the change is small:

```bash
git commit -m "refactor: extract calculateOrderTotal to src/pricing/order-total.js"
```

---

## Handling circular dependencies

If the extraction would create a circular dependency (A imports B, B imports A):

1. **Identify the cycle**: draw the dependency chain
2. **Extract the shared code** into a third module that neither A nor B imports (the shared dependency)
3. Both A and B import from the third module

```
Before: service.js ↔ repository.js (circular)
After:  service.js → shared-types.js ← repository.js (no cycle)
```

---

## Fallbacks

**If AskUserQuestion is unavailable:**

After analysis, present as a numbered plan:

```
Extraction plan for calculateOrderTotal from order-service.js:

New module: src/pricing/order-total.js
Exports: calculateOrderTotal(), TAX_RATE
Callers to update: 1 (only order-service.js uses it)

Steps:
1. Create src/pricing/order-total.js with the extracted code
2. Update order-service.js to import from the new module
3. Run tests to confirm behaviour preserved
4. Write direct unit tests for the new module

Reply with "proceed" to apply all steps, or tell me what to change.
```
