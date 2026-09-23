# Common Bug Patterns Reference

**Load this when:** you've isolated a bug to a general category and want to match it to known patterns, or when you want to check if the current bug is an instance of a recurring type.

---

## Category 1: Null and undefined errors

The most common category. Almost always caused by an assumption that a value will exist.

### Pattern 1.1: DB query returning null unexpectedly

**Symptom:** `TypeError: Cannot read properties of null` on a field of a database result

**Cause:** The record doesn't exist in the database, but the code assumed it always would.

```js
// Bug
const user = await User.findById(req.params.id);
return res.json({ name: user.name }); // TypeError if user is null

// Fix
const user = await User.findById(req.params.id);
if (!user) return res.status(404).json({ error: "User not found" });
return res.json({ name: user.name });
```

**Root cause:** Missing null check after a database lookup that can return null.

### Pattern 1.2: Optional chaining pitfall

**Symptom:** Code with `?.` returns `undefined` but code downstream doesn't handle it.

```js
// Bug: silently returns undefined, downstream code crashes
const email = user?.profile?.contact?.email;
await sendWelcome(email); // email is undefined; sendWelcome crashes or sends to undefined

// Fix: guard before using the result
const email = user?.profile?.contact?.email;
if (!email) throw new Error(`User ${user.id} has no email address`);
await sendWelcome(email);
```

### Pattern 1.3: Array empty result not handled

```js
// Bug: assumes at least one result
const admins = await User.findAll({ where: { role: "admin" } });
const primaryAdmin = admins[0]; // undefined if admins is []
await notifyAdmin(primaryAdmin.email); // crash

// Fix
if (admins.length === 0) throw new Error("No admin users found");
```

---

## Category 2: Async / Promise errors

### Pattern 2.1: Missing await

**Symptom:** Code behaves as if it's using a default/empty value, then later operations fail.

```js
// Bug: result is a Promise, not the actual value
const user = User.findById(id); // missing await
console.log(user.name); // Promise object doesn't have .name

// Fix
const user = await User.findById(id);
```

**How to spot it:** Look for property access on a variable that holds a Promise. TypeScript catches this if types are correct.

### Pattern 2.2: Fire and forget (unhandled rejection)

**Symptom:** Silent failure — something should happen but doesn't; sometimes shows as `UnhandledPromiseRejection` in logs.

```js
// Bug: if sendEmail rejects, nobody knows
emailService.sendWelcome(user.email);

// Fix option 1: await and handle
await emailService.sendWelcome(user.email);

// Fix option 2: intentional fire-and-forget with error logging
emailService.sendWelcome(user.email).catch((err) => {
  logger.error("Failed to send welcome email", { userId: user.id, err });
});
```

### Pattern 2.3: Promise.all short-circuit

**Symptom:** One of several parallel operations fails, but the error is confusing because it mentions a different operation.

```js
// Bug: if any one fails, ALL results are lost; error message may reference the wrong one
const [orders, invoices, payments] = await Promise.all([
  getOrders(userId),
  getInvoices(userId),
  getPayments(userId), // this one fails
]);

// Fix: if partial results are acceptable, use Promise.allSettled
const results = await Promise.allSettled(
  [getOrders, getInvoices, getPayments].map((fn) => fn(userId)),
);
const [orders, invoices, payments] = results.map((r) =>
  r.status === "fulfilled" ? r.value : null,
);
```

---

## Category 3: Race conditions

### Pattern 3.1: Check-then-act (TOCTOU)

**Symptom:** Intermittent duplicate records or constraint violation errors.

```js
// Bug: another request can insert between the check and the insert
const existing = await User.findByEmail(email);
if (existing) throw new Error("Email already taken");
await User.create({ email }); // another request may have inserted by now

// Fix: use a unique constraint in the database + catch the constraint error
try {
  await User.create({ email });
} catch (err) {
  if (err.code === "ER_DUP_ENTRY" || err.constraint === "users_email_key") {
    throw new ConflictError("Email already taken");
  }
  throw err;
}
```

### Pattern 3.2: Shared in-memory state across async operations

**Symptom:** Data from request A appears in request B's response.

```js
// Bug: object modified across async boundary — shared between requests
const cache = {}; // module-level — shared across ALL requests

app.get("/user/:id", async (req, res) => {
  cache.currentUserId = req.params.id; // BUG: shared state
  const user = await getUser(cache.currentUserId); // may get wrong ID
  res.json(user);
});

// Fix: keep state per-request, not at module level
app.get("/user/:id", async (req, res) => {
  const userId = req.params.id; // request-scoped variable
  const user = await getUser(userId);
  res.json(user);
});
```

### Pattern 3.3: Increment / decrement race

**Symptom:** Counter or balance goes negative or to wrong value under concurrent load.

```sql
-- Bug: both requests read balance=100, both subtract 80, both update to 20
-- instead of one update failing
UPDATE accounts SET balance = balance - 80 WHERE id = 5;

-- Fix: use a conditional update and check rows affected
UPDATE accounts SET balance = balance - 80 WHERE id = 5 AND balance >= 80;
-- If 0 rows updated: insufficient balance
```

---

## Category 4: Type and coercion bugs

### Pattern 4.1: Loose equality causing incorrect branching

```js
// Bug: 0 is falsy — empty cart treated as "no cart found"
if (!cartCount) return res.json({ empty: true }); // fires when cartCount === 0

// Fix: explicit comparison
if (cartCount === null || cartCount === undefined)
  return res.json({ empty: true });
```

### Pattern 4.2: String/number confusion from external input

```js
// Bug: URL param is always a string
app.get("/items/:page", (req, res) => {
  const page = req.params.page; // "1" (string)
  const offset = page * 10; // "1" * 10 = 10 (works, implicit coercion)
  const nextPage = page + 1; // "11" (string concat!) ← bug
});

// Fix: always parse external inputs
const page = parseInt(req.params.page, 10);
if (isNaN(page) || page < 1)
  return res.status(400).json({ error: "Invalid page" });
```

### Pattern 4.3: JSON parse / stringify precision loss

```js
// Bug: JavaScript numbers lose precision beyond 2^53
const id = JSON.parse('{ "id": 9007199254740993 }').id;
console.log(id); // 9007199254740992 — wrong!

// Fix: use a JSON bigint-aware parser, or return IDs as strings
```

---

## Category 5: State management bugs

### Pattern 5.1: Stale closure

**Symptom:** A variable in an event handler or callback has the wrong (old) value.

```js
// Bug: `count` in the closure is from when the handler was created
let count = 0;
button.addEventListener("click", () => {
  count++;
  setTimeout(() => {
    console.log(count); // always logs the count from when setTimeout was called, not when it fires
  }, 1000);
});

// Fix: use a ref (React), use useCallback/useRef, or read from state on every access
```

### Pattern 5.2: Mutating props / arguments

```js
// Bug: mutates the input object — caller's data is changed
function normalise(user) {
  user.email = user.email.toLowerCase(); // ← modifies the original
  return user;
}

// Fix: return a new object
function normalise(user) {
  return { ...user, email: user.email.toLowerCase() };
}
```

---

## Category 6: Date and time bugs

### Pattern 6.1: Timezone mismatch

**Symptom:** Timestamps off by hours; date comparisons fail in certain timezones.

```js
// Bug: new Date() uses local timezone; server and client may differ
const today = new Date().toISOString().slice(0, 10); // '2025-01-01' in UTC but not in UTC+10

// Fix: always work in UTC; use a library (date-fns, Temporal) for date arithmetic
import { format } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";
const today = format(utcToZonedTime(new Date(), "UTC"), "yyyy-MM-dd");
```

### Pattern 6.2: DST boundary bugs

**Symptom:** Duration calculations off by 1 hour on daylight saving transition dates.

```js
// Bug: day duration calculation using milliseconds breaks at DST boundary
const msInDay = 24 * 60 * 60 * 1000;
const daysDiff = (end - start) / msInDay; // may be 22/23/25 hours on DST day

// Fix: use a date library that handles DST
import { differenceInDays } from "date-fns";
const daysDiff = differenceInDays(end, start);
```

---

## Category 7: Off-by-one errors

### Pattern 7.1: Loop boundary

```js
// Bug: should process items 0..9 (10 items), but < vs <= is wrong
for (let i = 0; i <= items.length; i++) { // ← goes one past the end
  process(items[i]); // items[10] is undefined on 10-item array
}

// Fix
for (let i = 0; i < items.length; i++) {
```

### Pattern 7.2: Slice/substring index

```js
// Bug: slice(1, n) vs slice(0, n) vs slice(0, n-1) confusion
const first10 = str.slice(1, 10); // skips the first character!

// Fix
const first10 = str.slice(0, 10);
```

### Pattern 7.3: Pagination offset

```js
// Bug: page 1 returns items 1-10, page 2 returns 11-20... but item 1 is index 0
const offset = page * pageSize; // page 1 → offset 10 → skips first 10 items!

// Fix
const offset = (page - 1) * pageSize; // page 1 → offset 0
```

---

## Category 8: Import / module bugs

### Pattern 8.1: Circular dependency

**Symptom:** A module exports `undefined` or an incomplete object.

```js
// a.js imports b.js, b.js imports a.js
// One of them will receive an incomplete module at require time
// Symptom: SomeClass is undefined at runtime, no error at import time

// Fix: break the cycle by extracting shared code into a third module
// Or use lazy imports (import inside the function, not at the top)
```

### Pattern 8.2: Named vs default export confusion

```js
// module.js
export const foo = () => {}; // named export
export default function bar() {} // default export

// Bug: wrong import style
import foo from "./module"; // gets the default export (bar), not foo!

// Fix
import { foo } from "./module"; // named import
import bar from "./module"; // default import
```
