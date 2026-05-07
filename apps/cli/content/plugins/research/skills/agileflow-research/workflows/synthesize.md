# Synthesize Workflow — Cross-Research Analysis

**Triggers:** "synthesize my research on X", "what do my research notes say about", "find patterns across research", "combine findings from multiple notes", "what's the consensus on"

**Goal:** Query across multiple research files to find consensus findings, unique insights, conflicts, and technology patterns — then optionally generate an implementation plan.

## Inputs needed

| Input         | Required | How to get it                                    |
| ------------- | -------- | ------------------------------------------------ |
| topic keyword | No\*     | Ask if neither topic nor files are provided      |
| file list     | No\*     | Comma-separated filenames in `docs/10-research/` |

\*At least one of topic or file list is required.

## Steps

1. If neither a topic nor a specific file list is provided, ask the user: "What topic should I search across your research notes?" Options: [A] Enter a topic keyword, [B] Show the full research index first, [C] Synthesize all research.

2. If a topic keyword is given, search all files in `docs/10-research/` — check filename, title header, Summary section, and Key Findings section. List matching files with date, title, and a one-line summary.

3. If 5 or fewer files match, proceed automatically. If 6 or more match, ask the user: [A] Analyze all N files, [B] Let me pick specific files, [C] Try a narrower search term.

4. For each selected file, extract:
   - Date (from filename YYYYMMDD prefix)
   - Title (first `#` header)
   - Summary (first paragraph of the Summary section)
   - Key Findings (bullet list)
   - Recommended Approach section if present
   - Technologies mentioned
   - Related ADRs, Stories, Epics
   - Age in days

5. Analyze across all files:
   - **Consensus (HIGH):** same finding appears in 2+ files — mark with the source files
   - **Unique (VERIFY):** finding only in 1 file — note age, flag for review if old
   - **Conflict (NEEDS REVIEW):** different files recommend different approaches for the same topic — flag both positions

6. Present the Synthesis Report:
   - Files Analyzed (table with date, title, status, age)
   - Consensus Findings (HIGH CONFIDENCE) with source files
   - Unique Insights (VERIFY) with age assessment
   - Conflicts Detected (NEEDS REVIEW) with resolution suggestion
   - Technology Patterns (table of technology, mention count, first/most recent date)
   - Related Artifacts (ADRs, Stories, Epics referenced across files)
   - Timeline (oldest → newest)

7. Present the user with these options: [A] Run implementation ideation with domain experts (recommended if consensus findings suggest actionable changes), [B] Save synthesis report to `docs/10-research/YYYYMMDD-synthesis-<slug>.md`, [C] Flag conflicts for review, [D] Search a different topic.

8. If implementation ideation is chosen, follow the same multi-expert pattern as the import workflow: detect research type from synthesis content, deploy 3–5 experts in parallel, synthesize with confidence scoring, present Implementation Ideation Report, recommend artifact type.

## Output

Synthesis report displayed inline. Optionally saved to `docs/10-research/YYYYMMDD-synthesis-<slug>.md` with a row added to the research index (Type = Synthesis). Optional: implementation ideation report and artifact.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Save and continue
2. Review before saving
3. Discard
```
