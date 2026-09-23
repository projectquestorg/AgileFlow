---
name: filing-pr
description: Open a pull request for the current branch with a title that follows repository conventions and a description that leads with the problem, summarizes the solution, and includes verification evidence, then return the PR URL. Use when the user asks to file, open, create, raise, or submit a pull request (PR). Not for reviewing an existing PR or monitoring one through CI.
---

# Filing a PR

## Workflow

1. **Confirm the branch and diff.**
   - Check the current branch and the base branch (usually the repository's default branch). If on the default branch itself, stop and ask whether to create a feature branch.
   - Check for uncommitted changes. Ask whether they belong in the PR rather than silently committing or ignoring them.
   - Read the commits and diff against the base (`git log <base>..HEAD`, `git diff <base>...HEAD`) so the description reflects everything in the PR, not only the latest commit.
2. **Check whether a PR already exists** for this branch (e.g. `gh pr view` / `gh pr list --head <branch>`). If one exists, return its URL and ask whether to update it instead of opening a duplicate.
3. **Follow repository title conventions.** Look at recent merged PR titles and commit messages, and any contributing guide or PR template. Match the style (conventional commits, ticket prefixes, casing). If a PR template exists, fill it in rather than replacing it.
4. **Lead with the problem.** Open the description with what was wrong or missing and why it matters, in one to three sentences.
5. **Explain the solution briefly.** Describe the approach and any notable decisions or trade-offs. Do not narrate the diff file by file.
6. **Include relevant verification evidence.** State what was actually run (tests, commands, manual checks) and the result. If something was not verified, say so. Do not claim tests pass unless they were run.
7. **Create the PR.** Push the branch with upstream tracking if needed, then create the PR against the correct base. Use draft status only if the user asked or the work is clearly incomplete.
8. **Return the URL** to the user, plus one line on anything that needs their attention (unverified parts, open questions).

## Constraints

- Follow the repository's and user's rules about commit and PR attribution footers; if they forbid AI attribution, omit it.
- Do not add reviewers, labels, or assignees unless the user asked or the repository clearly requires them.
- Never force-push or rewrite history to prepare the PR without explicit permission.
- Keep the description short. Reviewers read the diff; the description provides context the diff cannot.

## Done when

The PR exists against the correct base branch with a convention-following title and a problem-first description that includes verification evidence, and its URL has been returned to the user (or an existing PR's URL was returned instead of creating a duplicate).
