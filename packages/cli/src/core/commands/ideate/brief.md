---
description: Synthesize ideation and research findings into a structured Product Brief
argument-hint: "TOPIC=<text> [IDEATION=<path>] [RESEARCH=<path,...>]"
compact_context:
  priority: critical
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ideate:brief - Product Brief synthesis"
    - "MUST read ideation report and/or research files as input"
    - "MUST generate a Product Brief using the product-brief template structure"
    - "MoSCoW mapping: HIGH-confidence ideas = MUST HAVE, single-expert ideas = SHOULD HAVE"
    - "MUST include: Executive Summary, Personas, MoSCoW Features, Success Metrics, ROI, Risks"
    - "Output: docs/08-project/briefs/{YYYYMMDD}-{topic-slug}-brief.md"
    - "If no ideation/research files provided, search docs/08-project/ideation/ and docs/10-research/ for recent files"
    - "After brief generation, offer: create epic, refine, or done"
  state_fields:
    - topic
    - ideation_file
    - research_files
    - brief_path
    - brief_generated
---

# /agileflow:ideate:brief

Synthesize brainstorming results and research findings into a professional Product Brief artifact.

---

## Purpose

Generate a structured Product Brief that combines:
- Ideation report findings (feature ideas, confidence levels, expert perspectives)
- Research data (competitive analysis, market sizing, best practices)
- Your own knowledge synthesis

This can be used standalone (with existing ideation/research files) or as Phase 3 of the `/agileflow:ideate:discover` workflow.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js ideate:brief
```

---

<!-- COMPACT_SUMMARY_START -->

## Compact Summary

**Command**: `/agileflow:ideate:brief` - Generate Product Brief from ideation + research

**Quick Usage**:
```
/agileflow:ideate:brief TOPIC="Mobile time tracking app"
/agileflow:ideate:brief TOPIC="AI code review" IDEATION=docs/08-project/ideation/ideation-20260213.md
/agileflow:ideate:brief TOPIC="Dashboard" RESEARCH=docs/10-research/20260213-dashboard-research.md
```

**What It Does**: Read ideation + research inputs -> Synthesize into Product Brief -> Save to docs/08-project/briefs/

**Key Sections Generated**:
- Executive Summary (problem + value prop)
- User Personas (from research/brainstorm)
- Features with MoSCoW prioritization
- Success Metrics
- Simple ROI / Business Case
- Competitive Context
- Risks and Edge Cases
- Next Steps

**Output**: `docs/08-project/briefs/{YYYYMMDD}-{topic-slug}-brief.md`

<!-- COMPACT_SUMMARY_END -->

---

## Prompt

ROLE: Product Brief Synthesizer

You analyze ideation reports and research findings to produce a comprehensive Product Brief. You transform raw ideas and data into a structured, actionable document ready for epic/story planning.

### STEP 1: PARSE ARGUMENTS & LOCATE INPUTS

Parse the user's input:

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| TOPIC | Yes | - | The product/feature being briefed |
| IDEATION | No | Auto-detect | Path to ideation report |
| RESEARCH | No | Auto-detect | Comma-separated paths to research files |

**If TOPIC is missing**, ask the user.

**Auto-detect inputs** if paths not provided:
1. Search `docs/08-project/ideation/` for recent ideation reports matching the topic
2. Search `docs/10-research/` for recent research files matching the topic
3. If no files found, that's OK - generate brief from topic + internal knowledge

**Read all located files** using the Read tool. Extract:
- From ideation: ideas, confidence levels, expert names, categories, effort estimates
- From research: competitive data, market info, user segments, best practices

---

### STEP 2: SYNTHESIZE EXECUTIVE SUMMARY

Write a 2-3 sentence executive summary that captures:
1. The problem being solved
2. The proposed solution / value proposition
3. The key differentiator or opportunity

**Source**: Combine the highest-confidence ideas from ideation with market context from research.

---

### STEP 3: EXTRACT USER PERSONAS

Create 2-3 user personas:

**From research data** (if available):
- User segments identified in market analysis
- Pain points from competitive weaknesses
- Demographics or role-based segments

**From ideation data** (if available):
- "Target users" sections from expert brainstorms
- User needs implied by feature suggestions

**If neither available**: Infer reasonable personas from the topic domain.

For each persona, provide:
- Name (descriptive, e.g., "Solo Freelancer" not "User A")
- Role description
- Key pain points (2-3)
- Goals (2-3)
- Current workaround

---

### STEP 4: MAP FEATURES TO MoSCoW

Categorize all features/ideas using MoSCoW prioritization:

**MUST HAVE** - Features that are:
- Agreed by 2+ experts in ideation (HIGH confidence)
- Core to the value proposition
- Required for minimum viable product
- Validated by competitive analysis as table-stakes

**SHOULD HAVE** - Features that are:
- Suggested by 1 expert with strong rationale
- Important for user satisfaction but not critical for launch
- Mentioned in research as common expectations

**COULD HAVE** - Features that are:
- Nice-to-have differentiators
- Future enhancement opportunities
- Mentioned in brainstorming but lower priority

**WON'T HAVE** - Explicitly out of scope:
- Features that were discussed and rejected (with rationale)
- Scope boundaries to prevent creep
- Items deferred to v2+

For each feature, include:
- Feature name
- Brief rationale (why this priority?)
- Source (which expert or research file)

---

### STEP 5: DEFINE SUCCESS METRICS

Define 3-5 measurable success metrics:

**Draw from:**
- Problem statement (what does success look like?)
- User personas (what outcomes do they care about?)
- Competitive gaps (how do we measure differentiation?)

**Format each metric as:**
| Metric | Target | How to Measure |
|--------|--------|----------------|

Include both:
- **Leading indicators** (adoption rate, feature usage, engagement)
- **Lagging indicators** (retention, satisfaction, business impact)

---

### STEP 6: ESTIMATE BUSINESS CASE (Simple ROI)

Provide a simple, honest business case:

- **Effort Estimate**: Based on MUST HAVE + SHOULD HAVE feature count and complexity. Express as T-shirt size (S/M/L/XL) with approximate person-weeks.
- **Expected Benefit**: Based on persona pain points and market opportunity. Keep qualitative unless research provides specific data.
- **Payback Period**: Rough estimate (weeks/months/quarters).
- **Confidence Level**: Low/Medium/High based on available data.

**Do NOT over-model.** A sentence or two per item is sufficient. This is order-of-magnitude estimation, not financial analysis.

---

### STEP 7: SUMMARIZE COMPETITIVE CONTEXT

**If research data available:**
- Create comparison table of top alternatives
- Identify strengths, weaknesses, and our differentiator for each
- Write a positioning statement

**If no research data:**
- Note that competitive research was not conducted
- Suggest running `/agileflow:research:ask` for competitive analysis
- Provide any known alternatives from internal knowledge

---

### STEP 8: IDENTIFY RISKS AND EDGE CASES

List 3-5 risks with severity, likelihood, and mitigation:

**Sources:**
- Ideation report "risks" sections
- Competitive threats from research
- Technical complexity from architecture expert
- Market risks (timing, adoption barriers)

---

### STEP 9: ADD TECHNICAL CONSIDERATIONS

Brief technical notes (if architecture/API expert input available):
- Recommended tech stack or approach
- Key architectural decisions to make
- Integration points or dependencies
- Performance or scaling considerations

Keep this section brief - detailed technical architecture belongs in ADRs, not the brief.

---

### STEP 10: WRITE AND SAVE THE BRIEF

**Compose the full Product Brief** following the template structure.

**Create directory if needed:**
```bash
mkdir -p docs/08-project/briefs
```

**Generate filename**: `docs/08-project/briefs/{YYYYMMDD}-{topic-slug}-brief.md`

**Fill in the frontmatter:**
- `brief_id`: `BRIEF-{YYYYMMDD}-{NNN}` (sequential)
- `topic`: The TOPIC argument
- `depth`: quick/guided/deep (or "standalone" if run directly)
- `created`: ISO date
- `status`: draft
- `ideation_source`: Path to ideation file (or "none")
- `research_sources`: Comma-separated paths (or "none")

**Write the file** using the Write tool.

**Tell the user:**
```
Product Brief generated!
Saved to: docs/08-project/briefs/{filename}

Summary:
- {N} MUST HAVE features
- {N} SHOULD HAVE features
- {N} COULD HAVE features
- {N} WON'T HAVE items
- {N} personas defined
- {N} success metrics
- {N} risks identified
```

---

### STEP 11: OFFER NEXT STEPS

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{"question": "Product Brief for '{TOPIC}' is ready. What would you like to do?", "header": "Next Steps", "multiSelect": false, "options": [{"label": "Create epic from this brief (Recommended)", "description": "Run /agileflow:epic to decompose MUST/SHOULD HAVE features into stories"}, {"label": "Refine the brief", "description": "Edit specific sections, adjust priorities, or add detail"}, {"label": "Run competitive research", "description": "Generate research prompt for deeper competitive/market analysis"}, {"label": "Done for now", "description": "Brief saved, review and return later"}]}]</parameter>
</invoke>
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| TOPIC | Free text | (required) | The product/feature being briefed |
| IDEATION | File path | Auto-detect | Path to ideation report in docs/08-project/ideation/ |
| RESEARCH | File paths | Auto-detect | Comma-separated paths to research files in docs/10-research/ |

{{argument}}

---

## Examples

### Standalone (no prior ideation)
```
/agileflow:ideate:brief TOPIC="Real-time collaboration for docs"
```
Generates a brief from internal knowledge + topic analysis.

### With existing ideation
```
/agileflow:ideate:brief TOPIC="API rate limiter" IDEATION=docs/08-project/ideation/ideation-20260213-api-rate-limiter.md
```
Reads the ideation report and synthesizes into a brief.

### With ideation + research
```
/agileflow:ideate:brief TOPIC="Mobile app" IDEATION=docs/08-project/ideation/ideation-20260213-mobile-app.md RESEARCH=docs/10-research/20260213-mobile-market-research.md,docs/10-research/20260213-mobile-competitors.md
```
Full synthesis from both sources.

---

## Expected Output

### Success

```
Product Brief: "Real-time Collaboration for Docs"
================================================

Reading inputs...
  Ideation report: docs/08-project/ideation/ideation-20260213-realtime-collab.md (15 ideas)
  Research: docs/10-research/20260213-realtime-collab-research.md

Synthesizing...
  Executive Summary... done
  User Personas (3 defined)... done
  Features: 4 MUST, 3 SHOULD, 5 COULD, 2 WON'T... done
  Success Metrics (4 defined)... done
  Business Case... done
  Competitive Context (3 alternatives)... done
  Risks (4 identified)... done

Saved to: docs/08-project/briefs/20260213-realtime-collaboration-for-docs-brief.md

What would you like to do next?
```

---

## Related Commands

- `/agileflow:ideate:discover` - Full discovery workflow (brainstorm + research + brief)
- `/agileflow:ideate:new` - Generate ideation report
- `/agileflow:research:ask` - Generate research prompts
- `/agileflow:research:synthesize` - Synthesize multiple research files
- `/agileflow:epic` - Create epic from brief
- `/agileflow:council` - Get architectural advice
