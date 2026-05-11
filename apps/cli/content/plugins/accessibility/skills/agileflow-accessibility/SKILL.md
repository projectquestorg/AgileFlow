---
name: agileflow-accessibility
version: 1.0.0
category: agileflow/accessibility
description: |
  Use when implementing accessible UI, auditing for WCAG 2.2 compliance,
  fixing screen reader issues, improving keyboard navigation, or preparing
  for an accessibility review. Covers semantic HTML, ARIA patterns,
  color contrast, focus management, and automated + manual testing.
triggers:
  keywords:
    - accessibility
    - a11y
    - screen reader
    - WCAG
    - aria
    - keyboard navigation
    - focus
    - color contrast
    - tab order
    - semantic html
    - alt text
    - accessible
    - ADA
    - Section 508
    - voiceover
    - NVDA
    - skip link
  priority: 50
  exclude:
    - accessible parking
    - accessible tourism
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/accessibility.yaml
  maxEntries: 50
depends:
  skills: []
  plugins: [core]
---

# AgileFlow Accessibility

Helps you build, audit, and fix accessible user interfaces — from semantic HTML foundations through ARIA patterns, focus management, screen reader compatibility, and automated testing integration.

## When this skill activates

- User wants to audit a page, component, or flow for WCAG 2.2 compliance
- User is implementing a new UI component and wants it to be accessible from the start
- User is fixing screen reader issues, keyboard trap bugs, or missing focus indicators
- User needs to add axe-core tests, eslint-plugin-jsx-a11y, or Lighthouse accessibility CI
- User is preparing for an ADA/Section 508 compliance review or legal audit
- User mentions VoiceOver, NVDA, JAWS, TalkBack, or any assistive technology

## Opening discovery flow

**When invoked without clear context, ask one focused question to understand the task.**

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[
  {
    "question": "What accessibility work do you need to do?",
    "header": "Accessibility task",
    "multiSelect": false,
    "options": [
      {"label": "Audit an existing page or component for WCAG 2.2 issues (Recommended)", "description": "I'll run through automated scanning + manual keyboard + screen reader checks and give you a prioritised fix list"},
      {"label": "Build a new UI component accessibly from scratch", "description": "Choose the right HTML element, add ARIA only where needed, wire up keyboard behaviour, write axe-core tests"},
      {"label": "Fix a specific accessibility bug", "description": "Describe the issue — focus trap, missing label, colour contrast failure — and I'll diagnose and patch it"},
      {"label": "Set up automated a11y testing in CI", "description": "Integrate axe-core, eslint-plugin-jsx-a11y, Pa11y, or Lighthouse into your test pipeline"},
      {"label": "Prepare for an ADA / Section 508 compliance review", "description": "Systematic WCAG 2.2 AA checklist, VPAT preparation, audit report structure"}
    ]
  }
]</parameter>
</invoke>
```

**Route based on answer:**

| Task                          | Next action                                                             |
| ----------------------------- | ----------------------------------------------------------------------- |
| Audit existing page/component | Follow `workflows/audit-page.md`                                        |
| Build new component           | Follow `workflows/implement-accessible-component.md`                    |
| Fix specific bug              | Diagnose with `references/aria-patterns.md`, apply fix, verify with axe |
| Set up CI testing             | See Testing Checklist in `references/testing-checklist.md`              |
| Compliance review             | Walk WCAG 2.2 AA checklist in `references/wcag-guide.md`                |

## The POUR principles

WCAG 2.2 organises all success criteria under four principles. Every accessibility decision maps to one of these.

```
┌─────────────────────────────────────────────────────────────────┐
│  PERCEIVABLE    Content must be presentable to users in ways    │
│                 they can perceive — text alternatives, captions, │
│                 sufficient contrast, adaptable layout.          │
├─────────────────────────────────────────────────────────────────┤
│  OPERABLE       UI components and navigation must be operable   │
│                 — keyboard accessible, no seizure triggers,     │
│                 enough time, findable content.                  │
├─────────────────────────────────────────────────────────────────┤
│  UNDERSTANDABLE Information and UI operation must be            │
│                 understandable — readable, predictable,         │
│                 input assistance, error prevention.             │
├─────────────────────────────────────────────────────────────────┤
│  ROBUST         Content must be robust enough for current and   │
│                 future assistive technologies — valid markup,   │
│                 name/role/value, status messages.               │
└─────────────────────────────────────────────────────────────────┘
```

**Conformance levels:**

- **Level A** — Minimum. Critical barriers that prevent access entirely.
- **Level AA** — Industry standard. Required for ADA, Section 508, EN 301 549. Target for all products.
- **Level AAA** — Enhanced. Not required for full-site conformance; implement where feasible.

## Who benefits and how

Accessibility is not a niche concern. It benefits the majority of users.

| Disability category               | Affected population                         | Assistive technology                              | WCAG principle      |
| --------------------------------- | ------------------------------------------- | ------------------------------------------------- | ------------------- |
| Visual (blind)                    | ~39M globally blind                         | Screen readers (JAWS, NVDA, VoiceOver)            | Perceivable, Robust |
| Visual (low vision)               | ~246M globally                              | Screen magnifiers, large text, high contrast      | Perceivable         |
| Visual (colour blind)             | ~300M globally (~8% men)                    | Colour contrast, pattern alternatives             | Perceivable         |
| Motor (limited dexterity)         | ~2M wheelchair users in US                  | Keyboard navigation, switch access, voice control | Operable            |
| Motor (tremor, repetitive strain) | Tens of millions                            | Larger touch targets, reduced motion              | Operable            |
| Cognitive / learning              | ~15–20% of population                       | Plain language, consistent layout, error recovery | Understandable      |
| Deaf / hard of hearing            | ~430M globally                              | Captions, transcripts, visual alerts              | Perceivable         |
| Vestibular / seizure              | ~3M epilepsy in US                          | Reduced motion, no flashing content               | Operable            |
| Temporary (broken arm, surgery)   | Situational, affects everyone at some point | All of the above                                  | All                 |

**The business case:**

- **1 billion+ people** worldwide have some form of disability (WHO).
- In the US, people with disabilities control **~$490B in discretionary spending**.
- ADA Title III digital lawsuits have exceeded **4,000 per year** in recent years; most settle for $25K–$100K+.
- Inaccessible sites face procurement exclusion from government and enterprise buyers (Section 508 requirements).
- Screen reader users abandon inaccessible sites at very high rates — directly lost revenue.
- Accessibility improvements also benefit SEO (semantic HTML, alt text, structured content).

## Semantic HTML as the foundation

The single most impactful accessibility change you can make is using the correct HTML element.

```html
<!-- Bad: div soup — no semantics, no keyboard access, screen reader silent -->
<div class="btn" onclick="submit()">Submit</div>
<div class="nav">
  <div onclick="goto('home')">Home</div>
</div>

<!-- Good: native semantics — keyboard accessible, screen reader announces role -->
<button type="submit">Submit</button>
<nav aria-label="Main navigation">
  <a href="/">Home</a>
</nav>
```

**Why native HTML wins:**

- Built-in keyboard support (Enter/Space for buttons, arrows for radio groups, etc.)
- Built-in ARIA role, name, and state (no extra attributes needed)
- Works across all browsers and assistive technologies without additional scripting
- Fewer bugs — browsers have tested these for decades

**HTML element quick reference:**

| Use case         | Correct element                                      | Common mistake                    |
| ---------------- | ---------------------------------------------------- | --------------------------------- |
| Clickable action | `<button>`                                           | `<div onclick>`, `<span onclick>` |
| Navigation link  | `<a href>`                                           | `<div onclick>`                   |
| Page sections    | `<main>`, `<nav>`, `<header>`, `<footer>`, `<aside>` | `<div id="main">`                 |
| Content sections | `<section>`, `<article>`                             | nested `<div>`                    |
| Headings         | `<h1>`–`<h6>` in logical order                       | `<div class="heading">`           |
| Form inputs      | `<input>`, `<select>`, `<textarea>` with `<label>`   | Unlabelled inputs                 |
| Data tables      | `<table>` with `<th scope>`, `<caption>`             | CSS grid faking a table           |
| Lists            | `<ul>/<ol>` + `<li>`                                 | `<div>` with bullet CSS           |
| Collapsible      | `<details>/<summary>`                                | Custom accordion with no ARIA     |

## ARIA: last resort, not first choice

ARIA (Accessible Rich Internet Applications) supplements HTML — it does not replace it.

**Use ARIA only when:**

1. No native HTML element exists for the pattern (custom combobox, tree view, data grid)
2. Dynamic content updates need announcement (loading spinners, live search results)
3. Relationships cannot be expressed in HTML (cross-section labelling, ownership)

**The five ARIA rules (W3C):**

1. **Use native HTML first.** `<button>` is always better than `<div role="button">`.
2. **Don't override native semantics.** Don't put `role="heading"` on a `<p>`.
3. **All interactive ARIA widgets must support keyboard.** If you add a role, add keyboard handlers.
4. **Don't hide focusable elements.** `aria-hidden="true"` must not be on or contain focusable elements.
5. **Interactive elements need an accessible name.** Button, input, link — must have a label.

## Focus management

Focus management is one of the most commonly broken accessibility requirements in SPAs and dynamic UIs.

**Rules:**

- Focus must always be visible — never `outline: none` without a custom focus style
- Focus order must follow reading order (DOM order, not CSS visual order)
- Modal dialogs must trap focus inside while open; release on close
- On modal close, focus returns to the element that triggered it
- Route changes in SPAs: move focus to the page `<h1>` or `<main>` landmark
- Dynamically added content: announce via `aria-live` or move focus if triggered by user action

```css
/* Acceptable: custom focus style instead of removing outline */
:focus-visible {
  outline: 2px solid #005fcc;
  outline-offset: 2px;
}

/* Unacceptable: removing focus indicator entirely */
* {
  outline: none;
} /* Never do this */
```

## Colour and contrast

**WCAG 2.2 AA thresholds:**

| Content type                       | Minimum ratio  | Notes                                 |
| ---------------------------------- | -------------- | ------------------------------------- |
| Normal text (< 18pt / < 14pt bold) | 4.5:1          | Most body text                        |
| Large text (≥ 18pt or ≥ 14pt bold) | 3:1            | Headlines, display text               |
| UI components (borders, icons)     | 3:1            | Against adjacent colour               |
| Focus indicators                   | 3:1            | Against adjacent colour (2.4.11)      |
| Disabled controls                  | No requirement | But should be clearly distinguishable |
| Decorative images                  | No requirement | Alt="" to mark as decorative          |

**Tools:**

- Browser DevTools — Elements panel shows contrast ratio in colour picker
- [Colour Contrast Analyser](https://www.tpgi.com/color-contrast-checker/) (free desktop app)
- [Who Can Use](https://www.whocanuse.com/) — shows how many people are affected at each ratio
- `axe-core` — catches AA failures automatically

**Common trap:** Placeholder text in inputs often fails contrast because browsers render it at ~40% opacity. Always check placeholder contrast separately from label contrast.

## Automated testing integration

Automated tools catch approximately 30–40% of WCAG issues. They are necessary but not sufficient.

**Recommended stack:**

```bash
# Install axe-core for Vitest/Jest
npm install --save-dev @axe-core/react axe-core vitest-axe

# eslint-plugin-jsx-a11y for lint-time checks
npm install --save-dev eslint-plugin-jsx-a11y

# Pa11y for CLI/CI scanning
npm install --save-dev pa11y

# Lighthouse CI for automated score tracking
npm install --save-dev @lhci/cli
```

**axe-core test example (Vitest + React Testing Library):**

```js
import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "vitest-axe";
import { expect } from "vitest";
import { LoginForm } from "./LoginForm";

expect.extend(toHaveNoViolations);

it("LoginForm has no axe violations", async () => {
  const { container } = render(<LoginForm />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

**eslint config (eslint.config.js flat config):**

```js
import jsxA11y from "eslint-plugin-jsx-a11y";

export default [
  jsxA11y.flatConfigs.recommended,
  {
    rules: {
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/anchor-is-valid": "error",
    },
  },
];
```

## Screen reader testing matrix

| Screen reader | Browser | Platform   | Priority                      |
| ------------- | ------- | ---------- | ----------------------------- |
| VoiceOver     | Safari  | macOS, iOS | High — Apple devices dominant |
| NVDA (free)   | Firefox | Windows    | High — most common Windows SR |
| JAWS          | Chrome  | Windows    | High — enterprise standard    |
| TalkBack      | Chrome  | Android    | Medium — mobile               |
| Narrator      | Edge    | Windows    | Low — rarely primary          |

**Quick VoiceOver commands (macOS):**

- Turn on/off: `Cmd + F5`
- Navigate by headings: `VO + Cmd + H`
- Navigate by form controls: `VO + Cmd + J`
- Read from cursor: `VO + A`
- Navigate landmarks: `VO + U` (rotor)

**Quick NVDA commands (Windows):**

- Turn on: `Ctrl + Alt + N`
- Navigate by headings: `H`
- Navigate by landmarks: `D`
- Navigate by form fields: `F`
- List all headings: `Insert + F7`

## Quality checklist

Before delivering any accessible component or audit fix:

- [ ] All interactive elements reachable and operable via keyboard alone
- [ ] Focus indicator visible on every interactive element (`outline: none` removed or replaced)
- [ ] Focus order follows logical reading order
- [ ] All images have appropriate alt text (descriptive or `alt=""` for decorative)
- [ ] All form inputs have a programmatically associated label
- [ ] Error messages identify the field and suggest correction (not just red border)
- [ ] Colour contrast meets 4.5:1 for body text, 3:1 for large text and UI components
- [ ] Information is not conveyed by colour alone
- [ ] Dynamic content changes announced via `aria-live` or focus management
- [ ] Modal dialogs trap focus, return focus on close, respond to Escape
- [ ] Page has a `<title>` and a logical heading hierarchy starting with `<h1>`
- [ ] `<html lang>` is set correctly
- [ ] Skip navigation link present and functional
- [ ] axe-core reports zero violations in automated tests
- [ ] Tested with at least one screen reader (VoiceOver or NVDA)
- [ ] Tested with keyboard only (no mouse)
- [ ] Tested at 200% zoom without horizontal scrolling

## Self-improving learnings

`_learnings/accessibility.yaml` records:

- Component library in use (Radix UI, Headless UI, MUI, custom) and its a11y baseline
- Screen reader(s) the team tests with
- axe-core rules the team has intentionally disabled and why
- Known contrast waivers (branding colours that can't be changed)
- Whether the project has a Lighthouse CI threshold configured
- Patterns the team has already implemented (skip links, focus traps, live regions)

Apply on invocation; update on correction.

## References

Load these files when you need deeper context:

| File                              | When to load                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `references/wcag-guide.md`        | Full WCAG 2.2 success criterion breakdown with implementation examples        |
| `references/aria-patterns.md`     | Common ARIA patterns: modals, accordions, live regions, navigation menus      |
| `references/testing-checklist.md` | Automated + manual testing procedures, tool setup, common issues by component |

## Workflows

Follow these step-by-step when the user initiates the matching action:

| File                                          | When to follow                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `workflows/audit-page.md`                     | User wants to audit an existing page or component for accessibility issues |
| `workflows/implement-accessible-component.md` | User is building a new UI component and wants it accessible from the start |

## Integration

- **agileflow-test-writer** — add axe-core tests alongside unit tests for every new component
- **agileflow-story-writer** — include accessibility acceptance criteria in user stories
- **agileflow:code:accessibility** — automated a11y flow audit across the full codebase
