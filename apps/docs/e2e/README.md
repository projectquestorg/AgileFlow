# E2E Testing

This directory contains end-to-end tests for the AgileFlow documentation site using Playwright.

## Test Files

- **smoke.spec.ts** - Critical path smoke tests (navigation, search, tutorial wizard)
- **visual.spec.ts** - Visual regression tests with screenshot comparison

## Running Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run with UI mode (interactive)
pnpm test:e2e:ui

# Run specific test file
pnpm test:e2e e2e/smoke.spec.ts

# Run specific browser only
pnpm test:e2e --project=chromium

# Update visual snapshots
pnpm test:e2e:update

# View test report
pnpm test:e2e:report
```

## Test Categories

### Smoke Tests
- Homepage loading and title
- Navigation between pages
- Search functionality (keyboard shortcut, results, navigation)
- Getting Started tutorial wizard
- Mobile navigation drawer
- Basic accessibility checks

### Visual Regression Tests
- Desktop screenshots (homepage, installation, getting-started, commands)
- Mobile screenshots (320px-768px viewports)
- Dark mode screenshots
- Component-level screenshots (cards, code blocks)

## Configuration

Configuration is in `playwright.config.ts`:

- **Browsers**: Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari
- **Base URL**: `http://localhost:3000`
- **Web Server**: Starts `pnpm dev` automatically
- **Screenshots**: On failure only
- **Traces**: On first retry

## CI Integration

E2E tests run automatically on GitHub Actions:
- Only smoke tests run on PRs (faster feedback)
- Full visual tests can be enabled for releases
- Test artifacts uploaded on failure

## Updating Snapshots

When intentional UI changes are made:

```bash
# Update all snapshots
pnpm test:e2e:update

# Update specific test
pnpm test:e2e --update-snapshots visual.spec.ts
```

Review changes carefully before committing updated snapshots.

## Troubleshooting

### Tests timing out
- Increase `timeout` in `playwright.config.ts`
- Check if dev server is starting correctly
- Verify network connectivity

### Flaky tests
- Add `await page.waitForLoadState('networkidle')`
- Increase `waitForTimeout` values
- Use more specific selectors

### Screenshot differences
- Ensure consistent fonts across environments
- Check for animation/transition timing
- Verify viewport sizes match
