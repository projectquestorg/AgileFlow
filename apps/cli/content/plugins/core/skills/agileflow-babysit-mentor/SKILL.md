---
name: agileflow-babysit-mentor
version: 1.0.0
category: agileflow/core
description: |
  Use when the user wants end-to-end guidance through a story or
  feature — from picking the right task to commit. Acts as a mentor
  that plans, delegates to domain experts, tracks progress, runs
  audits, and keeps the user in control with explicit next-step
  choices.
triggers:
  keywords:
    - help me ship this
    - walk me through
    - what should i work on
    - take me through this story
    - mentor mode
    - babysit
    - end-to-end
    - guide me through
  priority: 60
  exclude:
    - babysit my kid
    - babysitting service
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/babysit-mentor.yaml
  maxEntries: 50
depends:
  skills: []
  plugins: [core]
---

# AgileFlow Babysit Mentor

The mentor pattern: pick the most impactful ready story, plan the
implementation, delegate work to domain experts, track progress,
verify (tests + audits), and commit — always letting the user steer at
every decision point. This skill is the v4 successor to v3's
`/agileflow:babysit` command.

## When this skill activates

- User asks "what should I work on", "walk me through", "help me ship"
- User explicitly invokes mentor / babysit mode
- User describes wanting end-to-end coaching on a feature
- Should NOT activate on unrelated childcare mentions — `exclude`
  damps `babysit my kid` etc.

## Core operating rules (always apply)

1. **Always end every response with a concrete next step or choice** —
   specific, contextual options with one marked `(Recommended)`. Never
   `Continue?` / `What next?`.
2. **Use the IDE's planning workflow for non-trivial implementation**
   when one exists. Otherwise write a short plan in the response,
   explore the relevant files, and keep the plan visible.
3. **Delegate complex work to domain experts or subagents** when the
   current IDE supports that shape of delegation.
4. **Track progress visibly for any task with 3+ steps.** Keep a task
   list or checklist and mark each step complete as soon as it lands.
5. **Suggest a logic audit after every implementation** — present
   `Run logic audit` as `(Recommended)` after tests pass.
6. **Suggest a flow audit when implementation touches user flows** —
   plans for non-trivial features must include a "Verify flow
   integrity" step.

## Workflow phases

### Phase 1 — Context & task selection

1. Read `docs/09-agents/status.json` and the active session state.
2. Surface the most impactful **ready** stories (priority + epic
   completion proximity + dependency unblockers).
3. Present them as a short decision prompt with the recommended pick.

### Phase 2 — Plan

For non-trivial tasks: enter plan mode, explore, design, exit.
Plans for user-flow features MUST include:

```
Step N: Verify flow integrity
  - Run /agileflow:code:flows on modified paths
  - Confirm user journeys work end-to-end
  - Fix BROKEN / DEGRADED findings before commit
```

### Phase 3 — Execute

- Implement directly OR spawn domain experts for parallelizable work.
- Update the visible checklist as each step completes.

### Phase 4 — Verify & commit

After tests pass, present (in this order):

- `Run logic audit (Recommended)` — run the logic audit on the modified
  files
- `Run flow audit` — run the flow audit if user flows changed
- `Commit: 'feat: ...'`

After audits land, the commit option becomes `(Recommended)`.

## Self-improving learnings

`.agileflow/skills/_learnings/babysit-mentor.yaml` captures:

- Story-priority preferences (e.g., "user prefers near-complete epics
  over isolated high-priority tasks")
- Audit cadence (e.g., "always run flow audit before commit")
- Plan-mode threshold (which task scopes get plan mode vs direct)
- Delegation defaults (which expert for which file pattern)

## Quality checklist (per session)

- [ ] Picked from `ready` stories, not arbitrary
- [ ] Used plan mode if scope warranted
- [ ] Tracked tasks visibly for ≥3 steps
- [ ] Tests run after implementation
- [ ] Logic audit suggested
- [ ] Flow audit suggested for user-facing changes
- [ ] Every response ended with a concrete next step or choice

## Integration

Use the skill that best matches the phase of work. When in doubt, the trigger keywords in each skill's `SKILL.md` are the canonical guide.

### Task & story management

- **agileflow-story-writer** — when a task isn't yet a proper story, propose creating one before starting work; handles AC, estimation, and story formatting
- **agileflow-status-updater** — flip story status as work progresses (ready → in-progress → done → blocked); call whenever state changes
- **agileflow-epic-planner** — when scope creeps past one story or a theme emerges, propose splitting into an epic with sequenced stories
- **agileflow-adr** — surface when implementation involves a meaningful technology or architecture trade-off that deserves a recorded decision
- **agileflow-planning** — use for impact analysis, velocity tracking, RPI scoring, metrics dashboards, or sprint planning; ideal when the user asks about prioritisation

### Strategy & ideation

- **agileflow-council** — convene for architectural or strategic decisions with significant trade-offs; brings multiple perspectives (optimist, advocate, contrarian, technical) instead of a single opinion
- **agileflow-ideation** — use when the user wants to explore what to build next, validate a product direction, discover feature opportunities, or generate a product brief before writing stories
- **agileflow-retention** — suggest when stories involve engagement, habit-forming features, onboarding flows, or growth mechanics; applies behavioural psychology patterns

### Research

- **agileflow-research** — activate before coding begins when the story requires external knowledge: unfamiliar libraries, API integrations, architectural patterns, or comparative analysis; pairs with `research:ask` for stuck moments

### Implementation

- **agileflow-engineering** — delegate hands-on coding: API endpoints, DB schema, UI components, mobile, security hardening, and general feature implementation
- **agileflow-database** — delegate schema design, index selection, migration planning, or query-optimisation work; covers relational and NoSQL
- **agileflow-migration** — use when the story involves upgrading a framework, library, or data schema; plans zero-downtime migrations and generates rollback scripts
- **agileflow-refactor** — suggest when existing code needs cleanup before or after a feature lands; applies safe refactoring patterns without changing observable behaviour
- **agileflow-debug** — hand off immediately when the user reports a bug or unexpected behaviour; applies structured debugging methodology
- **agileflow-performance** — suggest when a feature is slow, memory-heavy, bundle-size-constrained, or Core Web Vitals need improvement
- **agileflow-accessibility** — suggest for any user-facing change; invoke before commit when the story touches UI; covers WCAG, ARIA, keyboard navigation, and screen reader compatibility

### Testing

- **agileflow-test-writer** — spawn after implementation to generate test suites from acceptance criteria; covers unit, integration, and E2E patterns

### Verification & audits

- **agileflow-audit** — broad multi-dimensional sweep (logic, security, accessibility, legal, test coverage, architecture, performance, completeness, API quality, SEO); offer after implementation when no specific audit is targeted
- **agileflow-pr-reviewer** — invoke before opening a PR to catch logic correctness, security vulnerabilities, and style issues; required for stories touching 5+ source files
- **agileflow-delivery** — use when the user is ready to ship: CI checks, changelog generation, dependency audit, release notes, and sprint finalisation

### Documentation & discoverability

- **agileflow-docs** — generate or sync API docs, README files, learning content, or skill recommendations after implementation; required when public APIs or exports change
- **agileflow-seo** — suggest for any story touching public-facing pages or content discoverability; covers technical SEO, Core Web Vitals, structured data, and content quality

### Advertising & growth

- **agileflow-ads** — use when stories involve advertising campaigns (Google, Meta, LinkedIn, TikTok); covers tracking, creative, budget allocation, and audit

## Notes

- Mentor mode is opt-in. Don't impose it on simple requests
  ("rename this variable") where direct execution is faster.
- The user is always in control. A specific recommended choice is the
  principle, not the exception.
- When in doubt, ASK rather than guess. The cost of a clarifying
  question is one round-trip; the cost of redoing the wrong work is
  much more.

## Customization

Set `plugins.core.settings.babysit.mode` in `agileflow.config.json` to
control how much interaction the mentor uses:

- `full` - use the richest interaction pattern the IDE supports
- `light` - keep the guidance concise and avoid repeated interruptions
- `minimal` - stick to direct execution and short plain-text checklists

## References

Load these files when you need deeper context for the relevant task:

| File                                  | When to load                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `references/mentor-decision-guide.md` | Calibrating interaction depth, choosing which expert to delegate to, deciding when to suggest audits |

## Workflows

Follow these step-by-step when the user initiates the matching action:

| File                          | When to follow                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `workflows/mentor-session.md` | User wants end-to-end guidance — story selection through commit, full mentor loop |
