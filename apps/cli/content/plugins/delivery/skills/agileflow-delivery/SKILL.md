---
name: agileflow-delivery
version: 1.0.0
category: agileflow/delivery
description: |
  Use when the user is preparing to ship: creating a PR, running CI,
  managing dependencies, generating a changelog, planning a sprint,
  or setting up deployment. Covers the full delivery pipeline from
  PR description to production.
triggers:
  keywords:
    - create pr
    - pull request
    - ship it
    - deploy
    - ci pipeline
    - changelog
    - release
    - dependencies
    - sprint planning
    - ready to merge
    - npm audit
    - dependency update
  priority: 55
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/delivery.yaml
  maxEntries: 30
depends:
  skills: []
  plugins: [delivery]
---

# AgileFlow Delivery

End-of-story delivery toolkit: write the PR, run CI, check dependencies,
generate changelog entries, plan sprints, and coordinate deployment.

## When this skill activates

- User says "create a PR", "ship it", or "ready to merge"
- User asks about CI failures or deployment setup
- User wants a changelog entry or release notes
- User needs dependency auditing or updates
- User is planning a sprint or tracking velocity

## Capabilities

| Command                | What it does                                         |
| ---------------------- | ---------------------------------------------------- |
| `/agileflow:pr`        | Write PR title, summary, and test plan from git diff |
| `/agileflow:ci`        | Set up or fix CI workflows                           |
| `/agileflow:deploy`    | Deployment guide and checklist                       |
| `/agileflow:changelog` | Generate changelog entry from commits                |
| `/agileflow:deps`      | Dependency audit and update recommendations          |
| `/agileflow:packages`  | Package management and version pinning               |
| `/agileflow:sprint`    | Sprint planning and story point estimation           |
| `/agileflow:devops`    | DevOps automation and infrastructure                 |

## PR workflow

1. Confirm tests pass and AC verified before opening PR
2. Run `/agileflow:pr` — it reads git diff and generates title + body
3. Check: does the PR description explain the WHY, not just the WHAT?
4. Include test plan checklist in the PR body

## Delivery checklist

```
⬜ Tests passing
⬜ AC verified
⬜ Logic audit clean (or findings accepted)
⬜ PR description written
⬜ CI green
⬜ Dependencies up to date
```

## References

Load these files when you need deeper context for the relevant task:

| File                                   | When to load                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `references/pr-checklist-guide.md`     | Creating or reviewing a PR — size guidelines, merge strategies, pre-merge checklist       |
| `references/changelog-format-guide.md` | Writing a changelog entry or release notes — Keep a Changelog format, good vs bad entries |
| `references/ci-pipeline-guide.md`      | Setting up or debugging a CI pipeline — stages, caching, parallelization strategies       |
| `references/release-checklist.md`      | Preparing a release — pre/post release gates, rollback triggers, communication templates  |

## Workflows

Follow these step-by-step when the user initiates the matching action:

| File                     | When to follow                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `workflows/pr.md`        | User wants to create a pull request — gathers diff, writes title and body, checks gates |
| `workflows/changelog.md` | User wants to generate a changelog entry from recent commits                            |
| `workflows/deploy.md`    | User is deploying — environment checks, deploy steps, post-deploy verification          |
