# Migration Patterns

**Load this when:** planning a zero-downtime migration, choosing between
migration strategies, or designing a rollback plan.

## The four migration strategies

| Strategy          | When to use                          | Risk   | Complexity |
| ----------------- | ------------------------------------ | ------ | ---------- |
| **Big bang**      | Small dataset, maintenance window OK | High   | Low        |
| **Strangler fig** | Live traffic, large codebase         | Low    | High       |
| **Parallel run**  | Data integrity critical              | Low    | High       |
| **Blue/green**    | Full deployment swap                 | Medium | Medium     |

### Big bang

Stop everything. Migrate. Restart. Simple but requires downtime.

```
Old system → [Maintenance window] → New system
```

**Use when:** Internal tools, staging environments, datasets < 10K rows, sub-1-hour migration.

**Never for:** User-facing production systems without a maintenance page + user communication.

### Strangler fig

Route traffic gradually from old to new. Old system "dies" as new handles more.

```
All traffic → Old system
↓ (add routing layer)
Traffic → Router → Old system (90%) + New system (10%)
↓ (shift gradually)
Traffic → Router → New system (100%)
↓ (remove old)
Traffic → New system
```

**Use when:** Migrating a monolith to microservices, rewriting a module that can't go down.

**Strangler fig checklist:**

```
⬜ Routing layer in place before migrating any traffic
⬜ Both systems can handle same requests (parity check)
⬜ Observability on both paths (latency, error rate)
⬜ Feature flags control traffic split
⬜ Rollback = flip flag back, not a deployment
```

### Parallel run

Both systems run simultaneously. Write to both, compare outputs, switch reads when confident.

```
Writes → Old + New (dual write)
Reads → Old (primary) + New (shadow — compare results)
Monitor divergence for N days
Switch reads to New
Stop writes to Old
```

**Use when:** Data integrity is critical, migrating billing, financial systems, healthcare records.

**Exit criteria:** Zero divergence for 7+ consecutive days across all operation types.

### Blue/green deployment

Two identical environments. Switch load balancer. Instant rollback.

```
LB → Blue (current production)
     Green (new version, fully ready)
Switch: LB → Green
If issues: LB → Blue (rollback in <1 min)
```

**Use when:** Application migrations, not data migrations. Great for infrastructure changes.

**Not ideal for:** Schema migrations — Blue and Green share the same DB, so schema must be backward compatible.

## Database migration patterns

### Expand-contract (zero downtime schema changes)

Never alter columns in production — always expand then contract:

```
Step 1: EXPAND — add the new structure alongside the old
  ALTER TABLE users ADD COLUMN email_v2 VARCHAR(255);

Step 2: MIGRATE — dual write during deploy
  App writes to both email and email_v2

Step 3: BACKFILL — populate the new column
  UPDATE users SET email_v2 = email WHERE email_v2 IS NULL;

Step 4: SWITCH — read from new column
  Deploy reads from email_v2

Step 5: CONTRACT — remove old column
  ALTER TABLE users DROP COLUMN email;

Step 6: RENAME (if needed)
  ALTER TABLE users RENAME COLUMN email_v2 TO email;
```

Each step is a separate deployment. Steps 1-3 are backward compatible.

### Additive-only migrations

Never break existing code with a migration:

| Safe ✓                | Unsafe ✗                                     |
| --------------------- | -------------------------------------------- |
| Add nullable column   | Drop column                                  |
| Add new table         | Rename column                                |
| Add index             | Change column type (without expand-contract) |
| Add nullable FK       | Add NOT NULL without default                 |
| Rename via new column | Remove FK that code depends on               |

### Large table migrations

For tables > 1M rows, never run migrations in a transaction that locks the table:

```sql
-- BAD: locks table, causes downtime
ALTER TABLE orders ADD COLUMN processed_at TIMESTAMP;

-- GOOD: add nullable, backfill in batches, add NOT NULL constraint later
ALTER TABLE orders ADD COLUMN processed_at TIMESTAMP NULL;

-- Then backfill in batches:
UPDATE orders SET processed_at = created_at
  WHERE id BETWEEN 1 AND 10000 AND processed_at IS NULL;
-- Repeat in 10k-row chunks with sleep between
```

Tools: `pt-online-schema-change` (MySQL), `pg_repack` (PostgreSQL), `gh-ost` (GitHub's MySQL tool).

## Rollback strategies

Every migration needs a rollback plan written BEFORE the migration runs.

| Migration type           | Rollback approach                   |
| ------------------------ | ----------------------------------- |
| Schema: added column     | DROP COLUMN (if no data yet)        |
| Schema: dropped column   | Restore from backup (can't undo)    |
| Data: transformed values | Restore from point-in-time snapshot |
| Code: strangler fig      | Flip feature flag to 0%             |
| Deployment: blue/green   | Switch LB back to blue              |
| Config: environment vars | Revert in secrets manager           |

**Rule:** If a migration doesn't have a rollback plan, it's not ready to run.

## Migration runbook template

```markdown
## Migration: Add `user_timezone` to profiles table

**Date:** 2026-03-15 10:00 UTC
**Owner:** @engineer
**Estimated duration:** 25 minutes
**Rollback time:** < 5 minutes

### Pre-migration checks

- [ ] Full DB backup completed (verify at: <link>)
- [ ] Monitoring dashboards open
- [ ] Rollback script tested in staging

### Steps

1. `psql $DATABASE_URL -f migrations/0042_add_user_timezone.sql` (5 min)
2. Deploy app v2.4.1 — includes dual-write for timezone (10 min)
3. Verify: `SELECT COUNT(*) FROM profiles WHERE timezone IS NULL` — expect < 5%
4. Run backfill: `node scripts/backfill-timezone.js` (10 min)
5. Verify: `SELECT COUNT(*) FROM profiles WHERE timezone IS NULL` — expect 0

### Rollback

If any step fails:

1. `psql $DATABASE_URL -c "ALTER TABLE profiles DROP COLUMN timezone"`
2. Redeploy v2.4.0
3. Page on-call if data inconsistency detected
```

## Data integrity checks

Before and after every migration:

```sql
-- Row counts by status (should be preserved)
SELECT status, COUNT(*) FROM orders GROUP BY status;

-- Sum of financial values (must not change)
SELECT SUM(amount) FROM transactions;

-- Check for nulls in NOT NULL columns
SELECT COUNT(*) FROM users WHERE email IS NULL;

-- Spot check sample rows
SELECT * FROM users ORDER BY RANDOM() LIMIT 10;
```

Save pre-migration counts. Verify post-migration counts match.
