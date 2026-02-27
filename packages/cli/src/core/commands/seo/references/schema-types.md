# Schema Markup Types Reference

Reference data for JSON-LD structured data validation. Updated February 2026.

---

## Actively Recommended Types

These schema types are actively supported by Google and can generate rich results:

| Type | Use Case | Required Properties |
|------|----------|-------------------|
| **Organization** | Business identity | name, url, logo |
| **LocalBusiness** | Physical businesses | name, address, telephone, openingHours |
| **Product** | E-commerce products | name, image, offers (price, availability, priceCurrency) |
| **Article** | News/blog content | headline, image, datePublished, author |
| **BlogPosting** | Blog content | headline, image, datePublished, author |
| **Review** | Product/service reviews | itemReviewed, reviewRating, author |
| **Event** | Events | name, startDate, location |
| **JobPosting** | Job listings | title, description, datePosted, hiringOrganization |
| **Course** | Educational content | name, description, provider |
| **VideoObject** | Videos | name, description, thumbnailUrl, uploadDate |
| **BroadcastEvent** | Live streams | isLiveBroadcast, startDate |
| **ProfilePage** | Author profiles | mainEntity (Person) |
| **ProductGroup** | Product variants | name, productGroupID, hasVariant |
| **WebSite** | Site-level (sitelinks search) | name, url, potentialAction (SearchAction) |
| **BreadcrumbList** | Navigation | itemListElement |
| **FAQPage** | FAQs (restricted - see below) | mainEntity (Question + acceptedAnswer) |

---

## Restricted Types (Limited Use)

| Type | Restriction | Details |
|------|-------------|---------|
| **FAQPage** | Government/healthcare only | Since August 2023, Google restricted FAQ rich results to government and health authority websites. Commercial sites should NOT use FAQPage schema. |

---

## Deprecated Types (Never Use)

These types no longer generate rich results or have been explicitly deprecated:

| Type | Deprecated Since | Replacement |
|------|-----------------|-------------|
| **HowTo** | Aug 2023 | None (removed from search features) |
| **SpecialAnnouncement** | 2024 | None (COVID-era, sunset) |
| **CourseInfo** | 2024 | Use Course instead |
| **EstimatedSalary** | 2024 | Use JobPosting.estimatedSalary |
| **LearningVideo** | 2024 | Use VideoObject |
| **ClaimReview** | 2024 | Limited to approved fact-checkers |
| **VehicleListing** | 2024 | Merchant API only |
| **PracticeProblem** | 2024 | None |
| **Dataset** | 2024 | Dataset Search only (not main SERP) |

---

## Critical Validation Rules

| Rule | Details |
|------|---------|
| **@context** | Must use `https://schema.org` (HTTPS, not HTTP) |
| **returnPolicyCountry** | Mandatory for Product schema (since March 2025) |
| **ISO 8601 dates** | All date fields must use ISO 8601 format |
| **Required properties** | All required properties must be present |
| **Valid URLs** | All URL fields must be valid, accessible URLs |
| **No empty values** | Properties must have meaningful values |
| **Merchant API** | Product structured data must migrate to Merchant API by August 18, 2026 |

---

## Implementation Format

- **Preferred**: JSON-LD in `<script type="application/ld+json">` (head or body)
- **Acceptable**: Microdata, RDFa
- **Recommendation**: Always use JSON-LD; it's easiest to maintain and Google's preferred format

---

## Common Validation Errors

| Error | Severity | Fix |
|-------|----------|-----|
| Missing @context | Critical | Add `"@context": "https://schema.org"` |
| HTTP in @context | High | Change to HTTPS |
| Missing required property | High | Add the required property with valid value |
| Deprecated type | Medium | Remove or replace per table above |
| Invalid date format | Medium | Convert to ISO 8601 |
| Missing returnPolicyCountry | High | Add to Product/Offer schema |
| Nested errors in offers | Medium | Validate Offer sub-schema |

---

## Business Type to Schema Mapping

| Business Type | Primary Schema Types |
|--------------|---------------------|
| **SaaS** | Organization, WebSite, Product, Article, FAQPage (if applicable) |
| **Local Business** | LocalBusiness, Organization, Product/Service, Review, Event |
| **E-commerce** | Product, ProductGroup, Organization, BreadcrumbList, Review |
| **Publisher** | Article, BlogPosting, Organization, WebSite, ProfilePage |
| **Agency** | Organization, LocalBusiness, Service, Review, Article |
