---
name: agileflow-database
version: 1.0.0
category: agileflow/database
description: |
  Use when designing schema, writing migrations, optimizing queries,
  choosing indexes, or diagnosing database performance. Covers relational
  (PostgreSQL, MySQL, SQLite) and common NoSQL patterns (MongoDB, Redis).
  Always migration-safe: reversible, zero-downtime, tested.
triggers:
  keywords:
    - schema design
    - database
    - migration
    - index
    - query optimization
    - N+1
    - foreign key
    - normalization
    - join
    - slow query
    - EXPLAIN
    - table design
    - relationship
    - one-to-many
    - many-to-many
    - transaction
    - deadlock
    - partitioning
  priority: 50
  exclude:
    - database administrator (role title)
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/database.yaml
  maxEntries: 50
depends:
  skills: []
  plugins: [core]
---

# AgileFlow Database

Schema design, migration discipline, query optimization, and indexing strategy — for relational databases (PostgreSQL, MySQL, SQLite) and common NoSQL patterns (MongoDB, Redis). Every change is reversible and zero-downtime by default.

## When this skill activates

- User needs to design or review a database schema
- User is writing or reviewing a migration
- User has a slow query and needs help diagnosing it
- User asks about indexing strategy — what to index, how to compose indexes
- User mentions N+1 queries, missing indexes, or EXPLAIN output
- User needs to model a relationship (one-to-many, many-to-many, hierarchical)
- User is planning a large table backfill or zero-downtime column change
- User asks about ACID, transactions, deadlocks, or isolation levels

## Opening discovery flow

**When invoked without clear context, ask one focused question to understand the goal.**

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[
  {
    "question": "What database work do you need help with?",
    "header": "Database task",
    "multiSelect": false,
    "options": [
      {"label": "Design a new schema or model a relationship (Recommended starting point)", "description": "Entity identification, normalization, column types, naming conventions, and relationship patterns"},
      {"label": "Write or review a migration", "description": "Reversible up/down, zero-downtime patterns, lock avoidance, backfill strategy"},
      {"label": "Optimize a slow query", "description": "Paste the query and EXPLAIN ANALYZE output — I'll diagnose and fix it"},
      {"label": "Plan an indexing strategy", "description": "Which columns to index, composite index column order, partial indexes, covering indexes"},
      {"label": "Diagnose a production database problem", "description": "Deadlocks, replication lag, bloat, long-running transactions, connection exhaustion"}
    ]
  },
  {
    "question": "Which database are you using?",
    "header": "Database engine",
    "multiSelect": false,
    "options": [
      {"label": "PostgreSQL", "description": "Full feature set: JSONB, GIN/GiST indexes, CTEs, partitioning, LISTEN/NOTIFY"},
      {"label": "MySQL / MariaDB", "description": "InnoDB engine, JSON columns, generated columns"},
      {"label": "SQLite", "description": "Embedded, file-based — great for local-first or edge deployments"},
      {"label": "MongoDB", "description": "Document store — schema validation, aggregation pipeline, Atlas Search"},
      {"label": "Redis", "description": "Key-value / data structure store — caching, pub/sub, sorted sets"},
      {"label": "Not sure / multiple", "description": "Tell me your stack and I'll adapt"}
    ]
  }
]</parameter>
</invoke>
```

**Route based on answers:**

| Task                      | Next action                                      |
| ------------------------- | ------------------------------------------------ |
| Schema design             | Follow `workflows/design-schema.md`              |
| Migration                 | Follow `workflows/write-migration.md` (inline)   |
| Slow query / optimization | Follow `workflows/optimize-query.md`             |
| Indexing strategy         | Load `references/indexing-guide.md`              |
| Production diagnosis      | Ask for symptoms, error logs, and EXPLAIN output |

## ACID and transaction fundamentals

Every database operation that touches more than one row should be wrapped in a transaction. Know what you're getting:

| Property    | Meaning                                                              |
| ----------- | -------------------------------------------------------------------- |
| Atomicity   | All operations in the transaction succeed or all are rolled back     |
| Consistency | Data moves from one valid state to another — constraints always hold |
| Isolation   | Concurrent transactions don't see each other's partial writes        |
| Durability  | Committed transactions survive crashes                               |

### Isolation levels (PostgreSQL)

| Level           | Dirty read | Non-repeatable read | Phantom read | Use when                                    |
| --------------- | ---------- | ------------------- | ------------ | ------------------------------------------- |
| Read Committed  | No         | Yes                 | Yes          | Default — fine for most OLTP                |
| Repeatable Read | No         | No                  | No (PG)      | Reports that must be consistent across rows |
| Serializable    | No         | No                  | No           | Financial operations, inventory deduction   |

## Normalization vs denormalization decision

**Normalize for writes, denormalize for reads.**

| Situation                                               | Approach                                                 |
| ------------------------------------------------------- | -------------------------------------------------------- |
| OLTP: frequent inserts/updates, data integrity critical | Normalize to 3NF                                         |
| OLAP / reporting: reads dominate, aggregations needed   | Denormalize into a reporting table or materialized view  |
| Mixed: primary OLTP with some reporting                 | Normalize primary tables, add read-model tables or views |
| Event-sourced system                                    | Events table normalized; projections denormalized        |

**Signs you've over-normalized:**

- Every read requires 5+ JOINs
- Query planning time exceeds execution time
- Application code reconstructs a single object from 8 round-trips

**Signs you've under-normalized:**

- The same value appears in 1,000 rows and you update it in one place — then find 200 rows still have the old value
- You can't enforce a constraint without an application-level check

## Migration discipline

Every migration must be reversible. Every destructive operation requires a multi-step deployment plan.

### The golden rules

1. **Always write `down`** — even if you think you'll never roll back
2. **Never lose data in `down`** — rename instead of drop, or restore from backup column
3. **Test `down` in staging first** — broken rollbacks discovered in production are disasters
4. **One logical change per migration** — column add, index add, constraint add are separate files
5. **Never seed production data in migrations** — use seeds or a separate idempotent script

### Zero-downtime patterns

| Change                 | Safe approach                                                               |
| ---------------------- | --------------------------------------------------------------------------- |
| Add nullable column    | One migration — always safe                                                 |
| Add NOT NULL column    | Add nullable → backfill → add default → add constraint (3 migrations)       |
| Add index              | `CREATE INDEX CONCURRENTLY` — non-blocking in PostgreSQL                    |
| Rename column          | Add new → backfill → update app → drop old (3 deploys)                      |
| Remove column          | Stop using in code → deploy → then drop (2 deploys)                         |
| Change column type     | Add new → trigger/backfill → switch app → drop old                          |
| Large table backfill   | Batch by PK in chunks of 1,000–10,000, sleep between batches                |
| Add FK constraint (PG) | Add `NOT VALID` → `VALIDATE CONSTRAINT` separately (avoids full table lock) |

## Query performance principles

### The N+1 problem

N+1 happens when you fetch a list of N records, then issue one query per record to fetch related data. The fix is always eager loading or a JOIN.

```sql
-- Bad: 1 query for orders + N queries for each order's user
SELECT * FROM orders;
-- then for each order: SELECT * FROM users WHERE id = $1

-- Good: one query with a JOIN
SELECT o.*, u.name, u.email
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE o.status = 'pending';
```

### Reading EXPLAIN ANALYZE

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 42 AND status = 'pending';
```

Key nodes to recognize:

| Node             | Meaning                                                             | Action if unexpected              |
| ---------------- | ------------------------------------------------------------------- | --------------------------------- |
| Seq Scan         | Full table scan — no index used                                     | Add index if table is large       |
| Index Scan       | Index used, then row fetched from heap                              | Normal — check rows estimate      |
| Index Only Scan  | Covering index — no heap fetch needed                               | Best possible                     |
| Bitmap Heap Scan | Index used for range, rows fetched in batches                       | Normal for range queries          |
| Hash Join        | In-memory hash of smaller table, probe with larger                  | Fine; bad if hash batches to disk |
| Nested Loop      | For each outer row, loop inner — fine for small sets, bad for large | Check row estimates               |

**Cost anatomy:** `cost=0.00..432.10 rows=1 width=256`

- First number: startup cost (before first row)
- Second number: total cost (all rows)
- Rows: planner estimate — compare to `actual rows` for stale stats

If `actual rows` >> `rows estimate`, run `ANALYZE table_name` to refresh statistics.

## Common schema anti-patterns

| Anti-pattern                       | Problem                                           | Fix                                        |
| ---------------------------------- | ------------------------------------------------- | ------------------------------------------ |
| Storing comma-separated IDs        | Can't JOIN, can't enforce FK, hard to query       | Junction table                             |
| Using FLOAT for money              | Floating-point precision errors                   | DECIMAL(19,4) or integer cents             |
| Timestamps without timezone        | Ambiguous on DST changes, breaks across regions   | TIMESTAMPTZ, store in UTC                  |
| VARCHAR(255) everywhere            | Magic number — usually meaningless                | TEXT for arbitrary, or actual max length   |
| No soft-delete strategy            | Hard deletes break audit trails and FK references | deleted_at TIMESTAMPTZ NULL                |
| Indexing every column              | Slows writes, bloats storage, confuses planner    | Index only WHERE / JOIN / ORDER BY columns |
| God table (100+ columns)           | Hard to reason about, locks contend               | Vertical split, 1-to-1 related tables      |
| Polymorphic FK without constraints | No referential integrity possible                 | STI, CTI, or separate FK per type          |

## Self-improving learnings

`_learnings/database.yaml` records:

- Database engine(s) and version in use
- ORM or query builder (Prisma, Drizzle, Knex, SQLAlchemy, GORM, ActiveRecord)
- Migration tool (Flyway, Liquibase, Rails migrations, Alembic, Prisma Migrate)
- Naming conventions the team uses (if non-standard)
- Whether the team uses UUID or BIGSERIAL for primary keys
- Partitioning strategy (if any)
- Connection pooling setup (PgBouncer, RDS Proxy, Prisma connection limit)

Apply on invocation; update on correction.

## Quality checklist

Before delivering any schema or migration:

- [ ] Every table has a primary key
- [ ] All foreign keys have corresponding indexes
- [ ] Timestamps use TIMESTAMPTZ (not TIMESTAMP), stored in UTC
- [ ] Money values use DECIMAL or integer cents — no FLOAT
- [ ] Migration has both `up` and `down`
- [ ] Zero-downtime pattern applied for any destructive change
- [ ] Large table changes use CONCURRENTLY or batch approach
- [ ] Constraints named explicitly (easier to reference in errors and rollbacks)
- [ ] New indexes created CONCURRENTLY in PostgreSQL
- [ ] EXPLAIN ANALYZE reviewed for any query expected to run at scale

## Integration

- **agileflow-test-writer** — generate tests for migration scripts, data access layers, and repository functions; DB changes without tests are untested contracts
- **agileflow-story-writer** — acceptance criteria for data-model changes drive schema decisions; always read the AC before designing the schema
- **agileflow-adr** — document significant schema decisions (UUID vs BIGSERIAL, multi-tenancy strategy, soft-delete vs hard-delete) before implementing
- **agileflow-migration** — use for zero-downtime schema migrations, large backfills, and framework-level ORM upgrades; database handles design, migration handles execution
- **agileflow-engineering** — engineering owns the feature; database is the specialist for the storage layer; coordinate so schema and API land together
- **agileflow-performance** — query optimisation, index analysis, and connection pool tuning overlap between both skills; use database for schema-level fixes, performance for application-level profiling
- **agileflow-audit** — the query performance and security dimensions of the audit surface DB issues; database fixes what the audit finds
- **agileflow-refactor** — when a schema has grown organically and needs restructuring (column renames, table splits, normalisation), coordinate with refactor for the application-layer changes

## References

Load these files when you need deeper context:

| File                                | When to load                                                                |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `references/schema-design-guide.md` | Full normalization rules, naming conventions, column types, common patterns |
| `references/indexing-guide.md`      | Index types, composite index ordering, when indexes hurt, maintenance       |
| `references/migration-guide.md`     | Reversibility rules, zero-downtime patterns, PostgreSQL-specific safety     |

## Workflows

Follow these step-by-step when the user initiates the matching action:

| File                          | When to follow                                                        |
| ----------------------------- | --------------------------------------------------------------------- |
| `workflows/design-schema.md`  | User needs to design a new schema or model entities from requirements |
| `workflows/optimize-query.md` | User has a slow query and needs diagnosis and a fix                   |
