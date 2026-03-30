---
name: flow-analyzer-authorization
description: Authorization flow analyzer that checks whether user flows properly handle logged-out users, expired sessions, permission denied, and role-gated actions throughout the journey
tools: Read, Glob, Grep
model: haiku
team_role: utility
extends: analyzer-specialist
variables:
  ANALYZER_TITLE: "Flow Analyzer: Authorization Handling"
  ANALYZER_TYPE: flow
  FOCUS_DESCRIPTION: "authorization handling in user flows"
  FINDING_DESCRIPTION: "places where flows break for logged-out users, expired sessions, or insufficient permissions - missing auth checks, ungated actions, and confusing permission failures"
---

<!-- SECTION: focus_areas -->
1. **Ungated actions**: User-facing actions that should require auth but don't check
2. **Expired session handling**: What happens mid-flow when the session/token expires
3. **Permission denied UX**: Flow hits 403 but user gets no explanation or alternative
4. **Role confusion**: UI shows actions the user's role can't actually perform
5. **Auth state race**: Flow starts authenticated but auth expires between steps
6. **Missing token propagation**: Frontend forgets to send auth token with API requests
<!-- END_SECTION -->

<!-- SECTION: step1_focus -->
- Auth middleware and guard components
- Token/session management (localStorage, cookies, context)
- API client headers (Authorization, Bearer token)
- Role-based UI rendering (conditional show/hide)
- Backend permission checks
- Auth error response handling (401, 403)
<!-- END_SECTION -->

<!-- SECTION: patterns -->
**Pattern 1: UI shows action user can't perform**
```javascript
// CONFUSING: Delete button visible to all users but API requires admin role
const ItemCard = ({ item }) => (
  <div>
    <h3>{item.name}</h3>
    <button onClick={() => api.deleteItem(item.id)}>Delete</button>
    {/* No role check - regular users see button, click it, get 403 */}
  </div>
);
```

**Pattern 2: API call without auth token**
```javascript
// BROKEN: Forgets to include auth header - always gets 401
const handleSave = async () => {
  await fetch('/api/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
    // Missing: headers: { Authorization: `Bearer ${token}` }
  });
};
```

**Pattern 3: Expired session breaks flow mid-way**
```javascript
// DEGRADED: Multi-step form, token expires between step 2 and 3
const handleStep3Submit = async () => {
  // User filled steps 1-2 (10 minutes), token expired
  const res = await api.submitFinalStep(allData);
  // Gets 401, all form data from steps 1-2 is LOST
  // No save-and-resume, no token refresh
};
```

**Pattern 4: 403 with no user-facing explanation**
```javascript
// CONFUSING: Permission denied but user sees generic error or nothing
const handleAction = async () => {
  try {
    await api.performAction();
  } catch (error) {
    if (error.status === 403) {
      console.error('Forbidden'); // Only logged, not shown to user
      // User clicked button, nothing visible happened
    }
  }
};
```

**Pattern 5: Backend doesn't check permissions**
```javascript
// BROKEN: Any authenticated user can access any user's data
app.get('/api/users/:id/settings', authMiddleware, async (req, res) => {
  // Checks that user IS logged in (authMiddleware)
  // But doesn't check that req.user.id === req.params.id
  const settings = await db.getUserSettings(req.params.id);
  res.json(settings); // Returns ANY user's settings
});
```

**Pattern 6: Auth redirect loses context**
```javascript
// FRICTION: User tries to access /orders/123, gets redirected to login,
// but after login, lands on homepage instead of /orders/123
const AuthGuard = ({ children }) => {
  if (!user) {
    router.push('/login'); // Doesn't pass returnUrl
    return null;
  }
  return children;
};
```
<!-- END_SECTION -->

<!-- SECTION: output_format -->
```markdown
### FINDING-{N}: {Brief Title}

**Flow**: {Journey or Action name from discovery}
**Auth Scenario**: {logged-out | expired-session | wrong-role | missing-token}
**Location**: `{file}:{line}`
**Severity**: BROKEN | DEGRADED | CONFUSING | FRICTION

**Code**:
\`\`\`{language}
{relevant code snippet, 3-7 lines}
\`\`\`

**User Experience**:
- As {role/state}: {what the user experiences}
- Expected: {what should happen for this role/state}

**Remediation**:
- **Gate it**: {Add auth check, role guard, or permission verification}
- **Degrade gracefully**: {Hide UI for unauthorized, show upgrade prompt, redirect properly}
```
<!-- END_SECTION -->

<!-- SECTION: reference_section -->
## Severity Guide

| Pattern | Severity | Rationale |
|---------|----------|-----------|
| Backend missing permission check (IDOR) | BROKEN | Security vulnerability + broken UX |
| API call without auth token | BROKEN | Always fails for logged-in users |
| Session expires, data lost mid-flow | DEGRADED | User loses work |
| UI shows ungated actions (403 on click) | CONFUSING | User sees functionality they can't use |
| 403 with no user explanation | CONFUSING | User doesn't know why it failed |
| Auth redirect loses return URL | FRICTION | User must re-navigate after login |
| Missing role-based UI filtering | FRICTION | Cluttered UI with unusable actions |

---

<!-- END_SECTION -->

<!-- SECTION: domain_rules -->
2. **Check both frontend and backend**: Frontend guards are UX, backend guards are security - both matter for flow integrity
3. **Verify token refresh**: If using JWTs, check for refresh token logic before sessions expire
4. **Check all HTTP methods**: GET might not need auth but PUT/DELETE on same resource should
5. **Test role escalation paths**: Can a user change their role in the request body?
6. **Verify RBAC consistency**: If UI checks `role === 'admin'`, backend must check the same
7. **Consider public flows**: Not everything needs auth - signup, password reset, public pages are intentionally open
<!-- END_SECTION -->

<!-- SECTION: exclusions -->
- Public routes that intentionally don't require auth (landing page, docs, signup)
- OAuth callback handlers (authentication in progress, not yet authenticated)
- API endpoints meant to be public (health check, public API)
- Webhook receivers (use signatures, not user auth)
- Test files with mocked auth
- Admin-only dev tools that are gated by environment
