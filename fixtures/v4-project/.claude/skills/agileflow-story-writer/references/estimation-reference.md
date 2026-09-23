# Owner, Estimate, and Priority Reference

**Load this reference when:** assigning `owner`, `estimate`, or `priority`
to a new story and you need the canonical scales.

## Owner

Pick the **primary** owner. If work spans multiple owners, note the
others under "Technical Notes".

| Owner         | Scope                                                          |
| ------------- | -------------------------------------------------------------- |
| **AG-UI**     | Frontend components, styling, user interactions, accessibility |
| **AG-API**    | Backend services, APIs, data models, business logic            |
| **AG-CI**     | CI/CD pipelines, testing infrastructure, quality gates         |
| **AG-DEVOPS** | Infrastructure, deployment, monitoring, automation             |

## Estimate (Fibonacci)

| Points | Meaning    | Example                                                             |
| ------ | ---------- | ------------------------------------------------------------------- |
| **1**  | Trivial    | Text update, typo, config tweak                                     |
| **2**  | Simple     | Add form field, new button, basic validation                        |
| **3**  | Small      | Basic CRUD endpoint, simple component                               |
| **5**  | Medium     | Auth flow, data model, multi-step form                              |
| **8**  | Large      | Payment integration, complex UI workflow                            |
| **13** | Very large | **Suggest splitting** into multiple stories or promoting to an epic |

## Priority

| Level             | When to use                                               |
| ----------------- | --------------------------------------------------------- |
| **P0 — Critical** | Blocking users, security, data loss, prod outage          |
| **P1 — High**     | Major features, important fixes, user-facing improvements |
| **P2 — Medium**   | Nice-to-have, minor improvements, enhancements            |
| **P3 — Low**      | Tech debt, cleanup, future enhancements, optimizations    |
