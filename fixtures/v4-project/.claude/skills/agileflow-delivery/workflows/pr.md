# PR Workflow — Pull Request Description Generator

**Triggers:** "create a PR", "generate PR description", "I'm opening a pull request for US-XXXX", "write the PR body", "PR for this story"

**Goal:** Generate a complete, paste-ready GitHub pull request description from the story file — including summary, linked issues, AC checklist, test evidence, and risk assessment.

## Inputs needed

| Input                  | Required | How to get it                                                                   |
| ---------------------- | -------- | ------------------------------------------------------------------------------- |
| story ID               | Yes      | Ask: "Which story is this PR for? (e.g., US-0042)"                              |
| PR title               | No       | Defaults to story summary                                                       |
| AC verification states | No       | Ask which ACs have been verified                                                |
| test evidence          | No       | Ask: "Any test evidence to include? (file paths, screenshots, test run output)" |
| notes                  | No       | Any additional context for the reviewer                                         |

## Steps

1. Ask for the story ID if not provided.

2. Read the story file from `docs/06-stories/<STORY>.md`. Extract — never guess:
   - Epic reference
   - Story summary and full description
   - Dependencies on other stories
   - Acceptance criteria (exact text, in order)
   - Owner/assignee

3. Ask the user: "Which acceptance criteria have you verified?" Present the list of ACs and let them mark each as verified or pending.

4. Ask: "Any test evidence to include? Paste test run output, file paths, or screenshot descriptions."

5. Generate the PR description in GitHub markdown:

   ```
   ## <STORY>: <TITLE>

   ### Summary
   [2–3 paragraphs from story description + any user notes]

   ### Linked Issues
   - #<STORY>
   - #<DEP1> (if dependencies exist)

   ### Acceptance Criteria
   - [x] Verified criterion
   - [ ] Pending criterion

   ### Test Evidence
   [Formatted bullets with paths or links]

   ### Risk Assessment
   [Bullet list of potential risks + rollback approach]
   ```

6. Show the PR description for review. Ask the user: [A] This looks good — copy it, [B] Adjust the title, [C] Add more test evidence, [D] Change which ACs are checked.

7. If the user wants to open the PR from the CLI, run `gh pr create` with the generated title and body. If not, the description is ready to paste into GitHub.

8. Suggest the conventional commit type for the merge: `feat:` for new functionality, `fix:` for bug fixes, `chore:` for maintenance.

## Output

Paste-ready PR description in GitHub markdown. Optional: PR opened via `gh pr create`. Conventional commit type suggested.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Save and continue
2. Review before saving
3. Discard
```
