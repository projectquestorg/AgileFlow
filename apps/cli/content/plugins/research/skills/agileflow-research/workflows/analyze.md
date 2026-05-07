# Analyze Workflow — Implement Saved Research

**Triggers:** "analyze my research on X", "I want to implement what I researched", "revisit that research", "turn the research into a plan", user references a specific research file

**Goal:** Take a saved research note and produce a project-specific implementation analysis with multi-expert validation, then optionally create an artifact to track the work.

## Inputs needed

| Input         | Required | How to get it                                        |
| ------------- | -------- | ---------------------------------------------------- |
| research file | No       | Ask the user to pick from the index if not specified |

## Steps

1. If no file is specified, list `docs/10-research/*.md` sorted by most recent first. Ask the user which note to analyze. If an active story or epic in the project relates to a research topic, highlight that file as recommended.

2. Check the file size before reading. For files under 50k characters, read directly. For larger files (50k+), extract only the relevant sections: Summary, Key Findings, Implementation Approach.

3. Display a brief summary of the research: key findings, action items, import date.

4. Ask the user: [A] Run implementation ideation with domain experts (recommended — maps findings to your codebase), [B] View the full research note, [C] Skip for now.

5. If implementation ideation is chosen, auto-detect the research type from the topic and content keywords. Select 3–5 domain experts based on the detected type:
   - Security keywords (auth, oauth, jwt, encryption, vulnerability) → security, api, testing, compliance
   - Performance keywords (cache, optimize, latency, throughput, benchmark) → performance, database, api, monitoring
   - Architecture keywords (migrate, upgrade, framework, refactor, redesign) → api, database, performance, security
   - UI keywords (component, styling, accessibility, ux, design system) → ui, api, testing, accessibility
   - Database keywords (schema, migration, query, index, model) → database, api, performance, datamigration
   - Default (unclear or multi-domain) → api, ui, database, testing, security

6. Deploy all selected experts simultaneously. Give each expert: the research topic and summary, the project context (read `package.json`, `README.md`, or `CLAUDE.md`), and their domain-specific analysis task (implementation fit, domain considerations, recommended approach with specific file paths, risks and effort estimate).

7. Collect all expert outputs. Synthesize:
   - HIGH CONFIDENCE steps: 2+ experts agree on the same approach or files
   - MEDIUM CONFIDENCE: 1 expert with specific evidence
   - Aggregate effort estimates (show range)
   - Collect all risks, ordered by frequency across experts
   - Determine artifact recommendation based on scope: ADR if experts discuss trade-offs or one-time decisions; Epic+Stories if 5+ files across multiple domains; Story if single focus area; Practice doc if guidelines/patterns only

8. Present the Implementation Ideation Report: high-confidence steps, domain-specific considerations, risks table, effort summary, recommended artifact.

9. Ask the user: [A] Create the recommended artifact (recommended), [B] Modify the approach first, [C] Save the analysis to the research file, [D] Cancel.

10. If artifact creation is confirmed, create the appropriate artifact and confirm with file paths. The implementation plan is now tracked with expert-validated guidance.

## Output

Implementation Ideation Report displayed. Optional artifact (ADR/Epic/Story/Practice doc) created. If user chooses save-only, the analysis is appended to the research file.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Save and continue
2. Review before saving
3. Discard
```
