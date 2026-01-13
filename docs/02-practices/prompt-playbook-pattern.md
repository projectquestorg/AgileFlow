# Prompt Playbook Pattern

Front-load thinking into structured specification files BEFORE starting Claude Code. Instead of iterative prompting, create comprehensive context artifacts that guide implementation.

Based on research: [Context Engineering for Rapid Prototyping](../10-research/20260113-context-engineering-rpi.md)

---

## The Pattern

```
┌─────────────────────────────────────────────────────────────┐
│  1. RESEARCH AI (Perplexity/ChatGPT)                        │
│     → Generate comprehensive spec.md                        │
├─────────────────────────────────────────────────────────────┤
│  2. DOCUMENTATION                                            │
│     → Save API docs as .md files                            │
│     → Include versions, endpoints, examples                  │
├─────────────────────────────────────────────────────────────┤
│  3. CLAUDE CODE                                              │
│     → /init + @spec.md + @api-docs.md                       │
│     → Targeted iteration prompts                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Why This Works

### Problem: Claude's Training Cutoff
- Claude doesn't know about latest API versions (Gemini 3 Flash, recent framework changes)
- Saying "use Gemini" may invoke outdated patterns
- Even explicit version numbers may not help

### Solution: Direct Documentation Injection
1. Find official docs → "View as Markdown" → Save as `.md` file
2. Use `@filename` to inject context: `@gemini-3-api.md`
3. Claude now has accurate, current API information

---

## Step 1: Generate Spec with Research AI

Use Perplexity (with Claude backend) to create comprehensive specs:

```
I have an idea to build [APP DESCRIPTION].

Links:
- [API documentation URL]
- [Framework documentation URL]

I want to use:
- [Technology 1]
- [Technology 2]

Please create a comprehensive specification markdown file that includes:
- Architecture overview
- Tech stack details
- Required environment variables
- API integration details
- UI/UX requirements
```

Save the output as `specs/app-name.md`.

---

## Step 2: Gather API Documentation

For each external API:

1. Find the official developer documentation
2. Look for "View as Markdown" option (many docs portals have this)
3. Save to `specs/[service]-api.md`

**Example structure:**
```
specs/
├── app-spec.md           # From Perplexity
├── stripe-api.md         # Payment API docs
├── resend-api.md         # Email API docs
└── gemini-3-tts.md       # Text-to-speech docs
```

---

## Step 3: Initialize Claude Code

```bash
# Reference your spec files
@specs/app-spec.md
@specs/stripe-api.md

# Let Claude create CLAUDE.md from specs
/init
```

---

## Step 4: Iterate with Specificity

### Vague (unreliable):
```
Make the UI look better
Use Google's AI
Add caching
```

### Specific (reliable):
```
Use these hex codes: #1a1a2e (dark bg), #16213e (card bg), #0f3460 (accent)

Use Gemini 3 Flash for analysis with JSON mode. @specs/gemini-3-api.md

Cache AI analysis in SQLite by version hash. Check cache before each API call.
```

---

## Playbook Template

For creating reusable playbooks:

```markdown
# [Pattern Name] Playbook

**Category**: [auth/payments/notifications/integration]
**Services**: [list of services used]
**Estimated Build Time**: [with iterations]

---

## Architecture

[Diagram or description]

## Environment Variables

```env
SERVICE_API_KEY=
SERVICE_SECRET=
```

## Implementation Steps

### Step 1: [First step]
[Details with code examples]

### Step 2: [Second step]
[Details]

---

## Prompts That Worked

### Initial Build
```
[The prompt that worked]
```

### UI Refinement
```
[The prompt for styling]
```

### Caching/Optimization
```
[The prompt for optimization]
```

---

## What Didn't Work

- [Thing that seemed good but wasn't useful]
- [Feature Claude added that you removed]

---

## Related Specs

- @specs/[service]-api.md
- @specs/[framework]-docs.md
```

---

## Integration with AgileFlow

### Store Playbooks as Research

```bash
/agileflow:research:import TOPIC="Stripe Webhook Playbook"
# Paste your playbook content
# Saved to docs/10-research/YYYYMMDD-stripe-webhook-playbook.md
```

### Find Existing Playbooks

```bash
/agileflow:research:list
# Look for entries with "playbook" in title
```

### Reference in New Work

When starting similar work:
1. Check `docs/10-research/` for existing playbooks
2. Copy relevant prompts and patterns
3. Adapt specs for new use case

---

## Key Principles

| Principle | What It Means |
|-----------|---------------|
| **Front-load thinking** | Spec files before code |
| **Inject latest docs** | Solve training cutoff with @file |
| **Be specific** | Hex codes > "make it pretty" |
| **Cache API docs** | Reuse across projects |
| **Document what worked** | Save successful prompts |
| **Track what didn't** | Prevent repeating mistakes |

---

## Anti-Patterns

| Don't | Do Instead |
|-------|------------|
| "Use the latest API" | `@specs/api-v3.md` with explicit version |
| "Make it look nice" | Provide design specs, hex codes, screenshots |
| Wing it with prompts | Create spec first, reference with @file |
| Forget caching | Add caching strategy to specs upfront |
| Start fresh each project | Build playbook library for common patterns |

---

## Comparison to RPI Workflow

This pattern **complements** the [RPI workflow](./context-engineering-rpi.md):

| Aspect | RPI | Prompt Playbook |
|--------|-----|-----------------|
| **Focus** | Phase structure (Research→Plan→Implement) | Input preparation (specs before prompts) |
| **Problem solved** | Context window management | Training cutoff, repeatability |
| **Key artifact** | Research notes, plans | Spec files, playbooks |
| **Best for** | Complex brownfield work | Rapid prototyping, API integration |

Use both together: Generate spec with Perplexity → Research in codebase → Plan with spec → Implement.

---

## Related

- [Context Engineering: RPI Workflow](./context-engineering-rpi.md) - Phase-based workflow
- [Research: Rapid Prototyping](../10-research/20260113-context-engineering-rpi.md) - Source research
- [Context Engineering Principles](../10-research/20260109-context-engineering-principles.md) - General framework
