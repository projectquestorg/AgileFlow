---
name: planning-migrations
description: Plan a database schema, data, or API migration before it runs - compatibility between old and new code, clients, and data, validation of existing data, deployment order (expand, migrate, contract), backfills, and per-step recovery - stating explicitly which steps lose data or cannot be reversed. Use when the user asks to plan, sequence, roll out, roll back, or de-risk a migration, a schema change such as renaming, retyping, or dropping a column or table, a backfill, or a breaking API change. Not for listing everything a finished change could break (checking-blast-radius), recording a decision already made (recording-decisions), or resolving git merge conflicts.
---

# Planning migrations

A migration plan says how to get from the old shape to the new one while old code, old clients, and existing data still exist, and what happens when a step fails.

## Workflow

1. **Pin the change and the environment.** Current and target shape; the engine and version; the migration tool and its conventions (read existing migrations: numbering, up and down files, whether DDL runs in a transaction). How deploys work: do migrations run before new code starts, and do old and new instances or clients run side by side? Read the repository first. Ask only for what it cannot show and what changes the plan (data volume, deploy process, downtime tolerance, external clients), and state your assumptions.
2. **Find what depends on the old shape:** writers, readers, jobs and scripts, other services, external API clients, caches and serialized data, reports.
3. **Check existing data against the new rules.** Write the queries to run first (nulls, duplicates, orphans, out-of-range values, lengths) and say how their results change the plan. Never assume the data is clean.
4. **Sequence for compatibility.** Prefer expand and contract: add the new shape so old code keeps working, deploy code that writes both and reads tolerantly, backfill in small, idempotent, resumable batches, validate, switch reads, stop writing the old shape, and remove it in a later release. For APIs, add before removing, keep a deprecation window, and measure remaining use of the old version before removing it. At every step, the code that can be running must work with the schema that exists.
5. **Plan validation per step:** pre-checks, post-checks (row counts, constraint validation, sampled comparisons of old and new values), what to monitor, and the go or no-go criterion.
6. **Plan recovery honestly per step:** how to roll back (down migration, redeploy the previous code, restore from backup) and whether that really restores the previous state. `references/risky-operations.md` lists operations that lock, rewrite, or lose data, per engine, and patterns for common changes.
7. **Stop at real blockers.** If the target contradicts existing data or current behavior (a constraint that live rows or writers violate, a dropped field that is the only copy of something), do not plan around it by inventing values. Present the conflict with evidence and the options, and ask.

## Constraints

- Call out every step that loses data or cannot be reversed (dropping or narrowing columns, overwriting values in a backfill, deleting rows, irreversible type conversions), even when the user asked for it, with what must exist beforehand to recover (a verified backup, a copy of the column or table).
- Never call a step reversible, zero-downtime, or safe unless the plan shows why. A down migration that re-adds a dropped column does not bring back its data.
- Do not run migrations, backfills, or destructive commands against any database, and do not change existing migration files. Write new migration files only if the user asks.
- Keep it proportional: a small table with no concurrent deploys needs a short plan.

## Plan format

- **Change and assumptions.**
- **Depends on the old shape:** consumers with file paths.
- **Data checks:** the queries to run first and what each result means for the plan.
- **Steps:** for each, what runs or deploys, which code versions it is compatible with, validation, rollback, and reversible (yes, no: data loss, or only until step N).
- **Data loss and irreversible steps:** listed on their own, with the prerequisite for recovery.
- **Open questions** that block or change the plan.

## Done when

The user has an ordered plan in which every step is compatible with the code that can be running at that time and has a validation and a rollback, every data-loss or irreversible step is called out with its recovery prerequisite, no reversibility or downtime claim is unsupported, and blockers are raised as questions instead of being planned around.
