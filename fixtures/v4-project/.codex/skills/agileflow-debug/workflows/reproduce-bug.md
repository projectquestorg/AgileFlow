# Workflow: Reproduce Bug

**Triggers:** "I can't reproduce this", "it's intermittent", "happens on production not locally", user needs to file a bug report, or the debugging flow is stuck because the bug won't reproduce consistently

**Goal:** Create a minimal, reliable reproduction case that makes the bug fail consistently and in isolation.

---

## Why minimal reproduction matters

A minimal reproduction:

1. Removes noise — confirms which code is actually causing the bug
2. Enables sharing — can be given to another developer or submitted as a bug report
3. Enables regression tests — the reproduction becomes the basis for a test
4. Forces clarity — the act of creating it often reveals the root cause

---

## Inputs needed

| Input                           | Required  | How to get it                                     |
| ------------------------------- | --------- | ------------------------------------------------- |
| Description of the bug          | Yes       | What happens vs what should happen                |
| Steps that sometimes trigger it | Yes       | Ask: "What sequence of actions produces the bug?" |
| Environment where it occurs     | Yes       | Local, staging, production? Browser? OS?          |
| Frequency                       | Preferred | Always? 1 in 10? Only at certain times?           |
| Recent changes                  | No        | `git log --oneline` since it started              |

---

## Steps

### Step 1: Write down the exact preconditions

The bug may require specific state to occur. List:

- What data must exist in the database?
- What user must be authenticated?
- What must have happened just before (previous requests, state changes)?
- What time of day, day of week, or timezone?
- What browser, OS, or runtime version?

### Step 2: Reduce to the minimum trigger

Start with the full sequence that produces the bug. Then remove steps one at a time:

1. Does the bug still occur without step N?
   - Yes → step N is not required; remove it
   - No → step N is required; keep it

Repeat until you have the minimum sequence.

### Step 3: Reduce to the minimum code

Identify the smallest code path involved in the bug:

1. Write a standalone script or test that calls only the suspected function
2. Use hard-coded inputs (no HTTP, no session, no middleware)
3. Does it still fail? If yes — you have a minimal reproduction
4. If no — the bug requires context from the wider system; add back pieces one at a time

**Example minimal reproduction script:**

```js
// repro.js — standalone, no server, no middleware
import { calculateDiscount } from "./src/pricing/discount.js";

// These are the exact inputs that reproduce the bug
const result = calculateDiscount({
  basePrice: 100,
  couponCode: "SAVE10",
  userRole: "premium",
});

console.log("Expected: 85");
console.log("Actual:", result.finalPrice);
// Run: node repro.js
```

### Step 4: Add assertions to make the failure explicit

Turn the reproduction into a failing test:

```js
import { describe, it, expect } from "vitest";
import { calculateDiscount } from "./src/pricing/discount.js";

describe("calculateDiscount — regression test for #issue-123", () => {
  it("applies the SAVE10 coupon correctly for premium users", () => {
    const result = calculateDiscount({
      basePrice: 100,
      couponCode: "SAVE10",
      userRole: "premium",
    });
    expect(result.finalPrice).toBe(85); // BUG: currently returns 90
  });
});
```

This test will fail until the bug is fixed. Once fixed, it becomes the regression test.

### Step 5: For intermittent bugs — find the trigger condition

If the bug is intermittent, the goal is to make it fail consistently. Strategies:

#### 5a: Add tight retry loops

```js
// Run the suspected operation 1000 times — race conditions will appear
for (let i = 0; i < 1000; i++) {
  await suspectedRaceCondition();
}
```

#### 5b: Add concurrent execution

```js
// Run 50 concurrent requests to expose race conditions
await Promise.all(
  Array.from({ length: 50 }, () =>
    request(app).post("/api/orders").send(payload),
  ),
);
```

#### 5c: Remove timeouts and sleep

Intermittent bugs often depend on timing. Replace any `setTimeout` or `sleep` with synchronous equivalents to make the state explicit.

#### 5d: Fake the time

```js
// If the bug depends on a specific time of day or elapsed time
vi.useFakeTimers();
vi.setSystemTime(new Date("2025-03-09T02:00:00Z")); // DST change day
// ... reproduce the bug
vi.useRealTimers();
```

#### 5e: Run tests in different order

```bash
# Vitest — randomise order
vitest --sequence.shuffle

# Jest
jest --randomize

# If a specific test fails only when run after another:
# Run the suspicious pair together and confirm
vitest path/to/test-a.test.js path/to/test-b.test.js
```

### Step 6: Document the reproduction

Write a short summary:

```
Bug: calculateDiscount returns 90 instead of 85 for premium users with SAVE10 coupon

Minimal reproduction:
  Input:  { basePrice: 100, couponCode: 'SAVE10', userRole: 'premium' }
  Expected: { finalPrice: 85 }
  Actual:   { finalPrice: 90 }

File: repro.js (attached) — run with: node repro.js
Test: tests/pricing/discount.regression.test.js

Root cause hypothesis: The premium discount (15%) and coupon (10%) are applied
additively instead of the coupon being applied first then the role discount.
```

### Step 7: Hand off the reproduction to the debug workflow

Once the bug is reproducible, follow `workflows/debug-issue.md` from Step 4 (isolate) using the minimal reproduction as the starting point. The root cause is usually obvious once the noise is removed.

---

## Fallbacks

**If the bug cannot be reproduced locally:**

1. Add verbose logging to the production/staging path and ask for logs
2. Check if the issue is data-specific (a particular user ID or record)
3. Ask: "Does this happen for all users or only specific accounts?"
4. Request a copy of the production data (sanitised) to reproduce locally

**If the bug cannot be reproduced at all (user reports it but you can't confirm):**

1. Ask for a screen recording or screenshot
2. Ask which browser, OS, and app version they are using
3. Ask if it happened more than once and if any colleagues can reproduce it
4. It may be a caching issue — ask them to hard-reload or clear cache
