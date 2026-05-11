# Workflow: Audit a Page for Accessibility Issues

Use this workflow when a user wants to assess an existing page or component for WCAG 2.2 compliance and receive a prioritised fix list.

**Time estimate:** 1–3 hours for a typical page (more for complex SPAs or forms-heavy flows)

---

## Step 0: Gather Context

Before auditing, ask (or infer from context):

1. **What is the page?** URL, route, or component name.
2. **What WCAG level?** Default: AA. Government/education/healthcare: potentially AAA.
3. **What is the tech stack?** React, Vue, Angular, plain HTML — affects tool recommendations.
4. **Are there known issues?** User may already know about specific failures.
5. **What is the scope?** Single component, full page, or an entire user flow?

If the user has shared code, read the relevant component files before beginning.

---

## Step 1: Run Automated Scan

Automated tools are fast and objective. Run first to identify the baseline.

### Option A: axe DevTools Browser Extension (for live pages)

1. Open the page in Chrome or Firefox
2. Open DevTools → axe DevTools tab (install from Chrome Web Store if needed)
3. Click "Scan all of my page"
4. Export results as CSV or screenshot

### Option B: axe-core in code (for components under test)

```js
// Run axe on the rendered component
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";

const { container } = render(<YourPage />);
const results = await axe(container);
console.log(JSON.stringify(results.violations, null, 2));
```

### Option C: Lighthouse in Chrome DevTools

1. Open DevTools → Lighthouse tab
2. Select "Accessibility" category
3. Run audit
4. Review violations in the report

### Option D: Pa11y CLI (for server-rendered pages or pages behind auth)

```bash
npx pa11y --standard WCAG2AA http://localhost:3000/your-page
# or with auth actions:
npx pa11y --standard WCAG2AA --action "navigate to http://localhost:3000/login" \
  --action "set field #email to test@example.com" \
  --action "click element button[type=submit]" \
  http://localhost:3000/dashboard
```

### What to record from the automated scan:

| Violation              | WCAG criterion   | Element          | Severity |
| ---------------------- | ---------------- | ---------------- | -------- |
| Image missing alt text | 1.1.1 (A)        | `img.hero-image` | Critical |
| Input has no label     | 1.3.1, 4.1.2 (A) | `input#email`    | Critical |
| Contrast ratio 2.1:1   | 1.4.3 (AA)       | `.btn-secondary` | Serious  |
| etc.                   |                  |                  |          |

---

## Step 2: Keyboard Navigation Audit

Automated tools cannot verify keyboard operability. Test manually.

### Procedure:

1. Close DevTools and other overlays
2. Click in the browser address bar to start keyboard focus outside the page
3. Press Tab to enter the page

### Work through this checklist:

**Navigation and structure:**

- [ ] Skip link appears and works (jumps to `#main-content`)
- [ ] Tab reaches every interactive element: links, buttons, inputs, selects, custom widgets
- [ ] Focus order is logical — matches visual reading order
- [ ] No unexpected focus jumps (focus jumping to header or footer mid-page)
- [ ] No keyboard traps — Tab can always move forward; Shift+Tab can always move back

**Interactive elements:**

- [ ] All buttons activate with Enter and Space
- [ ] All links activate with Enter
- [ ] Radio groups and checkboxes navigate with arrow keys
- [ ] Native select elements navigate with arrow keys
- [ ] Custom dropdowns, date pickers, accordions, tabs respond to keyboard
- [ ] Modal dialogs: focus trapped inside, Escape closes, focus returns to trigger

**Focus indicator:**

- [ ] Focus indicator visible on every Tab stop — no element loses focus ring
- [ ] Focus indicator has sufficient contrast against surrounding colours
- [ ] Focus not hidden behind sticky header, cookie banner, or chat widget

### Record keyboard failures:

| Element          | Issue                                     | WCAG criterion |
| ---------------- | ----------------------------------------- | -------------- |
| `.custom-select` | Not reachable by Tab                      | 2.1.1 (A)      |
| `#modal`         | Focus escapes modal, background focusable | 2.1.1 (A)      |
| `.tab-btn`       | Focus ring hidden by `outline: none`      | 2.4.7 (AA)     |

---

## Step 3: Screen Reader Walkthrough

Select the screen reader most relevant to your users or test with VoiceOver (most accessible on macOS dev machines).

### VoiceOver on macOS (Safari):

1. Enable: `Cmd + F5`
2. Open the rotor: `VO + U` → check Headings, Landmarks, Links, Form Controls
3. Navigate by heading: `VO + Cmd + H`
4. Navigate by form control: `VO + Cmd + J`
5. Navigate landmarks: `VO + Cmd + L`

### What to listen for:

**Page structure:**

- [ ] Page title announced when tab opens
- [ ] Heading hierarchy logical (h1 → h2 → h3, no skipped levels)
- [ ] Landmarks present: main, nav, header, footer (check rotor)
- [ ] `<nav>` has descriptive `aria-label` if multiple navs exist

**Images:**

- [ ] Informative images: meaningful alt text announced
- [ ] Decorative images: skipped (alt="" or aria-hidden)
- [ ] Icon buttons: aria-label announced, SVG not announcing raw markup

**Forms:**

- [ ] Each input announces its label when focused
- [ ] Required fields announced as required
- [ ] Error messages announced when form submitted with errors
- [ ] Error correction instructions announced

**Dynamic content:**

- [ ] Toast notifications announced via aria-live
- [ ] Loading states announced
- [ ] Success/failure messages announced without moving focus unexpectedly

**Modals:**

- [ ] Dialog announced as "web dialog" with its title when opened
- [ ] Focus trapped inside; background content not reachable

### Record screen reader failures:

| Element          | Issue                            | WCAG criterion |
| ---------------- | -------------------------------- | -------------- |
| `img.chart`      | "image" announced, no alt text   | 1.1.1 (A)      |
| `input#search`   | "text field" announced, no label | 4.1.2 (A)      |
| `#success-toast` | Not announced after save         | 4.1.3 (AA)     |

---

## Step 4: Colour Contrast Check

1. Open Chrome DevTools → Elements panel
2. Click any text element → Styles panel → click colour swatch → view contrast ratio
3. Check against thresholds: 4.5:1 for normal text, 3:1 for large text, 3:1 for UI components

**Priority spots to check:**

- Body text on page background
- Button text on button background
- Link text on page background
- Placeholder text on input background
- Error text on page background
- Focus ring against adjacent backgrounds
- Icon colour against adjacent background
- Chart/graph colour against background

Use [Colour Contrast Analyser](https://www.tpgi.com/color-contrast-checker/) for picking exact pixel colours from screenshots.

---

## Step 5: Classify and Prioritise Findings

Classify each finding by severity and WCAG level to create a prioritised fix list.

### Severity classification:

| Severity     | Definition                                        | Examples                                                              |
| ------------ | ------------------------------------------------- | --------------------------------------------------------------------- |
| **Critical** | Completely blocks access for a user group         | No keyboard access to a feature, screen reader can't read form labels |
| **Serious**  | Major barrier — significantly degrades experience | Missing alt text on informational image, contrast ratio below 3:1     |
| **Moderate** | Inconvenience — can work around with effort       | Missing skip link, non-descriptive link text                          |
| **Minor**    | Best practice deviation                           | Redundant alt text, slightly inconsistent heading structure           |

### Fix priority order:

1. Level A violations (Critical and Serious first)
2. Level AA violations (Critical and Serious first)
3. Level A violations (Moderate)
4. Level AA violations (Moderate)
5. Level A/AA violations (Minor)
6. Level AAA improvements (if time permits)

---

## Step 6: Document and Report

Produce a findings document for the team:

```markdown
# Accessibility Audit: [Page Name]

**Date:** [date]
**WCAG standard:** 2.2 AA
**Tools used:** axe-core, VoiceOver + Safari, keyboard testing
**Automated score:** Lighthouse 72/100

## Summary

- Critical: 3 issues (block access entirely)
- Serious: 5 issues (major barriers)
- Moderate: 4 issues (workarounds exist)
- Minor: 2 issues (best practice)

## Critical Issues

### 1. Search form has no label

**WCAG:** 1.3.1 Info and Relationships (A), 4.1.2 Name, Role, Value (A)
**Element:** `input#search`
**Fix:** Add `<label for="search">Search</label>` or `aria-label="Search"`
**Effort:** 5 minutes

### 2. [Next issue...]

## Recommended fix order

[Ordered list of issues with estimated effort]
```

---

## Step 7: Fix by Priority

Work through issues from critical to minor. For each fix:

1. Apply the fix (see `references/aria-patterns.md` for patterns)
2. Re-run axe-core on the affected component
3. Re-test with keyboard for the specific interaction
4. Re-verify with screen reader if applicable

### Common quick fixes (< 30 minutes each):

| Issue                | Fix                                                                          |
| -------------------- | ---------------------------------------------------------------------------- |
| Image missing alt    | Add `alt="descriptive text"` or `alt=""` for decorative                      |
| Input missing label  | Wrap in `<label>` or add `aria-label` / `aria-labelledby`                    |
| Icon button no name  | Add `aria-label="Action name"` to button                                     |
| Error not announced  | Add `role="alert"` or `aria-live="polite"` to error container                |
| Focus ring removed   | Remove `outline: none`; add custom `:focus-visible` style                    |
| Skip link missing    | Add `<a href="#main" class="skip-link">Skip to main content</a>`             |
| Missing page title   | Update `<title>` element (for SPAs: update `document.title` on route change) |
| Placeholder as label | Add `<label>` element associated with input                                  |

---

## Step 8: Verify Fixes

After implementing fixes:

- [ ] Re-run automated scan — zero critical violations
- [ ] Re-run keyboard navigation checklist — all items pass
- [ ] Re-test affected components with screen reader
- [ ] Lighthouse accessibility score ≥ 90
- [ ] Add axe-core tests to the test suite for audited components to prevent regression

### Regression prevention:

```js
// Add to test suite for every audited component
it("has no axe violations", async () => {
  const { container } = render(<AuditedComponent />);
  expect(await axe(container)).toHaveNoViolations();
});

// Test all major states
it("has no axe violations in error state", async () => {
  const { container } = render(<AuditedComponent hasErrors />);
  expect(await axe(container)).toHaveNoViolations();
});

it("has no axe violations in loading state", async () => {
  const { container } = render(<AuditedComponent isLoading />);
  expect(await axe(container)).toHaveNoViolations();
});
```
