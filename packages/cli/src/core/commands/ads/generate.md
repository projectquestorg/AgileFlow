---
description: Bulk ad copy generation — produce 40+ headline/body/CTA variants from product description + ICP angles, formatted for Meta bulk upload and Google Ads Editor
argument-hint: "<product-description> [PLATFORM=all] [VARIANTS=40] [ANGLES=auto]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ads:generate - Bulk ad copy generation"
    - "Generate headline/body/CTA variants from product description + ICP angles"
    - "Output structured markdown AND CSV formatted for Meta bulk upload"
    - "Delegate to ads-generate agent for variant production"
  state_fields:
    - product_description
    - platform
    - variant_count
    - angles
---

# /agileflow:ads:generate

Generate bulk ad copy variants from a product description and ideal customer profile (ICP) angles. Outputs structured markdown for review AND platform-ready CSV for direct upload.

---

## Quick Reference

```
/agileflow:ads:generate <product-description>                          # 40 variants, all platforms
/agileflow:ads:generate <product-description> PLATFORM=meta            # Meta-optimized variants
/agileflow:ads:generate <product-description> PLATFORM=google          # Google Ads Editor format
/agileflow:ads:generate <product-description> VARIANTS=80 ANGLES=5     # 80 variants across 5 angles
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| product-description | Text, URL, or file path | Required | Product/service description to generate copy for |
| PLATFORM | all, meta, google, linkedin, tiktok | all | Target platform(s) for format optimization |
| VARIANTS | 20-100 | 40 | Number of ad variants to generate |
| ANGLES | 1-10 or auto | auto (5) | Number of ICP angles to explore |

---

## Multi-Step Discovery Flow

### STEP 1: Product Discovery

If product description is minimal or missing, gather context:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[
  {
    "question": "What are you advertising? Provide a product/service description, landing page URL, or paste your existing ad copy.",
    "header": "Product",
    "multiSelect": false,
    "options": [
      {"label": "Paste product description (Recommended)", "description": "Copy/paste from your website, pitch deck, or product brief"},
      {"label": "Provide landing page URL", "description": "I'll analyze the page and extract product details"},
      {"label": "Describe verbally", "description": "I'll ask follow-up questions to build the brief"}
    ]
  },
  {
    "question": "Who is your ideal customer?",
    "header": "ICP",
    "multiSelect": false,
    "options": [
      {"label": "B2B decision makers", "description": "CTOs, VPs, Directors making software/service purchasing decisions"},
      {"label": "SMB owners", "description": "Small business owners looking for solutions to operational problems"},
      {"label": "Consumers", "description": "Individual consumers making personal purchasing decisions"},
      {"label": "Let me describe", "description": "I'll provide specific ICP details"}
    ]
  }
]</parameter>
</invoke>
```

### STEP 2: Angle Generation

From the product description and ICP, generate 5 differentiated messaging angles:

**Standard Angle Framework:**

| # | Angle | What It Emphasizes |
|---|-------|--------------------|
| 1 | **Pain Point** | The problem your ICP faces without this product |
| 2 | **Outcome/Benefit** | The result/transformation after using the product |
| 3 | **Social Proof** | Numbers, testimonials, authority signals |
| 4 | **Urgency/Scarcity** | Time-limited offer, competitive pressure, FOMO |
| 5 | **Contrarian/Pattern Interrupt** | Challenges assumptions, stands out in feed |

If ANGLES > 5, add from:
| 6 | **Comparison** | Direct or indirect competitor comparison |
| 7 | **How-It-Works** | Simplicity, 3-step process, ease of use |
| 8 | **Identity** | "For people who..." — tribe/identity-based |
| 9 | **Risk Reversal** | Guarantee, free trial, money-back |
| 10 | **Curiosity** | Open loops, questions, intrigue |

### STEP 3: Generate Variants

Delegate to the `ads-generate` agent for variant production:

```xml
<invoke name="Agent">
<parameter name="description">Generate ad copy variants</parameter>
<parameter name="prompt">TASK: Generate {VARIANTS} ad copy variants for bulk upload.

PRODUCT:
{product_description}

ICP:
{icp_description}

ANGLES:
{angle_list_with_descriptions}

PLATFORMS: {platform}

## Generation Rules

1. **Per angle**: Generate {VARIANTS / ANGLES} variants per angle
2. **Per variant**: Generate headline + body + CTA as a set
3. **Platform compliance**: Respect character limits per platform
4. **Diversity**: No two variants should have the same opening word
5. **Specificity**: Include numbers, timeframes, or concrete outcomes where possible
6. **CTA variety**: Mix of "Learn More", "Get Started", "Try Free", "See How", "Book Demo"

## Platform Character Limits

### Meta Ads
- Primary Text: 125 chars (above fold), 1000 max
- Headline: 27 chars (recommended), 255 max
- Description: 27 chars (recommended), 255 max
- CTA: Select from preset list

### Google Ads (RSA)
- Headline: 30 chars max (generate 15 headlines)
- Description: 90 chars max (generate 4 descriptions)
- Path: 15 chars per path segment

### LinkedIn
- Intro text: 150 chars (above fold), 600 max
- Headline: 70 chars max
- Description: 100 chars max

### TikTok
- Ad text: 100 chars (recommended)
- No headline separate from creative

## Output Format

OUTPUT your response in TWO sections:

### Section 1: Review Format (Markdown Table)

| # | Angle | Headline | Body | CTA | Platform |
|---|-------|----------|------|-----|----------|
| 1 | Pain Point | ... | ... | Learn More | Meta |
| ... | ... | ... | ... | ... | ... |

### Section 2: Meta Bulk Upload CSV

```csv
Ad Name,Primary Text,Headline,Description,Call to Action,Website URL
{angle}-{number},"{body}","{headline}","{description}",LEARN_MORE,{url}
```

### Section 3: Google Ads Editor CSV (if PLATFORM includes google)

```csv
Campaign,Ad Group,Headline 1,Headline 2,Headline 3,Description 1,Description 2,Path 1,Path 2
```

Flag any variants that push character limits with ⚠️.</parameter>
<parameter name="subagent_type">ads-generate</parameter>
</invoke>
```

### STEP 4: Present Results

After generation completes, present summary and offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Generated {N} ad variants across {M} angles. {platform_count} platform format(s) ready. Files saved to docs/08-project/ads-copy/.",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Generate more variants for winning angles (Recommended)", "description": "Double down on the strongest 2-3 angles with more variations"},
    {"label": "Create test plan for these variants", "description": "Run /agileflow:ads:test-plan to structure A/B tests with decision criteria"},
    {"label": "Adapt for additional platforms", "description": "Reformat variants for Google, LinkedIn, or TikTok specifications"},
    {"label": "Review and refine specific variants", "description": "Edit individual variants or regenerate specific angles"}
  ]
}]</parameter>
</invoke>
```

---

## Output Files

The agent saves artifacts to:
- `docs/08-project/ads-copy/ads-copy-{YYYYMMDD}.md` — Full review format with all variants
- `docs/08-project/ads-copy/meta-bulk-upload-{YYYYMMDD}.csv` — Meta Ads Manager bulk upload format
- `docs/08-project/ads-copy/google-ads-editor-{YYYYMMDD}.csv` — Google Ads Editor import format (if applicable)

---

## Example Output

For a SaaS product "TaskFlow — AI project management":

| # | Angle | Headline | Body | CTA |
|---|-------|----------|------|-----|
| 1 | Pain Point | Stop losing tasks in Slack threads | Your team wastes 5 hours/week searching for decisions buried in chat. TaskFlow surfaces action items automatically. | Try Free |
| 2 | Outcome | Ship 2x faster with AI project management | TaskFlow auto-generates tasks from meetings, prioritizes your backlog, and predicts blockers before they happen. | Get Started |
| 3 | Social Proof | 2,847 teams shipped faster this month | "We cut our sprint planning from 3 hours to 20 minutes" — VP Eng, Series B startup | See How |
| 4 | Urgency | Your competitors already use AI for PM | 73% of high-growth startups adopted AI project management in 2025. Don't get left behind. | Start Free Trial |
| 5 | Contrarian | Project management tools are the problem | More tools = more context switching. TaskFlow replaces your PM tool, not adds to it. | Learn More |

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:ads:generate` - Bulk ad copy generation with ICP angles

**Input**: Product description + ICP + platform (interactive or parameters)

**Output**: 40+ ad variants in review markdown + platform-ready CSV (Meta bulk upload, Google Ads Editor)

**Usage**: `/agileflow:ads:generate <product-description> [PLATFORM=all] [VARIANTS=40] [ANGLES=auto]`

**Files**: `docs/08-project/ads-copy/ads-copy-{YYYYMMDD}.md`, `*-bulk-upload-*.csv`
<!-- COMPACT_SUMMARY_END -->
