# Release Checklist

**Load this when:** Preparing, executing, or verifying a software release — pre-release gates, deploy steps, and post-release validation.

## Pre-Release Gates

### Code quality

- [ ] All CI checks passing on release branch
- [ ] No critical or high CVEs in `npm audit` / security scan
- [ ] Code review approved by at least one non-author
- [ ] Feature flags set correctly for release scope

### Testing

- [ ] Unit + integration tests passing
- [ ] Smoke tests passing on staging
- [ ] Any manual QA sign-off completed (if required)
- [ ] Regression tests run on affected paths
- [ ] Performance benchmarks within budget (if perf-sensitive change)

### Documentation

- [ ] CHANGELOG updated with version and summary
- [ ] API docs updated if contract changed
- [ ] README version badge / install instructions current
- [ ] Migration guide written if breaking change

### Ops readiness

- [ ] Feature flags configured for gradual rollout (if applicable)
- [ ] Monitoring dashboards prepared for new metrics
- [ ] Runbook updated if new failure modes introduced
- [ ] On-call engineer notified of release window

---

## Release Execution Steps

```
1. Tag the release commit (semver, annotated tag)
2. Push tag to trigger CI publish pipeline
3. Monitor pipeline to completion
4. Verify artifact published (npm, Docker Hub, GitHub Releases, etc.)
5. Deploy to production (manual gate or auto on tag)
6. Run post-deploy smoke tests
7. Watch error rate / latency for 15 minutes
8. Announce in team channel
```

---

## Rollback Triggers

Roll back immediately if within 30 minutes of deploy:

| Signal                       | Threshold               |
| ---------------------------- | ----------------------- |
| Error rate increase          | >2x baseline            |
| 5xx rate                     | >1% of requests         |
| P95 latency                  | >2x pre-deploy baseline |
| Critical user journey broken | Any                     |
| Data corruption detected     | Any                     |
| Payment / auth failure       | Any                     |

Roll back after extended monitoring if:

- Slow error rate increase over 1–4 hours
- Memory leak detected (heap growth without plateau)
- User reports of data inconsistency

---

## Rollback Decision Matrix

| Time since deploy | Error severity | Rollback?                                           |
| ----------------- | -------------- | --------------------------------------------------- |
| <30 min           | Any            | Yes — immediate                                     |
| 30 min–2h         | Critical/High  | Yes                                                 |
| 30 min–2h         | Medium         | Hotfix preferred                                    |
| >2h               | Any            | Hotfix strongly preferred; rollback if data at risk |

**Rollback methods (in order of preference):**

1. Feature flag disable (instant, no deploy)
2. Revert deploy in CD platform (Vercel, Railway, etc.)
3. `git revert` + fast-track deploy
4. Database snapshot restore (last resort, data loss risk)

---

## Post-Release Validation (first 30 minutes)

- [ ] Health endpoint returning 200
- [ ] Error rate at or below pre-release baseline
- [ ] P95 latency within 20% of baseline
- [ ] Critical user journeys functional (smoke test)
- [ ] Log stream clean (no unexpected errors)
- [ ] New feature working as specified (spot check)

---

## Communication Templates

### Release announcement (internal)

```
[RELEASE] v{version} — {title}

What's new: {1–3 bullet summary}
Deployed to: {environment(s)}
Monitoring: {link to dashboard}
Rollback plan: {feature flag / revert method}

Needs attention? Ping @on-call
```

### Incident during release

```
[INCIDENT] Release v{version} — rollback initiated

Impact: {what's affected}
Root cause (preliminary): {hypothesis}
Action taken: {rolled back to v{previous}}
Status: {investigating / resolved}
Updates in: #{incident-channel}
```

---

## Versioning Rules (semver)

| Change type                      | Bump            | Example        |
| -------------------------------- | --------------- | -------------- |
| Bug fix, patch-level             | PATCH           | 1.2.3 → 1.2.4  |
| New feature, backward-compatible | MINOR           | 1.2.3 → 1.3.0  |
| Breaking change                  | MAJOR           | 1.2.3 → 2.0.0  |
| Pre-release                      | Pre-release tag | 2.0.0-alpha.1  |
| Build metadata                   | Build tag       | 1.2.3+build.42 |

**Breaking change examples:** Removed API endpoint, changed required field to required, renamed public method, dropped runtime support (Node version, browser).
