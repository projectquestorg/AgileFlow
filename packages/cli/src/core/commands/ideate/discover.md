---
description: Run structured discovery workflow - brainstorm, research, and generate a Product Brief
argument-hint: "TOPIC=<text> [DEPTH=quick|guided|deep] [MODEL=haiku|sonnet|opus]"
compact_context:
  priority: critical
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ideate:discover - Discovery workflow orchestrator"
    - "DEPTH modes: quick (skip research, auto-generate), guided (interactive, optional research), deep (comprehensive research + curation)"
    - "Phase 1: Brainstorm via /agileflow:ideate:new SCOPE=all"
    - "Phase 2: Research via /agileflow:research:ask (optional in quick mode)"
    - "Phase 3: Generate Product Brief via /agileflow:ideate:brief"
    - "Output: docs/08-project/briefs/{date}-{topic-slug}-brief.md"
    - "MUST parse TOPIC (required), DEPTH (default: guided), and MODEL (default: haiku, passed to ideate:new)"
    - "After brief generation, offer: create epic, refine brief, or done"
  state_fields:
    - topic
    - depth
    - model
    - brainstorm_complete
    - research_complete
    - brief_generated
    - ideation_file
    - research_files
---

# /agileflow:ideate:discover

Run a structured discovery workflow that produces a professional Product Brief. Chains brainstorming, optional research, and synthesis into a single orchestrated flow.

---

## Purpose

Bridge the gap between "vague idea" and "epic planning". This command validates product viability BEFORE decomposing into stories/epics.

```
Vague Idea --> /ideate:discover --> Product Brief --> /epic --> Stories --> Implementation
```

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js ideate:discover
```

---

<!-- COMPACT_SUMMARY_START -->

## Compact Summary

**Command**: `/agileflow:ideate:discover` - Orchestrate brainstorm + research + Product Brief generation

**Quick Usage**:
```
/agileflow:ideate:discover TOPIC="Mobile time tracking app"
/agileflow:ideate:discover TOPIC="AI code review tool" DEPTH=deep
/agileflow:ideate:discover TOPIC="Internal dashboard" DEPTH=quick
/agileflow:ideate:discover TOPIC="Enterprise CRM" MODEL=opus
```

**Phases**:
1. Brainstorm (delegates to `/agileflow:ideate:new`)
2. Research (delegates to `/agileflow:research:ask` - optional in quick mode)
3. Brief Generation (delegates to `/agileflow:ideate:brief`)

**Depth Modes**:
- `quick`: Auto-run brainstorm, skip research, generate brief immediately (~5-10 min)
- `guided` (default): Interactive brainstorm, optional research, curate before brief (~30-45 min)
- `deep`: Comprehensive brainstorm + multi-stage research + detailed brief (~2+ hours)

**Output**: `docs/08-project/briefs/{YYYYMMDD}-{topic-slug}-brief.md`

### Tool Usage Examples

**AskUserQuestion** (depth selection):
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{"question": "What depth of discovery do you want for this topic?", "header": "Depth", "multiSelect": false, "options": [{"label": "Guided (Recommended)", "description": "Interactive brainstorm + optional research + curated brief (30-45 min)"}, {"label": "Quick", "description": "Auto brainstorm, skip research, fast brief (5-10 min)"}, {"label": "Deep", "description": "Comprehensive brainstorm + multi-stage research + detailed brief (2+ hours)"}]}]</parameter>
</invoke>
```

<!-- COMPACT_SUMMARY_END -->

---

## How It Works

```
USER: /agileflow:ideate:discover TOPIC="..." DEPTH=guided
                    |
                    v
    +-------------------------------+
    |   STEP 1: PARSE ARGUMENTS     |
    |   - TOPIC (required)          |
    |   - DEPTH (quick/guided/deep) |
    +-------------------------------+
                    |
                    v
    +-------------------------------+
    |   STEP 2: BRAINSTORM          |
    |   Delegate to ideate:new      |
    |   Output: ideation report     |
    +-------------------------------+
                    |
                    v
    +-------------------------------+
    |   STEP 3: RESEARCH (optional) |
    |   Delegate to research:ask    |
    |   User runs externally        |
    |   Import with research:import |
    +-------------------------------+
                    |
                    v
    +-------------------------------+
    |   STEP 4: GENERATE BRIEF      |
    |   Delegate to ideate:brief    |
    |   Synthesize all inputs       |
    |   Output: Product Brief       |
    +-------------------------------+
                    |
                    v
    +-------------------------------+
    |   STEP 5: NEXT STEPS          |
    |   Create epic? Refine? Done?  |
    +-------------------------------+
```

---

## Prompt

ROLE: Discovery Workflow Orchestrator

You run a structured discovery workflow that takes a topic from idea to Product Brief. You chain existing AgileFlow commands together and guide the user through each phase.

### STEP 1: PARSE ARGUMENTS

Parse the user's input:

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| TOPIC | Yes | - | The product/feature idea to explore |
| DEPTH | No | guided | Discovery depth: quick, guided, or deep |
| MODEL | No | haiku | Model for expert subagents (haiku, sonnet, opus). Passed through to ideate:new brainstorm phase. |

**If TOPIC is missing**, ask the user:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{"question": "What product or feature idea do you want to explore?", "header": "Topic", "multiSelect": false, "options": [{"label": "I'll type it", "description": "Describe the idea you want to validate"}]}]</parameter>
</invoke>
```

**If DEPTH is not provided**, use `guided` as the default.

**Normalize the topic** into a slug for filenames: lowercase, replace spaces with hyphens, remove special characters. Example: "AI Code Review Tool" becomes `ai-code-review-tool`.

---

### STEP 2: BRAINSTORM PHASE

**Purpose**: Generate creative ideas and approaches around the topic using multi-expert analysis.

**Tell the user what's happening:**
```
Phase 1/3: Brainstorming
Deploying domain experts to explore "{TOPIC}" from multiple angles...
```

**Execute brainstorming differently per depth:**

#### Quick Mode
Run brainstorming with minimal interaction. Deploy 3 experts in parallel using the Task tool:

1. **Product expert** - analyze market fit, user needs, competitive landscape
2. **API/Architecture expert** - evaluate technical feasibility, architecture options
3. **UX/Design expert** - consider user experience, interaction patterns

Use this prompt template for each expert:

```
TASK: Brainstorm ideas for a product/feature: "{TOPIC}"

From your {DOMAIN} perspective, generate 3-5 ideas covering:
1. **Core Value Proposition**: What's the main value this delivers?
2. **Key Features**: What are the essential features?
3. **Target Users**: Who benefits most?
4. **Risks**: What could go wrong?
5. **Differentiation**: How is this different from alternatives?

Be specific and actionable. Reference real-world examples where helpful.
```

Deploy all experts with `run_in_background: true`, then collect results with TaskOutput. **If MODEL is specified**, pass it to each Task call via the `model` parameter.

#### Guided Mode
Same as Quick, but after collecting results:

1. **Present a summary** of the brainstorm findings to the user
2. **Ask the user to curate**: Which ideas resonate? Which to drop?

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{"question": "Review the brainstorm results above. Which direction do you want to pursue?", "header": "Curate", "multiSelect": false, "options": [{"label": "Proceed with all ideas", "description": "Include everything in the brief"}, {"label": "Let me highlight the best ones", "description": "I'll tell you which ideas to focus on"}, {"label": "Re-brainstorm with different focus", "description": "Try again with adjusted scope"}]}]</parameter>
</invoke>
```

#### Deep Mode
Deploy 5+ experts (add Security and Testing to the base 3). Use `DEPTH=deep` prompts asking for 5 ideas each. After collection, present findings and allow the user to curate, add their own ideas, and refine before proceeding.

**Save brainstorm output** to `docs/08-project/ideation/ideation-{YYYYMMDD}-{topic-slug}.md`

Record the ideation file path for Phase 3.

---

### STEP 3: RESEARCH PHASE

**Purpose**: Gather external context - competitive analysis, market data, best practices.

**Behavior varies by depth:**

#### Quick Mode
**Skip research entirely.** Tell the user:
```
Phase 2/3: Research
Skipping external research (quick mode). Using brainstorm findings + internal knowledge only.
```
Proceed directly to Step 4.

#### Guided Mode
**Offer optional research.** Ask the user:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{"question": "Would you like to research this topic before generating the brief?", "header": "Research", "multiSelect": false, "options": [{"label": "Yes, generate research prompt (Recommended)", "description": "Creates a detailed prompt for ChatGPT/Perplexity to gather competitive + market data"}, {"label": "Skip research", "description": "Generate brief using brainstorm findings + internal knowledge only"}, {"label": "I already have research", "description": "I'll paste findings or point to existing docs/10-research/ files"}]}]</parameter>
</invoke>
```

**If yes**: Generate a research prompt tailored to the topic. Focus on:
- Competitive analysis (top 3-5 alternatives)
- Target market validation
- Best practices and patterns

Use this approach - generate the prompt inline (don't delegate to `/research:ask` to avoid double-orchestration complexity):

```markdown
# Research Request: {TOPIC} - Competitive & Market Analysis

## Context
We're exploring building: {TOPIC}
Key ideas from brainstorming: {top 3-5 ideas from Phase 1}

## Questions
1. What are the top 3-5 existing solutions for {TOPIC}? Compare on: features, pricing, target audience, strengths/weaknesses.
2. What is the target market size? Who are the primary user segments?
3. What are current best practices and emerging trends in this space?
4. What common pitfalls should we avoid?
5. What technical approaches are most common (architecture, tech stack)?

## Format
Provide structured analysis with tables for comparison. Include specific data points and sources where possible.
```

Instruct the user to copy the prompt, run it externally, and paste results back. When results are returned, save them to `docs/10-research/{YYYYMMDD}-{topic-slug}-market-research.md`.

**If user has existing research**: Ask them to specify the file path(s). Read those files to incorporate into the brief.

#### Deep Mode
Run **multiple research stages**, each with a focused prompt:

1. **Stage 1: Competitive Analysis** - Top 5 competitors, feature comparison, pricing
2. **Stage 2: Market Sizing** - TAM/SAM/SOM, user segments, growth trends
3. **Stage 3: Technical Landscape** - Common architectures, tech stacks, best practices

Each stage is optional (user can skip). For each completed stage, save research output to `docs/10-research/`.

Record all research file paths for Phase 3.

---

### STEP 4: GENERATE PRODUCT BRIEF

**Purpose**: Synthesize brainstorm findings + research into a structured Product Brief.

**Tell the user:**
```
Phase 3/3: Generating Product Brief
Synthesizing brainstorm findings and research into a structured brief...
```

**Read the inputs:**
1. Read the ideation report from Step 2
2. Read any research files from Step 3

**Generate the brief** by filling in the product-brief template. Apply these rules:

**MoSCoW Mapping from brainstorm confidence:**
- Ideas agreed by 2+ experts OR marked as core value = **MUST HAVE**
- Ideas from 1 expert with strong rationale = **SHOULD HAVE**
- Nice-to-have ideas or differentiators = **COULD HAVE**
- Explicitly rejected or out-of-scope ideas = **WON'T HAVE**

**Persona extraction:**
- From research: extract user segments and pain points
- From brainstorm: infer personas from "target users" sections
- If insufficient data: create 2 reasonable personas based on the topic

**Success metrics:**
- Derive from the problem statement and value proposition
- Include both quantitative (adoption rate, time saved) and qualitative (user satisfaction) metrics

**ROI estimation:**
- Effort: Based on feature count and complexity from MoSCoW
- Benefit: Based on target user pain points and market size
- Keep it simple - order-of-magnitude estimates, not financial modeling

**Competitive context:**
- From research findings if available
- From expert knowledge if research was skipped

**Save the brief** to: `docs/08-project/briefs/{YYYYMMDD}-{topic-slug}-brief.md`

Create the `docs/08-project/briefs/` directory if it doesn't exist.

---

### STEP 5: OFFER NEXT STEPS

Present the completed brief and ask what to do next:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{"question": "Product Brief for '{TOPIC}' has been generated. What would you like to do next?", "header": "Next Steps", "multiSelect": false, "options": [{"label": "Create epic from this brief (Recommended)", "description": "Run /agileflow:epic to decompose into stories"}, {"label": "Refine the brief", "description": "Edit specific sections or add more detail"}, {"label": "Run deeper research", "description": "Generate research prompts for areas that need more data"}, {"label": "Done for now", "description": "Brief saved, come back to it later"}]}]</parameter>
</invoke>
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| TOPIC | Free text | (required) | The product/feature idea to explore |
| DEPTH | quick, guided, deep | guided | Discovery depth level |
| MODEL | haiku, sonnet, opus | haiku | Model for expert subagents. Passed to brainstorm phase Task calls. |

{{argument}}

---

## Expected Output

### Success

```
Discovery Workflow: "AI Code Review Tool"
Depth: guided
============================================

Phase 1/3: Brainstorming
Deploying 3 domain experts...
  Product Expert... done
  Architecture Expert... done
  UX Expert... done
Synthesized 12 ideas (4 high-confidence, 6 medium, 2 low)

Phase 2/3: Research
[User runs external research prompt]
Imported competitive analysis (3 competitors found)

Phase 3/3: Generating Product Brief
  Executive Summary... done
  User Personas... done
  Features (MoSCoW)... done
  Success Metrics... done
  Business Case... done
  Competitive Context... done
  Risks... done

Brief saved to: docs/08-project/briefs/20260213-ai-code-review-tool-brief.md

What would you like to do next?
```

---

## Related Commands

- `/agileflow:ideate:brief` - Generate a Product Brief from existing ideation + research
- `/agileflow:ideate:new` - Run multi-expert brainstorming
- `/agileflow:research:ask` - Generate external research prompts
- `/agileflow:research:import` - Import research results
- `/agileflow:epic` - Create epic from a brief
- `/agileflow:auto` - Auto-generate stories from an epic
- `/agileflow:council` - Get architectural advice on an idea
