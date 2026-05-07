# Decision Log Template

**Load this when:** Recording a council decision, drafting an ADR, or documenting a significant architectural or product choice.

## Decision Record Format

```markdown
# DR-[NNN]: [Short descriptive title]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded by DR-NNN
**Deciders:** [Names or roles who have authority to accept this]
**Council perspectives consulted:** [e.g., Technical, Revenue, Advocate, Contrarian]

---

## Context

[2–4 sentences. What situation prompted this decision? What constraints exist?
Include relevant metrics, deadlines, or dependencies.]

## Decision

[1–3 sentences. The actual choice made. Start with "We will..." or "We decided to..."]

## Options Considered

| Option            | Pros | Cons | Ruled out because |
| ----------------- | ---- | ---- | ----------------- |
| Option A (chosen) | ...  | ...  | —                 |
| Option B          | ...  | ...  | ...               |
| Option C          | ...  | ...  | ...               |

## Consequences

**Positive:**

- [Benefit 1]
- [Benefit 2]

**Negative / trade-offs:**

- [Trade-off 1]
- [Accepted risk: ...]

**Neutral / follow-on actions:**

- [ ] [Action item with owner]
- [ ] [Action item with owner]

## Dissenting Views

[Any perspectives not reflected in the final decision. Optional but valuable for future context.]

## Review Trigger

[When should this decision be revisited? e.g., "If user adoption of X falls below Y%", "At 6-month mark", "When we exceed N customers"]
```

---

## Decision Severity Classification

| Level            | Criteria                                              | Example                         | Review cycle            |
| ---------------- | ----------------------------------------------------- | ------------------------------- | ----------------------- |
| L1 — Critical    | Affects architecture, data model, or security posture | "Switch from REST to GraphQL"   | Quarterly or on trigger |
| L2 — Significant | Affects multiple teams or user-facing behavior        | "Add feature flag system"       | 6-month or on trigger   |
| L3 — Routine     | Contained within one area, reversible                 | "Choose between library A vs B" | Annual or on migration  |

---

## Status Transitions

```
Proposed → Accepted     (after council + stakeholder sign-off)
Accepted → Deprecated   (superseded but context still valuable)
Accepted → Superseded   (replaced by newer DR — link to it)
Proposed → Rejected     (not pursued — record why for future reference)
```

---

## Filing Convention

```
docs/04-architecture/decisions/
├── DR-001-use-postgresql.md
├── DR-002-api-versioning-strategy.md
└── DR-003-frontend-framework.md
```

**Numbering:** Sequential, never reuse. Rejected decisions still get a number.

---

## Quick-Capture Format (for time-constrained decisions)

When speed matters, minimum viable record:

```markdown
# DR-[NNN]: [Title]

Date: YYYY-MM-DD | Status: Accepted | Deciders: [names]

**Decision:** [One sentence]
**Because:** [One sentence rationale]
**Trade-off accepted:** [One sentence]
**Review if:** [Trigger condition]
```
