# User Story Patterns

**Load this when:** Writing user stories, defining acceptance criteria, or structuring feature requirements.

## Standard Story Formats

### Classic format

```
As a [persona/role],
I want to [action/goal],
So that [benefit/outcome].
```

### JTBD (Jobs-to-Be-Done) format

Better for product strategy and feature discovery:

```
When [situation/trigger],
I want to [motivation/goal],
So I can [expected outcome].
```

Example:

> When I'm reviewing a PR late at night,
> I want to see a summary of what changed and why,
> So I can give a meaningful review without reading every line.

### Outcome-first format

Better for roadmap items and stakeholder communication:

```
[Persona] needs to [accomplish outcome]
because [root cause / current friction].
```

---

## Persona Templates

### Lightweight persona card

```
Name: [Role name — "Alex the Developer", not a real person name]
Context: [Where they are in the workflow]
Goal: [What they're trying to accomplish right now]
Frustration: [What currently gets in the way]
Success looks like: [What they'd say if it worked perfectly]
```

### Persona tiers for B2B products

| Tier     | Role                             | Decision power   | Story focus                |
| -------- | -------------------------------- | ---------------- | -------------------------- |
| Champion | Power user / day-to-day operator | Feature adoption | Workflow efficiency, depth |
| Buyer    | Manager / Director               | Budget approval  | ROI, reporting, compliance |
| End user | Occasional user                  | Usage            | Simplicity, onboarding     |
| Admin    | IT / DevOps                      | Setup + security | Config, SSO, audit logs    |

---

## Acceptance Criteria Patterns

### Given/When/Then (BDD format)

Best for testable, specific behavior:

```
Given [precondition / context]
When [action / event]
Then [expected outcome]
  And [additional outcome]
```

### Checklist format

Best for UI/UX stories with multiple states:

```
Acceptance criteria:
- [ ] [Condition 1 — observable, verifiable]
- [ ] [Condition 2]
- [ ] [Error state handled: ...]
- [ ] [Empty state handled: ...]
- [ ] [Loading state handled: ...]
```

### Constraint format

Best for non-functional requirements:

```
The system must [behavior] [qualifier].
Example: "The search results must appear within 300ms for queries under 10k records."
```

---

## Story Sizing Signals

| Story complexity signal         | Suggested action               |
| ------------------------------- | ------------------------------ |
| More than 3 acceptance criteria | Consider splitting             |
| Involves >2 system boundaries   | Split by boundary              |
| Requires new data model design  | Spike story first              |
| "And also..." in story title    | Split on the "and also"        |
| Multiple distinct user types    | One story per persona          |
| Unclear success metric          | Write definition of done first |

---

## Story Splitting Patterns

| Pattern           | How to split                    | Example                                          |
| ----------------- | ------------------------------- | ------------------------------------------------ | ------------------------------------------- |
| By workflow step  | One story per step              | "View cart" / "Edit cart" / "Checkout"           |
| By data variation | One story per type              | "Import CSV" / "Import JSON"                     |
| >                 | By happy/unhappy path           | One for success, one for error                   | "Send notification" / "Handle send failure" |
| By user type      | One story per persona           | "Admin dashboard" / "Read-only viewer dashboard" |
| By complexity     | Simple first, edge cases later  | "Basic search" → "Search with filters"           |
| CRUD split        | Create / Read / Update / Delete | Four separate stories                            |

---

## Definition of Done (standard checklist)

Adapt per team but include:

- [ ] Acceptance criteria all met
- [ ] Unit tests written and passing
- [ ] Code reviewed and approved
- [ ] No new linting errors
- [ ] Deployed to staging, smoke-tested
- [ ] Documentation updated (if applicable)
- [ ] Feature flag configured (if applicable)
- [ ] Accessibility requirements met (if UI)

---

## Anti-Patterns to Avoid

| Anti-pattern                            | Problem                            | Fix                     |
| --------------------------------------- | ---------------------------------- | ----------------------- |
| "As a user, I want to click the button" | Describes implementation, not need | Reframe around outcome  |
| "As a developer, I want to refactor X"  | Tech tasks aren't stories          | Use a task/chore ticket |
| No acceptance criteria                  | Untestable; done when?             | Add at least 2 criteria |
| Acceptance criteria as a design spec    | Too prescriptive                   | Test outcomes, not UI   |
| Epic-sized story                        | Takes >1 sprint                    | Split it                |
| Vague benefit ("so that it's better")   | No value validation possible       | Make benefit measurable |
