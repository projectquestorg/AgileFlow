# Migration Guide

Safe database migration discipline for production systems. Every migration is reversible, every destructive operation has a zero-downtime strategy, and every change is tested before it touches production.

---

## The Reversibility Rule

A migration without a working `down` is a one-way door. One-way doors in production databases are dangerous.

**Mandatory rules:**

1. Every migration file has both `up` and `down`
2. The `down` must actually restore the previous state — not just be a placeholder comment
3. The `down` must not lose data. If dropping a column, the `down` cannot restore it (data is gone). Use rename instead.
4. Test `down` in a staging environment before deploying `up` to production
5. If data loss in rollback is truly unavoidable, document it explicitly and get sign-off

```sql
-- Example migration structure (pseudo-code for most migration tools)

-- up
ALTER TABLE users ADD COLUMN display_name TEXT;

-- down
ALTER TABLE users DROP COLUMN display_name;
```

For a column with data that would be lost on rollback:

```sql
-- up: rename old column, add new one (data preserved in old column for rollback)
ALTER TABLE users RENAME COLUMN username TO username_legacy;
ALTER TABLE users ADD COLUMN username TEXT;
UPDATE users SET username = username_legacy;
ALTER TABLE users ALTER COLUMN username SET NOT NULL;

-- down: remove new column, rename back
ALTER TABLE users DROP COLUMN username;
ALTER TABLE users RENAME COLUMN username_legacy TO username;
```

---

## Zero-Downtime Migration Patterns

### Adding a Column

**Safe:** adding a nullable column with no default, or a column with a constant default.

```sql
-- Always safe in PostgreSQL (no table rewrite needed)
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN is_premium BOOLEAN NOT NULL DEFAULT false;
```

**Unsafe:** adding NOT NULL without a default on a table with existing rows.

```sql
-- BAD: acquires ACCESS EXCLUSIVE lock while rewriting the table
ALTER TABLE users ADD COLUMN tier TEXT NOT NULL;  -- fails if rows exist, or locks for rewrite

-- GOOD: three-step approach
-- Migration 1: add nullable
ALTER TABLE users ADD COLUMN tier TEXT;

-- Migration 2 (separate deploy): backfill
UPDATE users SET tier = 'free' WHERE tier IS NULL;  -- batch if large

-- Migration 3 (separate deploy after code handles NULL): add constraint
ALTER TABLE users ALTER COLUMN tier SET DEFAULT 'free';
ALTER TABLE users ALTER COLUMN tier SET NOT NULL;
```

### Renaming a Column

Never rename directly — it breaks the running application code immediately.

**Three-deploy strategy:**

```
Deploy 1: Add new column, write to both old and new, read from old
Deploy 2: Backfill new column for all existing rows, switch reads to new column
Deploy 3: Drop old column
```

```sql
-- Deploy 1 migration:
ALTER TABLE users ADD COLUMN display_name TEXT;

-- Deploy 1 application code: write to both `name` and `display_name`

-- Deploy 2 migration: backfill
UPDATE users SET display_name = name WHERE display_name IS NULL;
-- Deploy 2 application code: reads from display_name, still writes to both

-- Deploy 3 migration: drop old column
ALTER TABLE users DROP COLUMN name;
-- Deploy 3 application code: write only to display_name
```

### Adding an Index

Always use CONCURRENTLY. Without it, an ACCESS SHARE lock blocks all writes during the build.

```sql
-- Never in production without CONCURRENTLY
CREATE INDEX idx_orders_user_id ON orders (user_id);

-- Always:
CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders (user_id);
```

Note: CONCURRENTLY cannot run inside a transaction block. If your migration tool wraps all migrations in transactions, you must disable the transaction for index migrations, or run them manually.

```sql
-- Disable transaction in Flyway:
-- @flyway:transaction=false

-- Rails: disable_ddl_transaction!
class AddIndexToOrdersUserId < ActiveRecord::Migration[7.0]
  disable_ddl_transaction!
  def change
    add_index :orders, :user_id, algorithm: :concurrently
  end
end
```

### Removing a Column

Two-deploy strategy — removing too early breaks the running code.

```
Deploy 1: Remove all references to the column in application code
Deploy 2: Drop the column in the migration
```

```sql
-- Deploy 2 migration (after code no longer references the column):
ALTER TABLE users DROP COLUMN legacy_token;
```

### Changing a Column Type

This is the most complex operation. Never do it in place on a live table.

**Strategy:**

```sql
-- Step 1: Add new column with new type
ALTER TABLE orders ADD COLUMN total_cents BIGINT;

-- Step 2: Backfill (in batches if large)
UPDATE orders SET total_cents = (total_amount * 100)::BIGINT
WHERE total_cents IS NULL;

-- Step 3: Add trigger to keep columns in sync during deployment window
-- (optional but recommended for tables with high write volume)

-- Step 4: Switch application reads and writes to new column

-- Step 5: Drop old column
ALTER TABLE orders DROP COLUMN total_amount;
ALTER TABLE orders RENAME COLUMN total_cents TO total_amount;
```

### Large Table Backfills

Backfilling millions of rows in a single UPDATE holds a long lock, generates massive WAL, spikes replication lag, and risks transaction timeout.

**Batch by primary key:**

```sql
DO $$
DECLARE
  batch_size INT := 5000;
  last_id BIGINT := 0;
  max_id BIGINT;
  rows_updated INT;
BEGIN
  SELECT MAX(id) INTO max_id FROM orders;

  LOOP
    EXIT WHEN last_id > max_id;

    UPDATE orders
    SET status = 'legacy'
    WHERE id > last_id
      AND id <= last_id + batch_size
      AND status IS NULL;

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    last_id := last_id + batch_size;

    -- Give replication a breath between batches
    PERFORM pg_sleep(0.1);
    RAISE NOTICE 'Updated through id %, % rows this batch', last_id, rows_updated;
  END LOOP;
END $$;
```

Or use a migration tool's batch helper (e.g., Rails `update_column_in_batches`, Flyway callback).

**Monitor replication lag during backfill:**

```sql
-- On replica:
SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) AS lag_seconds;
```

Pause the backfill if lag exceeds your threshold.

---

## Adding Foreign Key Constraints (PostgreSQL)

A standard `ADD FOREIGN KEY` acquires a SHARE ROW EXCLUSIVE lock on both tables and validates all existing rows — this can take minutes and block writes.

**Use NOT VALID + VALIDATE CONSTRAINT:**

```sql
-- Step 1: Add constraint without validating existing rows (fast, minimal lock)
ALTER TABLE orders
  ADD CONSTRAINT orders_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id)
    NOT VALID;

-- Step 2: Validate existing rows (no write locks held during scan)
ALTER TABLE orders
  VALIDATE CONSTRAINT orders_user_id_fkey;
```

The two-step approach holds only a brief lock for the metadata update, then validates rows while holding only a weaker lock that doesn't block reads or writes.

---

## PostgreSQL-Specific Safety Settings

Add these at the top of risky migration scripts:

```sql
-- Fail fast if we can't get a lock within 2 seconds
-- (better to fail loudly than to queue all production queries)
SET lock_timeout = '2s';

-- Kill the statement if it runs too long
SET statement_timeout = '30s';  -- adjust to expected migration duration

-- For long backfills, disable statement timeout
SET statement_timeout = 0;
```

In application code or migration tools, set these as session-level settings before running migrations.

### Implicit Locks on Referenced Tables

Creating a FK also briefly locks the referenced table. On busy tables, set `lock_timeout` to avoid locking up production:

```sql
SET lock_timeout = '3s';
ALTER TABLE order_items
  ADD CONSTRAINT order_items_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES orders(id)
    NOT VALID;
```

If this times out, retry during a low-traffic window.

---

## Migration Anti-Patterns

| Anti-pattern                                        | Risk                                                  | Fix                                                     |
| --------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| Adding NOT NULL to existing column in one step      | Full table lock (PostgreSQL rewrites the table)       | Add nullable → backfill → add constraint (3 migrations) |
| Dropping column same deploy as removing code        | Rollback impossible — code restored but column gone   | Remove code → deploy → drop column                      |
| Direct column rename                                | Breaks running application immediately                | Add new → backfill → switch → drop old                  |
| Bulk UPDATE without batching                        | Long lock, replication lag spike, timeout risk        | Batch by PK with sleep between batches                  |
| CREATE INDEX without CONCURRENTLY                   | Blocks all writes during index build                  | Always use CONCURRENTLY                                 |
| Seeding production data in migrations               | Migrations become environment-specific, slow, brittle | Use seeds or separate idempotent scripts                |
| Migration with no `down`                            | Cannot roll back without manual intervention          | Always write the `down`                                 |
| Multi-hour migration in a single transaction        | Holds locks, fills WAL, blocks autovacuum             | Break into stages; avoid long transactions              |
| Running migration against production before staging | No opportunity to catch problems                      | Always run in staging first                             |
| Changing ENUM values directly                       | Requires table rewrite in older PostgreSQL            | Add new ENUM value (safe), migrate data, remove old     |

---

## Migration Checklist

Before running any migration in production:

- [ ] Migration has been run against a production-sized staging database
- [ ] `down` has been tested and verified to restore the previous state
- [ ] EXPLAIN ANALYZE run for any queries involved in the migration
- [ ] Large table changes use CONCURRENTLY, batching, or NOT VALID
- [ ] lock_timeout set for any DDL that acquires ACCESS EXCLUSIVE lock
- [ ] Replication lag monitored during backfill operations
- [ ] Rollback plan documented and reviewed
- [ ] Migration is idempotent (can be re-run safely if interrupted)
- [ ] No data-seeding in the migration file
- [ ] Application code changes are backward-compatible with pre- and post-migration schema

---

## Common Migration Tools

| Tool             | Language  | Notes                                                                      |
| ---------------- | --------- | -------------------------------------------------------------------------- |
| Flyway           | Any (SQL) | SQL-based, strong versioning, Java CLI or Maven/Gradle plugin              |
| Liquibase        | Any       | XML/YAML/SQL format, rollback support, change tracking                     |
| Rails Migrations | Ruby      | ActiveRecord DSL, `up`/`down`, `disable_ddl_transaction!` for CONCURRENTLY |
| Alembic          | Python    | SQLAlchemy-based, autogenerate from models, `upgrade`/`downgrade`          |
| Prisma Migrate   | Node.js   | Schema-first, drift detection, no CONCURRENTLY support (workaround needed) |
| Drizzle Kit      | Node.js   | TypeScript schema-first, generate SQL migrations                           |
| GORM AutoMigrate | Go        | Simple but limited — not recommended for production beyond dev             |
| golang-migrate   | Go        | SQL files, up/down, supports PostgreSQL CONCURRENTLY                       |

### Prisma CONCURRENTLY Workaround

Prisma Migrate wraps migrations in transactions. For index creation, add a manual SQL migration:

```sql
-- In a separate migration file that Prisma won't auto-generate
-- migrations/20240115_add_index_orders_user_id.sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_user_id ON orders (user_id);
```

Mark it as applied manually after running it outside Prisma: `prisma migrate resolve --applied migration_name`.
