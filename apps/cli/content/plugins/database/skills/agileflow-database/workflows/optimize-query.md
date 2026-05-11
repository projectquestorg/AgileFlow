# Workflow: Optimize Query

Follow this workflow when the user has a slow query or reports database performance problems. Diagnose before prescribing. Collect evidence, identify the bottleneck, apply the minimum effective fix, and verify the improvement.

---

## Step 1: Capture the Slow Query

Ask the user to provide:

1. **The query** — exact SQL, including WHERE clauses, ORDER BY, LIMIT, JOINs
2. **EXPLAIN ANALYZE output** — run `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) <query>;`
3. **Table row counts** — approximate sizes of the tables involved
4. **Context** — is this a background job, user-facing API endpoint, report? What latency is acceptable?
5. **How slow** — current execution time, target execution time

If EXPLAIN ANALYZE output is not available, ask why (read replica, permissions) and adapt.

---

## Step 2: Read EXPLAIN ANALYZE

Parse the output from the bottom up (innermost nodes first). Identify:

**What to look for:**

| Signal                                         | Meaning                                                                |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `Seq Scan` on a large table                    | Missing index on a filter column                                       |
| `actual rows` >> `rows` estimate (10x or more) | Stale statistics — `ANALYZE` needed                                    |
| `Sort` node with high cost                     | Consider index to serve ORDER BY                                       |
| `Hash Join` with `Batches: N > 1`              | Hash doesn't fit in memory — increase `work_mem` or rewrite            |
| `Nested Loop` with large outer rows            | N×M iterations — may need different join type or index                 |
| High `shared read` buffers                     | Data not cached — cold cache or table too large for cache              |
| `Filter: (...)` rows removed after index       | Index chosen but lots of rows filtered post-scan — better index needed |
| `Index Scan` with high loops                   | Called repeatedly in a nested loop — may be N+1                        |

**Cost anatomy:**

```
Seq Scan on orders  (cost=0.00..58432.10 rows=2000000 width=128)
                     (actual time=0.012..820.341 rows=2000000 loops=1)
```

- `cost=0.00..58432.10`: startup cost..total cost (planner's estimate)
- `rows=2000000`: planner's row estimate
- `actual time=0.012..820.341`: real ms (startup..total)
- `actual rows=2000000`: real rows returned
- `loops=1`: how many times this node ran

---

## Step 3: Identify the Bottleneck

Categorize the problem before choosing a fix:

### Missing Index (most common)

**Signs:** `Seq Scan` on a large table with low selectivity filter, or `Filter` removing most rows after a scan.

**Fix:** Add an index on the filter column(s). Use the column order rules from `references/indexing-guide.md`.

```sql
-- Confirm the index would be used by checking with set enable_seqscan = off:
SET enable_seqscan = off;
EXPLAIN ANALYZE <your query>;
SET enable_seqscan = on;
```

### Wrong Index (planner chose incorrectly)

**Signs:** An index exists but isn't being used, or a different index is chosen than expected.

**Causes:**

- Stale statistics: planner row estimates are far off actual rows
- Index isn't selective enough for the data distribution
- Function applied to indexed column: `WHERE LOWER(email) = $1` won't use index on `email`

**Fix:**

```sql
-- Refresh stats
ANALYZE table_name;

-- For function on column, create functional index
CREATE INDEX idx_users_email_lower ON users (LOWER(email));
-- Query must match exactly:
SELECT * FROM users WHERE LOWER(email) = LOWER($1);
```

### N+1 Query Pattern

**Signs:** A query node shows `loops=N` where N equals the number of parent rows. 1000 index lookups for 1000 parent rows.

**Fix:** Rewrite to use a JOIN or a `WHERE id = ANY($1)` batch fetch.

```sql
-- Bad pattern (application-level N+1):
-- SELECT * FROM orders WHERE user_id = $1   -- loop N times

-- Good: one query with JOIN
SELECT o.*, u.name, u.email
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE o.status = 'pending'
  AND o.created_at > NOW() - INTERVAL '7 days';

-- Or batch fetch with ANY
SELECT * FROM users WHERE id = ANY($1::BIGINT[]);
```

### Slow Sort / ORDER BY

**Signs:** `Sort` node in EXPLAIN with high cost, or sort is the dominant time.

**Fix:** Create an index that serves the ORDER BY:

```sql
-- Query: WHERE status = 'active' ORDER BY created_at DESC
CREATE INDEX CONCURRENTLY idx_orders_status_created
  ON orders (status, created_at DESC);
```

The planner can use this index and return rows in sorted order without an explicit sort step.

### Inefficient JOIN

**Signs:** `Hash Join` batching to disk, `Nested Loop` with large row counts, `Merge Join` on unsorted input requiring expensive sort.

**Fix options:**

- Ensure FK columns are indexed
- Add a more selective filter to reduce the row count before the join
- Rewrite with a CTE to force evaluation order (use sparingly — can prevent optimization)
- Increase `work_mem` if hash join is batching: `SET work_mem = '256MB';`

### Stale Statistics

**Signs:** `rows=100` estimate but `actual rows=500000`, or vice versa.

**Fix:**

```sql
ANALYZE table_name;

-- After bulk loads, VACUUM ANALYZE to reclaim dead tuples and update stats
VACUUM ANALYZE table_name;

-- Check when last analyzed:
SELECT relname, last_analyze, last_autoanalyze, n_live_tup, n_dead_tup
FROM pg_stat_user_tables
WHERE relname = 'orders';
```

### Large Result Set (Missing LIMIT)

**Signs:** Query returns millions of rows when only a page is needed.

**Fix:** Add LIMIT/OFFSET pagination, or use cursor-based pagination:

```sql
-- Offset pagination (simple but slow for large offsets)
SELECT * FROM orders
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 20 OFFSET $2;

-- Cursor-based pagination (fast even on page 10000)
SELECT * FROM orders
WHERE user_id = $1
  AND created_at < $last_cursor_value  -- cursor = last seen created_at
ORDER BY created_at DESC
LIMIT 20;
```

---

## Step 4: Apply the Fix

Apply the minimum effective change:

1. **Index fix:** write the `CREATE INDEX CONCURRENTLY` statement
2. **Query rewrite:** rewrite the query, keeping semantics identical
3. **Stats fix:** `ANALYZE table_name`
4. **Schema change:** if a column type or missing column is the root cause, follow `workflows/design-schema.md` or `references/migration-guide.md`

Always implement index additions as a separate migration using `CREATE INDEX CONCURRENTLY`.

---

## Step 5: Verify the Improvement

After applying the fix, run EXPLAIN ANALYZE again on the same query with the same parameters.

**What to confirm:**

- [ ] Seq Scan replaced by Index Scan or Index Only Scan
- [ ] `actual time` is within the target latency
- [ ] `actual rows` is close to `rows` estimate (planner is accurate now)
- [ ] No new bottleneck introduced elsewhere in the plan
- [ ] Query returns the same results as before

Compare before and after:

```
Before: Seq Scan on orders  actual time=820.341ms  rows=2000000
After:  Index Scan using idx_orders_user_id  actual time=0.081ms  rows=12
```

---

## Step 6: Document

For any significant change (new index, query rewrite, schema change):

- Add a comment to the migration explaining why the index was added
- Note the before/after execution time in the PR or commit message
- If the root cause was stale statistics, check autovacuum settings:

```sql
-- Check autovacuum settings for a specific table
SELECT relname, reloptions FROM pg_class WHERE relname = 'orders';

-- Check if autovacuum is running frequently enough
SELECT schemaname, relname, last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
ORDER BY last_autovacuum DESC NULLS LAST;
```

If autovacuum is too infrequent on a busy table, tune it:

```sql
ALTER TABLE orders SET (
  autovacuum_vacuum_scale_factor = 0.01,  -- trigger at 1% dead tuples (default 20%)
  autovacuum_analyze_scale_factor = 0.005 -- trigger analyze at 0.5% changes
);
```

---

## Quick Diagnosis Reference

| Symptom                               | First thing to check                                            |
| ------------------------------------- | --------------------------------------------------------------- |
| Query suddenly slow after data load   | ANALYZE — statistics are stale                                  |
| Slow on large table with WHERE clause | Missing index on filter column                                  |
| Slow ORDER BY                         | Index that serves the ORDER BY clause                           |
| API endpoint slow under load          | N+1 pattern — count queries in one request                      |
| Report query times out                | Pagination, partial index, materialized view                    |
| Deadlock errors                       | Lock ordering inconsistency — acquire locks in same order       |
| Connection pool exhausted             | Long-running transactions, missing indexes causing slow queries |
| Replication lag spike                 | Large write operation or bulk update without batching           |
