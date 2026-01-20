# Research: AgileFlow Docs Internationalization Improvements

**Date**: 2026-01-19
**Researcher**: RESEARCH Agent
**Status**: Active
**Target**: AgileFlow Documentation Site (apps/docs)

## Summary

The AgileFlow documentation site (114 MDX files, Next.js 15 + Fumadocs) currently supports English only. This research identifies 5 prioritized i18n improvements to enable multi-language support, focusing on translation workflow automation, locale routing, RTL language support, and community-driven translations. Recommended approach: Phase 1 = next-i18n-router setup (2 weeks), Phase 2 = translation infrastructure + community tools (4 weeks).

## Key Findings

1. **Current State is English-Only**: Root layout hardcoded to `lang="en"` (app/layout.tsx:70), no locale detection, no language routing mechanism, metadata locale fixed to "en_US".

2. **Fumadocs Supports Custom Routing**: Fumadocs (v16.0.5) uses standard Next.js App Router with source.config.ts for content management; no built-in i18n but fully compatible with next-i18n-router pattern.

3. **Documentation Structure is Flat**: 114 MDX files in `content/docs/` with simple slug-based navigation (no nested locale folders), making locale migration non-breaking if done with middleware + rewrite strategy.

4. **Next.js 15 Native i18n Support**: App Router fully supports locale middleware (via `next-i18n-router` or custom), URL patterns (`/[locale]/docs/...`), and automatic language detection from Accept-Language headers.

5. **RTL Languages Need Layout Adjustments**: Current CSS uses left-aligned defaults (Tailwind); RTL (Arabic, Hebrew, Persian) requires: `dir="rtl"`, RTL text utilities, flexbox direction changes, spacing reversals. Fumadocs UI components may need wrapper adjustments.

## Recommended Approach

**Three-Phase Strategy** (12 weeks total):
- **Phase 1** (2 weeks): i18n routing infrastructure + locale switching UI
- **Phase 2** (4 weeks): Translation workflow + Crowdin/i18n integration
- **Phase 3** (6 weeks): Community launch + monitoring

**Initial Languages**: English, Spanish, French, German, Japanese (cover 60% of tech docs audience)

## Implementation Steps

### Phase 1: Routing & Locale Detection (Weeks 1-2)

1. Install `next-i18n-router` and locale utilities:
   ```bash
   npm install next-i18n-router next-i18n-router-middleware
   ```

2. Create locale middleware at `middleware.ts`:
   ```typescript
   import { createI18nMiddleware } from 'next-i18n-router/middleware'
   import { NextRequest } from 'next/server'

   export const middleware = createI18nMiddleware({
     locales: ['en', 'es', 'fr', 'de', 'ja'],
     defaultLocale: 'en',
     localeCookie: 'NEXT_LOCALE',
   })

   export const config = {
     matcher: ['/((?!_next|public|api).*)'],
   }
   ```

3. Update `app/layout.tsx` to accept locale from URL:
   ```typescript
   export default function RootLayout({
     children,
     params,
   }: {
     children: React.ReactNode
     params: { locale: string }
   }) {
     return (
       <html lang={params.locale} dir={params.locale === 'ar' || params.locale === 'he' ? 'rtl' : 'ltr'}>
         {/* ... */}
       </html>
     )
   }
   ```

4. Refactor `app/(docs)/[[...slug]]/page.tsx` to handle locale segment:
   ```typescript
   type Props = {
     params: { locale: string; slug?: string[] }
   }

   export default function DocsPage({ params }: Props) {
     const { locale, slug = [] } = params
     // Pass locale to content resolution
   }
   ```

5. Create `lib/i18n-config.ts`:
   ```typescript
   export const locales = ['en', 'es', 'fr', 'de', 'ja'] as const
   export const defaultLocale = 'en' as const
   export type Locale = (typeof locales)[number]

   export const localeNames: Record<Locale, string> = {
     en: 'English',
     es: 'Español',
     fr: 'Français',
     de: 'Deutsch',
     ja: '日本語',
   }
   ```

6. Add locale switcher component (`components/locale-switcher.tsx`):
   ```typescript
   'use client'
   import { useRouter, usePathname } from 'next/navigation'
   import { locales } from '@/lib/i18n-config'

   export function LocaleSwitcher() {
     const router = useRouter()
     const pathname = usePathname()

     const handleChange = (locale: string) => {
       const newPathname = pathname.replace(/^\/[a-z]{2}/, `/${locale}`)
       router.push(newPathname)
     }

     return (
       <select onChange={(e) => handleChange(e.target.value)}>
         {locales.map((locale) => (
           <option key={locale} value={locale}>{locale}</option>
         ))}
       </select>
     )
   }
   ```

### Phase 2: Translation Infrastructure (Weeks 3-6)

1. Set up Crowdin integration:
   - Create Crowdin project, sync to `content/docs/` source (English)
   - Configure automated PRs for translation updates
   - Structure: `content/docs/[locale]/commands/`, `content/docs/[locale]/agents/`, etc.

2. Create translation key extraction script (`scripts/extract-i18n-keys.js`):
   - Parse all `.mdx` frontmatter + headings
   - Extract UI strings (navigation, buttons, labels) into `locales/en.json`
   - Generate placeholders for other languages

3. Set up JSON-based UI translation fallback (`lib/translations.ts`):
   ```typescript
   import en from '@/locales/en.json'
   import es from '@/locales/es.json'
   // ... other languages

   const translations = { en, es, fr, de, ja }

   export function t(key: string, locale: string = 'en'): string {
     return translations[locale as keyof typeof translations]?.[key] || translations.en[key]
   }
   ```

4. Create Fumadocs metadata translation layer:
   - Wrap Fumadocs components with locale context
   - Pass translated titles/descriptions to search index
   - Generate locale-aware sitemaps

5. Build translation CI workflow (`.github/workflows/i18n-sync.yml`):
   - Trigger: Manual or on Crowdin sync
   - Steps: Extract keys → Pull translations → Build → Deploy staging
   - Preview link in Crowdin PRs

### Phase 3: Community Launch (Weeks 7-12)

1. Create translation contributor guide (`docs/i18n/TRANSLATING.md`):
   - Link to Crowdin project
   - Glossary of AgileFlow terms (epic, story, agent, etc.)
   - Review process for community PRs

2. Add language metadata to `package.json`:
   ```json
   {
     "i18n": {
       "locales": ["en", "es", "fr", "de", "ja"],
       "defaultLocale": "en",
       "crowdinProjectId": "12345",
       "completionThreshold": 80
     }
   }
   ```

3. Monitor translation status dashboard (Crowdin reporting):
   - Embed completion % in docs homepage
   - Highlight in-progress languages

## Risks & Considerations

- **Content Drift**: MDX source in `content/docs/` must stay canonical; translations lag by nature. Versioning strategy needed (only translate stable releases).
- **Search Indexing**: Fumadocs search builds index per locale; multiplies index size by 5x. Consider lazy-loading indices or separate search endpoints per locale.
- **RTL Testing**: Hebrew/Arabic text + UI components need visual regression testing. Tailwind flex-direction reversals can break layouts subtly.
- **Crowdin Sync Latency**: Automated syncs may create stale PR cycles. Implement debouncing (e.g., sync daily, not per commit).
- **Component Code Not Translatable**: Demo code blocks in MDX (e.g., `<Button>Click me</Button>`) contain hardcoded English. Translation comments needed or i18n wrapper components.

## Trade-offs

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **A: Full File Replication** | `content/docs/en/`, `content/docs/es/`, etc. | Clear separation, easy to understand | Duplicate maintenance, storage overhead, complex Fumadocs config |
| **B: Middleware + Key Extraction (Recommended)** | Keep single English source, extract UI strings to JSON, stream translations via middleware | Minimal duplication, single source of truth, Fumadocs unaware | More complex middleware logic, fallback handling needed |
| **C: Third-party i18n SaaS** | Use Lokalise/Phrase/Weglot | Full-stack solution, no setup | Proprietary lock-in, cost per locale |

**Recommended: Option B** - Balances maintainability with Fumadocs compatibility.

## Sources

- [Next.js Internationalization Routing](https://nextjs.org/docs/app/building-your-application/routing/internationalization) - Retrieved 2026-01-19
- [next-i18n-router GitHub](https://github.com/UnlyEd/next-i18n-router) - Retrieved 2026-01-19
- [Fumadocs Documentation](https://fumadocs.vercel.app/docs) - v16.0.5, Retrieved 2026-01-19
- [Next.js 15 App Router Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware) - Retrieved 2026-01-19
- [Tailwind CSS RTL Support](https://tailwindcss.com/docs/dir) - Retrieved 2026-01-19
- [W3C: Structural Markup and Right-to-Left Text](https://www.w3.org/International/questions/qa-html-dir) - Retrieved 2026-01-19

## Related

- ADRs: [Decision on docs platform choice]
- Epics: EP-DOCS (Documentation Platform)
- Stories: [Future i18n epic US-XXXX]
- Components: `LocaleSwitcher`, `locale middleware`, Crowdin sync workflow

## Implementation Files (Affected/Created)

### Modified Files
- `app/layout.tsx` - Add locale param, set `lang` + `dir` attributes
- `app/(docs)/[[...slug]]/page.tsx` - Handle locale routing
- `next.config.mjs` - Add i18n config + locale rewrite rules (if needed)
- `source.config.ts` - Register locale resolvers

### New Files to Create
- `middleware.ts` - Locale detection + routing
- `lib/i18n-config.ts` - Locale constants, names, RTL map
- `lib/translations.ts` - Translation key resolver
- `components/locale-switcher.tsx` - Language selector UI
- `locales/en.json`, `locales/es.json`, etc. - UI strings
- `scripts/extract-i18n-keys.js` - Crowdin integration helper
- `.github/workflows/i18n-sync.yml` - Crowdin CI sync
- `docs/i18n/TRANSLATING.md` - Community contribution guide

### Directory Structure After Implementation
```
apps/docs/
├── content/docs/          # English source (canonical)
│   ├── commands/
│   ├── agents/
│   └── features/
├── locales/               # NEW: UI translation JSONs
│   ├── en.json
│   ├── es.json
│   ├── fr.json
│   ├── de.json
│   └── ja.json
├── app/
│   ├── layout.tsx         # MODIFIED: Accept locale
│   ├── (docs)/
│   │   └── [[...slug]]/
│   │       └── page.tsx   # MODIFIED: Locale routing
│   └── ...
├── components/
│   └── locale-switcher.tsx # NEW
├── lib/
│   ├── i18n-config.ts    # NEW
│   └── translations.ts   # NEW
├── middleware.ts          # NEW
├── scripts/
│   └── extract-i18n-keys.js # NEW
├── .github/workflows/
│   └── i18n-sync.yml      # NEW
└── docs/
    └── i18n/
        └── TRANSLATING.md # NEW
```

## Notes

**Phasing Rationale**:
- Phase 1 (routing) unblocks UI translation in parallel (can start Week 2)
- Phase 2 (infrastructure) depends on Phase 1, enables Crowdin automation
- Phase 3 (community) can begin once Phase 1 complete, runs independently

**Testing Strategy**:
- Unit: Locale extraction, key resolution, RTL detection
- Integration: Middleware locale routing, Crowdin sync CI
- E2E: Language switcher, multilingual search, RTL layout regression (use Playwright visual snapshots for Arabic/Hebrew)

**Performance Considerations**:
- Locale detection in middleware (2-5ms overhead)
- Translation lookup O(1) via JSON object (negligible)
- Fumadocs index: Build all locales once (adds ~20% to build time)
- CDN edge caching: Set `Cache-Control: public, s-maxage=86400` for locale-specific routes

**Community Contribution Path**:
1. Non-engineers: Crowdin UI (no code needed)
2. Developers: Fork repo, edit `locales/XX.json`, submit PR (auto-validated)
3. Content: Review via Crowdin dashboard before merge

**Launch Readiness Checklist**:
- [ ] Middleware tested with all 5 locales
- [ ] RTL layout tested in Chrome DevTools Arabic mode
- [ ] Crowdin project linked + sync working
- [ ] Locale switcher visible on all pages (including homepage)
- [ ] Search works in all languages
- [ ] Sitemap includes all locale variants
- [ ] Docs/TRANSLATING.md published
- [ ] Crowdin link in footer/navbar
- [ ] Blog post announcing community translations
