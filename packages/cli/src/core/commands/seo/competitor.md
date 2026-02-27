---
description: SEO competitor comparison - analyze competing pages, generate feature matrices, and create comparison content with schema markup
argument-hint: "YOUR_URL COMPETITOR_URL [COMPETITOR_URL_2]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:seo:competitor - Competitor SEO comparison"
    - "Fetch both your page and competitor page(s)"
    - "Generate feature comparison matrix"
    - "Produce comparison page content with Product schema"
  state_fields:
    - your_url
    - competitor_urls
    - comparison_matrix
---

# /agileflow:seo:competitor

Analyze competitor pages and generate SEO-optimized comparison content with feature matrices and structured data.

---

## Quick Reference

```
/agileflow:seo:competitor https://you.com https://competitor.com          # 1v1 comparison
/agileflow:seo:competitor https://you.com https://comp1.com https://comp2.com  # Multi-competitor
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| YOUR_URL | Any valid URL | Required | Your product/service page |
| COMPETITOR_URL | Any valid URL(s) | Required | Competitor page(s) to compare (1-3) |

---

## Process

### STEP 1: Fetch All Pages

Use WebFetch to retrieve your page and each competitor page. Extract:
- Product/service name
- Features list
- Pricing (if visible)
- Key differentiators
- Schema markup present
- Meta title/description

### STEP 2: Build Feature Matrix

Create a comparison matrix:

```markdown
| Feature | Your Product | Competitor A | Competitor B |
|---------|-------------|-------------|-------------|
| {feature 1} | Yes/No/Value | Yes/No/Value | Yes/No/Value |
| {feature 2} | Yes/No/Value | Yes/No/Value | Yes/No/Value |
| Pricing | {price} | {price} | {price} |
| Free Trial | Yes/No | Yes/No | Yes/No |
```

### STEP 3: SEO Comparison

Compare SEO elements:

| Element | You | Competitor |
|---------|-----|-----------|
| Title tag | {length, keywords} | {length, keywords} |
| Meta description | {present, quality} | {present, quality} |
| H1 | {text} | {text} |
| Schema types | {types} | {types} |
| Word count | {count} | {count} |
| Internal links | {count} | {count} |
| Image optimization | {score} | {score} |

### STEP 4: Generate Comparison Content

Produce draft comparison page content:

```markdown
# {Your Product} vs {Competitor}: {Year} Comparison

## Quick Summary

{2-3 sentence overview}

## Feature Comparison

[Feature matrix table]

## {Your Product} Advantages

1. {advantage with evidence}
2. {advantage}

## When to Choose {Competitor}

{Fair, balanced assessment}

## Pricing Comparison

[Pricing table]

## Verdict

{Balanced recommendation}
```

### STEP 5: Generate Schema

```json
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "{Your Product} vs {Competitor}",
  "description": "Compare {Your Product} and {Competitor} features, pricing, and capabilities",
  "mainEntity": {
    "@type": "ItemList",
    "itemListElement": [
      {
        "@type": "Product",
        "name": "{Your Product}",
        "url": "{your_url}"
      },
      {
        "@type": "Product",
        "name": "{Competitor}",
        "url": "{competitor_url}"
      }
    ]
  }
}
```

### STEP 6: Output

```markdown
# Competitor Analysis: {You} vs {Competitor(s)}

## SEO Comparison
[Side-by-side SEO element comparison]

## Feature Matrix
[Feature comparison table]

## Content Gaps
[What competitor has that you're missing]

## Generated Comparison Page
[Draft content ready to publish]

## Schema Markup
[JSON-LD for the comparison page]

## SEO Recommendations
1. {Priority improvement}
2. {Next priority}
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:seo:competitor` - Competitor SEO comparison

**Output**: Feature matrix, SEO comparison, draft comparison page content, schema markup

**Usage**: `/agileflow:seo:competitor YOUR_URL COMPETITOR_URL [COMPETITOR_URL_2]`
<!-- COMPACT_SUMMARY_END -->
