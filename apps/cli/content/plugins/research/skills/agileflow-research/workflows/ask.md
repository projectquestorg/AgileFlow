# Ask Workflow — Research Prompt Generation

**Triggers:** "I need to research X", "generate a research prompt", "help me ask ChatGPT about", "I'm stuck on X", "create a prompt for Perplexity"

**Goal:** Produce a detailed, context-rich prompt the user can paste into an external AI tool (ChatGPT, Perplexity, Claude web, Gemini) and get actionable results.

## Inputs needed

| Input                 | Required | How to get it                                      |
| --------------------- | -------- | -------------------------------------------------- |
| topic                 | Yes      | Ask the user if not stated                         |
| error message         | No       | Ask: "Is there an exact error? Paste it verbatim." |
| what was tried        | No       | Ask: "What have you already attempted?"            |
| relevant source files | Yes      | Read from codebase — do not skip                   |

## Steps

1. Ask the user for the topic if not already provided.

2. Read relevant files from the codebase:
   - `package.json` or `pyproject.toml` for framework and dependency versions
   - Source files related to the topic (read at least 50 lines of actual code)
   - `README.md` or `CLAUDE.md` for project context

3. Ask the user: "Is there an exact error message? Paste it verbatim." If yes, include it exactly as given — never paraphrase errors.

4. Ask the user: "What have you already tried? List at least 2 approaches and what happened with each."

5. Generate the research prompt with these mandatory sections in order:
   - **Project Context** — framework, key dependencies with versions, relevant files
   - **Current Implementation** — 50+ lines of actual code from the codebase (not pseudocode)
   - **The Problem** — exact error message verbatim, expected vs actual behavior, steps to reproduce
   - **What We've Already Tried** — 2+ approaches with what happened and why each didn't work
   - **Specific Questions** — 3+ precise, contextualized questions (not "how do I fix this?")
   - **What I Need** — root cause analysis, step-by-step solution with exact code, gotchas
   - **Environment Details** — Node/Python version, OS, tool versions

6. Validate the prompt before showing it:
   - Is it 200+ lines? If not, add more code and context.
   - Does it include 50+ lines of actual code? If not, read more files.
   - Does it have the exact error verbatim (if applicable)?
   - Does it list 2+ attempts?
   - Does it have 3+ specific questions?
     If any check fails, gather the missing information and regenerate — do not show an incomplete prompt.

7. Display the prompt inside a code block so the user can copy it. End with: "Copy this and paste it into ChatGPT, Perplexity, or Claude web. When you get results, let me know and I'll save them."

8. Present the user with these options: [A] Copy and go (no further action), [B] Save the prompt to `docs/10-research/prompts/YYYYMMDD-prompt-<topic-slug>.md` and update the research index, [C] Regenerate with more detail.

## Output

The prompt is displayed for copy/paste. If the user chooses to save: write to `docs/10-research/prompts/YYYYMMDD-prompt-<topic-slug>.md` and add a row to `docs/10-research/README.md` (Type = Prompt). After the user gets results from the external AI, hand off to the import workflow.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Save and continue
2. Review before saving
3. Discard
```
