# Data Validation Checklist

**Load this when:** validating data after a migration, designing pre/post
migration checks, or building a data quality gate before cutover.

## Pre-migration baseline (capture before running)

Run these queries and save the output. Compare against post-migration results.

### Row counts

```sql
-- Total rows per table
SELECT table_name, n_live_tup AS row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

-- Or for key tables explicitly
SELECT
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM orders) AS orders,
  (SELECT COUNT(*) FROM transactions) AS transactions;
```

### Aggregate values (financial / critical)

```sql
-- Sum of money — must not change
SELECT
  SUM(amount) AS total_amount,
  SUM(refunded_amount) AS total_refunds,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed_orders
FROM orders;
```

### Status distributions

```sql
-- Status counts — proportions should be preserved
SELECT status, COUNT(*) FROM orders GROUP BY status ORDER BY status;
SELECT verified, COUNT(*) FROM users GROUP BY verified;
```

### Relationship integrity

```sql
-- Orphaned records (should be 0)
SELECT COUNT(*) FROM order_items oi
  LEFT JOIN orders o ON oi.order_id = o.id
  WHERE o.id IS NULL;
```

## Post-migration validation

Run the same queries. Compare:

| Check                          | Expected      | Action if wrong                          |
| ------------------------------ | ------------- | ---------------------------------------- |
| Row counts                     | Match exactly | Investigate lost/duplicate rows          |
| Financial sums                 | Match exactly | STOP — data loss, rollback               |
| Status distributions           | Match exactly | Check transformation logic               |
| Orphaned records               | 0             | Find FK violation, fix before proceeding |
| Null counts in required fields | 0             | Backfill missing values                  |

## Column-level validation

```sql
-- Check for unexpected nulls in columns that should be populated
SELECT
  COUNT(*) FILTER (WHERE email IS NULL) AS null_email,
  COUNT(*) FILTER (WHERE created_at IS NULL) AS null_created_at,
  COUNT(*) FILTER (WHERE user_id IS NULL) AS null_user_id
FROM orders;

-- Check for values outside expected ranges
SELECT COUNT(*) FROM transactions
  WHERE amount < 0 OR amount > 1000000;

-- Check for format violations
SELECT COUNT(*) FROM users
  WHERE email NOT LIKE '%@%.%';

-- Check for duplicate unique values
SELECT email, COUNT(*) FROM users
  GROUP BY email HAVING COUNT(*) > 1;
```

## Sampling validation

For large datasets where full comparison isn't practical:

```sql
-- Sample 100 random rows, verify they look correct
SELECT * FROM users ORDER BY RANDOM() LIMIT 100;

-- Sample from each status bucket
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY status ORDER BY RANDOM()) AS rn
  FROM orders
) t WHERE rn <= 10;
```

Manual review of samples catches transformation bugs that aggregate checks miss.

## Application-level validation

After schema migration, verify application behavior:

```
⬜ New writes succeed (create a test record, verify it persists)
⬜ Reads return expected data (fetch a known record, compare fields)
⬜ Indexes are being used (EXPLAIN ANALYZE on key queries)
⬜ Existing API endpoints return 200 (not 500 from schema mismatch)
⬜ Background jobs complete without errors
⬜ Reports/aggregations produce correct output
```

## Cutover decision criteria

Only proceed to final cutover when ALL of these are true:

```
⬜ Row counts match (tolerance: 0 for critical tables, < 0.01% for large tables)
⬜ All financial aggregates match exactly
⬜ Zero orphaned records
⬜ Zero unexpected nulls in required columns
⬜ Sample review passes (100+ records spot-checked)
⬜ Application smoke test passes
⬜ Rollback has been tested in staging
⬜ Team is available to monitor for 2 hours post-cutover
```

## Common migration data bugs

| Bug                            | Symptom                       | How to detect               |
| ------------------------------ | ----------------------------- | --------------------------- |
| Off-by-one in batch processing | Last N rows missing           | Row count check             |
| Timezone conversion error      | Timestamps shifted by hours   | Sample date comparison      |
| Character encoding issue       | Garbled names/text            | Spot check non-ASCII values |
| Duplicate row insertion        | Inflated counts               | Aggregate sum comparison    |
| Null coalesce wrong default    | All nulls → 0 instead of NULL | Null count check            |
| FK constraint skipped          | Orphaned records              | Orphan count check          |
| Truncated strings              | Data cut off at 255 chars     | Check max-length values     |

## Post-cutover monitoring (first 24 hours)

Watch these metrics for anomalies:

- Error rates in application logs (spike = schema mismatch)
- Query latency (missing index = slow queries)
- Database CPU and lock waits (backfill still running?)
- Failed job counts (workers hitting migration-related errors)

Set alert thresholds before cutover, not after.
