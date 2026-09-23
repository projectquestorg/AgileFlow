---
name: resolving-conflicts
description: Resolve git merge, rebase, cherry-pick, or stash conflicts by understanding the intent of both sides and producing a combined result that preserves both behaviors where compatible, then verifying and completing the operation. Use when a merge or rebase stops with conflicts, files contain conflict markers, or the user asks to fix, resolve, or get through merge conflicts.
---

# Resolving conflicts

Merge intent, not text. Neither side is right by default.

## Workflow

1. **Establish the situation.** Determine which operation is in progress (merge, rebase, cherry-pick, stash pop, revert) and which side is which. During a rebase, "ours" is the branch being rebased onto and "theirs" is your commit being replayed; say this explicitly when it matters. List the conflicted files (`git status`, `git diff --name-only --diff-filter=U`).
2. **Understand both sides' intent** for each conflict before editing:
   - read the commits that changed the region on each side (`git log --oneline <base>..<side> -- <file>`, `git show <commit>`);
   - where useful, compare each side against the merge base (`git diff <merge-base> <side> -- <file>`, or enable `diff3`/`zdiff3` conflict style to see the base inline).
3. **Resolve each hunk:**
   - If the changes are independent, keep both.
   - If both modify the same logic, write a combined version that preserves both behaviors.
   - If they genuinely contradict (one side deletes what the other extends, or they encode incompatible behavior), stop and ask the user which intent wins, explaining the trade-off. When structured user-question tooling is available, prefer it for this choice; otherwise ask concisely in normal text.
4. **Handle non-textual conflicts correctly:**
   - Lockfiles and generated files: take one side, then regenerate with the project's tool rather than hand-merging.
   - Renames/deletions: check whether the other side's edits need to move to the new location.
   - Check for semantic conflicts that git did not flag: a renamed function still called by the old name in newly merged code, changed signatures, duplicate imports or definitions.
5. **Verify.** Search for leftover markers (`<<<<<<<`, `=======`, `>>>>>>>`) across the repository, then run the build/type-check and the tests relevant to the conflicted files.
6. **Complete or hand back.** Stage the resolved files and continue the operation (`git merge --continue`, `git rebase --continue`, and so on), repeating for each rebase step. If you stop before completion, leave the repository in a clear state and tell the user exactly what remains.

## Constraints

- Never blindly resolve with `--ours`/`--theirs` or "accept all" for a whole file unless you have confirmed one side's change is fully superseded.
- Do not widen scope: no refactors, formatting sweeps, or unrelated fixes while resolving.
- Do not run `git merge --abort`, `git rebase --abort`, `git reset --hard`, or force-push without explicit permission.
- Do not commit with failing verification without telling the user.

## Report

For each conflicted file, one line on how it was resolved (kept both, combined, chose one side and why). Then the verification run and the final state of the operation.

## Done when

No conflict markers remain, the build and tests relevant to the conflicted files pass, and the merge/rebase/cherry-pick is completed, or it is clearly handed back to the user with the exact remaining steps and any decision they need to make.
