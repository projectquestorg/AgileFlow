# Rollback Playbook

**Load this when:** Planning a migration rollback, responding to a failed migration, or writing a post-mortem.

## Rollback Decision Tree

```
Is data corruption or data loss occurring?
  YES → STOP migration immediately. Initiate rollback NOW. Skip all other checks.
  NO  ↓

Is a critical user-facing service down or severely degraded?
  YES → Rollback within 15 minutes if no hotfix available.
  NO  ↓

Is the error rate >2x pre-migration baseline AND rising?
  YES → Rollback if no fix identified within 30 minutes.
  NO  ↓

Is the migration >50% complete with no data integrity issues?
  YES → Strongly prefer forward-fix over rollback (rollback cost exceeds benefit).
  NO  ↓

Rollback is an option — evaluate cost vs. benefit.
```

---

## Rollback Triggers by Migration Type

### Schema migration

| Trigger                        | Action                                   |
| ------------------------------ | ---------------------------------------- |
| Query errors on new schema     | Immediate rollback                       |
| Constraint violations in prod  | Immediate rollback                       |
| Performance regression >5x     | Rollback if not resolvable in 1h         |
| Application errors post-deploy | Check if schema-related; rollback if yes |

### Data migration

| Trigger                                | Action                               |
| -------------------------------------- | ------------------------------------ |
| Row count mismatch vs. expected        | STOP. Investigate before proceeding. |
| Checksum / hash validation fail        | STOP. Do not proceed.                |
| Referential integrity errors           | Rollback source data changes         |
| Business logic producing wrong outputs | Rollback and fix migration script    |

### Dependency / library migration

| Trigger                          | Action                               |
| -------------------------------- | ------------------------------------ |
| Test suite failure rate >10%     | Rollback package version             |
| Runtime errors in new dependency | Rollback to previous version         |
| Build failure                    | Rollback, investigate, fix in branch |

---

## Rollback Methods by Layer

| Layer                  | Rollback method                          | Speed           | Data risk      |
| ---------------------- | ---------------------------------------- | --------------- | -------------- |
| Feature flag           | Toggle off                               | Instant         | None           |
| Application code       | Revert deploy                            | 2–5 min         | None           |
| Schema (additive only) | Drop added columns/tables                | Minutes         | None           |
| Schema (destructive)   | Restore from pre-migration snapshot      | 30 min – hours  | Potential loss |
| Data migration         | Restore from backup / run inverse script | Minutes – hours | Potential loss |
| Infrastructure         | Terraform rollback / restore snapshot    | Minutes         | Low–medium     |

---

## Pre-Migration Rollback Preparation Checklist

Complete before every significant migration:

- [ ] Full database backup taken and verified restorable
- [ ] Rollback script written and tested in staging
- [ ] Feature flag created to disable new behavior without code deploy
- [ ] Rollback decision owner named (who has authority to call it)
- [ ] Communication plan drafted (what to say, to whom, via which channel)
- [ ] Monitoring dashboards ready for key metrics
- [ ] Estimated rollback time documented
- [ ] All affected services identified (who else do we notify?)

---

## Communication Templates

### Migration incident (initial)

```
[MIGRATION INCIDENT] {migration name} — {severity}

Status: Rollback in progress / Investigating
Impact: {what's affected — service, users, data}
Started: {time}
Action: {what we're doing right now}

Updates every 15 minutes in #{incident-channel}.
DRI: {name}
```

### Rollback complete

```
[RESOLVED] {migration name} — rollback complete

Rolled back to: v{version} / state as of {timestamp}
Impact duration: {start} → {end}
Affected: {scope}
Root cause (preliminary): {1 sentence}

Post-mortem scheduled: {date/time}
```

---

## Post-Mortem Structure

```markdown
# Post-Mortem: {Migration Name}

**Date:** YYYY-MM-DD
**Severity:** P1 / P2 / P3
**Duration:** {start} → {resolved}
**Impact:** {affected users / data volume / downtime}

## Timeline

| Time  | Event                  |
| ----- | ---------------------- |
| HH:MM | Migration started      |
| HH:MM | First alert triggered  |
| HH:MM | Rollback decision made |
| HH:MM | Rollback complete      |

## Root Cause

[What actually went wrong]

## Contributing Factors

- [Factor 1]
- [Factor 2]

## What Went Well

- [Thing 1]

## Action Items

| Action | Owner | Due |
| ------ | ----- | --- |
|        |       |     |

## Prevention

[How do we ensure this doesn't happen again?]
```

---

## Rollback Risk by Migration Completeness

| % Complete | Rollback recommendation                             |
| ---------- | --------------------------------------------------- |
| 0–20%      | Easy — rollback preferred if issues found           |
| 20–50%     | Evaluate — rollback cost growing                    |
| 50–80%     | Risky — forward-fix preferred unless data corrupted |
| 80–99%     | Very risky — forward-fix strongly preferred         |
| 100%       | Rollback is a new migration — plan carefully        |
