# Accessibility Testing Checklist

Automated tools catch approximately 30–40% of WCAG issues. The remaining 60–70% require manual testing with keyboard navigation, screen readers, and human judgement. Both layers are mandatory for a credible accessibility posture.

---

## Automated Testing Tools

### axe-core (Primary — integrate in unit tests)

The most widely adopted open-source accessibility engine, used by browser extensions (axe DevTools), CI pipelines, and testing frameworks.

```bash
npm install --save-dev axe-core @axe-core/react vitest-axe
# or for Jest:
npm install --save-dev axe-core @axe-core/react jest-axe
```

**Vitest + React Testing Library:**

```js
// src/components/LoginForm.test.jsx
import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "vitest-axe";
import { expect, it } from "vitest";
import { LoginForm } from "./LoginForm";

expect.extend(toHaveNoViolations);

it("LoginForm has no axe violations", async () => {
  const { container } = render(<LoginForm />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});

// Test interactive states too
it("LoginForm error state has no axe violations", async () => {
  const { container } = render(<LoginForm showErrors />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

**Jest equivalent:**

```js
import { axe, toHaveNoViolations } from "jest-axe";
expect.extend(toHaveNoViolations);

test("has no axe violations", async () => {
  const { container } = render(<MyComponent />);
  expect(await axe(container)).toHaveNoViolations();
});
```

**Configuring axe rules:**

```js
const results = await axe(container, {
  rules: {
    // Disable rules that don't apply to your context
    "color-contrast": { enabled: false }, // if you handle contrast via design tokens
    region: { enabled: false }, // if your component is intentionally not in a landmark
  },
});
```

**What axe catches automatically:**

- Missing image alt text
- Form inputs without labels
- Insufficient colour contrast (approximate — verify with dedicated tool)
- Missing document language
- Missing page title
- Duplicate IDs
- Invalid ARIA roles, properties, and values
- Focusable elements with aria-hidden
- Missing required ARIA children

**What axe does NOT catch:**

- Logical reading order
- Meaningful alt text (it detects presence, not quality)
- Keyboard operability of custom widgets
- Focus management on modal open/close
- Live region announcements
- Screen reader announcement quality
- Cognitive load and plain language issues

---

### eslint-plugin-jsx-a11y (Lint-time — catches issues before they reach the browser)

```bash
npm install --save-dev eslint-plugin-jsx-a11y
```

**eslint.config.js (flat config):**

```js
import jsxA11y from "eslint-plugin-jsx-a11y";

export default [
  jsxA11y.flatConfigs.recommended,
  {
    rules: {
      // Promote some warnings to errors in your codebase
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/label-has-associated-control": "error",
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/interactive-supports-focus": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
    },
  },
];
```

**What eslint-plugin-jsx-a11y catches:**

- `<img>` without `alt`
- `<a>` without `href` or with invalid `href`
- Interactive elements without keyboard handlers
- `tabIndex` values greater than 0
- `autoFocus` prop usage
- Form controls without associated labels
- `aria-*` attributes on elements with incompatible roles
- Missing `role` on interactive `<div>` / `<span>` elements

---

### Lighthouse CI (Score tracking in CI pipeline)

```bash
npm install --save-dev @lhci/cli
```

**.lighthouserc.js:**

```js
module.exports = {
  ci: {
    collect: {
      url: ["http://localhost:3000/", "http://localhost:3000/login"],
      startServerCommand: "npm run build && npm run start",
      numberOfRuns: 1,
    },
    assert: {
      assertions: {
        "categories:accessibility": ["error", { minScore: 0.9 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
```

**GitHub Actions integration:**

```yaml
- name: Run Lighthouse CI
  run: |
    npm run build
    npx lhci autorun
  env:
    LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

**Score targets:**

- Development: ≥ 85 (allows iteration)
- Staging: ≥ 90
- Production: ≥ 95

---

### Pa11y (CLI scanner — good for pages behind auth)

```bash
npm install --save-dev pa11y pa11y-ci
```

**.pa11yci:**

```json
{
  "standard": "WCAG2AA",
  "threshold": 0,
  "urls": [
    "http://localhost:3000/",
    "http://localhost:3000/dashboard",
    "http://localhost:3000/settings"
  ],
  "actions": [
    "navigate to http://localhost:3000/login",
    "set field #email to test@example.com",
    "set field #password to testpassword",
    "click element button[type=submit]",
    "wait for url to be http://localhost:3000/dashboard"
  ]
}
```

```bash
npx pa11y-ci --config .pa11yci
```

---

### Storybook a11y Addon (Component-level testing in isolation)

```bash
npm install --save-dev @storybook/addon-a11y
```

**.storybook/main.js:**

```js
export default {
  addons: ["@storybook/addon-a11y"],
};
```

Each story gets an "Accessibility" panel with axe results. Useful for catching issues before components are assembled into pages.

---

## Manual Testing Procedures

### 1. Keyboard-only Navigation

**Setup:** Disconnect or ignore mouse. Use only keyboard.

**Checklist:**

- [ ] Press Tab from browser address bar — does focus enter the page?
- [ ] Tab through every interactive element in order — does focus order match visual/logical order?
- [ ] Is focus indicator visible at every step? (Never disappears, never `outline: none`)
- [ ] Activate every button with Enter and Space
- [ ] Activate every link with Enter
- [ ] Navigate dropdown/select with arrow keys
- [ ] Open accordion panels, tab panels — do they work?
- [ ] Navigate modal dialogs: focus stays inside, Escape closes, focus returns to trigger
- [ ] Use skip link to jump to main content
- [ ] Navigate forms: can you complete and submit using only keyboard?
- [ ] No keyboard traps except intentional modal focus traps

**Common failures:**

- Custom dropdown that only responds to mouse click
- Modal that does not trap focus — Tab escapes to background
- Icon button reachable by Tab but not activatable by Enter/Space
- Visual reordering via CSS that breaks logical tab sequence

---

### 2. Screen Reader Testing

#### VoiceOver on macOS (Safari)

1. Enable: `Cmd + F5`
2. Navigate by landmark: `VO + U` (rotor), then arrow to Landmarks or Headings
3. Navigate headings: `VO + Cmd + H`
4. Navigate form controls: `VO + Cmd + J`
5. Read from current position: `VO + A`
6. Interact with widget: `VO + Shift + Down` (enter), `VO + Shift + Up` (exit)

**What to verify:**

- [ ] Page title reads correctly when page loads
- [ ] Headings list makes sense — logical hierarchy (h1, h2, h3)
- [ ] Landmarks present: main, nav, header, footer
- [ ] All images have meaningful alt text (VoiceOver announces "image" + alt)
- [ ] All form fields announced with label, required status, type
- [ ] Errors announced when form submitted with invalid data
- [ ] Modal announced as "web dialog" with its label
- [ ] Buttons state announced ("expanded", "collapsed", "checked")
- [ ] Live region updates announced (save confirmations, status messages)

#### NVDA on Windows (Firefox)

1. Enable: `Ctrl + Alt + N` (after installing NVDA)
2. Virtual browse mode: read page with arrow keys; Tab for interactive elements
3. Navigate headings: `H` key
4. Navigate landmarks: `D` key
5. Navigate form controls: `F` key
6. Form mode: Enter when focused on a form field; Escape to exit

**What to verify:** Same as VoiceOver checklist above.

#### Common screen reader issues to catch:

- "image.jpg", "photo", or "icon" as alt text — useless announcement
- Form field announced with no label (just "text field")
- "Link" or "button" with no name (icon-only without aria-label)
- Dynamic content updates not announced (missing aria-live)
- Modal doesn't announce as dialog — screen reader reads behind the modal
- Heading hierarchy skips levels (h1 → h3, skipping h2)

---

### 3. Zoom and Reflow Testing

**200% zoom test (1.4.4 Resize Text):**

1. Open Chrome DevTools → Settings → Emulation → Font size: 32px (double default 16px)
   OR browser zoom to 200% (`Cmd + +` × 5)
2. Check: all text readable, no overflow, no truncation, layout intact

**Reflow test at 320px width (1.4.10):**

1. Chrome DevTools → Device toolbar → Set width to 320px
2. Check: no horizontal scrollbar, all content accessible by vertical scroll only
3. Exception: data tables and code blocks may scroll horizontally

---

### 4. Colour Contrast Testing

**Tools:**

- Chrome DevTools: Inspect element → click colour swatch → see "Contrast ratio"
- [Colour Contrast Analyser](https://www.tpgi.com/color-contrast-checker/) (TPGi, free desktop app)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Who Can Use](https://www.whocanuse.com/) — shows affected user count

**What to check:**

- [ ] Body text vs background: ≥ 4.5:1
- [ ] Headings (if ≥ 18pt regular or ≥ 14pt bold): ≥ 3:1
- [ ] Placeholder text vs input background: ≥ 4.5:1
- [ ] Button text vs button background: ≥ 4.5:1
- [ ] Link text vs page background (and vs surrounding text if not underlined): ≥ 4.5:1
- [ ] Input border vs page background: ≥ 3:1
- [ ] Focus indicator vs adjacent colours: ≥ 3:1
- [ ] Icon/graphic vs adjacent colour: ≥ 3:1
- [ ] Disabled elements: no requirement, but should be visually distinct

---

### 5. Motion and Animation Testing

**Reduced motion:**

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Test:** In macOS System Preferences → Accessibility → Display → Reduce Motion. Does your UI still work? Do animations stop or dramatically reduce?

---

### 6. High Contrast Mode Testing (Windows)

Windows High Contrast Mode overrides colours with system-defined high contrast values. Many CSS tricks (border replicated with box-shadow, images used as backgrounds) break.

1. Windows: Settings → Ease of Access → High contrast → Turn on
2. Test that: all UI elements visible, borders/outlines present, icons not disappearing

```css
/* Force borders to show in High Contrast Mode */
@media (forced-colors: active) {
  .custom-checkbox {
    border: 2px solid ButtonText;
  }
  .icon-btn svg {
    forced-color-adjust: none;
    fill: ButtonText;
  }
}
```

---

## Common Issues by Component Type

| Component     | Most common a11y failures                                                              |
| ------------- | -------------------------------------------------------------------------------------- |
| Images        | Missing alt; `alt="image.jpg"` or `alt="photo"`                                        |
| Icon buttons  | No `aria-label`; SVG announcing its contents                                           |
| Form inputs   | Label not associated (missing `for`/`id` or `aria-labelledby`); error not described    |
| Links         | "Click here", "Read more" — not descriptive; missing `href`                            |
| Buttons       | `<div>` or `<span>` with `onclick` — not keyboard accessible                           |
| Modals        | Focus not trapped; Escape not handled; focus not returned                              |
| Dropdowns     | Keyboard inaccessible; state (expanded/collapsed) not communicated                     |
| Tables        | Missing `<th scope>`; no `<caption>`; using `<table>` for layout                       |
| Carousels     | Auto-play without pause control; no keyboard navigation                                |
| Toasts        | Announced too aggressively (assertive) or not at all (missing aria-live)               |
| Videos        | No captions; player controls not keyboard accessible                                   |
| PDFs          | Usually completely inaccessible — prefer HTML alternatives                             |
| Charts/graphs | Alt text describes what it is, not what it shows                                       |
| Autocomplete  | Does not announce options count; option selection not announced                        |
| Date pickers  | Calendar grid not keyboard navigable — use native `<input type="date">` where possible |

---

## CI Integration Strategy

**Recommended pipeline:**

```yaml
# .github/workflows/a11y.yml
name: Accessibility checks

on: [pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run lint # includes eslint-plugin-jsx-a11y

  unit-axe:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm test # axe-core tests run as part of unit tests

  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && npm run build
      - run: npx lhci autorun
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

**What each layer catches:**

| Layer            | Tools                     | Catches                                                                          |
| ---------------- | ------------------------- | -------------------------------------------------------------------------------- |
| Lint             | eslint-plugin-jsx-a11y    | Missing alt, invalid ARIA, non-interactive elements with onclick                 |
| Unit tests       | axe-core                  | Rendered DOM violations: contrast, ARIA validity, label associations             |
| E2E / Lighthouse | Lighthouse CI, Pa11y      | Full page violations, including dynamically loaded content                       |
| Manual           | VoiceOver, NVDA, keyboard | Everything automated misses: reading order, announcement quality, cognitive load |
