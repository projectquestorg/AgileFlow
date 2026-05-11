---
name: agileflow-docs
version: 1.0.0
category: agileflow/docs
description: |
  Use when the user wants to generate, update, or sync documentation:
  API docs, README files, learning content, skill recommendations, or
  architecture explanations. Also handles onboarding tours and glossary
  definitions.
triggers:
  keywords:
    - update docs
    - write documentation
    - readme
    - api docs
    - explain this
    - how does this work
    - glossary
    - onboarding
    - sync docs
    - document this
    - skill recommendation
  priority: 45
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/docs.yaml
  maxEntries: 30
depends:
  skills: []
  plugins: [docs]
---

# AgileFlow Docs

Documentation generator and learning assistant. Syncs READMEs,
generates API docs, explains codebase concepts, and recommends skills
for the current task.

## When this skill activates

- User asks to update or write documentation
- User wants to understand how something works
- User asks for a glossary definition or concept explanation
- User wants to sync README after code changes
- User asks which skill or command to use

## Capabilities

| Command                      | What it does                                    |
| ---------------------------- | ----------------------------------------------- |
| `/agileflow:docs`            | Sync docs after API or interface changes        |
| `/agileflow:readme-sync`     | Update README to reflect current codebase state |
| `/agileflow:learn`           | Explain AgileFlow concepts and patterns         |
| `/agileflow:learn:explain`   | Deep-dive explanation of a specific concept     |
| `/agileflow:learn:glossary`  | Define terms and acronyms                       |
| `/agileflow:learn:tour`      | Onboarding tour of AgileFlow features           |
| `/agileflow:learn:patterns`  | Common patterns and best practices              |
| `/agileflow:skill:list`      | List available skills                           |
| `/agileflow:skill:recommend` | Recommend the right skill for the current task  |

## Auto-trigger rules

Suggest `/agileflow:docs` after implementation when:

- API endpoints or interfaces were added or changed
- Public function signatures changed
- New configuration options were added
- README references stale commands or paths

## Documentation quality checks

- Does the README reflect the current install process?
- Are all public APIs documented with examples?
- Are new configuration options listed with their defaults?

## Integration

- **agileflow-engineering** — trigger docs after any implementation that changes public APIs, exports, or user-facing configuration; docs-sync is the last step of a well-run feature story
- **agileflow-story-writer** — when writing a story, include "update docs" as an explicit acceptance criterion for API-changing work
- **agileflow-seo** — after writing or updating public content, pass through seo for title, meta, heading, and structured data optimisation
- **agileflow-delivery** — docs update is a delivery gate for API changes; delivery should block if docs are stale
- **agileflow-pr-reviewer** — pr-reviewer checks that docs were updated alongside code; docs generates what the reviewer verifies
- **agileflow-audit** — the completeness dimension of the audit flags missing docs; docs fills those gaps
- **agileflow-research** — if writing technical docs for an unfamiliar pattern or library, use research first to gather authoritative source material
- **agileflow-migration** — migration plans should be documented as runbooks; docs generates the runbook format after the migration plan is finalised

## References

Load these files when you need deeper context for the relevant task:

| File                             | When to load                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `references/doc-types-guide.md`  | Deciding what kind of doc to write — tutorial vs how-to vs reference vs explanation       |
| `references/api-doc-template.md` | Documenting an API endpoint or function — parameter tables, example requests, error cases |
| `references/readme-template.md`  | Writing or auditing a README — required sections, what to include, what to skip           |

## Workflows

Follow these step-by-step when the user initiates the matching action:

| File                       | When to follow                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `workflows/sync.md`        | User wants to sync docs after implementation — checks what changed, updates relevant docs |
| `workflows/readme-sync.md` | User wants to update the README — audits current state, fills gaps                        |
