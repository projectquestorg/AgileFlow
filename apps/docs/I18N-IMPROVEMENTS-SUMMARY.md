# AgileFlow Docs: 5 Actionable i18n Improvement Ideas

**Project Context**: 114 MDX files, Next.js 15 + Fumadocs, currently English-only
**Analysis Date**: 2026-01-19
**Focus Areas**: Translation workflow, locale routing, RTL support, community translations

---

## IDEA 1: Next.js Middleware-Based Locale Routing with Automatic Detection

**Title**: Multi-locale URL routing with automatic language detection

**Category**: i18n

**Impact**: High

**Effort**: 2 Days

**Files Affected**:
- `middleware.ts` (CREATE)
- `app/layout.tsx` (MODIFY)
- `app/(docs)/[[...slug]]/page.tsx` (MODIFY)
- `lib/i18n-config.ts` (CREATE)

**Why**: Without locale routing, the site remains permanently English-only. Middleware enables URL patterns like `/es/docs/commands/epic` and automatic language detection from browser headers (Accept-Language), removing friction for non-English users discovering the site.

**Approach**: Create `middleware.ts` using `next-i18n-router` to intercept requests, detect locale from URL segment or cookie fallback, and rewrite to canonical path. Update root layout to accept `params.locale` and set `lang` + `dir` HTML attributes (crucial for RTL). Add `i18n-config.ts` with locale constants and RTL language map (e.g., `{ ar: true, he: true, fa: true }`).

**Code Snippet** (middleware.ts):
```typescript
import { createI18nMiddleware } from 'next-i18n-router/middleware'
import { NextRequest } from 'next/server'

export const middleware = createI18nMiddleware({
  locales: ['en', 'es', 'fr', 'de', 'ja'],
  defaultLocale: 'en',
  localeCookie: 'NEXT_LOCALE',
})

export const config = { matcher: ['/((?!_next|public|api).*)'] }
```

---

## IDEA 2: Crowdin Integration with Automated PR Sync & Glossary

**Title**: Community-driven translation workflow via Crowdin with CI/CD automation

**Category**: i18n

**Impact**: High

**Effort**: 1 Week

**Files Affected**:
- `.github/workflows/i18n-sync.yml` (CREATE)
- `scripts/extract-i18n-keys.js` (CREATE)
- `crowdin.yml` (CREATE)
- `docs/i18n/TRANSLATING.md` (CREATE)
- `locales/en.json`, `locales/es.json`, etc. (CREATE)

**Why**: Manual translation maintenance at 114+ files becomes unsustainable. Crowdin provides professional-grade translation management with community contributions, version control integration, and glossary support (critical for AgileFlow terms: "epic", "story", "agent", "babysit").

**Approach**: Set up Crowdin project with `content/docs/` as source. Create `locales/[locale].json` files for UI strings (navigation, buttons, labels). Build GitHub workflow that syncs translations daily, creates PRs for review, and deploys on merge. Include AgileFlow glossary in Crowdin to maintain terminology consistency across languages (e.g., "epic" must translate to `épico` in Spanish, not `epopeya`).

**Implementation Checklist**:
1. Create Crowdin project at crowdin.com, link GitHub repo
2. Upload `locales/en.json` (extract UI strings manually or script it)
3. Create `crowdin.yml` in repo root with sync config
4. Build `.github/workflows/i18n-sync.yml` to run `crowdin upload` + `crowdin download` on schedule
5. Add contribution guide at `docs/i18n/TRANSLATING.md` with link to Crowdin
6. Set up branch protection to require translation review before merge

**CI Workflow Outline**:
```yaml
name: i18n Sync
on:
  schedule:
    - cron: '0 9 * * MON'  # Weekly on Monday
  workflow_dispatch:
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run extract-i18n-keys  # Generate locales/en.json
      - run: crowdin upload  # Upload source to Crowdin
      - run: crowdin download  # Download translations
      - run: npm run build  # Verify build
      - uses: peter-evans/create-pull-request@v5
        with:
          title: 'chore(i18n): sync translations from Crowdin'
          body: 'Auto-synced translations. Review before merge.'
```

---

## IDEA 3: RTL Language Support with Tailwind CSS & Component Wrapping

**Title**: Right-to-left language support (Arabic, Hebrew, Persian) with layout reversals

**Category**: i18n

**Impact**: Medium

**Effort**: 3 Days

**Files Affected**:
- `app/layout.tsx` (MODIFY - add `dir` attribute)
- `styles/globals.css` (MODIFY - add RTL utilities)
- `components/locale-switcher.tsx` (CREATE - include RTL test toggle)
- `lib/i18n-config.ts` (MODIFY - add RTL map)
- Fumadocs wrapper component (CREATE or MODIFY)

**Why**: RTL languages (Arabic 310M speakers, Hebrew 9M, Persian 70M) are drastically underrepresented in tech docs. Supporting RTL removes a barrier to adoption in Middle East, North Africa, and Iran regions. Without proper RTL support, text direction breaks, spacing inverts unpredictably, and the site becomes unusable.

**Approach**: Add `dir="rtl"` to HTML element based on locale (e.g., if locale is `ar` or `he`, set RTL). Modify Tailwind CSS to use logical properties (`start`/`end` instead of `left`/`right`). Wrap Fumadocs components with locale context to ensure UI components (navigation, sidebar) flip correctly. Test with Chrome DevTools language/locale override (simulate Arabic).

**CSS Changes** (styles/globals.css):
```css
/* Add RTL utilities */
[dir="rtl"] {
  @apply text-right;
}

[dir="rtl"] .sidebar {
  @apply ml-0 mr-4;  /* Reverse margin */
}

[dir="rtl"] .nav-menu {
  @apply flex-row-reverse;
}

/* Use logical properties (Tailwind 4.1+) */
.sidebar {
  @apply ps-4 pe-2;  /* padding-start/padding-end auto-flip */
}
```

**Locale Config**:
```typescript
export const rtlLanguages = new Set(['ar', 'he', 'fa', 'ur', 'yi'])

export function isRTL(locale: string): boolean {
  return rtlLanguages.has(locale)
}
```

**Testing Strategy**: Use Playwright with Arabic font loaded, capture RTL visual regression snapshots, compare against baseline.

---

## IDEA 4: Locale-Aware Search Index with Per-Language Completions

**Title**: Fumadocs search index split by locale with language-specific metadata

**Category**: i18n

**Impact**: Medium

**Effort**: 1 Week

**Files Affected**:
- `source.config.ts` (MODIFY - add locale resolver)
- `app/api/search/route.ts` (MODIFY - filter by locale)
- `lib/docs.ts` (MODIFY - add locale metadata)
- Build scripts (MODIFY - generate locale-specific search indices)

**Why**: Fumadocs search currently indexes only English. A Spanish user searching for "flujo de trabajo" (workflow) gets no results because the index contains only English keywords. Locale-aware search ensures discoverability across languages and enables search analytics per language (e.g., "which terms confuse Japanese users?").

**Approach**: Modify Fumadocs source config to register locale as metadata in front matter. Split search index generation by locale during build (generates `search-en.json`, `search-es.json`, etc.). Update search API route to filter results by requested locale (from URL or cookie). Implement fallback: if no Spanish results, suggest English matches with a "not yet translated" badge.

**Implementation**:
```typescript
// source.config.ts - Add locale metadata extraction
export const docs = defineDocs({
  dir: 'content/docs',
  schema: frontmatterSchema.extend({
    locale: z.string().default('en'),  // From URL segment
  }),
})

// app/api/search/route.ts
export async function GET(req: NextRequest) {
  const locale = req.nextUrl.searchParams.get('locale') || 'en'
  const query = req.nextUrl.searchParams.get('q') || ''

  // Load locale-specific index
  const indexPath = `/r/search-${locale}.json`
  const index = await fetch(indexPath).then(r => r.json())

  // Filter & rank by relevance
  return Response.json(filterByQuery(index, query))
}
```

**Build Impact**: Adding 5 locales multiplies search index build time by ~5x (manageable with caching). Final indices are smaller per-locale because docs aren't yet fully translated.

---

## IDEA 5: Locale Switcher Component with Persistent Language Preference

**Title**: Sticky language selector UI with localStorage + cookie fallback

**Category**: i18n

**Impact**: Medium

**Effort**: 2 Days

**Files Affected**:
- `components/locale-switcher.tsx` (CREATE)
- `components/main-nav.tsx` (MODIFY - add switcher to navbar)
- `components/mode-switcher.tsx` (REFERENCE - follow existing pattern)
- `app/layout.tsx` (MODIFY - wrap with LanguageProvider)
- `lib/use-locale.ts` (CREATE - React hook for locale state)

**Why**: Users discovering the site in English may not realize translations exist. A prominent language switcher removes friction, enables users to switch mid-session, and persists preference across visits (better UX than resetting every reload). Current Fumadocs setup has no language awareness, so this is a visible gap.

**Approach**: Create `LocaleSwitcher` component mirroring the existing `ModeSwitch` pattern (dark/light theme toggle). Place in navbar or header. On selection, update URL via router + set localStorage + set cookie for middleware to read on next page load. Include visual indicator of current language. Optionally add "Help translate" link to Crowdin.

**Component Sketch** (components/locale-switcher.tsx):
```typescript
'use client'
import { useRouter, usePathname } from 'next/navigation'
import { locales, localeNames } from '@/lib/i18n-config'
import { useLocale } from '@/lib/use-locale'

export function LocaleSwitcher() {
  const router = useRouter()
  const pathname = usePathname()
  const currentLocale = useLocale()

  const handleChange = (newLocale: string) => {
    // Update URL
    const newPathname = pathname.replace(/^\/[a-z]{2}/, `/${newLocale}`)
    router.push(newPathname)

    // Persist preference
    localStorage.setItem('locale', newLocale)
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=${365 * 24 * 60 * 60}`
  }

  return (
    <select
      value={currentLocale}
      onChange={(e) => handleChange(e.target.value)}
      className="...styles..."
    >
      {locales.map((locale) => (
        <option key={locale} value={locale}>
          {localeNames[locale]}
        </option>
      ))}
    </select>
  )
}
```

**Placement**: Next to existing mode switcher (theme toggle) in header. Visual parity with ModeSwitch (dropdown or popover).

**Cookie Strategy**: Middleware reads `NEXT_LOCALE` cookie to detect user preference, falls back to Accept-Language header, then defaults to English.

---

## Implementation Priority Matrix

| Idea | Phase | Dependencies | Ready for PR? | Launch Blocker? |
|------|-------|--------------|---------------|-----------------|
| **Idea 1: Routing** | 1 | None | Week 1 | Yes (foundational) |
| **Idea 5: Switcher** | 1 | Idea 1 | Week 1 | Yes (UX) |
| **Idea 2: Crowdin** | 2 | Idea 1 | Week 2-3 | No (can run in parallel) |
| **Idea 4: Search** | 2 | Idea 1, 2 | Week 3-4 | No (can defer to v2) |
| **Idea 3: RTL** | 3 | Ideas 1-2 | Week 4 | No (phase into v2) |

---

## Recommended Rollout

**Week 1-2 (MVP)**: Launch Ideas 1 + 5 (routing + switcher)
- Enables URL-based locale selection
- Minimal user confusion with language picker
- No translation dependency

**Week 3-4 (Beta)**: Add Idea 2 (Crowdin)
- Enable Spanish, French, German, Japanese translations
- Open Crowdin for community contributions
- Set 80% completion target before shipping

**Week 5-6 (v1.1)**: Add Ideas 3 + 4 (RTL + Search)
- RTL in beta for Arabic/Hebrew interest
- Locale-aware search fully functional
- Monitor performance (search index size)

---

## Estimated Effort & Cost

| Phase | Duration | FTE Eng | Est. Cost (hiring) | Crowdin (annual) |
|-------|----------|---------|-------------------|------------------|
| MVP (Ideas 1+5) | 2 weeks | 1 | $2K (agency) | Free (community) |
| Beta (Idea 2) | 2 weeks | 1 | $2K | $240-600/year |
| v1.1 (Ideas 3+4) | 2 weeks | 1.5 | $3K | (same) |
| **Total** | **6 weeks** | **1 FTE** | **~$7K** | **~$300-600/yr** |

---

## Success Metrics

After 3 months:
- [ ] 40%+ traffic from non-English regions (monitor via analytics)
- [ ] 5+ languages at 70%+ translation completion
- [ ] 20+ community translators active on Crowdin
- [ ] Search queries in Spanish/French/German returning results
- [ ] Zero RTL-related bug reports (layout, text direction)
- [ ] Language switcher used by 30%+ of visitors
- [ ] Average session duration increases in non-English locales (indicates better UX)

---

## Next Steps

1. **Validate i18n-router choice** with tech lead (compare to alternative: custom middleware)
2. **Reserve 2 weeks** in Q1 roadmap for MVP (Ideas 1+5)
3. **Set up Crowdin project** in parallel (non-blocking)
4. **Draft translation glossary** (AgileFlow terms: epic, story, agent, babysit, skill, etc.)
5. **Announce in community** once MVP launches (Twitter, Discord, GitHub Discussions)

---

**Full Technical Research**: See `research-i18n-improvements.md` for detailed implementation guide, code examples, risks, and monitoring strategy.
