# Schema Markup Types Reference

**Load this when:** recommending structured data, validating JSON-LD,
or generating schema markup for a specific business type.

## Which schema type for which site

| Site type           | Primary schema             | Supporting schema                          |
| ------------------- | -------------------------- | ------------------------------------------ |
| SaaS / Software     | `SoftwareApplication`      | `Organization`, `FAQPage`, `HowTo`         |
| Ecommerce / store   | `Product`, `Offer`         | `BreadcrumbList`, `Organization`, `Review` |
| Local business      | `LocalBusiness` (subtype)  | `OpeningHoursSpecification`, `Review`      |
| Blog / content      | `Article` or `BlogPosting` | `Person` (author), `BreadcrumbList`        |
| News publisher      | `NewsArticle`              | `Organization`, `Person`                   |
| Recipe site         | `Recipe`                   | `HowToStep`, `AggregateRating`             |
| Job listings        | `JobPosting`               | `Organization`                             |
| Events              | `Event`                    | `Place`, `Offer`                           |
| Courses / education | `Course`                   | `EducationalOrganization`                  |
| FAQ pages           | `FAQPage`                  | —                                          |
| How-to guides       | `HowTo`                    | `HowToStep`, `HowToTool`                   |

## Google-supported rich result types (confirmed)

Only these produce rich results in Google Search:

| Schema type                  | Rich result                          | Eligibility requirements                              |
| ---------------------------- | ------------------------------------ | ----------------------------------------------------- |
| `Article` / `NewsArticle`    | Top stories carousel                 | AMP or signed exchange (news)                         |
| `Product`                    | Price, availability, ratings in SERP | Required: name, image, description                    |
| `Recipe`                     | Cooking carousel                     | Required: name, image, steps                          |
| `FAQPage`                    | Expandable FAQ in SERP               | Genuine FAQ content, not SEO spam                     |
| `HowTo`                      | Step-by-step in SERP                 | Clear steps with instructions                         |
| `Event`                      | Event dates in SERP                  | Required: name, startDate, location                   |
| `JobPosting`                 | Job listing in SERP                  | Required: title, hiringOrganization, datePosted       |
| `LocalBusiness`              | Knowledge panel                      | Required: name, address, telephone                    |
| `Review` / `AggregateRating` | Star ratings in SERP                 | Cannot be self-reviews                                |
| `VideoObject`                | Video thumbnail                      | Required: name, description, thumbnailUrl, uploadDate |
| `BreadcrumbList`             | Breadcrumb trail in URL              | Page hierarchy                                        |
| `SiteLinksSearchBox`         | Search box in SERP                   | Large sites only                                      |

## JSON-LD template: Product

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Product Name",
  "image": ["https://example.com/image.jpg"],
  "description": "Product description",
  "sku": "SKU123",
  "brand": {
    "@type": "Brand",
    "name": "Brand Name"
  },
  "offers": {
    "@type": "Offer",
    "url": "https://example.com/product",
    "priceCurrency": "USD",
    "price": "29.99",
    "availability": "https://schema.org/InStock",
    "itemCondition": "https://schema.org/NewCondition"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.5",
    "reviewCount": "89"
  }
}
```

## JSON-LD template: LocalBusiness

```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Business Name",
  "image": "https://example.com/logo.jpg",
  "telephone": "+1-555-555-5555",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Main St",
    "addressLocality": "City",
    "addressRegion": "ST",
    "postalCode": "12345",
    "addressCountry": "US"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 40.7128,
    "longitude": -74.006
  },
  "url": "https://example.com",
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      "opens": "09:00",
      "closes": "17:00"
    }
  ]
}
```

## JSON-LD template: FAQPage

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Question text here?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Answer text here."
      }
    }
  ]
}
```

## Common schema mistakes

| Mistake                             | Problem                  | Fix                                                   |
| ----------------------------------- | ------------------------ | ----------------------------------------------------- |
| Markup not matching visible content | Manual action risk       | Markup must match what users see                      |
| Self-reviews in `AggregateRating`   | Policy violation         | Only use genuine third-party reviews                  |
| `FAQPage` on every page for SEO     | Spam — Google may ignore | Only on genuine FAQ pages                             |
| Missing required properties         | Rich result won't show   | Check Google's docs for required fields               |
| Multiple `@type` conflicts          | Parser confusion         | Use array: `"@type": ["LocalBusiness", "Restaurant"]` |
| Schema on 404 / thin pages          | Wasted markup            | Only add schema to quality pages                      |

## Validation tools

- **Google Rich Results Test**: test.google.com/rich-results — shows if eligible for rich results
- **Schema Markup Validator**: validator.schema.org — general schema validity
- **Google Search Console**: search.google.com/search-console → Enhancements — field data on schema errors
