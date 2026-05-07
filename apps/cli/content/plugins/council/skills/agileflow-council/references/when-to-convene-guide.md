# When to Convene the Council

**Load this when:** Deciding whether a question warrants full council deliberation or can be resolved immediately.

## Decision Tree

```
Is the decision reversible within 1 sprint?
  YES → Decide now. Document briefly. No council needed.
  NO  ↓

Does it affect more than one team or system boundary?
  NO  → Team decides. Record in DR log. No council needed.
  YES ↓

Is it time-sensitive (must decide in <2 hours)?
  YES → Emergency council: 2–3 perspectives max, async if needed.
  NO  ↓

Convene full council.
```

---

## Trigger Checklist — Convene When Any Apply

### Architecture / Technical

- [ ] Introducing a new service, database, or data store
- [ ] Changing the API contract (breaking or additive)
- [ ] Adding a new infrastructure dependency (cloud service, SaaS)
- [ ] Proposing a migration >500 lines of affected code
- [ ] Security-impacting change (auth, authz, secrets, PII handling)
- [ ] Performance trade-off that degrades another system

### Product / Business

- [ ] Feature that changes the core user journey
- [ ] Pricing, packaging, or trial model change
- [ ] Deprecating a user-facing feature
- [ ] Launch decision (go/no-go) with revenue implications
- [ ] Policy change affecting compliance (GDPR, HIPAA, etc.)

### Process / Team

- [ ] Changing team structure or ownership boundaries
- [ ] Adopting a new tool that affects all engineers
- [ ] Incident post-mortem with systemic findings
- [ ] Budget allocation above agreed threshold

---

## Skip the Council When

| Situation                             | What to do instead                           |
| ------------------------------------- | -------------------------------------------- |
| Clear best practice exists            | Implement it, note the reference             |
| Reversible in <1 sprint               | Decide, ship, observe                        |
| Already decided by a prior DR         | Follow the prior DR                          |
| Purely aesthetic / style choice       | Follow style guide                           |
| One person has clear domain ownership | Let them decide                              |
| Urgency overrides deliberation        | Timebox to 30 min, decide, post-mortem later |

---

## Council Format by Urgency

### Async (default — use for most decisions)

- Post the question + context doc in the team channel
- Tag each perspective holder
- 24-hour comment window
- Decision maker synthesizes and posts DR

### Synchronous (use when debate is needed)

- Max 4 perspectives in the room
- 25-minute timebox: 10 context, 10 debate, 5 decide
- One person plays Devil's Advocate if no natural Contrarian

### Emergency (production incident or hard deadline)

- 2–3 people max
- Async notes captured in real-time (shared doc)
- Full DR written within 24 hours post-decision

---

## Perspective Roles — When to Include Each

| Role       | Include when                                       |
| ---------- | -------------------------------------------------- |
| Technical  | Any architecture, infra, or code-level decision    |
| Revenue    | Feature prioritization, pricing, conversion impact |
| Advocate   | UX/DX changes, customer-facing behavior            |
| Contrarian | High-confidence proposals (prevent groupthink)     |
| Optimist   | Morale-impacting changes, long-horizon bets        |
| Moonshot   | Exploring whether we're thinking too small         |

**Minimum viable council:** Technical + Advocate + Contrarian (3 perspectives).

---

## Anti-Patterns to Avoid

| Anti-pattern                                    | Why it's harmful                                   |
| ----------------------------------------------- | -------------------------------------------------- |
| Convening council for every decision            | Slows teams; dilutes significance of real councils |
| Skipping council for major architecture changes | Creates unreviewed technical debt                  |
| Stacking council with only aligned perspectives | Produces echo-chamber decisions                    |
| Council without a decision maker                | Produces discussion, not decisions                 |
| Reopening accepted DRs without new information  | Wastes time; undermines trust in the process       |
