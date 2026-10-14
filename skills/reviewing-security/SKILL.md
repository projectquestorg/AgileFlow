---
name: reviewing-security
description: Review a change or an area of code for exploitable security weaknesses at its trust boundaries (input handling and injection, authentication and authorization, permissions, secrets, signatures and crypto, and risky execution paths such as shell, file system, deserialization, and outbound requests) and report evidence-backed findings with location, exploit path, impact, severity, and remediation, or state plainly that nothing exploitable was found. Use when the user asks for a security review or audit, a threat or vulnerability check, or whether code can be exploited or abused. Not for a general review of a diff for defects (reviewing-changes) or for explaining security concepts.
---

# Reviewing security

Find what an attacker can actually do. A finding is a concrete path from input an attacker controls to harm, not a category from a checklist.

## Workflow

1. **Fix the scope.** A change (its diff: `git diff`, `git diff --staged`, `git diff <base>...HEAD`, or the PR) or an area (a module, endpoint, or feature). State the scope, and the base for a diff. Read enough of the project to know who uses it and how it is exposed: entry points, routing, middleware, configuration.
2. **Map the trust boundaries.** List where untrusted data enters (request parameters, headers, bodies, webhooks, uploaded files, messages, third-party responses, arguments from less-privileged users), which privilege levels exist (anonymous, user, admin, service), and what is worth protecting (other users' data, money, credentials, the host).
3. **Trace each input to its sinks** and check the controls on the way: who is authenticated, whether this actor may act on this particular object, how the input is validated or encoded before it reaches a query, a shell, a path, a template, a redirect, or a parser, and whether secrets or integrity checks can be bypassed. Spend attention where this code carries risk; when a sink or control type is unfamiliar in this stack, read `references/attack-surfaces.md` for what to check.
4. **Confirm every finding.** Read the surrounding code, callers, middleware, and framework defaults, because a control may live elsewhere. Where it is safe and local, demonstrate it: call the handler or function with the malicious input from an inline script or a temporary file outside the repository. Never probe production, shared, or third-party systems. What you cannot confirm is a question, not a finding.
5. **Rate and remediate.** Severity follows impact and exploitability: who can trigger it, with what privileges and preconditions, and what they gain (`references/attack-surfaces.md` ends with a severity guide). Give the specific fix at the right layer (for example "resolve the path and reject it unless it stays inside the exports directory", not "validate input").

## Constraints

- Every finding needs a `path:line`, the attacker and entry point, a concrete input or request sequence, the impact, a severity, and a fix.
- No generic checklists or boilerplate advice ("consider adding security headers") and no findings in code outside the scope unless it is reachable from the scope.
- If nothing exploitable was found, say so plainly and list what you checked. Do not invent or inflate findings to fill the report. Risks the repository cannot show (deployment configuration, dependency advisories) go under "Not verified", not under findings.
- Do not edit code unless asked, and leave the working tree unchanged. If you find a real secret, report its location with the value redacted.

## Report format

Findings ordered by severity (Critical, High, Medium, Low), each like:

```
High  src/files/download.js:14  Path traversal in file download
  Who/how: any signed-in user, GET /files?name=../../.env
  Impact:  reads any file the service can read, including secrets
  Fix:     resolve the path and reject it unless it stays under FILES_DIR
```

Then **Checked, not exploitable** (one line each: boundary or sink and why it holds), **Not verified** (what could not be checked and how to check it), and a one-line verdict.

## Done when

The scope's trust boundaries and relevant sinks were traced, every reported finding is confirmed and has a location, exploit path, impact, severity, and fix, and the user has either severity-ordered findings or an explicit statement that nothing exploitable was found, together with what was checked and what remains unverified.
