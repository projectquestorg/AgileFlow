# AgileFlow Docs: i18n Implementation Deep Dive

**Target Audience**: Developers implementing the 5 i18n improvements
**Status**: Reference guide (use alongside I18N-IDEAS-AT-A-GLANCE.txt)

---

## Table of Contents

1. [Project Status Analysis](#project-status-analysis)
2. [Idea 1: Routing Implementation](#idea-1-routing-implementation)
3. [Idea 2: Crowdin Integration](#idea-2-crowdin-integration)
4. [Idea 3: RTL Support](#idea-3-rtl-support)
5. [Idea 4: Search Indices](#idea-4-search-indices)
6. [Idea 5: Locale Switcher](#idea-5-locale-switcher)
7. [Testing & Validation](#testing--validation)
8. [Deployment & Monitoring](#deployment--monitoring)

---

## Project Status Analysis

### Current Architecture

```
apps/docs/
├── package.json (v15.5.9 Next.js, Fumadocs 16.0.5)
├── next.config.mjs (NO i18n config)
├── source.config.ts (Fumadocs config, single dir: content/docs)
├── app/layout.tsx (lang="en" hardcoded, no locale param)
├── app/(docs)/[[...slug]]/page.tsx (slug-based routing)
├── content/docs/ (114 MDX files, English only)
│   ├── commands/ (43 files)
│   ├── agents/ (25 files)
│   ├── features/ (15 files)
│   ├── ... (31 more files)
└── NO middleware.ts (needed for i18n)
```

### Key Constraints

- **Fumadocs Version 16.0.5**: Modern, App Router native, but no built-in i18n
- **Next.js 15.5.9**: Supports middleware + App Router locale routing natively
- **No Existing Locale Infrastructure**: Every component assumes English
- **114 MDX Files**: Large content base; translation at scale requires automation
- **Hardcoded Metadata**: `lang="en"`, `openGraph.locale="en_US"` in layout

---

## Idea 1: Routing Implementation

### Step 1: Install Dependencies

```bash
npm install next-i18n-router
npm install --save-dev @types/next-i18n-router
```

### Step 2: Create Middleware

**File: `middleware.ts`** (at project root, same level as app/)

```typescript
import { createI18nMiddleware } from 'next-i18n-router/middleware'
import { type NextRequest } from 'next/server'

export const middleware = createI18nMiddleware({
  locales: ['en', 'es', 'fr', 'de', 'ja'],
  defaultLocale: 'en',
  localeCookie: 'NEXT_LOCALE',
})

export const config = {
  matcher: [
    // Include all paths EXCEPT:
    '/((?!_next|public|api|.*\\..*|rss).*)',
  ],
}
```

### Step 3: Create i18n Config

**File: `lib/i18n-config.ts`**

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

// RTL language map (for Idea 3)
export const rtlLanguages = new Set<Locale>(['ar', 'he', 'fa', 'ur', 'yi'])

export function isRTL(locale: Locale): boolean {
  return rtlLanguages.has(locale)
}

export function getDirection(locale: Locale): 'ltr' | 'rtl' {
  return isRTL(locale) ? 'rtl' : 'ltr'
}

// SEO
export const localeToHrefLang: Record<Locale, string> = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  ja: 'ja-JP',
}
```

### Step 4: Update Root Layout

**File: `app/layout.tsx`** (modify existing)

```typescript
import type { Metadata } from 'next'
import { type Locale, getDirection, localeToHrefLang } from '@/lib/i18n-config'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
// ... other imports

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://agileflow.dev'

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s - ${siteConfig.name}`,
  },
  metadataBase: new URL(APP_URL),
  description: siteConfig.description,
  keywords: ['Next.js', 'React', 'Tailwind CSS', 'Components', 'AgileFlow'],
  authors: [{ name: 'AgileFlow', url: 'https://agileflow.dev' }],
  creator: 'AgileFlow',
  openGraph: {
    type: 'website',
    locale: 'en_US', // Will be overridden by generateMetadata in child routes
    url: APP_URL,
    title: siteConfig.name,
    description: siteConfig.description,
    siteName: siteConfig.name,
    images: [
      {
        url: `${APP_URL}/opengraph-image.png`,
        width: 1200,
        height: 630,
        alt: siteConfig.name,
      },
    ],
  },
  alternates: {
    languages: {
      'en-US': `${APP_URL}/en`,
      'es-ES': `${APP_URL}/es`,
      'fr-FR': `${APP_URL}/fr`,
      'de-DE': `${APP_URL}/de`,
      'ja-JP': `${APP_URL}/ja`,
      'x-default': APP_URL,
    },
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.name,
    description: siteConfig.description,
    images: [`${APP_URL}/opengraph-image.png`],
    creator: '@agileflow',
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: `${siteConfig.url}/site.webmanifest`,
}

export default function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale?: Locale }> // Next.js 15 uses Promise for dynamic params
}>) {
  // Resolve async params
  const { locale = 'en' } = React.use(params) // Using React.use for Promise
  const direction = getDirection(locale as Locale)

  return (
    <html
      lang={locale}
      dir={direction}
      suppressHydrationWarning
      className={fontVariables}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.theme === 'dark' || ((!('theme' in localStorage) || localStorage.theme === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.querySelector('meta[name="theme-color"]').setAttribute('content', '${META_THEME_COLORS.dark}')
                }
                if (localStorage.layout) {
                  document.documentElement.classList.add('layout-' + localStorage.layout)
                }
              } catch (_) {}
            `,
          }}
        />
        <meta name="theme-color" content={META_THEME_COLORS.light} />
      </head>
      <body
        className={cn(
          'group/body overscroll-none antialiased [--footer-height:calc(var(--spacing)*14)] [--header-height:calc(var(--spacing)*14)] xl:[--footer-height:calc(var(--spacing)*24)]'
        )}
      >
        <ThemeProvider>
          <LayoutProvider>
            <ActiveThemeProvider>
              <NuqsAdapter>
                {children}
                <Toaster position="top-center" />
              </NuqsAdapter>
              <TailwindIndicator />
              <Analytics />
            </ActiveThemeProvider>
          </LayoutProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
```

### Step 5: Update Docs Route

**File: `app/(docs)/[[...slug]]/page.tsx`** (modify existing)

```typescript
import { type Locale } from '@/lib/i18n-config'
import { getPage } from 'fumadocs-core/source'
import { docs } from '@/source'
import { notFound } from 'next/navigation'

type Props = {
  params: Promise<{ locale: Locale; slug?: string[] }>
}

export default async function Page({ params }: Props) {
  const { locale, slug = [] } = await params

  // For now, load English docs for all locales (will be updated in Idea 2)
  const page = getPage(docs.getPages(), slug)

  if (!page) notFound()

  return (
    <>
      {/* Render page with locale context */}
      <div data-locale={locale}>
        {page.data.body}
      </div>
    </>
  )
}

export async function generateStaticParams() {
  // Generate routes for all locales + all slug combinations
  return docs
    .getPages()
    .flatMap((page) => {
      const slugs = page.file.path.split('/').slice(1) // Remove 'docs' prefix
      return [
        { locale: 'en', slug: slugs },
        { locale: 'es', slug: slugs },
        { locale: 'fr', slug: slugs },
        { locale: 'de', slug: slugs },
        { locale: 'ja', slug: slugs },
      ]
    })
}
```

### Step 6: Update Next.js Config

**File: `next.config.mjs`** (modify existing)

```javascript
import { createMDX } from "fumadocs-mdx/next"

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  outputFileTracingIncludes: {
    "/*": ["./registry/**/*"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "avatar.vercel.sh",
      },
    ],
  },
  redirects() {
    return [
      // OLD: /docs → / (keep for backwards compat)
      {
        source: "/docs",
        destination: "/",
        permanent: true,
      },
      // Keep locale-prefixed redirects
      {
        source: "/:locale(en|es|fr|de|ja)/docs",
        destination: "/:locale",
        permanent: true,
      },
    ]
  },
  rewrites() {
    return [
      {
        source: "/:locale(en|es|fr|de|ja)/:path*.md",
        destination: "/llm/:path*",
      },
      // Default English
      {
        source: "/:path*.md",
        destination: "/llm/:path*",
      },
    ]
  },
}

const withMDX = createMDX({})
export default withMDX(nextConfig)
```

### Verification

After implementing Idea 1:
- Navigate to `http://localhost:3002/en` → should show homepage in English
- Navigate to `http://localhost:3002/es` → URL changes, still shows English (expected until Idea 2)
- Check HTML: `<html lang="es" dir="ltr">` (locale updated)
- Cookie: Open DevTools > Application > Cookies, see `NEXT_LOCALE=es`

---

## Idea 2: Crowdin Integration

### Step 1: Create Locale Translation Files

**File: `locales/en.json`** (English UI strings)

```json
{
  "nav.home": "Home",
  "nav.docs": "Documentation",
  "nav.commands": "Commands",
  "nav.agents": "Agents",
  "nav.components": "Components",
  "nav.themes": "Themes",
  "footer.copyright": "Copyright 2026 AgileFlow. All rights reserved.",
  "search.placeholder": "Search documentation...",
  "search.notFound": "No results found.",
  "language": "Language",
  "theme": "Theme",
  "helpTranslate": "Help translate AgileFlow"
}
```

**File: `locales/es.json`** (Spanish - initially from Crowdin)

```json
{
  "nav.home": "Inicio",
  "nav.docs": "Documentación",
  "nav.commands": "Comandos",
  "nav.agents": "Agentes",
  "nav.components": "Componentes",
  "nav.themes": "Temas",
  "footer.copyright": "Copyright 2026 AgileFlow. Todos los derechos reservados.",
  "search.placeholder": "Buscar documentación...",
  "search.notFound": "No se encontraron resultados.",
  "language": "Idioma",
  "theme": "Tema",
  "helpTranslate": "Ayuda a traducir AgileFlow"
}
```

### Step 2: Create Translation Hook

**File: `lib/translations.ts`**

```typescript
import { Locale } from '@/lib/i18n-config'

// Import translation files
import en from '@/locales/en.json'
import es from '@/locales/es.json'
import fr from '@/locales/fr.json'
import de from '@/locales/de.json'
import ja from '@/locales/ja.json'

type TranslationKey = keyof typeof en

const translations: Record<Locale, Record<string, string>> = {
  en,
  es,
  fr,
  de,
  ja,
}

export function getTranslation(
  key: TranslationKey,
  locale: Locale = 'en'
): string {
  return translations[locale]?.[key] ?? translations['en'][key] ?? key
}

export function useTranslations(locale: Locale) {
  return (key: TranslationKey) => getTranslation(key, locale)
}
```

### Step 3: Create Crowdin Integration Script

**File: `scripts/extract-i18n-keys.js`**

```javascript
const fs = require('fs')
const path = require('path')
const matter = require('front-matter')

// Scan MDX files for translatable strings
function extractI18nKeys() {
  const localesDir = path.join(__dirname, '../locales')
  const enKeysPath = path.join(localesDir, 'en.json')

  // Read existing keys or start fresh
  let allKeys = fs.existsSync(enKeysPath)
    ? JSON.parse(fs.readFileSync(enKeysPath, 'utf-8'))
    : {}

  // Extract UI keys from components and layouts
  const componentsDir = path.join(__dirname, '../components')
  const libDir = path.join(__dirname, '../lib')

  // Add known UI keys (manual for now)
  const uiKeys = {
    'nav.home': 'Home',
    'nav.docs': 'Documentation',
    'nav.commands': 'Commands',
    'nav.agents': 'Agents',
    'nav.components': 'Components',
    'nav.themes': 'Themes',
    'footer.copyright': 'Copyright 2026 AgileFlow. All rights reserved.',
    'search.placeholder': 'Search documentation...',
    'search.notFound': 'No results found.',
    'language': 'Language',
    'theme': 'Theme',
    'helpTranslate': 'Help translate AgileFlow',
  }

  allKeys = { ...allKeys, ...uiKeys }

  // Sort alphabetically
  const sortedKeys = Object.keys(allKeys)
    .sort()
    .reduce((acc, key) => {
      acc[key] = allKeys[key]
      return acc
    }, {})

  // Write back
  fs.writeFileSync(enKeysPath, JSON.stringify(sortedKeys, null, 2))
  console.log(`Extracted ${Object.keys(sortedKeys).length} i18n keys to ${enKeysPath}`)
}

extractI18nKeys()
```

### Step 4: Create GitHub Workflow

**File: `.github/workflows/i18n-sync.yml`**

```yaml
name: i18n Sync with Crowdin

on:
  schedule:
    # Run every Monday at 9 AM UTC
    - cron: '0 9 * * MON'
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Extract i18n keys
        run: node scripts/extract-i18n-keys.js

      - name: Download translations from Crowdin
        run: npx crowdin download
        env:
          CROWDIN_PERSONAL_TOKEN: ${{ secrets.CROWDIN_TOKEN }}

      - name: Verify build
        run: pnpm build

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v5
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          commit-message: 'chore(i18n): sync translations from Crowdin'
          title: 'chore(i18n): sync translations from Crowdin'
          body: |
            Automated translation sync from Crowdin.

            **Translation status:**
            - Spanish: ${{ secrets.CROWDIN_STATUS_ES }}%
            - French: ${{ secrets.CROWDIN_STATUS_FR }}%
            - German: ${{ secrets.CROWDIN_STATUS_DE }}%
            - Japanese: ${{ secrets.CROWDIN_STATUS_JA }}%

            **Changes:**
            - Updated language files
            - Verified build passes

            Please review translation completeness before merging.
          branch: i18n/crowdin-sync
          delete-branch: true
          labels: i18n, automated
```

### Step 5: Crowdin Setup

1. Go to https://crowdin.com and create account
2. Create new project "AgileFlow Docs"
3. Upload `locales/en.json` as source
4. Add target languages: Spanish, French, German, Japanese
5. Set up GitHub integration:
   - Settings > Integrations > GitHub
   - Select repository
   - Configure automatic file mapping
6. Generate and add `CROWDIN_TOKEN` to GitHub Secrets

---

## Idea 3: RTL Support

### Step 1: Add RTL CSS Utilities

**File: `styles/globals.css`** (append to existing)

```css
/* RTL Support */
[dir="rtl"] {
  direction: rtl;
  text-align: right;
}

[dir="rtl"] .sidebar {
  @apply ml-0 mr-4;
}

[dir="rtl"] .nav-menu {
  @apply flex-row-reverse;
}

[dir="rtl"] .breadcrumb {
  @apply flex-row-reverse;
}

[dir="rtl"] ul {
  @apply pl-0 pr-6;
}

[dir="rtl"] li {
  @apply text-right;
}

/* Logical properties (Tailwind 4.1+) */
.spacing-x {
  @apply ps-4 pe-4; /* padding-start/end auto-flip */
}

.spacing-left {
  @apply ms-4; /* margin-start */
}

.spacing-right {
  @apply me-4; /* margin-end */
}
```

### Step 2: Update Layout (Already done in Idea 1)

The `dir` attribute is already set in `app/layout.tsx` via `getDirection()`.

### Step 3: RTL Testing Setup

**File: `playwright.config.ts`** (add RTL locale)

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  projects: [
    {
      name: 'chromium-en-LTR',
      use: { ...devices['Desktop Chrome'], locale: 'en-US' },
    },
    {
      name: 'chromium-ar-RTL',
      use: { ...devices['Desktop Chrome'], locale: 'ar-SA' },
    },
    {
      name: 'chromium-he-RTL',
      use: { ...devices['Desktop Chrome'], locale: 'he-IL' },
    },
  ],
})
```

### Verification

- Load `http://localhost:3002/ar` (if Arabic added)
- Inspect HTML: `<html lang="ar" dir="rtl">`
- CSS: flexbox reversed, text right-aligned
- Manual test in Chrome DevTools: Settings > Rendering > Emulate CSS media feature prefers-direction: rtl

---

## Idea 4: Search Indices

### Step 1: Update Source Config

**File: `source.config.ts`** (modify)

```typescript
import { defineConfig, defineDocs } from "fumadocs-mdx/config"
import { z } from "zod"

export default defineConfig({
  mdxOptions: {
    // ... existing config
  },
})

export const docs = defineDocs({
  dir: "content/docs",
  schema: z.object({
    locale: z.string().default('en'),
    title: z.string(),
    description: z.string().optional(),
  }),
})
```

### Step 2: Update Search Route

**File: `app/api/search/route.ts`** (modify)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { Locale } from '@/lib/i18n-config'

export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get('locale') as Locale || 'en'
  const query = request.nextUrl.searchParams.get('q') || ''

  if (!query) {
    return NextResponse.json([])
  }

  // Load locale-specific search index
  try {
    const indexPath = `/r/search-${locale}.json`
    const response = await fetch(new URL(indexPath, request.url))

    if (!response.ok) {
      // Fallback to English
      const fallbackPath = `/r/search-en.json`
      const fallbackResponse = await fetch(new URL(fallbackPath, request.url))
      const index = await fallbackResponse.json()
      return NextResponse.json(filterResults(index, query, true))
    }

    const index = await response.json()
    return NextResponse.json(filterResults(index, query, false))
  } catch (error) {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}

function filterResults(
  index: any[],
  query: string,
  isFallback: boolean
): any[] {
  const lowerQuery = query.toLowerCase()

  return index
    .filter(
      (item: any) =>
        item.title.toLowerCase().includes(lowerQuery) ||
        item.description?.toLowerCase().includes(lowerQuery)
    )
    .map((item: any) => ({
      ...item,
      isFallback, // Mark as fallback for UI (optional "not translated yet" badge)
    }))
}
```

---

## Idea 5: Locale Switcher

### Step 1: Create Hook

**File: `lib/use-locale.ts`**

```typescript
'use client'

import { useParams } from 'next/navigation'
import { Locale } from '@/lib/i18n-config'

export function useLocale(): Locale {
  const params = useParams()
  return (params.locale as Locale) || 'en'
}
```

### Step 2: Create Component

**File: `components/locale-switcher.tsx`**

```typescript
'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useLocale } from '@/lib/use-locale'
import { locales, localeNames } from '@/lib/i18n-config'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function LocaleSwitcher() {
  const router = useRouter()
  const pathname = usePathname()
  const currentLocale = useLocale()

  const handleChange = (newLocale: string) => {
    // Replace locale in pathname
    const newPathname = pathname.replace(
      /^\/[a-z]{2}(\/|$)/,
      `/${newLocale}$1`
    ) || `/${newLocale}`

    // Update URL
    router.push(newPathname)

    // Persist preference in localStorage
    localStorage.setItem('preferredLocale', newLocale)

    // Set cookie for server-side middleware
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=${365 * 24 * 60 * 60}`
  }

  return (
    <Select value={currentLocale} onValueChange={handleChange}>
      <SelectTrigger className="w-[120px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {locales.map((locale) => (
          <SelectItem key={locale} value={locale}>
            {localeNames[locale]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
```

### Step 3: Add to Navigation

**File: `components/main-nav.tsx`** (modify existing, add LocaleSwitcher)

```typescript
// ... existing imports
import { LocaleSwitcher } from '@/components/locale-switcher'
import { ModeSwitch } from '@/components/mode-switcher'

export function MainNav() {
  return (
    <nav className="flex items-center justify-between">
      {/* Navigation menu */}
      <div className="flex items-center gap-4">
        {/* Existing menu items */}
      </div>

      {/* Right side: theme toggle + language switcher */}
      <div className="flex items-center gap-2">
        <LocaleSwitcher />
        <ModeSwitch />
      </div>
    </nav>
  )
}
```

---

## Testing & Validation

### Unit Tests

**File: `__tests__/lib/i18n-config.test.ts`**

```typescript
import { isRTL, getDirection, locales } from '@/lib/i18n-config'

describe('i18n-config', () => {
  it('should identify RTL languages', () => {
    // Note: Arabic/Hebrew not in locales yet, but future-proofing
    expect(isRTL('ar')).toBe(true)
    expect(isRTL('he')).toBe(true)
    expect(isRTL('en')).toBe(false)
  })

  it('should return correct direction', () => {
    expect(getDirection('en')).toBe('ltr')
    expect(getDirection('ar')).toBe('rtl')
  })

  it('should have all locales defined', () => {
    expect(locales).toContain('en')
    expect(locales.length).toBeGreaterThanOrEqual(5)
  })
})
```

### Integration Tests

**File: `e2e/locale-routing.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'

test('locale routing works', async ({ page }) => {
  // Test English
  await page.goto('/en')
  expect(page.locator('html')).toHaveAttribute('lang', 'en')
  expect(page.locator('html')).toHaveAttribute('dir', 'ltr')

  // Test Spanish
  await page.goto('/es')
  expect(page.locator('html')).toHaveAttribute('lang', 'es')
  expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
})

test('language switcher persists preference', async ({ page }) => {
  await page.goto('/en')

  // Change language
  await page.selectOption('select', 'es')

  // Wait for navigation
  await page.waitForURL('**/es/**')

  // Reload page
  await page.reload()

  // Should still be in Spanish
  expect(page).toHaveURL(/\/es\//)
  expect(page.locator('html')).toHaveAttribute('lang', 'es')
})
```

---

## Deployment & Monitoring

### Build Configuration

**File: `vercel.json`** (if using Vercel)

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "env": {
    "NEXT_PUBLIC_APP_URL": "@app-url"
  }
}
```

### Environment Variables

**File: `.env.local`** (local development)

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3002
CROWDIN_TOKEN=xxxx
```

### Performance Monitoring

**File: `lib/analytics.ts`** (add locale tracking)

```typescript
export function trackLocaleSwitch(fromLocale: string, toLocale: string) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'locale_switch', {
      from_locale: fromLocale,
      to_locale: toLocale,
    })
  }
}

export function trackTranslationQuality(locale: string, completionPercent: number) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'translation_status', {
      locale,
      completion_percent: completionPercent,
    })
  }
}
```

### Monitoring Checklist

- Build time increase: <20%
- Search index size: <5x
- Middleware latency: <5ms per request
- Translation coverage: >80% before v1 launch
- RTL regression: Zero layout breaks
- Locale switcher usage: >30% of sessions

---

**End of Implementation Guide**
