# Indexing Guide

A practical reference for choosing, designing, and maintaining database indexes — primarily PostgreSQL, with notes for MySQL and MongoDB where behavior differs.

---

## When Indexes Help

An index is only worth its write overhead if it meaningfully reduces the rows the planner must examine. Index when:

- A column appears in `WHERE` clauses on large tables
- A column is used in `JOIN` conditions (foreign keys almost always need indexes)
- A column drives `ORDER BY` or `GROUP BY` on large result sets
- A query must enforce `UNIQUE` or `PRIMARY KEY` (indexes are automatic for these)
- A covering index can eliminate a heap fetch entirely

**Rule of thumb:** if a query returns less than ~5% of rows, an index scan is faster than a sequential scan. Above that, the planner may prefer sequential scan even with an index.

---

## Index Types (PostgreSQL)

| Type    | Operators                                | Use case                                                                                            |
| ------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| B-tree  | =, <, <=, >, >=, BETWEEN, LIKE 'prefix%' | Default — general purpose, ORDER BY, range queries                                                  |
| Hash    | = only                                   | Equality lookups only; slightly faster than B-tree for = but not maintained across WAL before PG 10 |
| GIN     | @>, <@, &&, @@                           | JSONB, arrays, full-text search (tsvector), pg_trgm trigrams                                        |
| GiST    | Geometric, range, PostGIS                | Geometric queries, PostGIS geography, fuzzy text (pg_trgm)                                          |
| BRIN    | Range on ordered data                    | Very large append-only tables (time-series, logs) — tiny index, approximate                         |
| SP-GiST | Partitioned non-balanced trees           | Points, ranges, network addresses                                                                   |

**When to choose GIN over GiST for text search:**

- GIN: faster reads, slower writes, larger index — good for mostly-read data
- GiST: faster writes, slower reads — good for frequently-updated data

---

## Composite Indexes

Column order in a composite index determines which queries it can serve. The index can serve queries that use a prefix of the column list.

```sql
-- Index on (user_id, status, created_at)
CREATE INDEX idx_orders_user_status_created ON orders (user_id, status, created_at);
```

This index can serve:

- `WHERE user_id = 1`
- `WHERE user_id = 1 AND status = 'pending'`
- `WHERE user_id = 1 AND status = 'pending' AND created_at > '2024-01-01'`

This index CANNOT efficiently serve:

- `WHERE status = 'pending'` (leading column missing)
- `WHERE created_at > '2024-01-01'` (leading columns missing)

### Column Ordering Rules

1. **Equality predicates first** — columns used with `=` before range columns
2. **Most selective equality column first** — put the column that filters most rows ahead of others
3. **Range predicates last** — `<`, `>`, `BETWEEN`, `LIKE 'prefix%'`
4. **ORDER BY columns can follow** — if sort direction matches index direction

```sql
-- Query: WHERE status = 'active' AND created_at > '2024-01-01' ORDER BY created_at

-- Good: equality first, then range
CREATE INDEX idx_users_status_created ON users (status, created_at);

-- Bad: range first blocks using the equality column from the index efficiently
CREATE INDEX idx_users_created_status ON users (created_at, status);
```

---

## Partial Indexes

A partial index indexes only the rows matching a WHERE condition. Smaller index, faster scans, lower write overhead.

```sql
-- Index only active users (not soft-deleted)
CREATE INDEX idx_users_email_active ON users (email) WHERE deleted_at IS NULL;

-- Index only pending orders (status is low-cardinality but subset is small)
CREATE INDEX idx_orders_pending ON orders (created_at) WHERE status = 'pending';

-- Index only unverified emails (temporary state — small subset)
CREATE INDEX idx_users_unverified ON users (email) WHERE email_verified_at IS NULL;
```

The query must include the same WHERE condition for the planner to use the partial index:

```sql
-- Uses the partial index
SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL;

-- Does NOT use the partial index (missing the condition)
SELECT * FROM users WHERE email = $1;
```

---

## Covering Indexes (Index-Only Scans)

A covering index includes all columns the query needs, eliminating the heap fetch. This is the fastest possible index path: `Index Only Scan`.

```sql
-- Query: SELECT email, name FROM users WHERE organization_id = $1
-- Covering index: include both filter and select columns
CREATE INDEX idx_users_org_covering ON users (organization_id) INCLUDE (email, name);
```

Use `INCLUDE` (PostgreSQL 11+) for non-key columns — they're in the leaf pages but not the B-tree structure, so they don't participate in ordering but are available for index-only scans.

---

## When Indexes Hurt

Don't index everything. Indexes have costs:

- Every `INSERT`, `UPDATE`, and `DELETE` must update all indexes on the table
- Indexes consume disk space (sometimes more than the table itself)
- Too many indexes confuse the query planner — it may choose the wrong one
- Indexes on low-cardinality columns (boolean, small ENUMs) often aren't used

### Low-cardinality columns

A boolean column with 90% `true` values: the planner knows a sequential scan is cheaper for `WHERE is_active = true` (90% of rows anyway). An index only helps if:

- Combined with other high-cardinality columns in a composite index
- Used as a partial index condition, not the filter itself

```sql
-- This standalone index often isn't used
CREATE INDEX idx_users_is_active ON users (is_active);  -- low cardinality

-- This composite index is useful
CREATE INDEX idx_orders_status_user ON orders (status, user_id);

-- This partial index is useful
CREATE INDEX idx_orders_pending_created ON orders (created_at) WHERE status = 'pending';
```

---

## Non-Blocking Index Creation

Never create an index without CONCURRENTLY on a live table. Standard CREATE INDEX takes an ACCESS SHARE lock that blocks writes.

```sql
-- Blocks writes during index build — NEVER use on live tables
CREATE INDEX idx_orders_user_id ON orders (user_id);

-- Non-blocking — takes longer but doesn't block
CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders (user_id);
```

If CONCURRENTLY fails (e.g., transaction issue), it leaves an INVALID index. Clean up:

```sql
-- Check for invalid indexes
SELECT indexname, indisvalid FROM pg_indexes
JOIN pg_class ON pg_class.relname = pg_indexes.indexname
JOIN pg_index ON pg_index.indexrelid = pg_class.oid
WHERE indisvalid = false;

-- Drop and recreate
DROP INDEX CONCURRENTLY idx_orders_user_id;
CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders (user_id);
```

---

## EXPLAIN ANALYZE Reference

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT ...;
```

### Node Types

| Node              | Meaning                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Seq Scan          | Full table scan. Fine for small tables; add an index if table is large and filter is selective |
| Index Scan        | Index lookup, then heap fetch for each matching row                                            |
| Index Only Scan   | Covering index — no heap fetch. Best possible for point lookups                                |
| Bitmap Index Scan | Builds a bitmap of matching pages, then bulk-fetches (efficient for range)                     |
| Bitmap Heap Scan  | Fetches pages identified by bitmap — paired with Bitmap Index Scan                             |
| Nested Loop       | Outer loop drives inner — fine for small row counts on outer side                              |
| Hash Join         | Hashes smaller table in memory, probes with larger — good default                              |
| Merge Join        | Sorts both inputs, merges — efficient when both inputs already sorted                          |
| Sort              | Explicit sort node — see if an index could eliminate it                                        |
| Hash              | Builds an in-memory hash table                                                                 |

### Reading Cost and Rows

```
->  Index Scan using idx_orders_user_id on orders
      (cost=0.43..8.45 rows=1 width=128)
      (actual time=0.032..0.033 rows=1 loops=1)
```

- `cost=0.43..8.45`: planner's estimated cost (startup..total) in arbitrary units
- `rows=1`: planner's row estimate
- `actual time=0.032..0.033`: real execution time in ms (startup..total)
- `actual rows=1`: real rows returned
- `loops=1`: how many times this node ran

**Stale statistics warning:** if `actual rows` >> `rows` estimate by 10x or more, run `ANALYZE table_name` to update statistics. The planner makes poor choices with stale stats.

### BUFFERS output

```
Buffers: shared hit=142 read=18 dirtied=0 written=0
```

- `hit`: pages found in shared_buffers (fast)
- `read`: pages read from disk (slow — consider more shared_buffers or caching)

---

## Index Maintenance

### Finding Unused Indexes

```sql
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS scans,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan < 50  -- threshold — adjust to your traffic
  AND indexrelname NOT LIKE '%pkey'
  AND indexrelname NOT LIKE '%unique'
ORDER BY pg_relation_size(indexrelid) DESC;
```

Drop unused indexes after confirming they're truly unused (reset stats after major deployments: `SELECT pg_stat_reset();`).

### Finding Tables Doing Excessive Sequential Scans

```sql
SELECT
  relname AS table_name,
  seq_scan,
  seq_tup_read,
  idx_scan,
  n_live_tup AS row_count,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
WHERE seq_scan > idx_scan
  AND n_live_tup > 10000  -- only large tables worth indexing
ORDER BY seq_tup_read DESC;
```

### Rebuilding Bloated Indexes

Over time, B-tree indexes accumulate dead tuples (bloat) from updates and deletes. Rebuild without blocking:

```sql
REINDEX INDEX CONCURRENTLY idx_orders_user_id;
```

Or recreate with a swap (safer for very large indexes):

```sql
CREATE INDEX CONCURRENTLY idx_orders_user_id_new ON orders (user_id);
-- verify new index is valid
DROP INDEX CONCURRENTLY idx_orders_user_id;
ALTER INDEX idx_orders_user_id_new RENAME TO idx_orders_user_id;
```

### Updating Statistics

After bulk data loads or large deletes:

```sql
ANALYZE orders;          -- update stats for one table
ANALYZE;                 -- update stats for all tables (runs quickly, non-blocking)
VACUUM ANALYZE orders;   -- reclaim dead tuples + update stats
```

---

## MySQL Notes

MySQL (InnoDB) index behavior differs from PostgreSQL in key ways:

- Clustered index: the primary key IS the table in InnoDB — secondary indexes contain the PK value as the row pointer
- Covering index: use `EXPLAIN` and look for `Using index` in the Extra column
- No `CONCURRENTLY`: use `pt-online-schema-change` or `gh-ost` for large table index changes
- FULLTEXT index: MySQL's built-in full-text search — different from PostgreSQL's `tsvector` approach
- Hash indexes: only in MEMORY engine — InnoDB uses adaptive hash index internally, not user-configurable
- Foreign key indexes: MySQL requires an index on the FK column; it creates one automatically if missing

---

## Quick Reference

| Scenario                                       | Index to create                                               |
| ---------------------------------------------- | ------------------------------------------------------------- |
| `WHERE user_id = $1`                           | `(user_id)`                                                   |
| `WHERE user_id = $1 AND status = 'active'`     | `(user_id, status)` — equality both, put more selective first |
| `WHERE status = 'pending' ORDER BY created_at` | `(status, created_at)`                                        |
| `WHERE deleted_at IS NULL AND email = $1`      | `(email) WHERE deleted_at IS NULL` (partial)                  |
| `SELECT id, name FROM users WHERE org_id = $1` | `(org_id) INCLUDE (name)` (covering)                          |
| `WHERE payload @> '{"type": "login"}'` (JSONB) | `USING GIN (payload)`                                         |
| Full-text: `WHERE to_tsvector(body) @@ query`  | `USING GIN (to_tsvector('english', body))`                    |
| Unique email                                   | `CREATE UNIQUE INDEX` (or `UNIQUE` constraint — same thing)   |
