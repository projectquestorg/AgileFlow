---
name: babysitting-pr
description: Monitor a pull request through CI and review feedback, fixing real failures and verified review findings until required checks are green and no actionable feedback or merge blocker remains. Use when the user asks to watch, monitor, shepherd, or babysit a PR until it is ready or green. Not for opening a new PR or doing a one-off code review.
---

# Babysitting a PR

Drive one PR to a defined ready state, then stop.

## Setup

- Identify the PR (number, URL, or the current branch's PR) and its original goal from the title and description. That goal is the scope boundary for everything that follows.
- Record the current head commit. Feedback is judged against it.

## Loop

Repeat until the done condition below is met:

1. **Check status:** required checks, review decisions, unresolved review threads, and mergeability (e.g. `gh pr view --json ...`, `gh pr checks`, the review comments API).
2. **Act only on findings newer than the latest push**, or older ones that still apply to the current head. Skip comments already addressed by a later commit.
3. **Verify findings before changing code.** Read the referenced code and confirm the problem is real. Reviewers and bots are sometimes wrong; if a finding is incorrect, reply with the evidence instead of changing code.
4. **Fix real issues** with focused commits, verify locally where practical, and push.
5. **Classify CI failures before fixing:**
   - **Repository failures** (test, lint, type, build errors caused by the code): fix them.
   - **Infrastructure flakes** (runner timeouts, network errors, rate limits, known-flaky jobs unrelated to the diff): re-run the job once. If it fails the same way again, report it rather than altering code to appease it.
6. **Keep the branch current when needed:** update from the base branch only when it is behind in a way that blocks merging or causes conflicts. Follow the repository's merge-versus-rebase convention; never force-push without permission.
7. **Wait efficiently** between rounds. Prefer a blocking watch (e.g. `gh pr checks --watch`) or the host's background/monitor capability over tight polling loops.

## Constraints

- Do not let review feedback expand the PR beyond its original goal. Out-of-scope requests get a reply suggesting a follow-up, not a code change, unless the user says otherwise.
- Do not disable, skip, or weaken tests or checks to get green.
- Do not merge the PR, dismiss reviews, or resolve other people's threads unless the user asked for that.
- Stop and ask the user when a decision is theirs: conflicting reviewer requests, design disagreements, a required approval that only a human can give, or a failure you cannot fix.

## Done when

- all required checks are green on the current head;
- all actionable feedback against the current head is resolved (fixed, or answered with evidence);
- no known merge blocker remains (conflicts, required reviews, branch out of date), other than approvals only a human can give, which are reported to the user.

Then report: final status, what was fixed, what was declined and why, and anything waiting on a human.
