# ARIA Patterns Reference

ARIA (Accessible Rich Internet Applications) is a set of attributes that extend HTML's native semantics. Use ARIA to fill gaps where HTML alone cannot express the accessibility information assistive technologies need — not as a replacement for correct HTML.

**The cardinal rule: if HTML can do it, use HTML.**

```
Native HTML                    ARIA equivalent (avoid if native works)
──────────                    ──────────────────────────────────────
<button>                  vs  <div role="button" tabindex="0">
<input type="checkbox">   vs  <div role="checkbox" tabindex="0">
<nav>                     vs  <div role="navigation">
<h2>                      vs  <div role="heading" aria-level="2">
<details><summary>        vs  <button aria-expanded> + hidden panel
```

---

## The Five ARIA Rules (W3C)

1. **Use native HTML first.** Only use ARIA when there is no native HTML element or attribute for the pattern.
2. **Don't change native semantics.** Don't add `role="button"` to an `<a>` or `role="heading"` to a `<p>`.
3. **All interactive ARIA widgets must be keyboard operable.** If you add a role, add keyboard event handlers.
4. **Don't use `role="presentation"` or `aria-hidden="true"` on focusable elements.** This hides elements from AT while leaving them in tab order.
5. **All interactive elements must have an accessible name.** Every `role="button"`, `role="textbox"`, `role="dialog"` etc. needs a label.

---

## Pattern: Modal Dialog

A modal dialog traps focus, announces to screen readers as a dialog, and returns focus on close.

```html
<!-- Trigger -->
<button id="open-dialog" onclick="openModal()">Delete account</button>

<!-- Dialog -->
<div
  id="confirm-dialog"
  role="dialog"
  aria-modal="true"
  aria-labelledby="dialog-title"
  aria-describedby="dialog-desc"
  hidden
>
  <h2 id="dialog-title">Confirm account deletion</h2>
  <p id="dialog-desc">
    This action is permanent and cannot be undone. All your data will be
    deleted.
  </p>
  <button onclick="confirmDelete()">Delete my account</button>
  <button onclick="closeModal()">Cancel</button>
</div>
```

```js
function openModal() {
  const dialog = document.getElementById("confirm-dialog");
  const trigger = document.getElementById("open-dialog");

  dialog.hidden = false;

  // Move focus to first focusable element or dialog heading
  const firstFocusable = dialog.querySelector(
    "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
  );
  firstFocusable?.focus();

  // Trap focus inside dialog
  dialog.addEventListener("keydown", trapFocus);

  // Close on Escape
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

function closeModal() {
  const dialog = document.getElementById("confirm-dialog");
  dialog.hidden = true;
  dialog.removeEventListener("keydown", trapFocus);

  // Return focus to the element that opened the dialog
  document.getElementById("open-dialog").focus();
}

function trapFocus(e) {
  if (e.key !== "Tab") return;

  const dialog = document.getElementById("confirm-dialog");
  const focusable = dialog.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
```

**Keyboard behaviour:**

- Tab cycles through focusable elements inside the dialog only
- Shift+Tab reverses cycle, stays inside dialog
- Escape closes the dialog and returns focus to trigger

**Note:** `aria-modal="true"` tells screen readers to ignore content outside the dialog. Some older screen readers (JAWS < 2019) do not support this — for maximum compatibility, also set `aria-hidden="true"` on sibling elements outside the dialog when it is open.

---

## Pattern: Disclosure (Accordion)

```html
<div class="accordion">
  <h3>
    <button id="acc-btn-1" aria-expanded="false" aria-controls="acc-panel-1">
      What is your return policy?
    </button>
  </h3>
  <div id="acc-panel-1" role="region" aria-labelledby="acc-btn-1" hidden>
    <p>We offer 30-day returns on all products...</p>
  </div>
</div>
```

```js
document.querySelectorAll(".accordion button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const expanded = btn.getAttribute("aria-expanded") === "true";
    const panel = document.getElementById(btn.getAttribute("aria-controls"));

    btn.setAttribute("aria-expanded", String(!expanded));
    panel.hidden = expanded;
  });
});
```

**Note:** For accordions where only one panel can be open at a time, update all other buttons to `aria-expanded="false"` and hide their panels when one is opened.

---

## Pattern: Tab Panel

```html
<div class="tabs">
  <div role="tablist" aria-label="Account sections">
    <button
      role="tab"
      id="tab-profile"
      aria-selected="true"
      aria-controls="panel-profile"
      tabindex="0"
    >
      Profile
    </button>
    <button
      role="tab"
      id="tab-billing"
      aria-selected="false"
      aria-controls="panel-billing"
      tabindex="-1"
    >
      Billing
    </button>
    <button
      role="tab"
      id="tab-security"
      aria-selected="false"
      aria-controls="panel-security"
      tabindex="-1"
    >
      Security
    </button>
  </div>

  <div id="panel-profile" role="tabpanel" aria-labelledby="tab-profile">
    Profile settings content...
  </div>
  <div id="panel-billing" role="tabpanel" aria-labelledby="tab-billing" hidden>
    Billing content...
  </div>
  <div
    id="panel-security"
    role="tabpanel"
    aria-labelledby="tab-security"
    hidden
  >
    Security content...
  </div>
</div>
```

**Keyboard behaviour (arrow key navigation pattern):**

- Left/Right arrow: move between tabs (automatic activation) or just move focus (manual activation)
- Home: first tab; End: last tab
- Tab: moves into the active panel content
- Only the selected tab is in tab order (tabindex="0"); others are tabindex="-1"

---

## Pattern: Combobox (Searchable Select)

Combobox is the most complex widget pattern. Use a library (Radix UI, Headless UI, Downshift) unless you have a strong reason to roll your own.

```html
<label for="country-input">Country</label>
<div class="combobox-wrapper">
  <input
    id="country-input"
    type="text"
    role="combobox"
    aria-expanded="false"
    aria-haspopup="listbox"
    aria-autocomplete="list"
    aria-controls="country-listbox"
    aria-activedescendant=""
    autocomplete="off"
  />
  <ul id="country-listbox" role="listbox" aria-label="Countries" hidden>
    <li role="option" id="opt-us" aria-selected="false">United States</li>
    <li role="option" id="opt-ca" aria-selected="false">Canada</li>
    <li role="option" id="opt-gb" aria-selected="false">United Kingdom</li>
  </ul>
</div>
```

**Keyboard behaviour:**

- Type to filter options
- Down arrow opens listbox and moves to first option
- Up/Down arrow navigates options (update `aria-activedescendant` on input)
- Enter selects highlighted option
- Escape closes listbox without selection, returns focus to input

---

## Pattern: Live Regions

Live regions announce dynamic content changes to screen readers without moving focus.

```html
<!-- Polite: announce after current speech completes -->
<!-- Use for: save confirmations, search result counts, non-critical updates -->
<div aria-live="polite" aria-atomic="true" id="status-message">
  <!-- JS injects: "3 results found" or "Changes saved." -->
</div>

<!-- Assertive: interrupt immediately -->
<!-- Use sparingly: critical errors only -->
<div aria-live="assertive" role="alert" id="critical-error">
  <!-- JS injects: "Session expired. Please log in again." -->
</div>

<!-- Log: cumulative announcements (chat, activity feed) -->
<div aria-live="polite" role="log" aria-label="Chat messages">
  <div>Alice: Hello!</div>
  <div>Bob: Hi there!</div>
  <!-- New messages appended here get announced -->
</div>
```

**Important implementation details:**

- The live region element must exist in the DOM BEFORE content is injected — don't create it dynamically
- `aria-atomic="true"` announces the entire region contents; `false` (default) announces only the changed portion
- `aria-relevant="additions"` (default) announces only added content; "all" announces additions and removals
- Empty the container briefly before re-injecting to ensure re-announcement of the same message:

```js
function announce(message, type = "polite") {
  const region = document.getElementById("status-message");
  region.textContent = ""; // Clear first
  // Small timeout allows screen readers to register the change
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}
```

---

## Pattern: Navigation Menu with Dropdown

```html
<nav aria-label="Main navigation">
  <ul role="list">
    <li>
      <a href="/">Home</a>
    </li>
    <li>
      <button
        id="products-btn"
        aria-expanded="false"
        aria-haspopup="true"
        aria-controls="products-menu"
      >
        Products
      </button>
      <ul id="products-menu" role="list" hidden>
        <li><a href="/products/widget">Widget</a></li>
        <li><a href="/products/gadget">Gadget</a></li>
      </ul>
    </li>
    <li>
      <a href="/about">About</a>
    </li>
  </ul>
</nav>
```

**Keyboard behaviour:**

- Enter/Space on trigger button: toggle submenu (`aria-expanded`)
- Escape: close submenu, return focus to trigger button
- Tab: moves to next interactive element (closes submenus)

---

## Pattern: Form Error Handling

```html
<!-- 1. On submit, move focus to error summary -->
<div
  id="error-summary"
  role="alert"
  tabindex="-1"
  aria-labelledby="error-heading"
>
  <h2 id="error-heading">3 errors need to be corrected</h2>
  <ul>
    <li><a href="#email-field">Email: Enter a valid email address</a></li>
    <li><a href="#phone-field">Phone: Enter a valid phone number</a></li>
    <li>
      <a href="#dob-field">Date of birth: Enter a date in MM/DD/YYYY format</a>
    </li>
  </ul>
</div>

<!-- 2. Individual field errors -->
<div class="field-group">
  <label for="email-field">Email address</label>
  <input
    id="email-field"
    type="email"
    aria-required="true"
    aria-invalid="true"
    aria-describedby="email-error"
    value="john@"
  />
  <span id="email-error" class="field-error">
    Enter a valid email address (e.g. you@example.com)
  </span>
</div>
```

```js
function handleSubmit(e) {
  e.preventDefault();
  const errors = validateForm();
  if (errors.length) {
    renderErrors(errors);
    // Move focus to error summary
    document.getElementById("error-summary").focus();
  }
}
```

---

## Pattern: Icon Button (Button with No Visible Text)

```html
<!-- Bad: no accessible name -->
<button onclick="closeDialog()">
  <svg><!-- X icon --></svg>
</button>

<!-- Good: aria-label provides the accessible name -->
<button aria-label="Close dialog" onclick="closeDialog()">
  <svg aria-hidden="true" focusable="false"><!-- X icon --></svg>
</button>

<!-- Good: visually hidden text -->
<button onclick="closeDialog()">
  <svg aria-hidden="true" focusable="false"><!-- X icon --></svg>
  <span class="sr-only">Close dialog</span>
</button>
```

```css
/* Screen-reader-only utility class */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

---

## Pattern: Toggle / Switch

```html
<button
  role="switch"
  aria-checked="false"
  id="dark-mode-toggle"
  onclick="toggleDarkMode(this)"
>
  Dark mode
</button>
```

```js
function toggleDarkMode(btn) {
  const isOn = btn.getAttribute("aria-checked") === "true";
  btn.setAttribute("aria-checked", String(!isOn));
  document.body.classList.toggle("dark", !isOn);
}
```

Screen readers will announce: "Dark mode, switch, off" or "Dark mode, switch, on".

---

## Pattern: Breadcrumb Navigation

```html
<nav aria-label="Breadcrumb">
  <ol>
    <li><a href="/">Home</a></li>
    <li><a href="/products">Products</a></li>
    <li><a href="/products/widgets">Widgets</a></li>
    <li aria-current="page">Super Widget Pro</li>
  </ol>
</nav>
```

`aria-current="page"` identifies the current page in the breadcrumb trail.

---

## Pattern: Data Table with Sort

```html
<table>
  <caption>
    Q1 2024 Sales by Region
  </caption>
  <thead>
    <tr>
      <th scope="col">
        <button aria-sort="ascending" onclick="sortByRegion()">Region</button>
      </th>
      <th scope="col">
        <button aria-sort="none" onclick="sortByRevenue()">Revenue</button>
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>North</td>
      <td>$48,000</td>
    </tr>
  </tbody>
</table>
```

`aria-sort` values: `"ascending"`, `"descending"`, `"none"`, `"other"`. Update on click.

---

## Focus Management Reference

| Scenario                 | Action                                                                 |
| ------------------------ | ---------------------------------------------------------------------- |
| Modal opens              | Move focus to modal heading or first interactive element               |
| Modal closes             | Return focus to the element that triggered the modal                   |
| Route change (SPA)       | Move focus to `<h1>` or `<main>` (add `tabindex="-1"`)                 |
| Toast/notification       | Announce via `aria-live="polite"` — do not move focus                  |
| Critical alert           | Announce via `role="alert"` — do not move focus unless action required |
| Inline form error        | Add `aria-invalid`, `aria-describedby` — do not move focus mid-entry   |
| Form submit error        | Move focus to error summary element                                    |
| Delete item from list    | Move focus to next item, previous item, or list container              |
| Expandable content added | If triggered by user, optionally move focus; otherwise use `aria-live` |

---

## Screen Reader Announcement Cheat Sheet

| HTML / ARIA                             | VoiceOver                            | NVDA                               |
| --------------------------------------- | ------------------------------------ | ---------------------------------- |
| `<button>Submit</button>`               | "Submit, button"                     | "Submit button"                    |
| `<a href>Read more</a>`                 | "Read more, link"                    | "Read more link"                   |
| `<input required aria-invalid="true">`  | "text field, required, invalid data" | "invalid entry, text"              |
| `role="dialog" aria-labelledby="title"` | Announces title, "web dialog"        | Opens virtual buffer inside dialog |
| `aria-expanded="false"`                 | "collapsed"                          | "collapsed"                        |
| `aria-expanded="true"`                  | "expanded"                           | "expanded"                         |
| `aria-checked="true"` (role=checkbox)   | "checked"                            | "checked"                          |
| `aria-live="polite"`                    | Announces after current speech       | Announces after current speech     |
| `role="alert"`                          | Interrupts immediately               | Interrupts immediately             |
| `aria-hidden="true"`                    | Element skipped                      | Element skipped                    |
| `aria-label="Close dialog"`             | "Close dialog, button"               | "Close dialog button"              |

---

## When to NOT use ARIA

- **`aria-label` on a `<div>`** — unless it has a role that warrants a label
- **`role="button"` on an `<a href>`** — use `<button>` instead; `<a>` is for navigation
- **`aria-hidden` on the `<body>`** — this hides the entire page from AT
- **`aria-required` without visual indication** — always pair with visible label text or `*`
- **Nested interactive ARIA widgets without keyboard** — adding role without keyboard support breaks access
- **`tabindex="1"` or higher** — disrupts natural tab order; use DOM order instead
- **`aria-label` that conflicts with visible text** — violates 2.5.3 Label in Name
