# Import Workflow — Save External Research

**Triggers:** "I have research to import", "save these results", "I got an answer from ChatGPT", "paste research findings", "import this article", user pastes a large block of text with findings

**Goal:** Format external research or AI-generated answers into structured markdown, save to the project knowledge base, and optionally run multi-expert implementation analysis.

## Inputs needed

| Input      | Required | How to get it                                      |
| ---------- | -------- | -------------------------------------------------- |
| topic      | Yes      | Ask the user: "What topic is this research about?" |
| content    | Yes      | Ask: "Please paste the research results below."    |
| source URL | No       | Ask: "Do you have a source URL?"                   |

## Steps

1. If the topic is not provided, ask: "What topic is this research about?"

2. If content is not provided, ask the user to paste the research results. Accept: AI-generated answers, article text, YouTube transcripts, blog posts, meeting notes, documentation excerpts.

3. Extract from the content:
   - A 2–3 paragraph executive summary
   - Key findings as bullet points
   - Any code snippets (preserve these exactly — do not reformat or clean up)
   - Concrete action items
   - Potential story suggestions if the content implies feature work
   - Risks or gotchas mentioned

4. Format as structured markdown:

   ```
   # [Topic Title]
   Import Date / Topic / Source / Content Type
   ## Summary
   ## Key Findings
   ## Implementation Approach
   ## Code Snippets   ← copied verbatim
   ## Action Items
   ## Risks & Gotchas
   ## Story Suggestions
   ## References
   ```

5. Show the formatted file to the user before saving. Present the user with these options: [A] Save to `docs/10-research/` (recommended), [B] Make changes first.

6. If confirmed, generate the filename as `YYYYMMDD-<topic-slug>.md` and write to `docs/10-research/`. Then add a row to `docs/10-research/README.md` (5-column format: Date | Topic | Type | Path | Summary). Always update the index — never skip this step.

7. After saving, present the user with these options: [A] Run implementation ideation — deploy 3–5 domain experts in parallel to analyze how this research applies to the codebase (recommended if content suggests changes), [B] Save as reference for later, [C] Link to an active Epic or Story.

8. If the user chooses implementation ideation: auto-detect the research type from keywords in the content (security keywords → security/api/testing experts; performance keywords → performance/database/api/monitoring experts; architecture keywords → api/database/performance/security experts; default → api/ui/database/testing/security). Deploy all selected experts simultaneously. Each expert analyzes: implementation fit in the codebase, domain-specific considerations, recommended approach with specific file paths, risks and effort estimate. Synthesize results with confidence scoring — HIGH means 2+ experts agree. Present the Implementation Ideation Report, then ask whether to create an artifact (ADR for architecture decisions, Epic+Stories for large features spanning multiple files, Story for focused tasks, Practice doc for guidelines).

## Output

Research saved to `docs/10-research/YYYYMMDD-<topic-slug>.md`. Index updated. Optional: implementation ideation report and artifact (ADR/Epic/Story) created based on expert consensus.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Save and continue
2. Review before saving
3. Discard
```
