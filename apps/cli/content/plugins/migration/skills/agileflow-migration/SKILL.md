---
name: agileflow-migration
version: 1.0.0
category: agileflow/migration
description: |
  Use when the user is migrating between frameworks, languages, library
  versions, or data schemas. Plans zero-downtime migrations, generates
  codemods, validates output, and produces rollback strategies.
triggers:
  keywords:
    - migrate
    - migration
    - upgrade
    - upgrade version
    - move from
    - switch to
    - refactor to
    - data migration
    - zero downtime
    - codemod
    - breaking changes
    - upgrade path
  priority: 55
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/migration.yaml
  maxEntries: 20
depends:
  skills: []
  plugins: [migration]
---

# AgileFlow Migration

Migration planning and execution assistant. Handles framework upgrades,
library version bumps, data schema migrations, and language transitions
— with validation, rollback strategies, and automated codemods where
possible.

## When this skill activates

- User wants to upgrade a framework or library version
- User is moving between technologies (e.g. CJS → ESM, REST → GraphQL)
- User needs to migrate data between schemas or databases
- User asks about breaking changes or upgrade paths
- User mentions "zero downtime" or "rollback strategy"

## Migration workflow

| Step        | Command                       | What it does                             |
| ----------- | ----------------------------- | ---------------------------------------- |
| 1. Scan     | `/agileflow:migrate:scan`     | Identify all affected files and patterns |
| 2. Plan     | `/agileflow:migrate:plan`     | Generate step-by-step migration plan     |
| 3. Codemods | `/agileflow:migrate:codemods` | Auto-transform code where possible       |
| 4. Validate | `/agileflow:migrate:validate` | Verify migration output is correct       |
| Full        | `/agileflow:migrate`          | Run all steps                            |

## Data migrations

For database schema migrations, use `agileflow-datamigration` which covers:

- Zero-downtime strategies (expand/contract pattern)
- Backfill with concurrent write safety
- Validation queries before and after
- Rollback SQL generation

## Safety rules

- Always scan before planning — scope surprises are common
- For data migrations: test on a copy first, validate row counts
- For framework upgrades: check for behavioral changes, not just syntax
- Always generate a rollback plan before executing

## References

Load these files when you need deeper context for the relevant task:

| File                                         | When to load                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `references/migration-patterns.md`           | Choosing a migration strategy — big bang vs strangler fig vs parallel run vs blue/green           |
| `references/data-validation-checklist.md`    | Validating a migration — pre/post row counts, financial aggregates, cutover criteria              |
| `references/rollback-playbook.md`            | Planning or executing a rollback — decision tree, communication templates, post-mortem structure  |
| `references/version-compatibility-matrix.md` | Upgrading a library or framework — semver rules, breaking change detection, deprecation timelines |

## Workflows

Follow these step-by-step when the user initiates the matching action:

| File                    | When to follow                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `workflows/plan.md`     | User wants a migration plan — scans affected files, generates step-by-step strategy       |
| `workflows/validate.md` | User wants to validate a migration — runs pre/post checks, compares counts and aggregates |
