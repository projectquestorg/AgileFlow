# Risky migration operations

Read the sections for the engine and change at hand. Behavior differs by engine and version; confirm against the version the project runs.

## Operations that lose data or cannot be undone

| Operation | Why | What makes recovery possible |
| --- | --- | --- |
| `DROP COLUMN`, `DROP TABLE`, `TRUNCATE` | Values are gone; a down migration only recreates an empty shape | A verified backup or point-in-time restore, or a copy table kept for a retention window |
| Narrowing a type (text to varchar(n), bigint to int, timestamp with zone to without) | Values are truncated, rounded, or rejected | Check the maximums first; keep the old column until the new one is validated |
| Changing units, encodings, or precision in place | Old values are overwritten | Write to a new column and keep the old one |
| Backfills that overwrite existing values | The previous values are lost | Only fill nulls, or record old values first |
| Deleting or merging duplicate rows | The chosen survivor hides the others | Export the affected rows first |
| Removing an API field or endpoint | Clients that still send or read it break, and you cannot un-ship their failures | Usage telemetry at zero for the deprecation window |

## Locks and table rewrites

- **PostgreSQL:** `ALTER TABLE` takes an `ACCESS EXCLUSIVE` lock; even fast changes queue behind long transactions and block everything behind them, so set `lock_timeout`. `CREATE INDEX` blocks writes: use `CREATE INDEX CONCURRENTLY` (not inside a transaction). Adding `NOT NULL` scans the table: add a `CHECK (col IS NOT NULL) NOT VALID` constraint, `VALIDATE CONSTRAINT`, then set `NOT NULL` (PostgreSQL 12+ uses the valid check to skip the scan). Adding a column with a constant default is instant from PostgreSQL 11; a volatile default rewrites the table. Changing a column type usually rewrites the table. Add foreign keys `NOT VALID`, then validate.
- **MySQL (InnoDB):** many `ALTER TABLE` operations copy the table; check whether `ALGORITHM=INSTANT` or `INPLACE, LOCK=NONE` is supported for the change, or use an online schema change tool (gh-ost, pt-online-schema-change). Metadata locks queue behind long transactions.
- **SQLite:** limited `ALTER TABLE`; most changes need the create-copy-drop-rename procedure inside a transaction with foreign keys handled explicitly.
- **Any engine:** large backfills in one transaction hold locks, bloat logs, and lag replicas. Batch by primary key ranges, commit per batch, throttle, and make each batch idempotent so it can resume.

## Patterns for common changes

- **Rename a column:** add the new column, write both, backfill, switch reads, stop writing the old one, drop it in a later release (the drop is the data-loss step). An in-place `RENAME` breaks every running instance that still uses the old name during a rolling deploy.
- **Change a column's type:** new column with the new type, dual write with conversion, backfill, validate conversions (count rows that fail to convert), switch reads, drop the old column later.
- **Add NOT NULL:** find and fix writers that write nulls, backfill existing nulls with a value the product agrees on, add the constraint without a long lock (see PostgreSQL above).
- **Split or merge tables:** new table, dual write, backfill, verify counts and sampled rows, switch reads, retire the old table after a retention window.
- **Breaking API change:** add the new field, endpoint, or version alongside the old one; make clients switch; measure old usage; remove only when usage is zero or the deprecation date passes.

## Validation checks worth writing

- Row counts before and after; counts of nulls, duplicates, and orphaned foreign keys.
- Old and new values compared for all rows after a backfill (`WHERE new IS DISTINCT FROM convert(old)` returns nothing).
- Constraint validation succeeding before it is enforced.
- Application error rates and slow query logs during and after each deploy step.
