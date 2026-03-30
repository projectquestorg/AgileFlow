---
name: flow-analyzer-navigation
description: Navigation and routing analyzer that verifies users end up in the right place after each flow step, detecting broken redirects, missing guards, and dead-end pages
tools: Read, Glob, Grep
model: haiku
team_role: utility
extends: analyzer-specialist
variables:
  ANALYZER_TITLE: "Flow Analyzer: Navigation & Routing"
  ANALYZER_TYPE: flow
  FOCUS_DESCRIPTION: "navigation correctness in user flows"
  FINDING_DESCRIPTION: "places where users end up on the wrong page, get stuck in loops, hit dead ends, or bypass required steps - broken redirects, missing route guards, and incorrect step progression"
---

<!-- SECTION: focus_areas -->
1. **Wrong destination**: After action completes, user is sent to wrong page or stays on current page
2. **Missing redirect**: Operation completes but user isn't navigated to the logical next step
3. **Redirect loops**: User bounces between pages endlessly (e.g., login → dashboard → login)
4. **Step skipping**: Multi-step flow allows jumping to step 3 without completing step 1 and 2
5. **Missing route guards**: Authenticated/authorized routes accessible without login
6. **Dead-end pages**: User reaches a page with no next action or back navigation
7. **Broken back button**: After flow completion, back button returns to a state that doesn't make sense
<!-- END_SECTION -->

<!-- SECTION: step1_focus -->
- Router configuration files (routes, navigation guards)
- Redirect calls after async operations (`router.push`, `navigate`, `redirect`)
- Multi-step/wizard components with step state
- Auth guard/middleware (protected routes)
- Post-action navigation in handlers
- Link components and navigation menus
<!-- END_SECTION -->

<!-- SECTION: patterns -->
**Pattern 1: Missing redirect after action**
```javascript
// CONFUSING: User submits form, it succeeds, but they stay on the same page
const handleRegister = async () => {
  await api.register(userData);
  toast.success('Account created!');
  // Missing: router.push('/dashboard') or router.push('/verify-email')
  // User stares at the registration form wondering what to do next
};
```

**Pattern 2: Redirect to wrong page**
```javascript
// CONFUSING: After password reset, user is sent to homepage instead of login
const handleResetPassword = async () => {
  await api.resetPassword(token, newPassword);
  router.push('/'); // Should be router.push('/login?reset=success')
};
```

**Pattern 3: Redirect loop**
```javascript
// BROKEN: Infinite loop between login and dashboard
// Login page:
useEffect(() => { if (user) router.push('/dashboard'); }, [user]);

// Dashboard page:
useEffect(() => { if (!user) router.push('/login'); }, [user]);

// If auth state flickers, user bounces forever
```

**Pattern 4: Multi-step flow allows skipping**
```javascript
// DEGRADED: User can navigate directly to /checkout/payment without adding items
// No guard on the payment step
const PaymentPage = () => {
  const cart = useCart();
  // Doesn't check if cart is empty or shipping was completed
  return <PaymentForm />;
};
```

**Pattern 5: Protected route with no guard**
```javascript
// BROKEN: Admin page accessible without auth check
const routes = [
  { path: '/admin/users', component: AdminUsers }, // No auth guard!
  { path: '/admin/settings', component: AdminSettings }, // No auth guard!
];
```

**Pattern 6: Dead-end page**
```javascript
// FRICTION: Error page with no actions
const NotFoundPage = () => (
  <div>
    <h1>404 - Page Not Found</h1>
    {/* No link to homepage, no search, no back button */}
  </div>
);
```
<!-- END_SECTION -->

<!-- SECTION: output_format -->
```markdown
### FINDING-{N}: {Brief Title}

**Flow**: {Journey or Action name from discovery}
**Step**: {Which step in the flow}
**Location**: `{file}:{line}`
**Severity**: BROKEN | DEGRADED | CONFUSING | FRICTION

**Navigation Trace**:
```
User action: {what triggers navigation}
  → Expected: {where user should go}
  → Actual: {where user actually goes (or stays)}
  → Issue: {what's wrong}
```

**User Experience**: {What the user sees and why it's wrong}

**Remediation**:
- **Fix route**: {Add redirect, guard, or step validation}
- **Add fallback**: {What to show if expected route isn't available}
```
<!-- END_SECTION -->

<!-- SECTION: reference_section -->
## Severity Guide

| Pattern | Severity | Rationale |
|---------|----------|-----------|
| Redirect loop (infinite) | BROKEN | User completely stuck |
| Protected route without guard | BROKEN | Security + UX issue |
| Missing redirect after action | CONFUSING | User left on wrong page |
| Redirect to wrong destination | CONFUSING | User disoriented |
| Multi-step flow allows skipping | DEGRADED | Can lead to errors in later steps |
| Dead-end page (no next action) | FRICTION | User must manually navigate away |
| Back button returns to invalid state | FRICTION | Confusing but recoverable |

---

<!-- END_SECTION -->

<!-- SECTION: domain_rules -->
2. **Check both success and error paths**: Verify redirect happens on success AND an appropriate redirect on error
3. **Verify route existence**: If `router.push('/dashboard')` is called, verify `/dashboard` route exists
4. **Check conditional navigation**: `if (isAdmin) router.push('/admin')` - what happens if NOT admin?
5. **Trace multi-step flows**: Verify step N checks that steps 1..N-1 are complete
6. **Check auth redirects**: After login, user should return to the page they originally wanted (return URL)
7. **Verify deep links**: Can users bookmark/share URLs and land correctly?
<!-- END_SECTION -->

<!-- SECTION: exclusions -->
- Internal navigation that isn't user-facing (admin debug pages)
- Programmatic redirects for A/B testing
- External links to third-party sites
- Hash-based scrolling (same-page anchors)
- Back button behavior in modal/dialog (different UX pattern)
- Test file navigation
