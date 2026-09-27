---
name: working-story
description: Implement a specific AgileFlow Work story end to end, from its acceptance criteria, epic, decisions, and Definition of Done through dependency checks, the smallest complete change, per-criterion verification, and an honest final status. Use when the user asks to work on, implement, pick up, continue, or finish a named story. Not for writing or splitting stories, or for reviewing whether an already implemented story is done.
---

# Working a story

The story says where done is; the codebase says how to get there. Implement the smallest complete solution and prove each acceptance criterion.

## Workflow

1. **Read the story.** `agileflow work show <id> --body` (IDs accept prefixes like `3Q7M`), or the file in `<root>/03-stories/` (`work.root` in `agileflow.yaml`, default `docs/agile`).
2. **Read its epic** if `epic:` is set, and **relevant decisions** in `04-decisions/` (those the story mentions or that relate to its epic). Read the Definition of Done in `00-product/product.md`.
3. **Check dependencies.** For each `depends_on` story that is not `done`, decide whether it truly blocks this work. If it does, set this story to `blocked`, explain why, and stop. If it does not, the metadata is wrong: say so and correct `depends_on` rather than obeying it blindly.
4. **Set the story to `in-progress`:** `agileflow work status <id> in-progress`, or change only the `status:` line in the frontmatter.
5. **Inspect the codebase** around the behavior the story describes, and follow its existing patterns.
6. **Implement the smallest complete solution** that satisfies every acceptance criterion and constraint. No scope creep: note unrelated problems instead of fixing them.
7. **Verify against every acceptance criterion** with evidence: run the relevant tests, add tests for new behavior, or exercise the behavior directly. Compiling is not evidence.
8. **Check a criterion (`- [x]`) only after verifying it.** Leave anything you could not verify unchecked and say why.
9. **Move to the right final state** using the Definition of Done and project context: `in-review` when a PR review or merge is still required, `done` only when every criterion is verified and nothing else in the Definition of Done remains. If you cannot finish, leave it `in-progress` (or `blocked`) and report what remains.

## Constraints

- Planning questions belong to story writing. Once a story is `ready`, ask only when a missing product decision truly blocks the work, and point out that the story was not ready.
- Do not automatically create a PR, decision records, implementation plans, progress logs, status files, or release notes, and do not run every audit or test suite you can find. Use other installed skills (verifying, filing a PR) only when relevant or asked.
- Edit only this story's file among the Agile artifacts; one agent owns one story at a time.
- Keep the story as written: in the frontmatter change only `status` (and `depends_on` when step 3 shows it is wrong); in the body only check verified criteria.

## Done when

The requested behavior is implemented, each acceptance criterion is either checked with evidence or explicitly reported as unverified, and the story's status reflects reality (`in-review`, `done`, `blocked`, or still `in-progress` with what remains).
