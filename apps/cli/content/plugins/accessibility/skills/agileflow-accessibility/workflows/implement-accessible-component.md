# Workflow: Implement an Accessible UI Component

Use this workflow when building a new UI component from scratch. Accessibility is much cheaper to build in from the start than to retrofit after the fact.

**Time estimate:** Adding accessibility to a component adds 10–30% to initial development time, but prevents 5–10× that time in later remediation.

---

## Step 0: Understand What You're Building

Before writing any code, answer:

1. **What is the component's purpose?** What does it allow users to do?
2. **Does a native HTML element do this?** If yes, use it.
3. **What are the interactive states?** Default, hover, focus, active, disabled, error, loading, expanded, selected, checked.
4. **What content does it display?** Images, icons, dynamic text, form inputs.
5. **Is it triggered by user action or automatic?** (affects focus management)

---

## Step 1: Choose the Correct HTML Element

This is the most important decision. The right element gives you keyboard support, ARIA semantics, and screen reader compatibility for free.

**Decision tree:**

```
Does the user click it to trigger an action?
├── Yes, and it navigates to another URL → <a href="...">
├── Yes, and it performs an action (submit, open, toggle) → <button type="button">
└── Yes, and it submits a form → <button type="submit"> or <input type="submit">

Does the user enter data?
├── Single line text → <input type="text|email|tel|password|search|url|number">
├── Multi-line text → <textarea>
├── One of many options (radio) → <input type="radio"> in a <fieldset>
├── On/off toggle → <input type="checkbox"> or <button role="switch">
└── Select from list → <select> or custom combobox (last resort)

Is it a container/structure element?
├── Primary page content → <main>
├── Site navigation → <nav aria-label="Main navigation">
├── Page header → <header>
├── Page footer → <footer>
├── Supplementary content → <aside>
├── Related content group → <article> or <section>
└── Just a layout div → <div> (no role needed)

Is it a list?
├── Unordered → <ul><li>...</li></ul>
├── Ordered → <ol><li>...</li></ol>
└── Description pairs → <dl><dt>Term</dt><dd>Definition</dd></dl>

Is it a heading?
└── Use <h1>–<h6> in logical hierarchy, not for visual sizing
```

**If no native element fits** (custom combobox, tree view, data grid, slider, color picker):

- Check [ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/patterns/) for the pattern
- Consider using an accessible library instead: Radix UI, Headless UI, React Aria
- If rolling custom: use `<button>` or `<div tabindex="0">` as the base, add role, add keyboard handlers

---

## Step 2: Write the Semantic HTML Structure

Write the markup first, before any CSS or JavaScript. If the HTML makes sense without styling, you're on the right track.

**Example: Accessible card with action button**

```html
<!-- Bad: div soup, no semantics -->
<div class="card" onclick="viewDetails(id)">
  <div class="card-img"><img src="product.jpg" /></div>
  <div class="card-title">Super Widget Pro</div>
  <div class="card-price">$49</div>
  <div class="card-btn">View details</div>
</div>

<!-- Good: semantic, keyboard accessible, screen reader friendly -->
<article class="card">
  <img
    src="product.jpg"
    alt="Super Widget Pro — a compact silver device with three ports"
  />
  <h3 class="card-title">Super Widget Pro</h3>
  <p class="card-price"><span class="sr-only">Price:</span> $49</p>
  <a href="/products/super-widget-pro" class="card-link">
    View details
    <span class="sr-only">for Super Widget Pro</span>
  </a>
</article>
```

---

## Step 3: Add ARIA Only Where HTML Is Insufficient

ARIA supplements native HTML. Before adding an ARIA attribute, ask: "Is there a native HTML way to express this?"

**Common cases where ARIA is needed:**

| Situation             | ARIA to add                                                      |
| --------------------- | ---------------------------------------------------------------- |
| Custom toggle/switch  | `role="switch" aria-checked="true/false"` on `<button>`          |
| Expandable section    | `aria-expanded="true/false"` on trigger button                   |
| Custom dropdown       | `role="listbox"`, `role="option"`, `aria-selected`               |
| Error on input        | `aria-invalid="true" aria-describedby="error-id"`                |
| Loading spinner       | `role="status" aria-label="Loading..."` or `aria-busy="true"`    |
| Icon-only button      | `aria-label="Close dialog"` + `aria-hidden="true"` on SVG        |
| Required field        | `aria-required="true"` (or native `required` attribute)          |
| Multiple navs on page | `aria-label="Main navigation"`, `aria-label="Footer navigation"` |

**What you should NOT add:**

- `role="button"` on a `<button>` — already has the role
- `aria-label` that duplicates visible text — redundant and potentially confusing
- `aria-hidden="true"` on visible, meaningful content
- `tabindex="2"` or any tabindex > 0 — use DOM order instead

---

## Step 4: Implement Keyboard Behaviour

Every interactive element needs keyboard support. Native elements handle most of this automatically; custom widgets need explicit keyboard handlers.

### Standard keyboard patterns:

| Widget      | Enter          | Space       | Arrow keys                    | Escape      | Tab                      |
| ----------- | -------------- | ----------- | ----------------------------- | ----------- | ------------------------ |
| Button      | Activate       | Activate    | —                             | —           | Move focus               |
| Link        | Activate       | —           | —                             | —           | Move focus               |
| Checkbox    | Toggle         | Toggle      | —                             | —           | Move focus               |
| Radio group | Select         | Select      | Move within group             | —           | Move to next group       |
| Select      | Open/select    | Open/select | Navigate options              | Close       | Move focus               |
| Accordion   | Toggle         | Toggle      | —                             | —           | Move focus               |
| Tab panel   | Select         | Select      | Switch tabs (with activation) | —           | Move into panel          |
| Modal       | —              | —           | —                             | Close modal | Stay inside modal        |
| Combobox    | Select/confirm | Open list   | Navigate options              | Close list  | Move focus (closes list) |
| Menu        | Select         | Select      | Navigate items                | Close menu  | Close menu, move focus   |
| Slider      | —              | —           | Increment/decrement           | —           | Move focus               |
| Date picker | Select date    | —           | Navigate calendar             | Close       | Move focus               |

### Example: Accessible accordion keyboard handler

```js
class AccessibleAccordion {
  constructor(el) {
    this.el = el;
    this.buttons = [
      ...el.querySelectorAll('[role="tab"], button[aria-expanded]'),
    ];
    this.bindEvents();
  }

  bindEvents() {
    this.buttons.forEach((btn, index) => {
      btn.addEventListener("click", () => this.toggle(btn));
      btn.addEventListener("keydown", (e) => this.handleKey(e, index));
    });
  }

  toggle(btn) {
    const isExpanded = btn.getAttribute("aria-expanded") === "true";
    const panel = document.getElementById(btn.getAttribute("aria-controls"));
    btn.setAttribute("aria-expanded", String(!isExpanded));
    panel.hidden = isExpanded;
  }

  handleKey(e, index) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this.buttons[(index + 1) % this.buttons.length].focus();
        break;
      case "ArrowUp":
        e.preventDefault();
        this.buttons[
          (index - 1 + this.buttons.length) % this.buttons.length
        ].focus();
        break;
      case "Home":
        e.preventDefault();
        this.buttons[0].focus();
        break;
      case "End":
        e.preventDefault();
        this.buttons[this.buttons.length - 1].focus();
        break;
    }
  }
}
```

---

## Step 5: Handle Focus Management

For components that show/hide content, open/close panels, or trigger dialogs:

```js
// Pattern: component that opens a panel and must manage focus
class FocusManagedDropdown {
  open() {
    this.panel.hidden = false;
    this.panel.setAttribute("aria-hidden", "false");

    // Move focus to first item in panel
    const firstItem = this.panel.querySelector("[role='option'], a, button");
    firstItem?.focus();
  }

  close() {
    this.panel.hidden = true;
    this.panel.setAttribute("aria-hidden", "true");

    // CRITICAL: return focus to the trigger
    this.trigger.focus();
  }
}
```

### Focus management checklist for the component:

- [ ] On open: focus moves to the first relevant element inside the opened content
- [ ] On close: focus returns to the element that triggered the opening
- [ ] If triggered automatically (not by user): use `aria-live` to announce instead of moving focus
- [ ] Focus indicator always visible within component
- [ ] No focus trap except intentional modals (which must have Escape to escape)

---

## Step 6: Handle Dynamic State Changes

When component state changes (loading, error, success, expanded, selected), update:

1. **Visual state** — via CSS
2. **ARIA state** — via attribute update
3. **Announcement** — via aria-live if the change is not focus-initiated

```js
// Example: async save button with loading state
async function handleSave(btn) {
  // Update ARIA state
  btn.setAttribute("aria-busy", "true");
  btn.setAttribute("aria-disabled", "true");
  btn.textContent = "Saving...";

  try {
    await saveData();

    // Success state
    btn.setAttribute("aria-busy", "false");
    btn.removeAttribute("aria-disabled");
    btn.textContent = "Save";

    // Announce success (don't move focus)
    announce("Changes saved successfully.");
  } catch (err) {
    btn.setAttribute("aria-busy", "false");
    btn.removeAttribute("aria-disabled");
    btn.textContent = "Save";

    // Announce error
    announceError("Save failed. Please try again.");
  }
}

function announce(message) {
  const region = document.getElementById("live-region");
  region.textContent = "";
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

function announceError(message) {
  const region = document.getElementById("alert-region");
  region.textContent = "";
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}
```

```html
<!-- Live regions — must exist in DOM before content injected -->
<div
  id="live-region"
  aria-live="polite"
  aria-atomic="true"
  class="sr-only"
></div>
<div id="alert-region" role="alert" aria-atomic="true" class="sr-only"></div>
```

---

## Step 7: Add Colour and Visual Accessibility

### Colour contrast

Before finalising colours, verify contrast ratios:

```js
// Quick contrast check during development
// Chrome DevTools → Elements → click colour swatch → shows ratio

// Design token example with documented contrast
const colors = {
  textPrimary: "#1a1a1a", // 16.1:1 against white — passes AA + AAA
  textSecondary: "#595959", // 7.0:1 against white — passes AA + AAA
  textDisabled: "#949494", // 2.9:1 against white — intentionally below (disabled)
  buttonPrimary: "#005fcc", // 5.9:1 white text on this — passes AA
  errorText: "#c0392b", // 5.1:1 against white — passes AA
  focusRing: "#005fcc", // 5.9:1 against white — passes 3:1 for focus indicator
};
```

### Focus indicator

```css
/* Remove browser default only if replacing with something better */
:focus {
  outline: none; /* Removes browser default */
}

/* Custom focus style — must meet 3:1 against adjacent colours */
:focus-visible {
  outline: 3px solid #005fcc;
  outline-offset: 3px;
  border-radius: 2px;
}

/* Component-specific focus style */
.card:focus-visible {
  outline: 3px solid #005fcc;
  outline-offset: 4px;
  box-shadow: 0 0 0 6px rgba(0, 95, 204, 0.15);
}
```

### Motion

```css
/* Wrap all animations in prefers-reduced-motion check */
.animated-element {
  transition: transform 0.3s ease;
}

@media (prefers-reduced-motion: reduce) {
  .animated-element {
    transition: none;
  }
}
```

---

## Step 8: Write axe-core Tests

Tests prevent regression. Write them alongside the component.

```js
// components/MyComponent/MyComponent.test.jsx
import { render, userEvent } from "@testing-library/react";
import { axe, toHaveNoViolations } from "vitest-axe";
import { expect, it, describe } from "vitest";
import { MyComponent } from "./MyComponent";

expect.extend(toHaveNoViolations);

describe("MyComponent accessibility", () => {
  it("has no axe violations in default state", async () => {
    const { container } = render(<MyComponent />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations in expanded state", async () => {
    const { container } = render(<MyComponent expanded />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations in error state", async () => {
    const { container } = render(
      <MyComponent hasError errorMessage="Invalid input" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations in disabled state", async () => {
    const { container } = render(<MyComponent disabled />);
    expect(await axe(container)).toHaveNoViolations();
  });

  // Keyboard behaviour test
  it("can be activated with keyboard", async () => {
    const user = userEvent.setup();
    const handleActivate = vi.fn();
    const { getByRole } = render(<MyComponent onActivate={handleActivate} />);

    const btn = getByRole("button");
    btn.focus();
    await user.keyboard("{Enter}");

    expect(handleActivate).toHaveBeenCalled();
  });
});
```

---

## Step 9: Manual Verification

After automated tests pass, verify manually:

**Keyboard test (2 minutes):**

- [ ] Tab to the component
- [ ] Verify focus indicator is visible
- [ ] Activate all interactive states with keyboard only
- [ ] Verify focus returns correctly after closing panels

**Screen reader test (5 minutes with VoiceOver):**

- [ ] Enable VoiceOver (`Cmd + F5`) with Safari
- [ ] Tab to the component — does it announce name, role, and state?
- [ ] Activate it — does it announce the state change?
- [ ] If it shows/hides content — does content appear in reading flow?
- [ ] If it has errors — are errors announced?

**Visual check:**

- [ ] Focus indicator visible and meets 3:1 contrast
- [ ] Text contrast meets 4.5:1 (normal) or 3:1 (large text)
- [ ] Information not conveyed by colour alone
- [ ] Component reflows at 320px width without horizontal scroll

---

## Component Accessibility Checklist

Before marking a component as complete:

- [ ] Uses native HTML element (or justified ARIA alternative)
- [ ] All interactive states accessible by keyboard
- [ ] ARIA roles, properties, and states accurate and complete
- [ ] All images have alt text (descriptive or `alt=""`)
- [ ] All form inputs have associated labels
- [ ] Focus indicator visible on all interactive elements
- [ ] Focus management implemented (open → focus inside; close → return focus)
- [ ] Dynamic state changes announced via ARIA updates or live regions
- [ ] Colour contrast meets WCAG AA thresholds
- [ ] Motion wrapped in `prefers-reduced-motion` media query
- [ ] axe-core tests written for all component states
- [ ] Keyboard tested manually
- [ ] Screen reader tested with VoiceOver or NVDA

---

## Library Recommendations

Before building a complex custom widget, evaluate:

| Component type        | Recommended library                                      |
| --------------------- | -------------------------------------------------------- |
| Dialog/modal          | Radix UI Dialog, Headless UI Dialog                      |
| Dropdown/select       | Radix UI Select, Downshift                               |
| Combobox              | Radix UI Combobox, Downshift, React Aria ComboBox        |
| Tabs                  | Radix UI Tabs, Headless UI Tab                           |
| Accordion             | Radix UI Accordion, Headless UI Disclosure               |
| Date picker           | React Aria DatePicker, react-day-picker                  |
| Tooltip               | Radix UI Tooltip, Floating UI                            |
| Toast/notification    | Radix UI Toast, react-hot-toast (with aria-live wrapper) |
| Table                 | TanStack Table (bring your own ARIA)                     |
| Full component system | Radix Themes, shadcn/ui (built on Radix)                 |

All Radix UI components ship with full WAI-ARIA compliance by default.
