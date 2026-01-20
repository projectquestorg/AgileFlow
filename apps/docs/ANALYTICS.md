# Analytics - AgileFlow Documentation Site

This document describes the analytics implementation for the AgileFlow documentation site.

## Overview

The documentation site uses two analytics providers:

1. **Vercel Analytics** - Automatic page views and web vitals (built-in)
2. **Plausible Analytics** - Privacy-friendly, custom event tracking (optional)

## Configuration

### Vercel Analytics

Vercel Analytics is enabled by default and requires no configuration. It automatically tracks:
- Page views
- Web Vitals (LCP, FID, CLS)
- Visitor geography

### Plausible Analytics

To enable Plausible Analytics:

1. Sign up at [plausible.io](https://plausible.io)
2. Add your domain (e.g., `agileflow.dev`)
3. Set the environment variable:

```bash
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=agileflow.dev
```

If `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is not set, Plausible is disabled and only Vercel Analytics runs.

## Event Tracking

### Using the Event Tracker

```typescript
import { trackEvent } from "@/lib/analytics"

// Track a search
trackEvent({
  name: "search",
  props: { query: "sidebar", results_count: 5 }
})

// Track code copy
trackEvent({
  name: "copy_code",
  props: { component: "Button", language: "tsx" }
})
```

### Event Schema

| Event Name         | Props                                    | Description                       |
|--------------------|------------------------------------------|-----------------------------------|
| `search`           | `query`, `results_count`                 | User searches documentation       |
| `copy_code`        | `component`, `language?`                 | User copies code block            |
| `copy_command`     | `command`                                | User copies CLI command           |
| `navigation`       | `from`, `to`                             | User navigates between pages      |
| `theme_change`     | `theme` (light/dark/system)              | User changes color theme          |
| `external_link`    | `url`, `text?`                           | User clicks external link         |
| `tutorial_start`   | `tutorial`                               | User starts a tutorial            |
| `tutorial_complete`| `tutorial`, `duration_ms`                | User completes a tutorial         |
| `tutorial_step`    | `tutorial`, `step`, `total`              | User advances in tutorial         |
| `feedback`         | `helpful` (bool), `page`                 | User submits feedback             |
| `error`            | `message`, `page`                        | Error occurs on page              |

### Development Mode

In development, events are logged to the console instead of being sent to Plausible:

```
[Analytics] search { query: "sidebar", results_count: 5 }
```

## Plausible Dashboard

Access the Plausible dashboard at:
- `https://plausible.io/agileflow.dev` (replace with your domain)

### Custom Goals

To set up event tracking in Plausible:

1. Go to your site settings → Goals
2. Click "Add Goal"
3. Select "Custom Event"
4. Enter the event name (e.g., `search`, `copy_code`)
5. Save

Events will then appear in your dashboard with their properties.

## Privacy

Both analytics providers are privacy-friendly:

- **Vercel Analytics**: No cookies, GDPR compliant
- **Plausible Analytics**: No cookies, GDPR/CCPA/PECR compliant

No personal data is collected. IP addresses are anonymized.

## Files

| File | Purpose |
|------|---------|
| `lib/analytics.ts` | Event tracking utility and types |
| `components/analytics.tsx` | Combined analytics component |
| `components/plausible.tsx` | Plausible script loader |

---

**Last Updated**: January 20, 2026
**Implemented in**: US-0161 (EP-0024)
