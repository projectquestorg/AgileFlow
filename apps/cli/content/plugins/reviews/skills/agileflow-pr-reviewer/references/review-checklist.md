# PR Review Checklist

**Load this when:** running a full review across all dimensions. Work through each section that is applicable to the change.

---

## Before you start: scope the review

Read the PR description (or ask for it). Understand:

1. **What is this change trying to do?** (feature, bugfix, refactor, chore)
2. **What is the blast radius?** (one file, one service, cross-service, database schema)
3. **What is the risk level?** (new endpoint, auth change, data migration, trivial copy change)

Higher blast radius and risk = more thorough review needed.

---

## Section 1: Security

Work through these for any change that handles user input, auth, database queries, or file operations.

### Input handling

- [ ] All user input is validated before use (type, length, format, range)
- [ ] No raw SQL constructed by concatenating user input
- [ ] No shell commands built from user input (`exec`, `spawn`, `subprocess`)
- [ ] File paths from user input are sanitised (no `..` traversal)
- [ ] HTML output is escaped (no raw `innerHTML = userInput`)
- [ ] JSON parsed safely (no `eval()` on untrusted input)

### Authentication and authorisation

- [ ] Every state-changing endpoint has an auth check
- [ ] Auth checks happen before expensive operations (not just before the response)
- [ ] User can only access their own resources (no IDOR — Insecure Direct Object Reference)
- [ ] Role checks are server-side (not just hidden in the UI)
- [ ] Session tokens are invalidated on logout
- [ ] Password reset tokens are single-use and time-limited

### Data handling

- [ ] No sensitive data (passwords, tokens, PII) logged to application logs
- [ ] No sensitive data returned in error messages
- [ ] No hardcoded credentials, API keys, or secrets in source code
- [ ] Passwords hashed with bcrypt/argon2 (not MD5, SHA1, or SHA256 alone)
- [ ] Tokens generated with cryptographically secure randomness

### Transport and headers

- [ ] HTTPS enforced (no plain HTTP fallback for sensitive operations)
- [ ] CSRF protection on state-changing form submissions
- [ ] Sensitive cookies have `HttpOnly`, `Secure`, and `SameSite` attributes

---

## Section 2: Logic and correctness

### Null and undefined handling

- [ ] No property access on a value that could be null/undefined
- [ ] All function return values checked when they can return null/undefined/error
- [ ] Optional chaining (`?.`) or explicit null checks before deep access
- [ ] Array access guarded when index might be out of bounds

### Async and concurrency

- [ ] All Promises are awaited or properly handled with `.catch()`
- [ ] No fire-and-forget async calls that silently fail
- [ ] No shared mutable state modified concurrently without locks
- [ ] No race condition between a read and a subsequent write
- [ ] Database transactions used when multiple writes must be atomic

### Error handling

- [ ] All error paths handled explicitly (not just the happy path)
- [ ] Errors are logged with enough context to diagnose (not just `console.error(err)`)
- [ ] User-facing errors are generic (not leaking stack traces or internal details)
- [ ] Errors propagate to the caller or are handled — not silently swallowed
- [ ] Retry logic present for transient failures (network, DB connection)

### Edge cases

- [ ] Behaviour with empty input (empty string, empty array, zero) is correct
- [ ] Behaviour at boundaries is correct (first/last item, min/max value, midnight)
- [ ] Unicode strings handled correctly (emojis, RTL text, special characters)
- [ ] Large inputs don't cause OOM or performance collapse
- [ ] Pagination / cursors work correctly on empty result sets

### Business logic

- [ ] The change matches the acceptance criteria / ticket requirements
- [ ] No "off-by-one" errors in loops, date calculations, or index slicing
- [ ] No implicit assumptions about data ordering (unless ordering is guaranteed)
- [ ] State transitions are valid (e.g. can't move from COMPLETED back to PENDING)

---

## Section 3: Test coverage

### Coverage

- [ ] New code paths have corresponding tests
- [ ] Tests cover both the happy path and at least one sad path
- [ ] Edge cases (null, empty, boundary values) have tests
- [ ] Security-sensitive paths have explicit tests for unauthorised access

### Test quality

- [ ] Each test has at least one meaningful assertion (not just `toBeDefined()`)
- [ ] Assertions are specific: `toBe(200)` not `toBeTruthy()`
- [ ] Mocks are placed at the correct boundary (external deps only)
- [ ] Tests don't depend on each other's state
- [ ] Tests use descriptive names: `'returns 404 when user not found'` not `'test2'`

### Test fragility

- [ ] No fixed dates or time-sensitive assertions without fake timers
- [ ] No hardcoded IDs or database sequences
- [ ] No tests that rely on test execution order
- [ ] No tests with `setTimeout` / `sleep` — use fake timers

---

## Section 4: API contracts and breaking changes

### HTTP API

- [ ] No required fields removed from request or response schemas
- [ ] No fields renamed without a deprecation path
- [ ] No HTTP status codes changed (e.g. 200 → 204 can break consumers)
- [ ] New required request fields have defaults or a migration path for callers
- [ ] Error response format consistent with existing endpoints

### Database schema

- [ ] Migrations are additive (add column, add table) — not destructive
- [ ] `NOT NULL` columns have defaults or are added to empty tables
- [ ] No column renames without code + data migration
- [ ] Indexes added for new query patterns
- [ ] Down migration exists (or impossibility noted)

### Events / messages

- [ ] Event/message schema changes are backward compatible
- [ ] Consumers won't break if a new field is added
- [ ] No event type renames without a transition period

---

## Section 5: Performance

- [ ] No N+1 queries (loop that issues a DB query per iteration)
- [ ] Large result sets are paginated — no `SELECT *` without `LIMIT`
- [ ] Expensive operations aren't synchronous on the request thread (use queues)
- [ ] Caches are invalidated correctly when underlying data changes
- [ ] No unnecessary database round-trips (can be combined into one query)
- [ ] Indexes exist for new filtering/sorting patterns

---

## Section 6: Code quality

### Readability

- [ ] Variable and function names clearly express intent
- [ ] Functions do one thing (single responsibility)
- [ ] Complex logic has a comment explaining _why_ (not _what_)
- [ ] No dead code (commented-out blocks, unused variables, unreachable branches)

### Duplication

- [ ] No copy-paste of code that already exists elsewhere
- [ ] New utility functions placed in a shared location if used in >1 place
- [ ] Constants defined once, not repeated as magic numbers/strings

### Change size

- [ ] PR is reviewable (< 400 LOC diff as a guideline)
- [ ] If larger: is it a mechanical change (rename, format)? Is it justified?
- [ ] Each PR does one thing (not a feature + refactor + chore bundled together)

---

## Section 7: Documentation

- [ ] New public functions/methods have JSDoc / docstrings
- [ ] README updated if setup instructions changed
- [ ] API documentation updated if endpoint signatures changed
- [ ] Migration guide added if there are breaking changes
- [ ] `CHANGELOG.md` entry added if this is a user-facing change

---

## Checklist usage

For a standard review: work through Sections 1–4 for every PR.
For a security review: focus on Section 1, run `workflows/security-review.md`.
For a performance review: focus on Section 5.
For a refactor-only PR: focus on Sections 2, 3, 4, 6.
