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
