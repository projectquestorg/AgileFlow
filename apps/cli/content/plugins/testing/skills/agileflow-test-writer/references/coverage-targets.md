# Coverage Targets Reference

**Load this when:** setting or evaluating coverage thresholds, prioritising which code to test first, or explaining coverage concepts to the team.

---

## Coverage is a floor, not a goal

A test suite with 95% line coverage and weak assertions (`toBeTruthy`, `toBeDefined`) gives false confidence. Coverage measures which lines of code were _executed_ by tests — not whether those tests _verify_ anything useful.

**Rule of thumb:** 70% coverage with strong assertions beats 95% coverage with trivial assertions.

---

## Coverage types explained

| Type                   | What it measures                | How hard to achieve | Recommended?                        |
| ---------------------- | ------------------------------- | ------------------- | ----------------------------------- |
| **Line coverage**      | Was each line executed?         | Easiest             | Use as baseline metric              |
| **Branch coverage**    | Was each if/else branch taken?  | Medium              | More meaningful than line; use this |
| **Function coverage**  | Was each function called?       | Easy                | Good sanity check                   |
| **Statement coverage** | Was each statement executed?    | Similar to line     | Use when line coverage unavailable  |
| **Mutation testing**   | Do tests catch deliberate bugs? | Hardest             | Best signal of test quality         |

**Recommended combination:** Track branch coverage as your primary metric + function coverage as a quick sanity check. Line coverage is fine as a secondary metric.

---

## Coverage targets by project type

### Greenfield / new features

| Layer                         | Branch coverage target | Rationale                               |
| ----------------------------- | ---------------------- | --------------------------------------- |
| Domain logic / business rules | 95%+                   | Bugs here are expensive                 |
| API handlers / controllers    | 90%+                   | All status codes + error paths          |
| Data access / repositories    | 85%+                   | All query paths including empty results |
| Utilities / helpers           | 90%+                   | Pure functions — easy and high-value    |
| UI components (unit)          | 70%+                   | Focus on behaviour, not render output   |
| Configuration / bootstrap     | 50%+                   | Often hard to test; smoke tests suffice |

### Established codebase

| Layer         | Branch coverage target |
| ------------- | ---------------------- |
| Domain logic  | 85%+                   |
| API handlers  | 80%+                   |
| Data access   | 75%+                   |
| Utilities     | 85%+                   |
| UI components | 60%+                   |

### Legacy / brownfield (incremental improvement)

Do NOT set a global target on a legacy codebase — it creates perverse incentives (trivial tests to hit a number). Instead:

1. **Protect the happy path** — write integration tests for critical flows first
2. **Test before refactoring** — add tests whenever you touch a file
3. **Ratchet coverage up** — never reduce coverage; gate PRs on "no regression"
4. **Prioritise by risk** — payment flows, auth, data mutations before UI

---

## What NOT to test

Do not write tests for code that:

| Category                                          | Why                                                       |
| ------------------------------------------------- | --------------------------------------------------------- |
| Auto-generated code (migrations, generated types) | Code is not hand-authored; tests would test the generator |
| Configuration constants (colours, strings)        | No logic to verify                                        |
| Framework boilerplate (e.g. `app.listen(3000)`)   | Framework is already tested                               |
| Third-party library internals                     | Not your responsibility                                   |
| Trivial getters/setters with no logic             | Zero ROI                                                  |
| Test helpers themselves                           | Usually overkill; only test helpers if they are complex   |

Exclude these from coverage reporting in vitest.config.ts / jest.config.js:

```js
// vitest.config.ts
export default {
  test: {
    coverage: {
      exclude: [
        "src/generated/**",
        "src/config/constants.ts",
        "**/*.d.ts",
        "**/index.ts", // barrel files — no logic
      ],
    },
  },
};
```

---

## Coverage tooling setup

### Vitest

```js
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8", // or 'istanbul'
      reporter: ["text", "lcov", "html"],
      thresholds: {
        branches: 80,
        functions: 85,
        lines: 85,
        statements: 85,
      },
      include: ["src/**/*.{ts,js}"],
      exclude: ["src/**/*.test.{ts,js}", "src/generated/**"],
    },
  },
});
```

Run: `npx vitest run --coverage`

### Jest

```js
// jest.config.js
module.exports = {
  collectCoverage: true,
  coverageProvider: "v8",
  coverageReporters: ["text", "lcov", "html"],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
  collectCoverageFrom: [
    "src/**/*.{js,ts}",
    "!src/**/*.test.{js,ts}",
    "!src/generated/**",
  ],
};
```

Run: `npx jest --coverage`

### pytest + pytest-cov

```ini
# pytest.ini or pyproject.toml [tool.pytest.ini_options]
addopts = --cov=src --cov-report=term-missing --cov-report=html --cov-fail-under=80
```

Run: `pytest --cov`

### Go

```bash
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out   # visual report
go tool cover -func=coverage.out   # per-function summary
```

---

## Prioritising what to test first

When coverage is low and you need to decide where to start, use this priority order:

### Priority 1: Critical paths (always test these)

- Authentication and authorisation checks
- Payment processing and financial calculations
- Data mutations that cannot be undone (delete, archive)
- External API integrations (mock the external call, test the adapter logic)
- Security-sensitive operations (password hashing, token generation, input sanitisation)

### Priority 2: High-value business logic

- Core domain rules (pricing, eligibility, routing)
- Complex state machines
- Data transformations used in multiple places

### Priority 3: Error handling

- What happens when a dependency returns an error?
- What happens when input is malformed?
- Does the system degrade gracefully?

### Priority 4: Happy paths on remaining features

Fill in coverage on everything else after the above are covered.

---

## Interpreting a coverage report

When reading a coverage report, look for:

| Signal                        | What it means                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| Branch < 60% on a domain file | Probably missing sad-path tests                                                                     |
| Function < 70%                | Untested functions — dead code or missing tests                                                     |
| A file at exactly 100%        | Usually means tests were written to cover lines, not to verify behaviour — review assertion quality |
| Large file with 0%            | Either dead code (delete it) or a critical gap                                                      |

---

## Coverage in CI

Add coverage checks to CI to prevent regressions:

```yaml
# GitHub Actions example
- name: Test with coverage
  run: npx vitest run --coverage

- name: Upload coverage report
  uses: codecov/codecov-action@v4
  with:
    files: ./coverage/lcov.info
```

**Gate strategy:** Fail the build if coverage drops below threshold (use `coverageThreshold` in config). Don't require 100% — that creates perverse incentives.

---

## Common coverage anti-patterns

| Anti-pattern                                         | Problem                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| Writing tests just to hit the threshold              | Results in trivial tests; wastes time; creates false confidence |
| 100% coverage as a team rule                         | Forces tests on trivial getters; makes adding code painful      |
| Testing the test setup (testing mock calls directly) | Proves the mock works, not the production code                  |
| No coverage check in CI                              | Coverage regresses silently over time                           |
| Excluding too much from coverage                     | Hides real gaps; start conservative with exclusions             |
