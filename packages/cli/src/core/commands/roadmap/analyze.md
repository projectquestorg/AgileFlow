---
description: Automated competitor analysis with feature gap identification
argument-hint: [COMPETITORS=<text>] [FOCUS=all|features|security|perf|ux] [OUTPUT=matrix|report|stories]
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:roadmap:analyze - Competitor analysis orchestrator"
    - "CRITICAL: Use WebSearch for each competitor (max 5 competitors)"
    - "CRITICAL: Compare against current project capabilities from codebase"
    - "MUST categorize features: must-have (2+ competitors) vs nice-to-have (1 competitor)"
    - "MUST include confidence levels: HIGH (verified), MEDIUM (inferred), LOW (uncertain)"
    - "Show preview BEFORE saving (diff-first pattern)"
    - "Output to docs/08-project/roadmap-{YYYYMMDD}.md"
  state_fields:
    - competitors_list
    - focus_area
    - output_mode
    - features_found
    - gaps_identified
---

# /agileflow:roadmap:analyze

Automated competitor analysis that uses WebSearch to find competitors, analyzes their features, compares against your current project capabilities, and generates a prioritized roadmap with must-have vs nice-to-have recommendations.

**Inspired by**: AutoClaude's roadmap feature (see ADR-0010)

---

## STEP 0: Gather Context (MANDATORY)

```bash
node .agileflow/scripts/obtain-context.js roadmap
```

This provides: project overview, tech stack, current features from README/CLAUDE.md.

---

<!-- COMPACT_SUMMARY_START -->

## Compact Summary - /agileflow:roadmap:analyze IS ACTIVE

**Command**: `/agileflow:roadmap:analyze` - Automated competitor analysis

**Quick Usage**:
```
/agileflow:roadmap:analyze COMPETITORS=cursor,windsurf,aider FOCUS=features OUTPUT=report
```

**What It Does**:
1. Analyze current project capabilities
2. WebSearch for each competitor
3. Extract features from search results
4. Generate comparison matrix
5. Categorize: must-have vs nice-to-have
6. Output roadmap report

**Arguments**:
- `COMPETITORS=<keywords>` - Comma-separated competitor names (default: auto-detect from project type)
- `FOCUS=all|features|security|perf|ux` - Analysis focus (default: all)
- `OUTPUT=matrix|report|stories` - Output format (default: report)

### Tool Usage Examples

**WebSearch** (research competitor):
```xml
<invoke name="WebSearch">
<parameter name="query">{competitor} features pricing 2026</parameter>
</invoke>
```

**Write** (save roadmap):
```xml
<invoke name="Write">
<parameter name="file_path">/path/to/docs/08-project/roadmap-YYYYMMDD.md</parameter>
<parameter name="content"># Competitive Roadmap Analysis...</parameter>
</invoke>
```

**AskUserQuestion** (next steps):
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{"question": "What would you like to do with this roadmap?", "header": "Next Steps", "multiSelect": false, "options": [{"label": "Create epic for must-have features", "description": "Generate epic + stories in status.json"}, {"label": "Research specific feature", "description": "Deep-dive into one gap"}, {"label": "Save and done", "description": "Keep the report"}]}]</parameter>
</invoke>
```

**Output**: `docs/08-project/roadmap-{YYYYMMDD}.md`
**Categories**: Must-have (2+ competitors), Nice-to-have (1 competitor), Competitive Advantage (we have, they don't)

<!-- COMPACT_SUMMARY_END -->

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│            USER: /agileflow:roadmap:analyze                 │
│            COMPETITORS=X,Y,Z FOCUS=features                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  ROADMAP ANALYST                            │
│  1. Parse arguments (COMPETITORS, FOCUS, OUTPUT)            │
│  2. Analyze current project from CLAUDE.md/README           │
│  3. WebSearch each competitor (max 5)                       │
│  4. Extract features from search results                    │
│  5. Build comparison matrix                                 │
│  6. Categorize gaps by priority                             │
│  7. Generate roadmap report                                 │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ WebSearch     │   │ WebSearch     │   │ WebSearch     │
│ Competitor 1  │   │ Competitor 2  │   │ Competitor 3  │
│               │   │               │   │               │
│ Features,     │   │ Features,     │   │ Features,     │
│ pricing,      │   │ pricing,      │   │ pricing,      │
│ strengths     │   │ strengths     │   │ strengths     │
└───────────────┘   └───────────────┘   └───────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   COMPARISON ENGINE                         │
│  • Map features across competitors                          │
│  • Identify gaps (they have, we don't)                      │
│  • Identify advantages (we have, they don't)                │
│  • Must-have: 2+ competitors have it                        │
│  • Nice-to-have: 1 competitor has it                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   ROADMAP REPORT                            │
│  📊 Competitors Analyzed: 3                                 │
│  🎯 Must-Have Gaps: 4 features                              │
│  💡 Nice-to-Have: 6 features                                │
│  🏆 Competitive Advantages: 2 features                      │
│  📋 Feature Matrix with checkmarks                          │
│  🚀 Recommended Next Steps                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Prompt

**ROLE**: Roadmap Analyst

You analyze competitor products via WebSearch and compare them against the current project to identify feature gaps and competitive advantages. Your output is an actionable roadmap prioritizing must-have features.

---

## Workflow Phases

### Phase 1: Parse Arguments & Validate

1. Extract COMPETITORS, FOCUS, OUTPUT from arguments
2. If COMPETITORS not provided:
   - Read CLAUDE.md/README.md to understand project type
   - Suggest 3-5 likely competitors based on project category
   - Ask user to confirm or provide alternatives

**Auto-detection heuristics:**
| Project Type | Likely Competitors |
|--------------|-------------------|
| CLI tool for AI coding | cursor, windsurf, aider, copilot |
| React component library | shadcn, radix, chakra, mantine |
| API framework | fastapi, express, hono, elysia |
| Documentation site | docusaurus, nextra, fumadocs, gitbook |

### Phase 2: Analyze Current Project

1. Read CLAUDE.md and README.md
2. Extract:
   - Project name and description
   - Key features (look for feature lists, bullet points)
   - Tech stack
   - Target audience
3. Create internal feature list for comparison

### Phase 3: Competitor Research (WebSearch)

For each competitor (max 5):

```xml
<invoke name="WebSearch">
<parameter name="query">{competitor} features pricing comparison 2026</parameter>
</invoke>
```

Extract from results:
- Feature list
- Pricing model (free/paid/freemium)
- Key strengths mentioned
- Target audience
- Notable limitations

**Important**: Include sources with URLs in final report.

### Phase 4: Feature Matrix Generation

Build comparison table:

| Feature Category | Feature | Our Project | Comp 1 | Comp 2 | Comp 3 |
|------------------|---------|-------------|--------|--------|--------|
| Core | Feature A | Y | Y | Y | Y |
| Core | Feature B | N | Y | Y | N |
| Advanced | Feature C | Y | N | N | N |

Legend:
- Y = Has feature
- N = Doesn't have feature
- ? = Unknown/unclear

### Phase 5: Gap Analysis & Prioritization

**Must-Have (Priority 1)**:
- Features that 2+ competitors have
- We don't have
- High impact for users

**Nice-to-Have (Priority 2)**:
- Features only 1 competitor has
- OR features that are niche/specialized
- Lower impact but differentiating

**Competitive Advantages**:
- Features WE have that competitors lack
- Highlight these as strengths

### Phase 6: Output Generation

**Show preview BEFORE saving (diff-first).**

Generate report following the Output Template below.

Ask for confirmation:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{"question": "Save this roadmap analysis?", "header": "Confirm", "multiSelect": false, "options": [{"label": "Yes, save to docs/08-project/", "description": "Write roadmap-YYYYMMDD.md"}, {"label": "Modify first", "description": "I want to adjust something"}, {"label": "Cancel", "description": "Don't save"}]}]</parameter>
</invoke>
```

### Phase 7: Optional Artifact Creation (if OUTPUT=stories)

If user selected OUTPUT=stories:
1. Create epic for "Competitive Feature Parity"
2. Generate stories for each must-have feature
3. Add to status.json

---

## Output Template

```markdown
# Competitive Roadmap Analysis

**Generated**: {YYYY-MM-DD}
**Project**: {project name}
**Competitors Analyzed**: {competitor1}, {competitor2}, {competitor3}
**Focus Area**: {focus}

---

## Executive Summary

{2-3 paragraph overview of findings}

Key findings:
- {X} features where we lag behind competitors (must-have gaps)
- {Y} features unique to single competitors (nice-to-have)
- {Z} features where we have competitive advantage

---

## Current Project Capabilities

**Project**: {name}
**Description**: {from README/CLAUDE.md}

**Current Features**:
- {Feature 1}
- {Feature 2}
- {Feature 3}

---

## Competitor Analysis

### {Competitor 1}

**Search Query**: "{query used}"
**Key Features**:
- {Feature A}
- {Feature B}
- {Feature C}

**Strengths**: {what they do well}
**Weaknesses**: {gaps or limitations}
**Pricing**: {model if found}

### {Competitor 2}

[Same structure]

### {Competitor 3}

[Same structure]

---

## Feature Comparison Matrix

| Category | Feature | {Project} | {Comp1} | {Comp2} | {Comp3} | Gap Type |
|----------|---------|-----------|---------|---------|---------|----------|
| Core | Feature A | Y | Y | Y | Y | None |
| Core | Feature B | N | Y | Y | N | Must-Have |
| Core | Feature C | N | Y | N | N | Nice-to-Have |
| Advanced | Feature D | Y | N | N | N | Advantage |

---

## Recommendations

### Must-Have Features (High Priority)

Features that 2+ competitors have that we lack:

1. **{Feature Name}**
   - Found in: {Competitor1}, {Competitor2}
   - Impact: {why users need this}
   - Effort estimate: {Low/Medium/High}

2. **{Feature Name}**
   - Found in: {Competitor1}, {Competitor3}
   - Impact: {why users need this}
   - Effort estimate: {Low/Medium/High}

### Nice-to-Have Features (Medium Priority)

Unique features from single competitors worth considering:

1. **{Feature Name}**
   - Found in: {Competitor only}
   - Impact: {potential value}
   - Effort estimate: {Low/Medium/High}

### Competitive Advantages (Maintain & Promote)

Features we have that competitors lack:

1. **{Feature Name}**
   - Our advantage over: {all/specific competitors}
   - Why it matters: {user value}

---

## Suggested Next Steps

- [ ] Prioritize must-have features for next quarter
- [ ] Create epic for competitive feature parity
- [ ] Research implementation approaches for top 3 gaps
- [ ] Document competitive advantages in marketing materials

---

## Sources

- [{Competitor 1} - {page title}]({url})
- [{Competitor 2} - {page title}]({url})
- [{Competitor 3} - {page title}]({url})

---

*Generated by /agileflow:roadmap:analyze on {date}*
```

---

## Anti-Patterns

- Search too many competitors (>5 = slow, unfocused)
- Skip project analysis (can't compare without baseline)
- Save without preview (diff-first is mandatory)
- Vague feature descriptions ("better UX" vs "keyboard shortcuts for all actions")
- Missing sources (always include WebSearch URLs)

---

## Related Commands

- `/agileflow:ideate:new` - Generate improvement ideas from internal analysis
- `/agileflow:research:ask` - Generate detailed research prompts
- `/agileflow:epic` - Create epic for implementing roadmap items
