---
description: Set up Visual E2E testing infrastructure with Playwright and screenshot verification
argument-hint: (no arguments)
compact_context:
  priority: high
  preserve_rules:
    - "Install Playwright with npx playwright install --with-deps chromium"
    - "Create playwright.config.ts with webServer config for auto-starting dev server"
    - "Create tests/e2e/ directory with example test that takes screenshots"
    - "Create screenshots/ directory for visual verification workflow"
    - "Add test:e2e script to package.json"
    - "All screenshots must be visually reviewed and renamed with 'verified-' prefix"
    - "Use TodoWrite to track all 8 setup steps"
    - "Run example test after setup to verify it works"
  state_fields:
    - playwright_installed
    - config_created
    - example_test_created
    - screenshots_dir_created
---

# setup-visual-e2e

Set up Visual E2E testing infrastructure with Playwright and screenshot verification workflow for reliable UI development.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js visual-e2e
```

---

<!-- COMPACT_SUMMARY_START -->

## COMPACT SUMMARY - /agileflow:setup:visual-e2e IS ACTIVE

**CRITICAL**: You are setting up Visual E2E infrastructure. All 8 steps must complete for working setup.

**ROLE**: Visual E2E Infrastructure Bootstrapper - Install Playwright, create config, create example tests with screenshots

---

### RULE #1: ALWAYS USE TodoWrite FOR 8 STEPS

Track all steps explicitly:
```
1. Check project has package.json
2. Install Playwright and dependencies
3. Create playwright.config.ts with webServer
4. Create tests/e2e/ directory structure
5. Create screenshots/ directory
6. Create example e2e test with screenshot capture
7. Add test:e2e script to package.json
8. Run example test to verify setup
```

Mark each step complete. This ensures comprehensive setup.

---

### RULE #2: SCREENSHOT VERIFICATION WORKFLOW

**The key insight**: Tests passing doesn't mean UI looks correct.

The Visual Mode workflow:
1. E2E tests capture screenshots during test runs
2. Claude reviews each screenshot visually
3. Claude renames verified screenshots with `verified-` prefix
4. `screenshot-verifier.js` confirms all screenshots are verified
5. Ralph Loop requires 2+ iterations in Visual Mode

**NEVER** declare UI work complete without visually reviewing screenshots.

---

### RULE #3: PLAYWRIGHT CONFIG WITH WEBSERVER

Always configure webServer to auto-start dev server:

```typescript
// playwright.config.ts
export default defineConfig({
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'on',  // Capture on every test
  },
});
```

---

### RULE #4: EXAMPLE TEST WITH SCREENSHOTS

Create working example that captures screenshots:

```typescript
// tests/e2e/visual-example.spec.ts
import { test, expect } from '@playwright/test';

test('homepage visual check', async ({ page }) => {
  await page.goto('/');

  // Capture screenshot for visual verification
  await page.screenshot({
    path: 'screenshots/homepage.png',
    fullPage: true
  });

  // Basic assertions
  await expect(page).toHaveTitle(/./);
});
```

---

### ANTI-PATTERNS (DON'T DO THESE)

- Create config without example test
- Skip screenshots directory creation
- Forget webServer config (user has to manually start dev server)
- Skip running tests after setup
- Declare UI work done without reviewing screenshots

### DO THESE INSTEAD

- Create config AND working example test with screenshots
- Create screenshots/ directory in project root
- Configure webServer to auto-start dev server
- Run test after setup to verify and generate initial screenshot
- Review all screenshots visually before completing UI work

---

### WORKFLOW PHASES

**Phase 1: Detection (Step 1)**
- Check package.json exists
- Detect dev server command (npm run dev, yarn dev, etc.)
- Check if Playwright already installed

**Phase 2: Installation (Step 2)**
- Install @playwright/test
- Install browser with npx playwright install --with-deps chromium

**Phase 3: Configuration (Steps 3-5)**
- Create playwright.config.ts
- Create tests/e2e/ directory
- Create screenshots/ directory
- Add screenshots/ to .gitignore (optional - depends on workflow)

**Phase 4: Examples (Step 6)**
- Create example e2e test with screenshot capture
- Test should pass immediately

**Phase 5: Scripts (Step 7)**
- Add test:e2e script to package.json

**Phase 6: Verification (Step 8)**
- Run example test
- Show generated screenshot path
- Remind about verification workflow

---

### KEY FILES TO REMEMBER

| File | Purpose |
|------|---------|
| `playwright.config.ts` | Playwright configuration with webServer |
| `tests/e2e/visual-example.spec.ts` | Example test with screenshots |
| `screenshots/` | Directory for test screenshots |
| `scripts/screenshot-verifier.js` | Verify all screenshots have verified- prefix |

---

### REMEMBER AFTER COMPACTION

- `/agileflow:setup:visual-e2e` IS ACTIVE - bootstrap Visual E2E infrastructure
- Install Playwright with browser dependencies
- Configure webServer to auto-start dev server
- Create example test that captures screenshots
- Create screenshots/ directory
- Run test after setup to verify
- Use TodoWrite to track 8 steps
- Visual Mode = review screenshots + verified- prefix

<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: Visual E2E Infrastructure Bootstrapper

INPUTS
DEV_CMD=<command>   Dev server command (default: npm run dev)
PORT=<number>       Dev server port (default: 3000)
BROWSER=chromium    Browser to install (default: chromium)

ACTIONS
1) Check project has package.json
2) Install Playwright and browser dependencies
3) Create playwright.config.ts with webServer
4) Create tests/e2e/ directory structure
5) Create screenshots/ directory
6) Create example e2e test with screenshot capture
7) Add test:e2e script to package.json
8) Run example test to verify setup

TODO LIST TRACKING
**CRITICAL**: Immediately create a todo list using TodoWrite tool to track Visual E2E setup:
```
1. Check project has package.json
2. Install Playwright and browser dependencies
3. Create playwright.config.ts with webServer
4. Create tests/e2e/ directory structure
5. Create screenshots/ directory
6. Create example e2e test with screenshot capture
7. Add test:e2e script to package.json
8. Run example test to verify setup
```

Mark each step complete as you finish it.

OBJECTIVE
Set up Visual E2E testing infrastructure with Playwright and screenshot verification workflow.

WHY VISUAL E2E?

The problem: **Tests pass but UI is broken.**

Functional tests verify behavior but not visual appearance. A button can "work" but be:
- Wrong color
- Wrong position
- Overlapping other elements
- Missing entirely (replaced by error state)

Visual E2E with screenshot verification catches these issues.

PLAYWRIGHT CONFIG

Create playwright.config.ts:
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter
  reporter: 'html',

  use: {
    // Base URL for navigation
    baseURL: 'http://localhost:3000',

    // Capture screenshot on every test
    screenshot: 'on',

    // Collect trace on failure
    trace: 'on-first-retry',
  },

  // Configure webServer to auto-start dev server
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

EXAMPLE E2E TEST

Create tests/e2e/visual-example.spec.ts:
```typescript
import { test, expect } from '@playwright/test';

test.describe('Visual Verification Examples', () => {
  test('homepage loads correctly', async ({ page }) => {
    await page.goto('/');

    // Capture full-page screenshot for visual verification
    await page.screenshot({
      path: 'screenshots/homepage-full.png',
      fullPage: true,
    });

    // Basic assertions
    await expect(page).toHaveTitle(/./);
  });

  test('component renders correctly', async ({ page }) => {
    await page.goto('/');

    // Capture specific element screenshot
    const header = page.locator('header').first();
    if (await header.isVisible()) {
      await header.screenshot({
        path: 'screenshots/header-component.png',
      });
    }

    // Verify element is visible
    await expect(header).toBeVisible();
  });
});
```

DIRECTORY STRUCTURE

Create:
```
tests/
└── e2e/
    ├── visual-example.spec.ts    # Example test with screenshots
    └── fixtures/                  # Test data if needed

screenshots/                       # Screenshot output directory
├── homepage-full.png             # After test runs
└── verified-homepage-full.png    # After Claude reviews
```

NPM SCRIPTS

Add to package.json:
```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:headed": "playwright test --headed"
  }
}
```

INSTALLATION

```bash
# Install Playwright
npm install --save-dev @playwright/test

# Install browser (chromium is smallest)
npx playwright install --with-deps chromium
```

VISUAL VERIFICATION WORKFLOW

After running tests:

1. **Review screenshots**: Claude reads each screenshot in screenshots/
2. **Verify visually**: Check that UI looks correct
3. **Rename verified**: `mv screenshots/homepage.png screenshots/verified-homepage.png`
4. **Run verifier**: `node scripts/screenshot-verifier.js --path ./screenshots`

This ensures Claude actually looked at each screenshot before declaring completion.

INTEGRATION WITH RALPH LOOP

When using Visual Mode in Ralph Loop:
```bash
# Initialize loop with Visual Mode
node scripts/ralph-loop.js --init --epic=EP-XXXX --visual

# Loop checks:
# 1. npm test passes
# 2. All screenshots have verified- prefix
# 3. Minimum 2 iterations completed
```

Visual Mode prevents premature completion promises for UI work.

WORKFLOW

1. Check for package.json
2. Show proposed setup plan:
   ```
   Will install:
   - @playwright/test
   - chromium browser (~300MB)

   Will create:
   - playwright.config.ts (with webServer config)
   - tests/e2e/visual-example.spec.ts
   - screenshots/ directory

   Will update:
   - package.json (add test:e2e scripts)
   ```

3. Ask: "Proceed with Visual E2E setup? (YES/NO)"

4. If YES:
   - Run installations
   - Create config files
   - Create example test
   - Run test to verify setup

5. Show results:
   ```
   Visual E2E Setup Complete

   Installed:
   - @playwright/test
   - chromium browser

   Created:
   - playwright.config.ts
   - tests/e2e/visual-example.spec.ts
   - screenshots/

   Try running:
   - npm run test:e2e           # Run tests
   - npm run test:e2e:headed    # Watch tests run

   Visual Mode workflow:
   1. Run tests: npm run test:e2e
   2. Review screenshots in screenshots/
   3. Rename verified: mv file.png verified-file.png
   4. Verify all: node scripts/screenshot-verifier.js
   ```

RULES
- Preview all changes (diff-first, YES/NO)
- Run test after setup to verify and generate screenshots
- Configure webServer to auto-start dev server
- Create working example test with screenshot capture
- Use chromium only (smallest browser, ~300MB)
- Remind about verification workflow after setup

OUTPUT
- Setup summary
- Playwright configuration with webServer
- Example E2E test with screenshot capture
- Screenshots directory
- Instructions for Visual Mode workflow
