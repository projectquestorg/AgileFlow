---
name: configuration-visual-e2e
description: Configure Visual E2E testing infrastructure with Playwright and screenshot verification
tools: Read, Write, Edit, Bash, Glob, Grep
model: haiku
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

# Configuration: Visual E2E Testing

Set up Visual E2E testing infrastructure with Playwright and screenshot verification workflow for reliable UI development.

---

## What This Does

Visual E2E testing catches issues that functional tests miss:

1. **Playwright Setup** - Install test runner and chromium browser
2. **Screenshot Capture** - E2E tests capture screenshots during test runs
3. **Visual Verification** - Claude reviews screenshots before marking UI work complete
4. **Auto-Start Dev Server** - webServer config auto-starts dev server for tests

---

## Configuration Steps

### Step 1: Check Prerequisites

```bash
# Verify package.json exists
ls package.json
```

If no package.json, exit with: "This project needs a package.json. Run `npm init` first."

### Step 2: Ask User to Proceed

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Set up Visual E2E testing with Playwright?",
  "header": "Visual E2E",
  "multiSelect": false,
  "options": [
    {"label": "Yes, install Playwright (Recommended)", "description": "~300MB for chromium browser, creates tests/e2e/ and screenshots/"},
    {"label": "Skip", "description": "No Visual E2E setup"}
  ]
}]</parameter>
</invoke>
```

If user selects "Skip", exit with: "Visual E2E setup skipped. Run /agileflow:configure to set up later."

### Step 3: Ask Dev Server Configuration

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What command starts your dev server?",
  "header": "Dev Server",
  "multiSelect": false,
  "options": [
    {"label": "npm run dev", "description": "Default Next.js/Vite command"},
    {"label": "npm start", "description": "Create React App default"},
    {"label": "yarn dev", "description": "Yarn package manager"}
  ]
}]</parameter>
</invoke>
```

### Step 4: Install Playwright

```bash
# Install Playwright test runner
npm install --save-dev @playwright/test

# Install chromium browser (smallest option, ~300MB)
npx playwright install --with-deps chromium
```

### Step 5: Create playwright.config.ts

Create `playwright.config.ts` in project root:

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
    command: 'npm run dev', // Replace with user's choice from Step 3
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

### Step 6: Create Directory Structure

```bash
# Create tests/e2e directory
mkdir -p tests/e2e

# Create screenshots directory
mkdir -p screenshots
```

### Step 7: Create Example Test

Create `tests/e2e/visual-example.spec.ts`:

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

### Step 8: Add npm Scripts

Add to package.json scripts:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:headed": "playwright test --headed"
  }
}
```

### Step 9: Run Verification Test

```bash
npm run test:e2e
```

### Step 10: Update Metadata

Update `docs/00-meta/agileflow-metadata.json` to register Visual E2E as enabled:

```javascript
// Read existing metadata
const metadataPath = 'docs/00-meta/agileflow-metadata.json';
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

// Add visual_e2e feature
metadata.features = metadata.features || {};
metadata.features.visual_e2e = {
  enabled: true,
  version: "2.83.0",
  at: new Date().toISOString(),
  screenshots_dir: "screenshots/",
  playwright_config: "playwright.config.ts"
};

// Update the updated timestamp
metadata.updated = new Date().toISOString();

// Write back
fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
```

This enables automatic detection by `obtain-context.js` so agents know Visual E2E is available.

### Step 11: Show Completion Summary

```
Visual E2E Setup Complete

Installed:
- @playwright/test
- chromium browser

Created:
- playwright.config.ts (with webServer auto-start)
- tests/e2e/visual-example.spec.ts (example test)
- screenshots/ (for visual verification)

Added scripts to package.json:
- npm run test:e2e         Run all e2e tests
- npm run test:e2e:ui      Run with Playwright UI
- npm run test:e2e:headed  Run with visible browser

Visual Verification Workflow:
1. Run tests: npm run test:e2e
2. Review screenshots in screenshots/
3. Rename verified: mv file.png verified-file.png
4. Verify all: node scripts/screenshot-verifier.js

Why Visual Mode?
Tests passing doesn't mean UI looks correct. A button can "work"
but be the wrong color, position, or missing entirely.
Visual verification catches these issues.
```

---

## Visual Verification Workflow

After running tests:

1. **Review screenshots**: Read each screenshot in screenshots/
2. **Verify visually**: Check that UI looks correct
3. **Rename verified**: `mv screenshots/homepage.png screenshots/verified-homepage.png`
4. **Run verifier**: `node scripts/screenshot-verifier.js --path ./screenshots`

This ensures Claude actually looked at each screenshot before declaring completion.

---

## Integration with Ralph Loop

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

---

## Troubleshooting

**Tests fail with "No server running":**
- Ensure webServer command matches your dev server command
- Check the port number in baseURL matches your app

**Screenshots directory empty:**
- Tests must include `await page.screenshot({path: 'screenshots/...'})` calls
- Check test output for errors

**Browser not installed:**
- Run `npx playwright install --with-deps chromium`

---

## Related

- Playwright docs: https://playwright.dev/docs/intro
- webServer config: https://playwright.dev/docs/test-webserver
