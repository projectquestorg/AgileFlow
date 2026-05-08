# Refactoring Patterns Reference

**Load this when:** choosing a refactoring pattern for a specific smell, or implementing a specific pattern with correct before/after structure.

---

## Pattern 1: Extract Function

**When:** A section of a function has a clear single purpose, or a function is > 20–30 lines.

**Signal:** You can describe a block of code with a phrase ("calculate tax", "validate email format", "format the response").

```js
// Before — 40-line function doing multiple things
async function processOrder(orderId, userId) {
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Order not found");
  if (order.userId !== userId) throw new Error("Forbidden");

  // calculate total with discounts
  let total = order.lineItems.reduce(
    (sum, item) => sum + item.price * item.qty,
    0,
  );
  const coupon = await Coupon.findByCode(order.couponCode);
  if (coupon && coupon.isValid) {
    total = total * (1 - coupon.discountPct / 100);
  }
  total = total * 1.1; // tax

  // send confirmation
  await Email.send({
    to: order.customerEmail,
    subject: `Order ${orderId} confirmed`,
    body: `Your total is $${total.toFixed(2)}`,
  });

  return { orderId, total };
}

// After — extracted functions, each with one responsibility
async function processOrder(orderId, userId) {
  const order = await fetchAndAuthoriseOrder(orderId, userId);
  const total = await calculateOrderTotal(order);
  await sendOrderConfirmation(order, total);
  return { orderId, total };
}

async function fetchAndAuthoriseOrder(orderId, userId) {
  const order = await Order.findById(orderId);
  if (!order) throw new OrderNotFoundError(orderId);
  if (order.userId !== userId) throw new ForbiddenError();
  return order;
}

async function calculateOrderTotal(order) {
  const subtotal = order.lineItems.reduce(
    (sum, item) => sum + item.price * item.qty,
    0,
  );
  const discounted = await applyDiscount(subtotal, order.couponCode);
  return discounted * 1.1; // apply tax
}
```

---

## Pattern 2: Replace Nested Conditionals with Guard Clauses

**When:** The happy path is deeply nested inside multiple if/else blocks; early exit conditions are buried.

**Signal:** Code looks like an arrow pointing right, with the main logic at the deepest indentation level.

```js
// Before — arrow anti-pattern
function getShippingCost(order) {
  if (order !== null) {
    if (order.isEligible) {
      if (order.total > 100) {
        return 0; // free shipping
      } else {
        return 5.99;
      }
    } else {
      return null; // not eligible
    }
  } else {
    return null;
  }
}

// After — guard clauses; happy path last, exceptions first
function getShippingCost(order) {
  if (!order) return null;
  if (!order.isEligible) return null;
  if (order.total > 100) return 0;
  return 5.99;
}
```

---

## Pattern 3: Extract Class (Single Responsibility)

**When:** A class has grown to handle multiple concerns; it is hard to describe what it does without using "and".

**Signal:** "This class manages users **and** sends emails **and** generates reports."

```js
// Before — UserService doing too much
class UserService {
  async createUser(data) {
    /* create in DB */
  }
  async deleteUser(id) {
    /* delete from DB */
  }
  async sendWelcomeEmail(user) {
    /* call email provider */
  }
  async sendPasswordResetEmail(user) {
    /* call email provider */
  }
  async generateMonthlyReport() {
    /* query + format report */
  }
  async exportUsersCsv() {
    /* query + format CSV */
  }
}

// After — separated by responsibility
class UserService {
  async createUser(data) {
    /* create in DB */
  }
  async deleteUser(id) {
    /* delete from DB */
  }
}

class UserEmailService {
  async sendWelcomeEmail(user) {
    /* call email provider */
  }
  async sendPasswordResetEmail(user) {
    /* call email provider */
  }
}

class UserReportService {
  async generateMonthlyReport() {
    /* query + format report */
  }
  async exportUsersCsv() {
    /* query + format CSV */
  }
}
```

---

## Pattern 4: Replace Magic Number/String with Named Constant

**When:** A numeric or string literal is used without explanation.

```js
// Before
if (user.subscriptionTier === 3) {
  applyDiscount(0.15);
}
setTimeout(retryRequest, 5000);

// After
const ENTERPRISE_TIER = 3;
const ENTERPRISE_DISCOUNT = 0.15;
const RETRY_DELAY_MS = 5_000;

if (user.subscriptionTier === ENTERPRISE_TIER) {
  applyDiscount(ENTERPRISE_DISCOUNT);
}
setTimeout(retryRequest, RETRY_DELAY_MS);
```

---

## Pattern 5: Introduce Parameter Object

**When:** A function takes more than 4 parameters, especially if several are related.

```js
// Before
function createBooking(userId, roomId, checkIn, checkOut, guestCount, notes) {}

// After
function createBooking({
  userId,
  roomId,
  checkIn,
  checkOut,
  guestCount,
  notes,
}) {}

// Caller — reads like documentation
await createBooking({
  userId: currentUser.id,
  roomId: selectedRoom.id,
  checkIn: dates.start,
  checkOut: dates.end,
  guestCount: form.guests,
  notes: form.specialRequests,
});
```

---

## Pattern 6: Extract Variable

**When:** A complex expression is used inline; it's hard to understand what it computes.

```js
// Before
if (
  user.plan === "premium" &&
  Date.now() - user.lastLoginMs < 86400000 &&
  user.emailVerified
) {
  showPremiumContent();
}

// After
const isPremium = user.plan === "premium";
const isActiveToday = Date.now() - user.lastLoginMs < ONE_DAY_MS;
const isVerified = user.emailVerified;

if (isPremium && isActiveToday && isVerified) {
  showPremiumContent();
}
```

---

## Pattern 7: Consolidate Duplicate Code

**When:** The same logic appears in 2+ places (copy-paste code). Bugs get fixed in one place but not the other.

```js
// Before — same validation in two places
// In user-controller.js:
if (!email || !email.includes("@")) throw new ValidationError("Invalid email");

// In admin-controller.js:
if (!email || !email.includes("@")) throw new ValidationError("Invalid email");

// After — extracted to a shared utility
// In utils/validation.js:
export function validateEmail(email) {
  if (!email || !email.includes("@"))
    throw new ValidationError("Invalid email");
}

// Both controllers import and use it
import { validateEmail } from "../utils/validation.js";
validateEmail(req.body.email);
```

---

## Pattern 8: Replace Inheritance with Composition

**When:** A subclass uses only a small fraction of the parent's interface, or "is-a" doesn't semantically make sense.

```js
// Before — awkward inheritance
class Animal {
  eat() {}
  sleep() {}
  fly() {} // not all animals fly
  swim() {} // not all animals swim
}

class Dog extends Animal {
  fly() {
    throw new Error("Dogs can't fly");
  } // Violates Liskov
}

// After — composition with mixins or interfaces
class Dog {
  constructor() {
    this.locomotion = new GroundLocomotion(); // can run
    this.feeding = new CarnivoreDiet();
  }
  move() {
    return this.locomotion.move();
  }
}
```

---

## Pattern 9: Strangler Fig (incremental large-scale refactoring)

**When:** A large module or system needs a full redesign but can't be replaced all at once.

**Concept:** Build the new implementation alongside the old one; gradually route traffic to the new version until the old one can be deleted.

```js
// Phase 1: new implementation exists but old one still runs
class LegacyPaymentProcessor {
  /* old implementation */
}
class NewPaymentProcessor {
  /* new implementation */
}

// Phase 2: add a feature flag / router
class PaymentProcessorAdapter {
  constructor() {
    this.legacy = new LegacyPaymentProcessor();
    this.modern = new NewPaymentProcessor();
  }

  async charge(amount, card) {
    if (featureFlags.useNewPaymentProcessor) {
      return this.modern.charge(amount, card);
    }
    return this.legacy.charge(amount, card);
  }
}

// Phase 3: once confidence is high, remove the legacy processor
```

---

## Pattern 10: Parallel Change (expand, migrate, contract)

**When:** Changing a function signature or data structure that has many callers — you need to migrate safely without breaking everything at once.

```
Step 1 — Expand: Add the new parameter alongside the old one
  function getUser(id, options = {}) { ... }

Step 2 — Migrate: Update all callers to use the new signature
  getUser(id, { includeProfile: true })

Step 3 — Contract: Remove the old parameter once all callers are updated
  function getUser(id, options) { ... }
```

---

## Pattern 11: Dead Code Removal

**When:** Functions, variables, or branches are never reached.

**Detection:**

```bash
# Find unused exports (TypeScript)
npx ts-prune

# Find unused variables
eslint --rule 'no-unused-vars: error'

# Find unreachable code after return
# Most linters catch this; look for ESLint 'no-unreachable'
```

**Before removing:**

1. Confirm with a search: is this truly never called? (Dynamic calls, reflection, string interpolation can fool static analysis)
2. Check git history: was this disabled recently for a reason?
3. Check if it's used in tests only — that's still "used" but warrants a discussion

---

## Pattern 12: Replace if/else chain with lookup table

**When:** A long if/else or switch that maps values to actions or results.

```js
// Before — hard to extend, easy to miss a case
function getStatusLabel(status) {
  if (status === "pending") return "Awaiting approval";
  else if (status === "approved") return "Approved";
  else if (status === "rejected") return "Rejected";
  else if (status === "cancelled") return "Cancelled";
  else return "Unknown";
}

// After — lookup table; adding a new status is one line
const STATUS_LABELS = {
  pending: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function getStatusLabel(status) {
  return STATUS_LABELS[status] ?? "Unknown";
}
```
