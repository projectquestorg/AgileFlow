---
name: agileflow-test-writer
version: 1.0.0
category: agileflow/testing
description: |
  Use when the user wants to write tests for new or existing code.
  Generates comprehensive test suites from acceptance criteria, covers
  happy paths, sad paths, and edge cases, and selects the right
  framework for the codebase. Also increases coverage on existing code
  that lacks tests.
triggers:
  keywords:
    - write tests
    - add tests
    - test this
    - unit test
    - integration test
    - test coverage
    - missing tests
    - tests for
    - spec file
    - test suite
    - tdd
    - test-driven
    - testing
  priority: 50
  exclude:
    - test environment (infrastructure context)
    - user acceptance testing (UAT project management)
    - penetration testing
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/test-writer.yaml
  maxEntries: 50
depends:
  skills: []
  plugins: [core]
---

# AgileFlow Test Writer

Turns acceptance criteria and existing code into complete, well-structured test suites — with happy paths, sad paths, edge cases, and the right mocking strategy for the codebase.

## When this skill activates

- User asks to write, add, or generate tests for a feature, function, or module
- User references a user story and wants tests derived from its AC
- User wants to increase test coverage on a file or directory
- User is practicing TDD and needs a failing test written before the implementation
- User mentions a specific test framework (Jest, Vitest, pytest, RSpec, Go test) and wants help

## Opening discovery flow

**When invoked without clear context, ask one focused question to understand scope and framework.**

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[
  {
    "question": "What would you like to test?",
    "header": "Test scope",
    "multiSelect": false,
    "options": [
      {"label": "Write tests from a user story or acceptance criteria (Recommended)", "description": "Paste your story or AC and I'll derive a complete test plan — happy paths, sad paths, edge cases"},
      {"label": "Add tests to existing code with low or no coverage", "description": "Point me at a file or module and I'll analyse what's untested and write the missing tests"},
      {"label": "Write tests first (TDD) — implementation comes after", "description": "Describe the behaviour you want and I'll write the failing tests before you write a single line of production code"},
      {"label": "Write an integration test for a specific flow", "description": "e.g. API endpoint, database round-trip, UI interaction — I'll choose the right layer and tooling"},
      {"label": "Improve a specific existing test file", "description": "Paste the test file; I'll find gaps, weak assertions, missing edge cases, and brittle mocks"}
    ]
  },
  {
    "question": "Which test framework does this project use?",
    "header": "Framework",
    "multiSelect": false,
    "options": [
      {"label": "Vitest (Recommended for Vite/React projects)", "description": "ESM-native, fast, Jest-compatible API"},
      {"label": "Jest", "description": "Most common Node.js test runner — CommonJS or ESM"},
      {"label": "pytest", "description": "Python — fixtures, parametrize, and rich plugin ecosystem"},
      {"label": "Go test (testing package)", "description": "Table-driven tests, subtests, benchmarks"},
      {"label": "RSpec", "description": "Ruby — describe/context/it, let, before hooks"},
      {"label": "Not sure — detect it for me", "description": "I'll read package.json / requirements.txt / go.mod to figure it out"}
    ]
  }
]</parameter>
</invoke>
```

**Route based on answers:**

| Scope                 | Next action                                                                        |
| --------------------- | ---------------------------------------------------------------------------------- |
| From AC / story       | Follow `workflows/write-tests-from-ac.md`                                          |
| Add coverage          | Follow `workflows/add-coverage.md`                                                 |
| TDD                   | Write the failing tests, then offer to stub the implementation                     |
| Integration test      | Ask for the endpoint/flow details; choose layer from `references/test-patterns.md` |
| Improve existing file | Read the file, run gap analysis, present findings first                            |

## What makes a great test suite

### The test pyramid

```
        /\
       /E2E\          ← few, slow, high-confidence
      /------\
     /Integr. \       ← moderate, tests wiring
    /----------\
   /   Unit    \      ← many, fast, isolated
  /____________\
```

Each layer has a job. Don't try to do everything at one layer.

| Layer        | Purpose                                         | Speed    | Isolation                    |
| ------------ | ----------------------------------------------- | -------- | ---------------------------- |
| Unit         | Test one function or class in isolation         | < 1ms    | Full mocks/stubs             |
| Integration  | Test two or more real components wired together | 10–500ms | DB, real modules, no network |
| E2E / System | Test the whole system from the outside          | Seconds  | Real browser / HTTP          |

### The four-phase test structure

Every test should follow: **Arrange → Act → Assert → (Cleanup)**

```js
// Arrange
const user = createUser({ role: "admin" });
const service = new UserService({ db: mockDb });

// Act
const result = await service.delete(user.id);

// Assert
expect(result.success).toBe(true);
expect(mockDb.delete).toHaveBeenCalledWith("users", user.id);
```

### Happy / sad / edge coverage

For every acceptance criterion, derive three test categories:

| Category       | Description                                    | Example                                                |
| -------------- | ---------------------------------------------- | ------------------------------------------------------ |
| **Happy path** | The criterion succeeds under normal conditions | Valid input, user is authenticated, data exists        |
| **Sad path**   | The criterion fails gracefully                 | Invalid input, unauthorized, resource not found        |
| **Edge case**  | Boundary conditions and unusual inputs         | Empty string, zero, null, max-length, concurrent calls |

## Framework selection guide

| Signal                                     | Recommended framework |
| ------------------------------------------ | --------------------- |
| `package.json` contains `vite` or `vitest` | Vitest                |
| `package.json` contains `jest`             | Jest                  |
| `*.py` source files                        | pytest                |
| `go.mod` present                           | Go test               |
| `Gemfile` with `rspec`                     | RSpec                 |
| `.NET` / `*.csproj`                        | xUnit or NUnit        |
| Unknown — ask                              | Ask the user          |

## Mocking strategy

**Mock at the boundary, not inside the unit.**

- Mock: external HTTP calls, databases, file system, time (`Date.now`), randomness
- Don't mock: the module under test, pure functions, domain logic

```js
// Good — mock the HTTP boundary
vi.mock("./api-client", () => ({
  fetchUser: vi.fn().mockResolvedValue({ id: 1, name: "Alice" }),
}));

// Bad — mocking the thing you're testing
vi.mock("./user-service"); // ← this tests nothing
```

**Prefer fakes over mocks when the interface is stable:**

- A fake in-memory database is more robust than 40 `mockResolvedValue` calls
- Fakes exercise real behaviour; mocks only verify calls were made

## Coverage targets

See `references/coverage-targets.md` for the full coverage guide. Quick reference:

| Project maturity            | Line coverage target           |
| --------------------------- | ------------------------------ |
| Greenfield / critical path  | 90%+                           |
| Established with some tests | 70–80%                         |
| Legacy brownfield           | 40–60% (improve incrementally) |
| UI/presentation layer       | 60% (unit) + visual regression |

Coverage is a floor, not a goal. 80% coverage with weak assertions is worse than 60% coverage with strong assertions. Always prioritise assertion quality over line count.

## Self-improving learnings

`_learnings/test-writer.yaml` records:

- Preferred test framework and version
- Coverage thresholds the team uses
- Mocking library preference (vi.mock, jest.mock, sinon, unittest.mock)
- Whether the project uses factories/fixtures for test data
- Naming conventions for test files (`*.test.ts` vs `*.spec.ts`)
- Whether the team prefers `describe/it` or flat test functions

Apply on invocation; update on correction.

## Output format

When writing tests, always:

1. Start with a brief comment block explaining what is being tested and why
2. Group tests with `describe` blocks by feature / scenario
3. Use descriptive `it`/`test` names: `it('returns 404 when user does not exist')`
4. Include at least one assertion per test; prefer `toEqual` over `toBeTruthy` for clarity
5. End with a coverage summary: which lines/branches are now covered

## Quality checklist

Before delivering a test suite:

- [ ] At least one happy-path test per acceptance criterion
- [ ] At least one sad-path test per acceptance criterion
- [ ] Edge cases for every input that accepts strings, numbers, or arrays
- [ ] All external dependencies mocked at the correct boundary
- [ ] No test depends on another test's state
- [ ] Test names read as documentation
- [ ] Tests can be run in any order and pass consistently (no flakiness)
- [ ] Tests are in the correct layer (unit vs integration vs e2e)

## Integration

- **agileflow-story-writer** — provides the source acceptance criteria; test-writer maps each AC to one or more test cases and coverage type
- **agileflow-pr-reviewer** — checks test coverage as part of PR review; test-writer is invoked when the reviewer flags missing coverage
- **agileflow-refactor** — refactored code must have its tests updated in the same pass; spawn test-writer before a refactor begins to ensure the safety net exists
- **agileflow-engineering** — spawn test-writer after implementation completes to cover the new code with unit, integration, and E2E tests
- **agileflow-debug** — after a bug is fixed, spawn test-writer to add a regression test that prevents it from returning; the fix isn't done without the test
- **agileflow-accessibility** — generate axe-core and keyboard navigation tests alongside functional tests for any UI story
- **agileflow-performance** — generate benchmark tests to lock in performance gains; test-writer provides the measurement harness, performance provides the thresholds
- **agileflow-database** — generate migration validation tests and repository-layer integration tests that hit a real database, not mocks
- **agileflow-delivery** — test-writer is a delivery gate; delivery should confirm coverage thresholds are met before shipping

## References

Load these files when you need deeper context:

| File                             | When to load                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `references/test-patterns.md`    | Choosing the right test structure by layer, framework-specific patterns, mocking strategies |
| `references/coverage-targets.md` | Understanding coverage targets by project type and how to prioritise what to test first     |

## Workflows

Follow these step-by-step when the user initiates the matching action:

| File                               | When to follow                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `workflows/write-tests-from-ac.md` | User has acceptance criteria or a user story and wants a test suite generated from it |
| `workflows/add-coverage.md`        | User wants to increase test coverage for existing code that is undertested            |
