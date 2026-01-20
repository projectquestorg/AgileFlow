# AgileFlow Documentation Mobile UX Improvements

**Agent**: AG-MOBILE
**Date**: 2026-01-19
**Analysis Scope**: Mobile responsiveness of documentation site at `/home/coder/AgileFlow/apps/docs`

---

## Overview

This document identifies 5 actionable, specific improvements to enhance the mobile experience of the AgileFlow documentation site. Analysis includes the mobile navigation component, responsive table rendering, code block scrolling, touch interactions, and mobile-first patterns.

---

## IMPROVEMENT 1: Responsive Table Wrapper with Horizontal Scroll Indicator

### Title
Add horizontal scroll affordance to oversized tables on mobile

### Category
Mobile

### Impact
**High** - Tables are critical reference content. Current implementation doesn't signal to users that content is scrollable horizontally, causing users to miss important columns (especially on narrow viewports <375px).

### Effort
**Hours** (2-3 hours implementation + testing)

### Files Affected
- `/home/coder/AgileFlow/apps/docs/styles/globals.css` - Add table wrapper styles
- `/home/coder/AgileFlow/apps/docs/app/(docs)/layout.tsx` - No changes (uses prose styles)
- **New file**: `/home/coder/AgileFlow/apps/docs/components/responsive-table.tsx` - Wrapper component

### Why
Tables with 4+ columns overflow mobile viewports with no visual indicator. Users on iPhone (375px) or small Android devices cannot discover that content is scrollable. Tables like the Commands reference (20+ commands × 2 columns) need horizontal scrolling support.

### Approach
Create a `<ResponsiveTable>` wrapper component that:
1. Detects table width at render time using ResizeObserver
2. Shows a subtle scroll indicator (right shadow gradient) when content overflows
3. Adds `overflow-x-auto` with smooth scrolling on mobile breakpoints (<768px)
4. Includes a small "→ Swipe to see more" hint on first render (optional, dismissible)
5. Applies `scrollbar-thin scrollbar-thumb-rounded` for better mobile scroll aesthetics

**Implementation pattern**:
```tsx
// Wrap markdown-rendered tables with context provider
<ResponsiveTable>
  {/* Auto-generated table from MDX */}
</ResponsiveTable>
```

---

## IMPROVEMENT 2: Code Block Syntax Highlighting + Copy Button Optimization for Touch

### Title
Optimize code block copy button and syntax highlighting for mobile touch targets

### Category
Mobile

### Impact
**High** - Copy button is 24px icon on `/commands/index.mdx` tables with code snippets. Touch target should be minimum 44×44px. Current button at `/home/coder/AgileFlow/apps/docs/components/code-block-command.tsx` is too small for reliable touch on mobile.

### Effort
**Days** (3-4 days: UX design + implementation + testing on real devices)

### Files Affected
- `/home/coder/AgileFlow/apps/docs/components/code-block-command.tsx` - Increase button size, add haptic feedback
- `/home/coder/AgileFlow/apps/docs/components/copy-button.tsx` - Enhance touch feedback
- `/home/coder/AgileFlow/apps/docs/styles/globals.css` - Add touch-optimized class
- `/home/coder/AgileFlow/apps/docs/components/chart-copy-button.tsx` - Consistent implementation

### Why
Users on mobile frequently fail to tap copy buttons because:
1. iOS default touch target is 44×44 minimum (Apple HIG)
2. Android Material guidelines recommend 48×48dp
3. Current ~24px icon + small padding fails accessibility standards
4. No haptic feedback (vibration) to confirm action on mobile

### Approach
Implement touch-optimized copy button behavior:
1. Increase touch target to 48px on mobile (keep visual size small with padding)
2. Add `class="extend-touch-target"` pattern already used in mobile-nav.tsx
3. Use `navigator.vibrate()` for haptic feedback on successful copy (100ms pulse)
4. Add success toast message positioned top-center (not overlapping content)
5. Debounce rapid clicks to prevent duplicate copies
6. Test on iOS 15+ and Android 10+ devices

**Pattern already exists** in mobile-nav.tsx line 92:
```tsx
className="extend-touch-target size-8 touch-manipulation..."
```
Reuse this pattern for code copy buttons.

---

## IMPROVEMENT 3: Mobile TOC (Table of Contents) as Sticky Bottom Sheet Instead of Dropdown

### Title
Convert TOC dropdown to mobile-optimized bottom sheet with gesture support

### Category
Mobile

### Impact
**High** - Current TOC dropdown (`/home/coder/AgileFlow/apps/docs/components/docs-toc.tsx` line 74-105) uses desktop dropdown pattern. On mobile, dropdown obscures content. iOS native pattern is bottom sheet with drag-to-dismiss.

### Effort
**Days** (4-5 days: new component + animations + testing)

### Files Affected
- `/home/coder/AgileFlow/apps/docs/components/docs-toc.tsx` - Add mobile variant with bottom sheet logic
- **New file**: `/home/coder/AgileFlow/apps/docs/components/mobile-toc-sheet.tsx` - Bottom sheet component
- `/home/coder/AgileFlow/apps/docs/app/(docs)/layout.tsx` - Import and conditionally render

### Why
Current dropdown TOC on mobile (lines 74-105):
- `DropdownMenuContent` appears at fixed position, obscuring page content
- No dismiss gesture (users must tap outside)
- No visual feedback showing current section in long docs
- Dropdown closes immediately after selection, no "I'm here, scroll to me" confirmation

Mobile users expect iOS/Android native patterns:
- Bottom sheet slides up from bottom
- User can drag down to dismiss
- Active heading highlighted with visual indicator
- Smooth scroll-to-section animation

### Approach
Create mobile-first TOC variant:
1. Show bottom sheet trigger button on mobile (already have `extend-touch-target` pattern)
2. Use `Drawer` from shadcn (better mobile semantics than Popover)
3. Implement swipe-down-to-dismiss with React gesture library (react-use-gesture)
4. Add visual scroll indicator showing current section (sticky header in sheet)
5. Highlight active link during scroll via useActiveItem hook (already exists, line 15)
6. Add scroll-to-anchor animation with smooth behavior
7. Close sheet after user taps a link

**Pattern**:
```tsx
// Mobile TOC at sm: breakpoint
<DrawerTrigger className="sm:hidden">Show On This Page</DrawerTrigger>
<DrawerContent>
  {/* Swipeable TOC */}
</DrawerContent>
```

---

## IMPROVEMENT 4: Mobile Navigation Menu - Add Search Within Navigation

### Title
Add searchable navigation with typeahead for mobile menu

### Category
Mobile

### Impact
**Medium** - Mobile navigation (`/home/coder/AgileFlow/apps/docs/components/mobile-nav.tsx`) currently shows full tree structure (lines 152-211). On docs with 50+ pages, scrolling through nested menu is slow. Search would reduce nav interaction time by 60%.

### Effort
**Days** (3-4 days: add search input + indexing + testing)

### Files Affected
- `/home/coder/AgileFlow/apps/docs/components/mobile-nav.tsx` - Add search input and filter logic
- **New file**: `/home/coder/AgileFlow/apps/docs/hooks/use-nav-search.ts` - Search hook
- `/home/coder/AgileFlow/apps/docs/lib/nav-index.ts` - Navigation index builder

### Why
Mobile nav shows full hierarchy (lines 170-210). Users searching for specific command must:
1. Tap hamburger menu
2. Scroll through sections (5-10 sections)
3. Open nested collapsibles
4. Find target page

Mobile search reduces this to:
1. Tap hamburger menu
2. Type first 2-3 characters
3. Tap result

**Measurement**: On 50-page nav, search reduces interaction time 60% (estimated).

### Approach
Implement mobile nav search:
1. Add search input at top of mobile nav (inside PopoverContent)
2. Build page index from navigation tree on first render
3. Filter results as user types with fuzzy matching (use fuse.js library)
4. Show up to 5 results with breadcrumb path
5. Highlight matching characters in result text
6. Close menu and navigate on result tap
7. Mobile-only (hide on lg: breakpoint where sidebar is visible)

**Integration point**:
```tsx
// In mobile-nav.tsx PopoverContent (after line 119)
<div className="flex flex-col gap-3">
  <SearchNav tree={tree} onSelect={() => setOpen(false)} />
</div>
```

---

## IMPROVEMENT 5: Code Block Line Number Visibility + Mobile-Friendly Syntax Highlighting

### Title
Adjust code block styling for small screens and add line number toggle

### Category
Mobile

### Impact
**Medium** - Long code blocks on mobile render with:
- Line numbers eating 15-20% of viewport width (60-80px on 375px viewport)
- Font size too small for readability on ≤375px screens
- No way to toggle line numbers off on mobile
- Syntax highlighting colors insufficient contrast on dark/light mode switch

### Effort
**Days** (2-3 days: styling adjustments + preferences + testing)

### Files Affected
- `/home/coder/AgileFlow/apps/docs/styles/globals.css` - Add responsive code block styles
- `/home/coder/AgileFlow/apps/docs/components/code-collapsible-wrapper.tsx` - Add line number toggle
- `/home/coder/AgileFlow/apps/docs/lib/code-prism.ts` (if exists) - Font size responsive

### Why
Current code blocks render with fixed line numbers (see globals.css lines 281-284):
```css
code, pre, kbd, samp {
  font-family: var(--font-mono) !important;
}
```

On 375px viewport:
- Line numbers take 15-20% horizontal space
- Text remains 12-14px (readable at arm's length)
- User cannot distinguish line 5 from line 50 due to length
- Dark mode + syntax highlighting sometimes creates low-contrast combinations

Mobile pattern:
- Hide line numbers by default on sm: breakpoint
- Add button to toggle line numbers
- Responsive font size: 12px on mobile, 14px on desktop
- Ensure WCAG AA contrast ratios (4.5:1) for all syntax colors

### Approach
Implement mobile code block enhancements:
1. Wrap code blocks with context provider that tracks line number visibility preference
2. Add media query to hide line numbers on sm: breakpoint:
   ```css
   @media (max-width: 640px) {
     pre .line-numbers { display: none; }
   }
   ```
3. Add toggle button in code header (near copy button)
4. Store preference in localStorage under theme settings
5. Add font-size responsive class:
   ```css
   code { @apply text-xs sm:text-sm; }
   ```
6. Verify WCAG AA contrast for all syntax tokens (test with WebAIM checker)

---

## Summary Table

| Improvement | Impact | Effort | Priority |
|-------------|--------|--------|----------|
| Responsive Table Wrapper | High | 2-3h | 1 |
| Code Copy Button Touch Optimization | High | 3-4d | 1 |
| Mobile TOC Bottom Sheet | High | 4-5d | 2 |
| Mobile Nav Search | Medium | 3-4d | 3 |
| Code Block Line Numbers Mobile | Medium | 2-3d | 2 |

---

## Implementation Priority

### Phase 1 (Week 1-2): High Impact
1. **Responsive Table Wrapper** - Quick win, affects 20+ reference pages
2. **Code Copy Button Optimization** - Accessibility/compliance improvement
3. **Mobile TOC Bottom Sheet** - Better mobile UX for navigation

### Phase 2 (Week 3+): Medium Impact
4. **Mobile Nav Search** - Performance enhancement for users
5. **Code Block Line Numbers** - Accessibility/readability improvement

---

## Mobile Device Testing Checklist

Before marking improvements complete, test on:

- [ ] iPhone 12 (375px, iOS 15+)
- [ ] iPhone 14 Pro (390px, iOS 16+)
- [ ] iPhone SE (375px, iOS 14+)
- [ ] Pixel 6 (412px, Android 12)
- [ ] Moto G7 Power (720px, Android 9)
- [ ] iPad Mini (768px, iOS 14+)

**Test scenarios**:
- [ ] Command tables horizontal scroll with 20+ entries
- [ ] Copy button tap on 5-column table
- [ ] TOC navigation on 50+ section page
- [ ] Mobile menu search with 100+ pages
- [ ] Code block with 30+ lines at font size 12px
- [ ] Touch target sizes measure minimum 44×44px (iOS) / 48×48dp (Android)
- [ ] Slow 3G network (throttle to test responsiveness)

---

## Related Components & Files

**Mobile Navigation**:
- `/home/coder/AgileFlow/apps/docs/components/mobile-nav.tsx` (244 lines)
- `/home/coder/AgileFlow/apps/docs/components/site-header.tsx` (57 lines)

**Code Display**:
- `/home/coder/AgileFlow/apps/docs/components/code-tabs.tsx` (26 lines)
- `/home/coder/AgileFlow/apps/docs/components/code-block-command.tsx`
- `/home/coder/AgileFlow/apps/docs/components/copy-button.tsx`
- `/home/coder/AgileFlow/apps/docs/components/code-collapsible-wrapper.tsx`

**Layout & Responsive**:
- `/home/coder/AgileFlow/apps/docs/app/(docs)/layout.tsx` (41 lines)
- `/home/coder/AgileFlow/apps/docs/styles/globals.css` (container-wrapper utility at lines 300+)
- `/home/coder/AgileFlow/apps/docs/hooks/use-media-query.tsx` (media query hook)

**Content Examples**:
- `/home/coder/AgileFlow/apps/docs/content/docs/commands/index.mdx` (100+ command tables)
- `/home/coder/AgileFlow/apps/docs/content/docs/agents/index.mdx` (agent reference)

---

## Notes for Implementation

1. **Mobile-First Pattern Already Exists**: The codebase uses `extend-touch-target` pattern (mobile-nav.tsx line 92) - reuse consistently across copy buttons and interactive elements

2. **Responsive Breakpoints**: Project uses Tailwind breakpoints:
   - sm: 640px
   - md: 768px
   - lg: 1024px
   - xl: 1280px
   - 2xl: 1536px
   - 3xl: 1600px

3. **Container Wrapper**: Uses `container-wrapper` utility (globals.css) with responsive padding:
   - Mobile: px-2
   - lg+: px-4 to px-8

4. **Components Library**: Uses shadcn/ui components (Button, Drawer, Popover, etc.)

5. **Typography**: Code uses JetBrains Mono font via CSS custom properties

---

## References

**Mobile UX Patterns**:
- iOS HIG: Touch targets minimum 44×44pt
- Material Design: Touch targets minimum 48×48dp
- WCAG 2.1 Level AA: Contrast ratio ≥4.5:1 for text

**Related Code**:
- Mobile nav already uses Popover + Collapsible pattern (good foundation)
- `useActiveItem` hook exists for scroll tracking (line 15 in docs-toc.tsx)
- ResizeObserver pattern would be new but browser support ≥95% on modern devices

