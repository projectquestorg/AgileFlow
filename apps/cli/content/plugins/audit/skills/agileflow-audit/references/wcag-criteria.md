# WCAG 2.2 Key Criteria Reference

**Load this when:** running an accessibility audit or reviewing UI components.
Focuses on the criteria most commonly violated in web apps.

## Conformance levels

| Level | Meaning  | Requirement                                                 |
| ----- | -------- | ----------------------------------------------------------- |
| A     | Minimum  | Must meet — basic accessibility                             |
| AA    | Standard | Target for most apps — legal baseline in most jurisdictions |
| AAA   | Enhanced | Aspirational — not required for full sites                  |

## Most commonly violated (AA)

### 1.1.1 Non-text Content (A)

Every `<img>`, `<input type="image">`, icon, and chart needs descriptive alt text.
Decorative images: `alt=""`. Complex charts: long description in addition to alt.

### 1.3.1 Info and Relationships (A)

Structure conveyed visually must be conveyed in markup: headings via `<h1>`–`<h6>`,
lists via `<ul>`/`<ol>`, tables with `<th>` and `scope`. Don't fake structure with CSS alone.

### 1.4.3 Contrast Minimum (AA)

- Normal text: 4.5:1 contrast ratio minimum
- Large text (18pt / 14pt bold): 3:1 minimum
- UI components and focus indicators: 3:1 against adjacent colors

### 1.4.4 Resize Text (AA)

Text must be readable at 200% zoom without loss of content or functionality.
Avoid `px` for font sizes — use `rem`/`em`.

### 1.4.11 Non-text Contrast (AA)

Form inputs, buttons, focus indicators, icons: 3:1 against background.
Default browser focus ring often fails — must be explicitly styled.

### 2.1.1 Keyboard (A)

Every interactive element must be operable via keyboard alone.
No keyboard traps. Custom widgets (dropdowns, modals, datepickers) need full keyboard support.

### 2.1.2 No Keyboard Trap (A)

Keyboard focus must not get stuck in a component. Modals need focus trap
_within_ the modal, but must release on close/Escape.

### 2.4.3 Focus Order (A)

Tab order must follow logical reading order. `tabindex` > 0 almost always breaks this.
Use `tabindex="0"` or `-1` only.

### 2.4.7 Focus Visible (AA)

Focus indicator must be visible. Never `outline: none` without a replacement.
WCAG 2.2 added 2.4.11 (Enhanced Focus Appearance) at AA — 2px minimum, 3:1 contrast.

### 3.2.2 On Input (A)

Changing a form field must not automatically submit the form or navigate away
without warning.

### 3.3.1 Error Identification (A)

Errors must be described in text, not color alone. `aria-describedby` linking
the field to the error message.

### 3.3.2 Labels or Instructions (A)

Form inputs need visible labels. `placeholder` is not a label — it disappears on input.
`aria-label` acceptable when visible label isn't possible.

### 4.1.2 Name, Role, Value (A)

Custom interactive components need ARIA roles, states, and properties:

- Buttons: `role="button"` with `aria-pressed` if toggle
- Modals: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- Tabs: `role="tablist"`, `role="tab"`, `aria-selected`, `role="tabpanel"`
- Checkboxes: `role="checkbox"`, `aria-checked`

### 4.1.3 Status Messages (AA)

Success/error messages injected into the DOM must use live regions:
`aria-live="polite"` for non-urgent, `aria-live="assertive"` for critical errors.

## New in WCAG 2.2

| Criterion                          | Level | What it adds                                       |
| ---------------------------------- | ----- | -------------------------------------------------- |
| 2.4.11 Focus Appearance            | AA    | Minimum focus indicator size and contrast          |
| 2.4.12 Focus Appearance (Enhanced) | AAA   | Stricter focus indicator                           |
| 2.5.7 Dragging Movements           | AA    | Drag operations need a pointer alternative         |
| 2.5.8 Target Size Minimum          | AA    | Interactive targets ≥ 24×24px                      |
| 3.2.6 Consistent Help              | A     | Help mechanisms in consistent location             |
| 3.3.7 Redundant Entry              | A     | Don't make users re-enter info in same session     |
| 3.3.8 Accessible Authentication    | AA    | No cognitive tests (CAPTCHAs without alternatives) |

## Quick audit checklist

```
⬜ All images have meaningful alt text
⬜ Color is not the only way info is conveyed
⬜ 4.5:1 contrast for body text, 3:1 for large text and UI
⬜ All interactive elements keyboard accessible
⬜ Visible focus indicator on all focusable elements
⬜ Form fields have visible labels (not just placeholder)
⬜ Errors described in text, linked to field via aria-describedby
⬜ Custom widgets have correct ARIA roles/states
⬜ Status messages use aria-live regions
⬜ Page has logical heading hierarchy (h1 → h2 → h3)
⬜ Landmarks present: main, nav, header, footer
```
