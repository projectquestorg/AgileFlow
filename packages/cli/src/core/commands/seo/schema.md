---
description: Schema markup validation, deprecated type detection, and ready-to-use JSON-LD generation for rich results
argument-hint: "URL [GENERATE=true]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:seo:schema - Schema markup analysis"
    - "Detect existing JSON-LD, Microdata, RDFa on the page"
    - "Validate against current Google standards (2025-2026)"
    - "Flag deprecated types (HowTo, SpecialAnnouncement, etc.)"
    - "If GENERATE=true, produce ready-to-use JSON-LD snippets"
  state_fields:
    - target_url
    - generate
    - schema_found
---

# /agileflow:seo:schema

Detect, validate, and generate schema markup (structured data) for rich results in Google Search.

---

## Quick Reference

```
/agileflow:seo:schema https://example.com                    # Detect and validate existing schema
/agileflow:seo:schema https://example.com GENERATE=true       # Also generate missing JSON-LD
/agileflow:seo:schema https://example.com/product             # Analyze product page schema
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| URL | Any valid URL | Required | Page to analyze |
| GENERATE | true, false | false | Generate ready-to-use JSON-LD for missing schema |

---

## Process

### STEP 1: Fetch and Detect

Use WebFetch to retrieve the page. Extract all structured data:
- `<script type="application/ld+json">` blocks (JSON-LD)
- Elements with `itemscope`/`itemtype`/`itemprop` (Microdata)
- Elements with `typeof`/`property` (RDFa)

### STEP 2: Validate Existing Schema

For each schema block found, check:

**Format**:
- Valid JSON syntax (for JSON-LD)
- `@context` uses `https://schema.org` (HTTPS, not HTTP)
- `@type` is a recognized type

**Required Properties** (per type - see schema-types.md reference):
- Organization: name, url, logo
- Product: name, image, offers (price, priceCurrency, availability)
- Article: headline, image, datePublished, author
- LocalBusiness: name, address, telephone
- etc.

**Current Rules**:
- `returnPolicyCountry` mandatory for Products (March 2025)
- ISO 8601 dates required
- Merchant API migration by August 18, 2026

### STEP 3: Flag Deprecated/Restricted Types

**Deprecated (remove immediately)**:
- HowTo, SpecialAnnouncement, CourseInfo, EstimatedSalary
- LearningVideo, ClaimReview, VehicleListing, PracticeProblem, Dataset

**Restricted (use only if eligible)**:
- FAQPage: Only government/healthcare sites since August 2023

### STEP 4: Identify Missing Opportunities

Based on page content, recommend schema that should be present:

| Page Contains | Recommended Schema |
|--------------|-------------------|
| Business info | Organization or LocalBusiness |
| Products | Product with Offer |
| Blog articles | Article or BlogPosting |
| Events | Event |
| Job listings | JobPosting |
| Videos | VideoObject |
| Breadcrumbs | BreadcrumbList |
| Site search | WebSite with SearchAction |
| Reviews | Review with Rating |

### STEP 5: Generate JSON-LD (if GENERATE=true)

For each missing schema, generate a ready-to-use JSON-LD snippet with placeholder values filled from the actual page content:

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "[extracted from page]",
  "url": "[page URL]",
  "logo": "[detected logo URL]",
  "sameAs": [
    "[detected social links]"
  ]
}
```

### STEP 6: Output Report

```markdown
# Schema Analysis: {URL}

## Existing Schema

| # | Type | Format | Valid | Issues |
|---|------|--------|-------|--------|
| 1 | Organization | JSON-LD | Yes | None |
| 2 | FAQPage | JSON-LD | No | Restricted type (commercial site) |

## Validation Results

### Schema 1: Organization (Valid)
```json
{existing schema}
```
All required properties present.

### Schema 2: FAQPage (Invalid)
- Issue: FAQPage restricted to government/healthcare since Aug 2023
- Action: Remove FAQPage schema from commercial pages

## Missing Schema Opportunities

| Type | Why | Rich Result |
|------|-----|-------------|
| BreadcrumbList | Page has breadcrumb nav | Breadcrumb trail in SERP |
| WebSite | Homepage, has search | Sitelinks search box |

## Generated JSON-LD (if requested)

[Ready-to-use code blocks]

## Schema Score: X/100
```

### STEP 7: Offer Next Steps

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Schema analysis: {found} types detected, {valid} valid, {issues} issues, {missing} opportunities.",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Generate missing JSON-LD (Recommended)", "description": "Create ready-to-use schema for {missing} opportunities"},
    {"label": "Fix {issues} validation errors", "description": "{top_error_summary}"},
    {"label": "Test in Rich Results Test", "description": "Validate generated schema at search.google.com/test/rich-results"},
    {"label": "Run full SEO audit", "description": "/agileflow:seo:audit {domain}"}
  ]
}]</parameter>
</invoke>
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:seo:schema` - Schema markup validation and generation

**Usage**: `/agileflow:seo:schema URL [GENERATE=true]`

**What It Does**: Detect existing schema → Validate against Google standards → Flag deprecated types → Identify missing opportunities → Generate JSON-LD

**Key References**: schema-types.md (recommended, restricted, deprecated types)
<!-- COMPACT_SUMMARY_END -->
