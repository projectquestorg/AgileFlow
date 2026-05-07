# PR Checklist Guide

**Load this when:** preparing a pull request, reviewing a PR checklist,
or deciding what checks are required before merge.

## Core PR gates

Every PR should clear these before merge:

| Gate     | Check      | Command            |
| -------- | ---------- | ------------------ |
| Tests    | All pass   | `npm test`         |
| Types    | No errors  | `tsc --noEmit`     |
| Lint     | Clean      | `npm run lint`     |
| Build    | Compiles   | `npm run build`    |
| Coverage | ≥ baseline | `npm run coverage` |

## PR description template

```markdown
## What

[1-3 bullet points describing the change]

## Why

[The motivation — ticket, bug, user request]

## How

[Brief explanation of the approach chosen, especially if non-obvious]

## Test plan

- [ ] Unit tests cover new logic
- [ ] Integration test for the happy path
- [ ] Edge case X tested (explain if non-obvious)

## Screenshots (UI changes only)

[Before/after or just after if new feature]
```

## Size guidelines

| PR size | Lines changed | Review time | Risk      |
| ------- | ------------- | ----------- | --------- |
| Tiny    | < 50          | 5 min       | Low       |
| Small   | 50-200        | 15 min      | Low       |
| Medium  | 200-500       | 30 min      | Medium    |
| Large   | 500-1000      | 1 hour      | High      |
| XL      | > 1000        | Split it    | Very high |

**Rule:** If a PR exceeds 500 lines, look for a natural split. Reviewers lose focus above that threshold — bugs slip through.

### How to split a large PR

1. **Extract prerequisites** — dependency, config, or schema changes as a separate PR
2. **Split by layer** — DB migration PR → API PR → UI PR
3. **Feature flag** — ship dead code first, enable separately
4. **One PR per file cluster** — group related files, ship independently

## Commit message conventions

```
feat: add webhook delivery for Slack notifications
fix: prevent duplicate delivery on retry
refactor: extract delivery queue into separate module
test: add integration tests for webhook retry logic
docs: update delivery configuration reference
chore: bump @slack/web-api to 7.3.0
```

**Never in commit messages:**

- AI attribution footers
- "WIP" or "temp" (clean up before merging)
- Emoji prefixes unless your team convention requires them
- "Fixed bug" with no specifics

## Merge strategies

| Strategy     | When to use          | Pros              | Cons                     |
| ------------ | -------------------- | ----------------- | ------------------------ |
| Squash merge | Feature branches     | Clean history     | Loses individual commits |
| Rebase merge | Linear history teams | Clean graph       | Rewrites SHAs            |
| Merge commit | Long-lived branches  | Preserves context | Noisy history            |

**Default recommendation:** Squash merge for feature/fix branches. Merge commit for release branches.

## Pre-merge checklist for large changes

```
⬜ Self-review: read every line of the diff
⬜ Tests added for new behavior
⬜ Tests updated for changed behavior
⬜ No debug logs left in
⬜ No hardcoded secrets or test credentials
⬜ No commented-out code (delete it or leave it)
⬜ Dependencies bumped in both package.json and lockfile
⬜ Migrations reversible (if schema change)
⬜ Feature flag added (if risk is high)
⬜ Docs updated (if public API changed)
```

## Rollback plan

For high-risk PRs, include in description:

```markdown
## Rollback plan

- Revert commit: `git revert <sha>`
- Migration rollback: `npm run db:rollback`
- Feature flag: set `FF_NEW_CHECKOUT=false` in env
```

## Review SLAs (team norms to set)

| PR size | Response time | Full review time |
| ------- | ------------- | ---------------- |
| Tiny    | 2 hours       | Same day         |
| Small   | 4 hours       | Same day         |
| Medium  | 1 day         | 2 days           |
| Large   | 2 days        | 3 days           |

## When to request additional reviewers

- Touches auth or security → always add security-focused reviewer
- Schema migration → add someone who knows the data model
- Performance-critical path → add performance reviewer
- Public API change → add API owner
- Billing/payment → add a second reviewer minimum
