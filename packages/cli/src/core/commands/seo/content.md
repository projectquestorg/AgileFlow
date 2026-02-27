---
description: E-E-A-T content quality analysis - trustworthiness, expertise, authoritativeness, experience scoring with AI content detection
argument-hint: "URL [TYPE=homepage|service|blog|product|location]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:seo:content - E-E-A-T content quality analysis"
    - "Deploy seo-analyzer-content for comprehensive E-E-A-T assessment"
    - "Score: Trust 30%, Expertise 25%, Authoritativeness 25%, Experience 20%"
    - "Check content minimums by page type (from quality-gates.md)"
  state_fields:
    - target_url
    - page_type
    - eeat_score
---

# /agileflow:seo:content

Analyze content quality using the E-E-A-T framework (Experience, Expertise, Authoritativeness, Trustworthiness). Includes AI content detection and citation readiness assessment.

---

## Quick Reference

```
/agileflow:seo:content https://example.com                    # Homepage content analysis
/agileflow:seo:content https://example.com/blog/post TYPE=blog # Blog post analysis
/agileflow:seo:content https://example.com/services TYPE=service # Service page analysis
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| URL | Any valid URL | Required | Page to analyze |
| TYPE | homepage, service, blog, product, location | Auto-detect | Page type (affects content minimums) |

---

## Process

### STEP 1: Deploy Content Analyzer

```xml
<invoke name="Task">
<parameter name="description">E-E-A-T content quality analysis</parameter>
<parameter name="prompt">TASK: Perform deep E-E-A-T content quality analysis.

TARGET URL: {url}
PAGE TYPE: {type or "auto-detect"}

Score each E-E-A-T factor:
- Trustworthiness (30%): HTTPS, contact, privacy, transparency, no deception
- Expertise (25%): Author credentials, citations, accuracy, depth
- Authoritativeness (25%): Brand signals, testimonials, certifications, NAP
- Experience (20%): First-hand accounts, original media, specific data, case studies

Also assess:
- Content depth vs minimums (homepage 500w, service 800w, blog 1500w, product 300w)
- Content uniqueness (boilerplate vs original)
- Readability level
- AI content red flags (generic phrasing, no insights, fabricated experience)
- AI citation readiness (self-contained blocks, specific facts, question headers)

OUTPUT: Content Quality Score X/100 with E-E-A-T breakdown.</parameter>
<parameter name="subagent_type">seo-analyzer-content</parameter>
</invoke>
```

### STEP 2: Present Results

Show E-E-A-T breakdown with signal-level detail and remediation steps.

---

## E-E-A-T Scoring

| Factor | Weight | Key Signals |
|--------|--------|-------------|
| Trustworthiness | 30% | HTTPS, contact info, privacy policy, editorial transparency |
| Expertise | 25% | Author bylines, cited sources, technical depth |
| Authoritativeness | 25% | Brand identity, certifications, media mentions |
| Experience | 20% | First-person accounts, original photos, specific data |

## Content Minimums (from quality-gates.md)

| Page Type | Min Words | Unique % |
|-----------|-----------|----------|
| Homepage | 500 | 100% |
| Service | 800 | 60% |
| Blog | 1,500 | 100% |
| Product | 300 | 40% |
| Location | 500 | 40% |

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:seo:content` - E-E-A-T content quality analysis

**Scoring**: Trust 30%, Expertise 25%, Authority 25%, Experience 20%

**Usage**: `/agileflow:seo:content URL [TYPE=page_type]`
<!-- COMPACT_SUMMARY_END -->
