# WCAG 2.2 Reference Guide

WCAG 2.2 (published October 2023) is the current W3C standard. It contains 78 success criteria organised under 13 guidelines across the four POUR principles. Level AA conformance is the legal and industry baseline for ADA, Section 508, and EN 301 549 compliance.

This guide covers every AA criterion (and the most impactful AAA ones) with implementation guidance.

---

## Principle 1: Perceivable

Content must be presentable to users in ways they can perceive. If a user cannot see, hear, or otherwise sense the content, the page fails at the foundation.

---

### 1.1 Text Alternatives

#### 1.1.1 Non-text Content (Level A)

All non-text content must have a text alternative that serves an equivalent purpose.

**Images:**

```html
<!-- Informative image: describe what the image conveys -->
<img
  src="revenue-chart.png"
  alt="Monthly revenue grew from $12K in January to $48K in June 2024"
/>

<!-- Decorative image: empty alt, screen reader skips it -->
<img src="decorative-swirl.svg" alt="" role="presentation" />

<!-- Functional image (logo linking home): describe function -->
<a href="/"><img src="logo.svg" alt="Acme Inc — Home" /></a>

<!-- Complex image (chart): alt summarises; long description in figure caption -->
<figure>
  <img
    src="complex-chart.png"
    alt="Sales by region Q1 2024 — see caption for details"
  />
  <figcaption>
    Sales by region: North 42%, South 28%, East 18%, West 12%.
  </figcaption>
</figure>

<!-- Icon button: describe the action, not the icon -->
<button aria-label="Delete item">
  <svg aria-hidden="true" focusable="false">...</svg>
</button>
```

**Common mistakes:**

- `alt="image.jpg"` — filename as alt text
- `alt="photo"` — useless generic description
- Missing alt attribute entirely (screen readers read the src path)
- Over-describing decorative images ("A beautiful blue gradient background")

---

### 1.2 Time-based Media

#### 1.2.1 Audio-only and Video-only (Prerecorded) — Level A

- Audio-only (podcast, voice memo): provide a full text transcript
- Video-only (silent animation, demo): provide audio description or text alternative

#### 1.2.2 Captions (Prerecorded) — Level A

All prerecorded video with audio must have synchronised captions.

- Captions must include spoken dialogue AND relevant non-speech audio (music, sound effects, speaker identification)
- Auto-generated captions alone do not satisfy this — they must be reviewed and corrected

#### 1.2.3 Audio Description or Media Alternative (Prerecorded) — Level A

Video must have audio description of visual information not conveyed in dialogue, OR a text alternative.

#### 1.2.4 Captions (Live) — Level AA

Live video (webinars, streams) must have real-time captions. CART (Communication Access Realtime Translation) services or live auto-caption tools (with review) can satisfy this.

#### 1.2.5 Audio Description (Prerecorded) — Level AA

All prerecorded video must have audio description if visual content is not conveyed by audio track.

---

### 1.3 Adaptable

#### 1.3.1 Info and Relationships (Level A)

Structure and relationships conveyed visually must also be programmatically determinable.

```html
<!-- Bad: visual structure, no programmatic structure -->
<div class="heading-large bold">Chapter 1</div>
<div class="required-label">Email *</div>
<input type="text" />

<!-- Good: semantic structure -->
<h2>Chapter 1</h2>
<label for="email"
  >Email <span aria-hidden="true">*</span
  ><span class="sr-only">(required)</span></label
>
<input type="email" id="email" required aria-required="true" />

<!-- Bad: table-like layout with divs -->
<div class="table">
  <div class="row">
    <div class="cell bold">Name</div>
    <div class="cell bold">Role</div>
  </div>
</div>

<!-- Good: actual table for tabular data -->
<table>
  <thead>
    <tr>
      <th scope="col">Name</th>
      <th scope="col">Role</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Alice</td>
      <td>Engineer</td>
    </tr>
  </tbody>
</table>
```

#### 1.3.2 Meaningful Sequence (Level A)

Reading order in the DOM must match the logical/meaningful order. Screen readers read the DOM, not the visual layout. CSS `order`, `grid-area`, and `position: absolute` can visually reorder content without affecting DOM order — creating a mismatch.

#### 1.3.3 Sensory Characteristics (Level A)

Don't instruct users using only sensory characteristics (shape, colour, size, visual location, orientation, sound).

```html
<!-- Bad: relies on colour alone -->
<p>Click the green button to proceed.</p>

<!-- Bad: relies on position alone -->
<p>Use the button on the right.</p>

<!-- Good: identifies by label -->
<p>Click the "Continue" button to proceed.</p>
```

#### 1.3.4 Orientation (Level AA)

Content must not be restricted to portrait or landscape orientation unless essential (e.g., a piano keyboard app).

#### 1.3.5 Identify Input Purpose (Level AA)

Input fields collecting personal data must have an `autocomplete` attribute to allow browser autofill.

```html
<input type="text" id="name" autocomplete="name" />
<input type="email" id="email" autocomplete="email" />
<input type="tel" id="phone" autocomplete="tel" />
<input type="text" id="street" autocomplete="street-address" />
```

Full list: [HTML autocomplete attribute values](https://html.spec.whatwg.org/multipage/form-elements.html#attr-fe-autocomplete)

---

### 1.4 Distinguishable

#### 1.4.1 Use of Color (Level A)

Colour must not be the only visual means of conveying information.

```html
<!-- Bad: error indicated only by red colour -->
<input class="error-red" />

<!-- Good: error indicated by colour + icon + text -->
<input
  aria-invalid="true"
  aria-describedby="email-error"
  class="error-border"
/>
<span id="email-error" class="error-text">
  <svg aria-hidden="true"><!-- error icon --></svg>
  Enter a valid email address
</span>
```

Charts: don't rely on colour alone to distinguish data series — use pattern fills, direct labels, or shapes.

#### 1.4.2 Audio Control (Level A)

If audio plays automatically for more than 3 seconds, provide a mechanism to pause, stop, or control volume independently of the system volume.

#### 1.4.3 Contrast (Minimum) — Level AA

| Text type                                 | Minimum ratio           |
| ----------------------------------------- | ----------------------- |
| Normal text (< 18pt regular, < 14pt bold) | 4.5:1                   |
| Large text (≥ 18pt / ≥ 14pt bold)         | 3:1                     |
| Text in images                            | 4.5:1 (or 3:1 if large) |
| Placeholder text                          | 4.5:1 (not exempt)      |
| Disabled controls                         | No requirement          |
| Logotype text in logos                    | No requirement          |

Test with: [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/), browser DevTools colour picker.

#### 1.4.4 Resize Text (Level AA)

Text must be resizable up to 200% without loss of content or functionality. Use relative units (`rem`, `em`, `%`) not fixed `px` for font sizes. Do not use `max-height` on containers that prevents scrolling when text grows.

#### 1.4.5 Images of Text (Level AA)

Use actual text instead of images of text wherever possible. Exceptions: logotypes, purely decorative images.

#### 1.4.10 Reflow (Level AA)

Content must reflow at a viewport width equivalent to 320 CSS pixels without horizontal scrolling (except for content that requires two-dimensional scrolling, such as maps or data tables).

```css
/* Good: responsive layout that reflows */
.container {
  max-width: 1200px;
  padding: 0 1rem;
  /* No fixed widths that cause overflow */
}

/* Test: Chrome DevTools → set viewport to 320px wide */
```

#### 1.4.11 Non-text Contrast (Level AA)

UI components (button borders, input borders, focus indicators, checkbox outlines) and informational graphics must have at least 3:1 contrast against adjacent colours.

```css
/* Good: visible input border against white background */
input {
  border: 2px solid #767676; /* 4.6:1 against white — passes */
}

/* Bad: light grey border */
input {
  border: 1px solid #d0d0d0; /* 1.6:1 — fails */
}
```

#### 1.4.12 Text Spacing (Level AA)

When users override text spacing properties, no content or functionality must be lost. Test by applying:

- Line height (leading) to at least 1.5 times the font size
- Letter spacing to at least 0.12 times the font size
- Word spacing to at least 0.16 times the font size
- No paragraph spacing override limit

```js
// Bookmarklet to test text spacing
javascript: (function () {
  var s = document.body.style;
  s.lineHeight = "1.5";
  s.letterSpacing = "0.12em";
  s.wordSpacing = "0.16em";
})();
```

#### 1.4.13 Content on Hover or Focus (Level AA)

Additional content that appears on hover or focus (tooltips, sub-menus, popups) must be:

- **Dismissible** — user can close it without moving pointer/focus (usually Escape key)
- **Hoverable** — pointer can move over the additional content without it disappearing
- **Persistent** — content stays visible until user dismisses it or removes hover/focus

---

## Principle 2: Operable

UI components and navigation must be operable. Users cannot be locked out of controls.

---

### 2.1 Keyboard Accessible

#### 2.1.1 Keyboard (Level A)

All functionality must be operable through a keyboard interface. No exception for timing of keystrokes.

**Tab order checklist:**

- Every interactive element reachable by Tab
- Can activate buttons and links with Enter
- Can activate buttons with Space
- Can navigate radio groups, select lists with arrow keys
- Can dismiss modals with Escape
- Can operate custom widgets (date pickers, sliders) with keyboard

#### 2.1.2 No Keyboard Trap (Level A)

Keyboard focus must not be locked to a component (except intentional modal dialogs where focus trap is correct behaviour with a provided exit mechanism).

#### 2.1.4 Character Key Shortcuts (Level A)

If single-character key shortcuts exist, users must be able to turn them off or remap them. This prevents conflicts with screen reader single-key navigation.

---

### 2.4 Navigable

#### 2.4.1 Bypass Blocks (Level A)

Provide a mechanism to skip past repeated blocks of content (navigation, headers) to reach main content.

```html
<!-- Skip link — visible on focus, hidden otherwise -->
<a href="#main-content" class="skip-link">Skip to main content</a>
<nav>...</nav>
<main id="main-content" tabindex="-1">...</main>
```

```css
.skip-link {
  position: absolute;
  top: -100%;
  left: 0;
  background: #000;
  color: #fff;
  padding: 0.5rem 1rem;
  z-index: 9999;
  text-decoration: none;
}
.skip-link:focus {
  top: 0;
}
```

#### 2.4.2 Page Titled (Level A)

Every page must have a `<title>` that describes the topic or purpose.

```html
<!-- Good: specific, meaningful title -->
<title>Checkout — Step 2 of 3 — Acme Store</title>

<!-- Bad: generic -->
<title>Page</title>
<title>Untitled</title>
```

SPAs: update `document.title` on every route change.

#### 2.4.3 Focus Order (Level A)

Focus order must preserve meaning and operability. Fix with DOM order, not CSS `order` or `tabindex > 0`.

**Rule:** Never use `tabindex` values greater than 0. Use `tabindex="0"` to make non-interactive elements focusable; use `tabindex="-1"` to make elements programmatically focusable without tab stop.

#### 2.4.4 Link Purpose (Level A)

The purpose of each link must be determinable from the link text alone, or from the link text together with surrounding context.

```html
<!-- Bad: ambiguous link text -->
<a href="/plan-a">Read more</a>
<a href="/plan-b">Read more</a>

<!-- Good: descriptive -->
<a href="/plan-a">View Starter Plan details</a>
<a href="/plan-b">View Pro Plan details</a>

<!-- Good: visually short but with aria-label -->
<a href="/plan-a" aria-label="Read more about Starter Plan">Read more</a>
```

#### 2.4.6 Headings and Labels (Level AA)

Headings describe the topic or purpose of the section. Labels describe the purpose of form controls. Both must be descriptive, not vague ("Section 1", "Field 1").

#### 2.4.7 Focus Visible (Level AA)

Keyboard focus indicator must be visible. Do not suppress `outline` without providing a replacement.

```css
/* Minimum: browser default (usually an outline) */
/* Better: custom focus style with sufficient contrast */
:focus-visible {
  outline: 3px solid #005fcc;
  outline-offset: 3px;
  border-radius: 2px;
}
```

#### 2.4.11 Focus Not Obscured (Minimum) — Level AA (NEW in 2.2)

When a component receives keyboard focus, it must not be entirely hidden by author-created content (sticky headers, cookie banners, chat widgets).

```css
/* Fix: add scroll-margin-top equal to sticky header height */
[id] {
  scroll-margin-top: 80px; /* height of sticky header */
}

/* Or: use scroll-padding-top on the scroll container */
html {
  scroll-padding-top: 80px;
}
```

#### 2.4.12 Focus Not Obscured (Enhanced) — Level AAA (NEW in 2.2)

No part of the focused component is hidden. (AA only requires it's not fully hidden.)

#### 2.5.3 Label in Name (Level A)

For UI components with visible text labels, the accessible name must contain the visible text.

```html
<!-- Bad: aria-label overrides visible text, creating mismatch -->
<button aria-label="Submit form data">Send</button>

<!-- Good: accessible name starts with visible text -->
<button aria-label="Send message">Send</button>
<!-- Or better: just match exactly -->
<button>Send</button>
```

#### 2.5.8 Target Size (Minimum) — Level AA (NEW in 2.2)

Interactive targets must be at least 24×24 CSS pixels, OR have at least 24px of spacing between adjacent targets.

```css
/* Ensure minimum touch target size */
button,
a,
input[type="checkbox"] + label {
  min-height: 24px;
  min-width: 24px;
}

/* Better (WCAG 2.5.5 AAA): 44×44px for comfortable touch targets */
.touch-target {
  min-height: 44px;
  min-width: 44px;
}
```

---

## Principle 3: Understandable

Information and the operation of the UI must be understandable.

---

### 3.1 Readable

#### 3.1.1 Language of Page (Level A)

```html
<html lang="en">
  <!-- or lang="fr", lang="de", etc. -->
</html>
```

Use BCP 47 language codes. This enables screen readers to use the correct pronunciation engine.

#### 3.1.2 Language of Parts (Level AA)

When content in a different language appears inline, mark it:

```html
<p>The French word <span lang="fr">bonjour</span> means hello.</p>
```

---

### 3.2 Predictable

#### 3.2.1 On Focus (Level A)

Receiving focus must not trigger an automatic context change (form submission, page navigation, opening a new window).

#### 3.2.2 On Input (Level A)

Changing the value of a form control must not automatically cause a context change unless the user has been warned in advance.

```html
<!-- Bad: submits on selection without warning -->
<select onchange="this.form.submit()">
  ...
</select>

<!-- Good: requires explicit submit action -->
<select>
  ...
</select>
<button type="submit">Apply filter</button>
```

#### 3.2.3 Consistent Navigation (Level AA)

Navigation mechanisms in the same relative order on each page where repeated.

#### 3.2.4 Consistent Identification (Level AA)

Components with the same functionality have consistent identification across pages.

---

### 3.3 Input Assistance

#### 3.3.1 Error Identification (Level A)

If an input error is detected, the item in error must be identified and the error described in text.

```html
<div role="alert" id="form-errors">
  Please correct the following errors:
  <ul>
    <li><a href="#email">Email: Enter a valid email address</a></li>
  </ul>
</div>

<label for="email">Email</label>
<input
  type="email"
  id="email"
  aria-invalid="true"
  aria-describedby="email-error"
/>
<span id="email-error" role="alert"
  >Enter a valid email address (e.g. you@example.com)</span
>
```

#### 3.3.2 Labels or Instructions (Level A)

Form inputs have labels. Where format is required, provide instructions before the input.

```html
<!-- Provide format hint for date -->
<label for="dob">Date of birth</label>
<span id="dob-hint" class="hint">Format: MM/DD/YYYY</span>
<input
  type="text"
  id="dob"
  aria-describedby="dob-hint"
  placeholder="MM/DD/YYYY"
/>
```

#### 3.3.3 Error Suggestion (Level AA)

When input errors are detected and suggestions are known, provide the suggestion.

"You entered: john@example — did you mean john@example.com?"

#### 3.3.4 Error Prevention (Legal, Financial, Data) — Level AA

For pages causing legal commitments or financial transactions: submissions are reversible, data is checked for errors, and user can review/confirm before final submission.

#### 3.3.7 Redundant Entry (Level A) — NEW in 2.2

Information previously entered in the same session must be auto-populated or available to select; users must not be required to re-enter it.

#### 3.3.8 Accessible Authentication (Minimum) — Level AA (NEW in 2.2)

Authentication must not require a cognitive function test (CAPTCHA, puzzle, remembering) unless:

- An alternative is provided (audio CAPTCHA, email link)
- Users can use a password manager (allow paste into password fields — never `onpaste="return false"`)
- Object recognition (pick the traffic lights) is provided as alternative to transcription

```html
<!-- Good: allow paste — never block it -->
<input type="password" id="password" autocomplete="current-password" />
<!-- Do NOT add: onpaste="return false" -->
```

---

## Principle 4: Robust

Content must be robust enough to be interpreted by a wide variety of user agents, including current and future assistive technologies.

---

### 4.1 Compatible

#### 4.1.2 Name, Role, Value (Level A)

All UI components must have:

- **Name**: accessible name (label, aria-label, aria-labelledby)
- **Role**: native HTML role or ARIA role
- **State/Value**: current value, state (expanded, checked, selected, invalid)

```html
<!-- Custom toggle switch with full name/role/value -->
<button
  role="switch"
  aria-checked="false"
  aria-label="Enable email notifications"
  id="notif-toggle"
>
  <span class="thumb"></span>
</button>

<!-- On toggle: update aria-checked="true" -->
```

#### 4.1.3 Status Messages (Level AA)

Status messages (success confirmations, loading indicators, error summaries) must be programmatically determinable without receiving focus, using `aria-live` regions or appropriate roles.

```html
<!-- Loading state -->
<div aria-live="polite" aria-atomic="true" id="status">
  <!-- Injected by JS: "Saving your changes..." then "Changes saved." -->
</div>

<!-- Error summary (focused, not live) — move focus to it -->
<div role="alert" tabindex="-1" id="error-summary">
  3 errors found. Please correct them below.
</div>

<!-- Toast / notification -->
<div role="status" aria-live="polite">Your profile has been updated.</div>
```

**`aria-live` values:**

- `polite` — announces after current speech finishes (most status messages)
- `assertive` — interrupts immediately (critical errors only; use sparingly)
- `off` — no announcements

**Common roles:**

- `role="alert"` — assertive live region (errors)
- `role="status"` — polite live region (confirmations, progress)
- `role="log"` — polite, cumulative (chat history, activity feed)
- `role="timer"` — polite, time-based (countdown)

---

## WCAG 2.2 What's New (vs. 2.1)

| Criterion                                  | Level | Summary                                             |
| ------------------------------------------ | ----- | --------------------------------------------------- |
| 2.4.11 Focus Not Obscured (Minimum)        | AA    | Focused element not fully hidden by sticky content  |
| 2.4.12 Focus Not Obscured (Enhanced)       | AAA   | Focused element not partially hidden                |
| 2.4.13 Focus Appearance                    | AAA   | Stricter focus indicator size/contrast              |
| 2.5.7 Dragging Movements                   | AA    | Drag operations have single-pointer alternative     |
| 2.5.8 Target Size (Minimum)                | AA    | 24×24px minimum touch targets                       |
| 3.2.6 Consistent Help                      | A     | Help mechanisms in consistent location              |
| 3.3.7 Redundant Entry                      | A     | Don't re-ask for info already provided this session |
| 3.3.8 Accessible Authentication (Minimum)  | AA    | No cognitive function test for auth                 |
| 3.3.9 Accessible Authentication (Enhanced) | AAA   | No object recognition tests                         |

**Removed from 2.2:** 4.1.1 Parsing (previously Level A) — browsers now handle malformed HTML consistently, making this criterion obsolete.

---

## Quick reference: conformance levels

| Level          | Criteria count | Who needs it                                                 |
| -------------- | -------------- | ------------------------------------------------------------ |
| A (minimum)    | 30 criteria    | Everyone — A failures are blockers                           |
| AA (standard)  | 20 additional  | ADA, Section 508, EN 301 549, most legal requirements        |
| AAA (enhanced) | 28 additional  | Government, healthcare, education — implement where feasible |

**Legal baselines by jurisdiction:**

- United States (ADA Title III, Section 508): WCAG 2.1 AA (courts increasingly applying 2.2)
- European Union (EN 301 549): WCAG 2.1 AA (being updated to 2.2)
- United Kingdom (Equality Act, public sector): WCAG 2.2 AA
- Canada (ACA, AODA): WCAG 2.0 AA minimum, 2.1/2.2 recommended
- Australia (DDA): WCAG 2.1 AA
