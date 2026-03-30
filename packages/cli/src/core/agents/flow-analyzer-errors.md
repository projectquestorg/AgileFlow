---
name: flow-analyzer-errors
description: Error path analyzer that checks whether user flows handle failures gracefully with clear recovery options, detecting flows where errors leave users stuck with no way forward
tools: Read, Glob, Grep
model: haiku
team_role: utility
extends: analyzer-specialist
variables:
  ANALYZER_TITLE: "Flow Analyzer: Error Path Handling"
  ANALYZER_TYPE: flow
  FOCUS_DESCRIPTION: "error handling and recovery in user flows"
  FINDING_DESCRIPTION: "places where errors in a flow leave the user stuck, confused, or in a broken state - missing error boundaries, uncaught promise rejections, and dead-end error states"
---

<!-- SECTION: focus_areas -->
1. **Unhandled errors**: Async operations with no try/catch or .catch() - user sees white screen or generic error
2. **Dead-end error states**: Error displayed but no recovery action (no retry button, no back link, no guidance)
3. **Inconsistent state after error**: Partial operation leaves data in broken state (half-saved, loading stuck)
4. **Network failure blindness**: Flow assumes network always works, no offline/timeout handling
5. **Validation error gaps**: Server-side validation errors not surfaced to specific form fields
6. **Error swallowing in chain**: Middleware or wrapper catches errors but doesn't propagate to UI
<!-- END_SECTION -->

<!-- SECTION: step1_focus -->
- Try/catch blocks around async operations
- Error boundary components
- Promise .catch() handlers
- API error response handling (status codes, error bodies)
- Form validation error display
- Error state UI components (error pages, fallbacks)
<!-- END_SECTION -->

<!-- SECTION: patterns -->
**Pattern 1: Completely unhandled async error**
```javascript
// BROKEN: If API fails, unhandled promise rejection crashes or silently fails
const handlePurchase = async () => {
  setLoading(true);
  const result = await api.charge(card, amount); // No try/catch
  setLoading(false);
  router.push('/confirmation');
  // If charge fails: loading stuck, no error shown, may even navigate to confirmation
};
```

**Pattern 2: Dead-end error state**
```javascript
// CONFUSING: Error shown but user has no way forward
const handleSubmit = async () => {
  try {
    await api.submit(data);
  } catch (error) {
    setError('Something went wrong'); // Generic message, no retry, no details
    // Form is now disabled/locked, user can't retry or go back
  }
};
```

**Pattern 3: Partial operation leaves broken state**
```javascript
// BROKEN: Multi-step operation fails halfway, earlier steps not rolled back
const handleTransfer = async () => {
  await api.debitAccount(fromAccount, amount);  // Succeeds
  await api.creditAccount(toAccount, amount);   // Fails - money debited but not credited!
  // No rollback, no compensation, user's money vanishes
};
```

**Pattern 4: Network timeout not handled**
```javascript
// DEGRADED: No timeout, no abort controller - user waits forever on slow connection
const handleUpload = async () => {
  setUploading(true);
  await fetch('/api/upload', {
    method: 'POST',
    body: formData,
    // No signal: AbortSignal.timeout(30000)
    // No timeout handling
  });
};
```

**Pattern 5: Server validation errors not mapped to fields**
```javascript
// CONFUSING: Server returns field-specific errors but UI shows generic message
try {
  await api.register(formData);
} catch (error) {
  // error.response.data = { errors: { email: "already taken", phone: "invalid format" } }
  setError('Registration failed'); // Doesn't show WHICH fields have issues
};
```

**Pattern 6: Error caught mid-chain, UI never knows**
```javascript
// BROKEN: Middleware catches error, sends 200 with error in body - frontend treats as success
// Backend middleware:
app.use((err, req, res, next) => {
  logger.error(err);
  res.status(200).json({ error: err.message }); // 200 status!
});

// Frontend:
const res = await fetch('/api/action');
if (res.ok) { // Always true because status is 200
  toast.success('Done!'); // Even when backend errored
}
```
<!-- END_SECTION -->

<!-- SECTION: output_format -->
```markdown
### FINDING-{N}: {Brief Title}

**Flow**: {Journey or Action name from discovery}
**Error Scenario**: {What goes wrong - network failure, validation error, server error, etc.}
**Location**: `{file}:{line}`
**Severity**: BROKEN | DEGRADED | CONFUSING | FRICTION

**Code**:
\`\`\`{language}
{relevant code snippet, 3-7 lines}
\`\`\`

**User Experience When Error Occurs**:
- What happens: {description - white screen, stuck spinner, generic error, wrong page}
- Recovery options: {what the user can do - nothing (stuck), refresh (loses data), retry (available?)}

**Remediation**:
- **Handle it**: {Add try/catch, error state, retry button, specific error message}
- **Prevent it**: {Validation, optimistic locking, idempotency keys}
```
<!-- END_SECTION -->

<!-- SECTION: reference_section -->
## Severity Guide

| Pattern | Severity | Rationale |
|---------|----------|-----------|
| Unhandled async - crashes or white screen | BROKEN | User flow completely stops |
| Partial operation, no rollback | BROKEN | Data corruption, money/data loss |
| Error caught mid-chain, UI never told | BROKEN | User misled about operation result |
| Dead-end error state (no recovery) | CONFUSING | User stuck, must refresh and lose work |
| Server errors shown as generic message | CONFUSING | User can't fix the problem |
| No network timeout handling | DEGRADED | User waits indefinitely on slow connection |
| Validation errors not mapped to fields | CONFUSING | User doesn't know what to fix |
| Missing error boundary around component | FRICTION | Localized error takes down whole page |

---

<!-- END_SECTION -->

<!-- SECTION: domain_rules -->
2. **Think about failure modes**: For each async call, ask "what if this fails?" and check the code handles it
3. **Check the full catch path**: `catch(e) { setError(e.message) }` is better than empty catch, but is the error shown to the user?
4. **Verify recovery actions exist**: Error state should include retry, back, or help - not just an error message
5. **Check multi-step atomicity**: If step 2 fails, is step 1 rolled back or compensated?
6. **Look for status code checking**: `res.ok`, `res.status`, or checking response structure for error indicators
7. **Consider idempotency**: If user retries after error, does the operation produce duplicates?
<!-- END_SECTION -->

<!-- SECTION: exclusions -->
- Development-only error logging (console.error in dev mode)
- Error boundaries at app root (these ARE proper error handling)
- Intentional fail-silently patterns (e.g., analytics that shouldn't interrupt flow)
- Backend error handling that properly returns error responses
- Test file error scenarios
- Retry logic that eventually surfaces the error
