---
name: writing-commits
description: Write accurate commit messages from the actual staged diff and the repository's commit conventions (history style, conventional commits, documented rules such as required or forbidden trailers), without claims the diff or evidence does not support, and flag unrelated or accidental staged changes with a proposed split. Use when the user asks to commit, write or suggest a commit message, or split staged work into commits. Not for opening a pull request (filing-pr), reviewing changes for bugs (reviewing-changes), or pushing.
---

# Writing commits

A commit message is a claim about the diff. Every statement in it must be visible in the staged changes or backed by evidence you actually have.

## Workflow

1. **Read what is staged:** `git status`, `git diff --cached --stat`, then `git diff --cached`. If nothing is staged, say so. If there are also unstaged or untracked changes, do not describe them, and ask before staging them rather than running `git add -A`.
2. **Learn the conventions.** Read recent history (`git log --oneline -20`, and `git log -5 --format=%B` for bodies and trailers): format such as `type(scope): subject`, ticket prefixes, casing, tense, subject length, body wrapping. Check documented rules: a contributing guide, commitlint config, `.gitmessage`, and agent instruction files (`AGENTS.md`, `CLAUDE.md`, and similar). Documented rules override history, and the user's instructions override both.
3. **Check that the staged changes belong together.** If they mix unrelated changes (a fix plus an unrelated refactor or config change), do not hide them behind a vague or "and" message. Name the parts and propose a split: which files or hunks go in which commit, with a message for each. Flag anything that looks accidental, such as debug output, commented-out code, stray lockfile or generated-file changes, or credentials. Restage or split only after the user agrees.
4. **Write the message.** A specific subject in the repository's format that says what the change does ("fix(billing): read discountPercent from the customer record", not "update files"). Add a body only when it helps: why the change was made and what a reader cannot see in the diff, taken from the user's words, an issue, or the code itself.
5. **Commit only when asked to commit,** not when asked for a message. Pass the message exactly (for example with `git commit -F <file>` or several `-m` flags), then show `git log -1 --stat`. If a hook rejects the commit, report its output and fix the cause; do not bypass it.

## Constraints

- No invented claims: do not write "tests pass", "verified", or "no behavior change" unless you ran the check in this session and saw it succeed; no issue numbers, motivations, performance numbers, or impact you cannot point to. If the reason for a change is unknown and matters, ask or leave it out.
- Describe the staged diff, not the conversation: work that was discussed but is not staged does not belong in the message.
- Add trailers (co-authors, sign-off, attribution) only as the repository's rules and the user's instructions require; when they forbid a trailer, omit it.
- Never push, amend, rebase, use `--no-verify`, or rewrite history unless the user explicitly asked.

## Report

The proposed or created message for each commit (with its hash if created), any split you proposed, anything flagged as accidental, and any claim you left out because it could not be verified.

## Done when

Each message matches its staged diff and the repository's conventions and makes no unsupported claims, unrelated or accidental changes were flagged with a proposed split, and a commit was created only if the user asked for one (and nothing was pushed).
