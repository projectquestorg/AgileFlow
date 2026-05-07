# Workflow: Write Tests from Acceptance Criteria

**Triggers:** "write tests for this story", "tests for this AC", user pastes acceptance criteria or a user story

**Goal:** Produce a complete, runnable test suite that covers every acceptance criterion with happy paths, sad paths, and edge cases.

---

## Inputs needed

| Input                                                  | Required  | How to get it                                           |
| ------------------------------------------------------ | --------- | ------------------------------------------------------- |
| Acceptance criteria or user story                      | Yes       | Paste or reference                                      |
| Source code for the feature                            | Preferred | Read the relevant file(s)                               |
| Test framework                                         | Yes       | Detect from `package.json` / config, or ask             |
| Test file location convention                          | No        | Detect from existing tests or ask                       |
| Mocking / test helper utilities already in the project | No        | Search for `test-helpers`, `factories`, `fixtures` dirs |

---

## Steps

### Step 1: Parse the acceptance criteria

Read each AC statement and classify it as:

- **Functional requirement** — "User can submit the form"
- **Validation rule** — "Email field is required and must be a valid format"
- **Permission / auth check** — "Only admins can delete accounts"
- **Error case** — "If payment fails, show an error banner"
- **Edge case** — "Handles empty cart gracefully"

If the AC is vague ("works correctly", "handles errors"), ask one clarifying question before proceeding.

### Step 2: Detect the test framework

Read `package.json`, `pyproject.toml`, `go.mod`, or `Gemfile` to confirm the framework. If multiple test frameworks are present (e.g. Jest + Playwright), confirm which to use for this test.

### Step 3: Find existing patterns in the project

Before writing new tests, scan for:

1. An existing test file for the same module — mirror its structure
2. Factory / fixture utilities (look in `test/`, `tests/`, `__tests__/`, `spec/`, `test-helpers/`)
3. Shared setup (`beforeAll`, `beforeEach`) patterns used elsewhere

Reuse what already exists. Don't invent new patterns when the project has established ones.

### Step 4: Build the test matrix

For each acceptance criterion, expand into test cases:

```
AC: User can log in with valid email and password

Happy path:
  - [TEST] Returns 200 and a session token when credentials are correct

Sad paths:
  - [TEST] Returns 401 when password is incorrect
  - [TEST] Returns 401 when email does not exist
  - [TEST] Returns 400 when email is missing from request body
  - [TEST] Returns 400 when password is missing from request body

Edge cases:
  - [TEST] Returns 400 when email is not a valid email format
  - [TEST] Returns 400 when password is an empty string
  - [TEST] Handles email with leading/trailing whitespace (trims or rejects consistently)
  - [TEST] Is case-insensitive for email addresses
```

Show the test matrix to the user if there are more than 10 tests, so they can prioritise or trim.

### Step 5: Write the test suite

Structure the tests as:

```
describe('<FeatureName>')
  describe('<ACGroup / scenario>')
    it('<specific behaviour under test>')
```

For each test:

1. Use a factory or fixture for test data (create one if the project doesn't have one)
2. Arrange all dependencies (mocks, DB state)
3. Act — invoke the unit under test
4. Assert — one primary assertion per test; add secondary assertions only when they are tightly related

### Step 6: Write missing test data helpers if needed

If the project has no factory utilities, create a `test-helpers/factories.{ts,js,py}` file alongside the tests with simple builder functions. Keep them minimal — only the fields relevant to the tests being written.

### Step 7: Verify the tests are syntactically correct

Read the generated test file and confirm:

- All imports resolve to real files
- Mock paths match the actual module paths
- `async/await` is used correctly
- No test has zero assertions

### Step 8: Present the result

Output:

1. The test file (full content, ready to copy or write)
2. A brief summary: "X tests covering Y acceptance criteria — happy paths, Z sad paths, W edge cases"
3. Offer to write the file directly

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Tests are ready — {N} tests covering all {M} ACs.",
  "header": "Next step",
  "multiSelect": false,
  "options": [
    {"label": "Write the test file now (Recommended)", "description": "I'll create {test-file-path} in the correct location"},
    {"label": "Run the tests first", "description": "I'll write the file and show you the output — expect some to fail if the implementation isn't complete yet"},
    {"label": "Revise the test plan", "description": "Tell me what to add, remove, or change"},
    {"label": "Also write the implementation to make these tests pass", "description": "TDD: tests first, then I'll write the implementation"}
  ]
}]</parameter>
</invoke>
```

---

## Example output structure

```js
// tests/auth/login.test.ts
// Tests for: POST /api/auth/login
// AC source: US-0042 - User Login
// Coverage: 5 ACs → 12 tests (4 happy, 6 sad path, 2 edge case)

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { createUser } from "../helpers/factories";
import { clearDatabase, seedDatabase } from "../helpers/db";

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  describe("with valid credentials", () => {
    it("returns 200 and a session token", async () => {
      await seedDatabase([
        createUser({ email: "alice@example.com", password: "hashed_pw" }),
      ]);

      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "alice@example.com", password: "correct_password" });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(typeof res.body.token).toBe("string");
    });
  });

  describe("with invalid credentials", () => {
    it("returns 401 when password is wrong", async () => {
      /* ... */
    });
    it("returns 401 when email does not exist", async () => {
      /* ... */
    });
  });

  describe("with missing or malformed inputs", () => {
    it("returns 400 when email is missing", async () => {
      /* ... */
    });
    it("returns 400 when password is missing", async () => {
      /* ... */
    });
    it("returns 400 when email is not a valid format", async () => {
      /* ... */
    });
  });

  describe("edge cases", () => {
    it("is case-insensitive for email", async () => {
      /* ... */
    });
    it("trims whitespace from email before lookup", async () => {
      /* ... */
    });
  });
});
```

---

## Fallbacks

**If AskUserQuestion is unavailable:**

Present the test matrix as a numbered list:

```
Here is the test plan for US-0042 (12 tests):

Happy paths (4):
1. Returns 200 + token on valid credentials
2. Sets session cookie correctly
...

Sad paths (6):
5. Returns 401 on wrong password
...

Edge cases (2):
11. Case-insensitive email lookup
12. Trims whitespace from email

Reply with:
- "write all" — I'll write the full test file
- "write [numbers]" — I'll write only those tests
- "revise" — tell me what to change
```
