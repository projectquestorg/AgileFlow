# E2E tests

Playwright smoke tests for the AgileFlow documentation site.

- `smoke.spec.ts`: every v5 page renders with its title, the sidebar sections exist, the legacy v4 link is labeled, and the dark theme and brand assets load.

```bash
npm run test:e2e        # starts the dev server on :3002
npm run test:e2e:ui     # interactive
```

Browsers: `npx playwright install chromium`.
