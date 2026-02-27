---
description: Generative Engine Optimization (GEO) - analyze and optimize content for AI search platforms like ChatGPT, Google AI Overviews, and Perplexity
argument-hint: "URL"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:seo:geo - AI search optimization"
    - "Assess 5 GEO dimensions: Citability, Structure, Multimodal, Authority, Technical Access"
    - "Check robots.txt for AI bot access (GPTBot, ClaudeBot, PerplexityBot)"
    - "Check for /llms.txt file"
    - "Optimize for 134-167 word citation blocks"
  state_fields:
    - target_url
    - geo_score
    - ai_bot_access
---

# /agileflow:seo:geo

Analyze and optimize content for AI search platforms (Generative Engine Optimization). Ensure your content gets cited by ChatGPT, Google AI Overviews, Perplexity, and Claude.

---

## Quick Reference

```
/agileflow:seo:geo https://example.com                      # Full GEO analysis
/agileflow:seo:geo https://example.com/blog/guide            # Analyze specific content page
```

---

## Background

**GEO (Generative Engine Optimization)** optimizes content for AI-powered search platforms:
- Google AI Overviews
- ChatGPT (with Browse/Search)
- Perplexity
- Claude

**Key insight**: Brand correlation is 3x stronger than backlinks for AI visibility. 92% of AI citations come from top-10 traditional search results.

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| URL | Any valid URL | Required | Page or site to analyze |

---

## GEO Assessment Framework

### 1. Citability (25%)

AI platforms cite content that contains self-contained, quotable blocks:

| Signal | Good | Poor |
|--------|------|------|
| Answer blocks | 134-167 word self-contained paragraphs | Long unbroken paragraphs |
| Specific facts | Numbers, dates, names, percentages | Vague generalizations |
| Definitions | Clear "X is Y" statements | Implied definitions |
| Lists | Numbered/bulleted key points | Points buried in prose |
| Attribution | "According to [source]..." | Unsourced claims |

**Check**: Count paragraphs in the 134-167 word range. Assess whether they answer specific questions independently.

### 2. Structure (20%)

AI platforms parse structured content more effectively:

| Signal | Good | Poor |
|--------|------|------|
| Question headers | H2/H3 as questions (Who, What, How) | Generic headings |
| Short paragraphs | 2-4 sentences | Wall of text |
| Tables | Comparison data in tables | Comparisons in prose |
| Numbered steps | Step-by-step instructions | Instructions in paragraphs |
| TL;DR / Summary | Key takeaway at top or bottom | No summary |

### 3. Multimodal Content (15%)

Pages with multiple content types get 156% higher AI citation rates:

| Signal | Good | Poor |
|--------|------|------|
| Text + Images | Informative images with good alt text | Text only |
| Text + Video | Embedded video with transcript | No video |
| Text + Tables | Data visualization | Numbers in paragraphs |
| Interactive | Calculators, tools, quizzes | Static content only |
| Infographics | Visual summaries | No visual aids |

### 4. Authority (20%)

AI platforms prioritize authoritative sources:

| Signal | Good | Poor |
|--------|------|------|
| Author credentials | Named author with bio/credentials | No attribution |
| Publication dates | Recent, prominently displayed | No dates or old |
| Primary sources | Original data, research, case studies | Only secondary sources |
| Citations | Links to authoritative references | No outbound links |
| Brand presence | Wikipedia, Reddit, YouTube mentions | No cross-platform presence |

### 5. Technical Access (20%)

AI bots must be able to access your content:

| Signal | Good | Poor |
|--------|------|------|
| GPTBot allowed | Not blocked in robots.txt | Blocked |
| ClaudeBot allowed | Not blocked in robots.txt | Blocked |
| PerplexityBot allowed | Not blocked in robots.txt | Blocked |
| Google-Extended allowed | Not blocked | Blocked |
| `/llms.txt` present | Exists at root | Missing |
| Server-side rendering | Content in HTML source | JS-only rendering |
| Fast response | Quick TTFB | Slow or rate-limited |

---

## Process

### STEP 1: Fetch Target Page

Use WebFetch to retrieve the page content.

### STEP 2: Fetch robots.txt

Check `{domain}/robots.txt` for AI bot rules:
```
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: PerplexityBot
User-agent: Google-Extended
```

### STEP 3: Check for llms.txt

Fetch `{domain}/llms.txt` - a machine-readable site description for AI platforms.

### STEP 4: Analyze Each Dimension

Score each of the 5 dimensions out of 100, then apply weights:

| Dimension | Weight |
|-----------|--------|
| Citability | 25% |
| Structure | 20% |
| Multimodal | 15% |
| Authority | 20% |
| Technical Access | 20% |

### STEP 5: Output Report

```markdown
# GEO Analysis: {URL}

## AI Search Readiness Score: {X}/100

| Dimension | Score | Weight | Weighted | Key Finding |
|-----------|-------|--------|----------|-------------|
| Citability | {X}/100 | 25% | {X} | {finding} |
| Structure | {X}/100 | 20% | {X} | {finding} |
| Multimodal | {X}/100 | 15% | {X} | {finding} |
| Authority | {X}/100 | 20% | {X} | {finding} |
| Technical Access | {X}/100 | 20% | {X} | {finding} |

## AI Bot Access Status

| Bot | Status | robots.txt |
|-----|--------|-----------|
| GPTBot (ChatGPT) | Allowed/Blocked | {rule or "No rule"} |
| ClaudeBot (Claude) | Allowed/Blocked | {rule or "No rule"} |
| PerplexityBot | Allowed/Blocked | {rule or "No rule"} |
| Google-Extended (AI Overviews) | Allowed/Blocked | {rule or "No rule"} |

## llms.txt: {Present/Missing}

## Citability Analysis

- Citation-ready blocks found: {N}
- Average paragraph length: {N} words
- Self-contained answer blocks: {N}

## Recommendations

### Quick Wins
1. {highest impact, easiest change}
2. {next priority}

### Content Improvements
1. {content change for better citability}
2. {structural improvement}

### Technical Changes
1. {robots.txt or llms.txt change}
```

### STEP 6: Offer Next Steps

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "GEO analysis: AI Search Readiness {X}/100. {bot_status}. {N} citation-ready blocks found.",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Improve citability (Recommended)", "description": "Restructure content into 134-167 word answer blocks"},
    {"label": "Fix AI bot access", "description": "Update robots.txt to allow GPTBot, ClaudeBot, PerplexityBot"},
    {"label": "Create llms.txt", "description": "Generate machine-readable site description"},
    {"label": "Run full SEO audit", "description": "/agileflow:seo:audit {domain}"}
  ]
}]</parameter>
</invoke>
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:seo:geo` - AI search optimization (Generative Engine Optimization)

**5 Dimensions**: Citability 25%, Structure 20%, Multimodal 15%, Authority 20%, Technical Access 20%

**Key Checks**: AI bot access in robots.txt, llms.txt presence, 134-167 word citation blocks

**Target Platforms**: Google AI Overviews, ChatGPT, Perplexity, Claude
<!-- COMPACT_SUMMARY_END -->
