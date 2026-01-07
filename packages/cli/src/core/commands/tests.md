---
description: Set up automated testing infrastructure
argument-hint: (no arguments)
compact_context:
  priority: high
  preserve_rules:
    - "Auto-detect language/runtime and testing framework (Node.js→Jest, Python→pytest, Ruby→RSpec, etc.)"
    - "MUST use TodoWrite to track all 10 steps (detect, check existing, install, config, examples, structure, scripts, CI, docs, run)"
    - "Always show diff-first preview before creating files"
    - "Create working example tests (unit, integration, E2E if requested) - not just config"
    - "Set reasonable coverage thresholds (70%, not 100%)"
    - "Integrate with CI immediately (.github/workflows/ci.yml update)"
    - "Create docs/02-practices/testing.md documentation"
    - "Run test suite after setup to verify it works"
  state_fields:
    - framework_detected
    - example_tests_created
    - ci_integrated
    - coverage_threshold_set
---

# setup-tests

Automatically set up testing infrastructure for projects without existing tests.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js tests
```

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:setup-tests IS ACTIVE

**CRITICAL**: You are bootstrapping test infrastructure. All 10 steps must complete to have working test suite.

**ROLE**: Test Infrastructure Bootstrapper - Auto-detect language, install framework, create examples, integrate CI

---

### 🚨 RULE #1: ALWAYS USE TodoWrite FOR 10 STEPS

Track all steps explicitly:
```xml
<invoke name="TodoWrite">
<parameter name="content">
1. Detect language/runtime and framework
2. Check existing test setup
3. Install testing framework dependencies
4. Create test configuration files
5. Create example tests (unit, integration, E2E if requested)
6. Create test directory structure
7. Add test scripts to package.json/equivalent
8. Integrate with CI workflow
9. Create docs/02-practices/testing.md documentation
10. Run tests to verify setup
</parameter>
<parameter name="status">in-progress</parameter>
</invoke>
```

Mark each step complete. This ensures comprehensive setup.

---

### 🚨 RULE #2: FRAMEWORK AUTO-DETECTION

Detect from manifest files:
- **Node.js**: package.json → **Jest** (or Mocha if configured)
- **Python**: requirements.txt/pyproject.toml → **pytest**
- **Ruby**: Gemfile → **RSpec**
- **Go**: go.mod → **go test**
- **Rust**: Cargo.toml → **cargo test**
- **Java**: pom.xml/build.gradle → **JUnit**
- **.NET**: *.csproj → **xUnit/NUnit**

If unclear, ask: "Detected Node.js. Use Jest?"

---

### 🚨 RULE #3: WORKING EXAMPLES, NOT JUST CONFIG

**NEVER** create config without example tests:
- Create `tests/unit/example.test.ts` (passes immediately)
- Create `tests/integration/api.test.ts` (passes immediately)
- Create `tests/e2e/flow.spec.ts` (only if E2E=yes)

Examples MUST pass on first run:
```typescript
describe('Example Test Suite', () => {
  it('should pass this example test', () => {
    expect(true).toBe(true);
  });
});
```

---

### 🚨 RULE #4: COVERAGE THRESHOLD

Always set REASONABLE thresholds (not perfectionistic):

```javascript
coverageThreshold: {
  global: {
    branches: 70,      // Don't require 100%
    functions: 70,     // Realistic goals
    lines: 70,
    statements: 70
  }
}
```

Don't enforce >80% initially. Users will increase over time.

---

### 🚨 RULE #5: CI INTEGRATION MANDATORY

Always update/create `.github/workflows/ci.yml` with test job:

```yaml
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: npm install
    - run: npm test -- --coverage
    - uses: codecov/codecov-action@v3
```

If .github/workflows/ci.yml exists, add test job. Don't replace.

---

### 🚨 RULE #6: DIFF-FIRST PATTERN

Always show preview:

```
Will set up testing for: Node.js (Jest)

Will create:
✓ jest.config.js (test configuration)
✓ tests/unit/example.test.ts (example unit test)
✓ tests/integration/api.test.ts (example integration test)
✓ tests/fixtures/ directory
✓ Update .github/workflows/ci.yml

Will install:
✓ jest @types/jest ts-jest

Proceed? (YES/NO)
```

Then ask: "Proceed with test setup? (YES/NO)"

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Create jest.config.js but no example tests
❌ Set coverage threshold to 100%
❌ Forget to integrate with CI
❌ Skip running tests after setup
❌ Create config without docs
❌ Hardcode framework (don't auto-detect)

### DO THESE INSTEAD

✅ Create config AND working example tests
✅ Set realistic thresholds (70%)
✅ Add test job to CI immediately
✅ Run tests after setup to verify
✅ Create docs/02-practices/testing.md
✅ Auto-detect language/framework first

---

### WORKFLOW PHASES

**Phase 1: Detection (Steps 1-2)**
- Scan for package.json, Gemfile, go.mod, etc.
- Detect language/runtime
- Check if tests already exist

**Phase 2: Installation (Step 3)**
- Install framework deps (jest, pytest, etc.)
- Install coverage tools if needed

**Phase 3: Configuration (Step 4)**
- Create config file (jest.config.js, pytest.ini, etc.)
- Set coverage thresholds (70%)

**Phase 4: Examples (Steps 5-6)**
- Create working example tests
- Create test directory structure

**Phase 5: Integration (Steps 7-8)**
- Add test scripts to package.json
- Add test job to CI workflow

**Phase 6: Documentation (Step 9)**
- Create docs/02-practices/testing.md

**Phase 7: Verification (Step 10)**
- Run tests to verify everything works
- Show test output

---

### OUTPUT STRUCTURE

Always create:
```
tests/
├── unit/           # Fast, isolated tests
├── integration/    # Slower, multi-component tests
├── e2e/           # Slow, full-flow tests (if E2E=yes)
├── fixtures/      # Test data files
└── helpers/       # Test utilities (mocks, factories)
```

---

### SCRIPTS TO ADD

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:e2e": "playwright test"
  }
}
```

---

### KEY FILES TO REMEMBER

| File | Purpose |
|------|---------|
| `jest.config.js` (or equivalent) | Test framework configuration |
| `tests/unit/example.test.ts` | Working example test |
| `docs/02-practices/testing.md` | How to write and run tests |
| `.github/workflows/ci.yml` | CI test job |
| `.gitignore` entry | Exclude coverage/ from git |

---

### REMEMBER AFTER COMPACTION

- `/agileflow:setup-tests` IS ACTIVE - bootstrap test infrastructure
- Auto-detect language/framework (Node.js→Jest, Python→pytest, etc.)
- ALWAYS create working example tests (not just config)
- Set reasonable coverage (70%, not 100%)
- Run tests after setup to verify they pass
- Use TodoWrite to track 10 steps
- Integrate with CI immediately
- Create docs/02-practices/testing.md

<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: Test Infrastructure Bootstrapper

INPUTS
FRAMEWORK=<name>   jest|mocha|pytest|rspec|go-test|cargo-test (default: auto-detect)
COVERAGE=yes|no    Enable coverage reporting (default: yes)
E2E=yes|no         Include E2E tests (default: no)

ACTIONS
1) Detect language/runtime and framework
2) Check existing test setup
3) Install testing framework dependencies
4) Create test configuration files
5) Create example tests
6) Add test scripts to package.json/equivalent
7) Integrate with CI workflow
8) Run tests to verify setup

TODO LIST TRACKING
**CRITICAL**: Immediately create a todo list using TodoWrite tool to track test infrastructure setup:
```
1. Detect language/runtime and framework
2. Check existing test setup
3. Install testing framework dependencies
4. Create test configuration files
5. Create example tests (unit, integration, E2E if requested)
6. Create test directory structure
7. Add test scripts to package.json/equivalent
8. Integrate with CI workflow
9. Create docs/02-practices/testing.md documentation
10. Run tests to verify setup
```

Mark each step complete as you finish it. This ensures comprehensive test infrastructure setup.

OBJECTIVE
Detect project type and set up appropriate testing framework with example tests and CI integration.

INPUTS (optional)
- FRAMEWORK=auto|jest|mocha|pytest|rspec|go-test|cargo-test (default: auto-detect)
- COVERAGE=yes|no (default: yes)
- E2E=yes|no (default: no, ask if needed)

PROJECT DETECTION

1. Detect language/runtime:
   - Node.js: package.json
   - Python: requirements.txt, pyproject.toml
   - Ruby: Gemfile
   - Go: go.mod
   - Rust: Cargo.toml
   - Java: pom.xml, build.gradle
   - .NET: *.csproj

2. Detect framework (if applicable):
   - React, Vue, Angular (npm deps)
   - Django, Flask, FastAPI (Python imports)
   - Rails, Sinatra (Gemfile)

3. Check existing test setup:
   - Test directories: test/, tests/, __tests__/, spec/
   - Test config: jest.config.js, pytest.ini, .rspec
   - CI config: .github/workflows/*test*

SETUP ACTIONS

### For Node.js (Jest)
```bash
npm install --save-dev jest @types/jest ts-jest
# If TypeScript: npm install --save-dev @types/jest ts-jest
# If React: npm install --save-dev @testing-library/react @testing-library/jest-dom
```

Create jest.config.js:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/*.d.ts',
    '!src/**/*.spec.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  }
};
```

### For Python (pytest)
```bash
pip install pytest pytest-cov pytest-mock
```

Create pytest.ini:
```ini
[pytest]
testpaths = tests
python_files = test_*.py *_test.py
python_classes = Test*
python_functions = test_*
addopts = --cov=src --cov-report=html --cov-report=term
```

### For Ruby (RSpec)
```ruby
# Add to Gemfile
group :test do
  gem 'rspec'
  gem 'rspec-rails' # if Rails
  gem 'factory_bot'
  gem 'simplecov'
end
```

```bash
bundle install
rspec --init
```

CREATE EXAMPLE TESTS

### Unit Test Example (Node.js/Jest)
```typescript
// tests/unit/example.test.ts
describe('Example Test Suite', () => {
  it('should pass this example test', () => {
    expect(true).toBe(true);
  });

  it('should test basic math', () => {
    expect(2 + 2).toBe(4);
  });
});
```

### Component Test Example (React)
```typescript
// tests/components/Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import Button from '@/components/Button';

describe('Button Component', () => {
  it('renders with text', () => {
    render(<Button>Click Me</Button>);
    expect(screen.getByText('Click Me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByText('Click'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### API Test Example (Integration)
```typescript
// tests/integration/api.test.ts
import request from 'supertest';
import app from '@/app';

describe('API Integration Tests', () => {
  it('GET / should return 200', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
  });

  it('POST /api/users should create user', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({ name: 'Test User', email: 'test@example.com' });
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
  });
});
```

DIRECTORY STRUCTURE

Create:
```
tests/
├── unit/           # Unit tests (isolated functions/classes)
├── integration/    # Integration tests (multiple components)
├── e2e/           # End-to-end tests (full user flows) [if E2E=yes]
├── fixtures/      # Test data
└── helpers/       # Test utilities
```

E2E SETUP (if E2E=yes)

### Playwright (recommended)
```bash
npm install --save-dev @playwright/test
npx playwright install
```

Create playwright.config.ts and example E2E test:
```typescript
// tests/e2e/login.spec.ts
import { test, expect } from '@playwright/test';

test('user can log in', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('http://localhost:3000/dashboard');
});
```

CI INTEGRATION

Add to .github/workflows/ci.yml (or create):
```yaml
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - name: Setup Node
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Run tests
      run: npm test -- --coverage

    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        files: ./coverage/lcov.info
```

NPM SCRIPTS

Add to package.json:
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:e2e": "playwright test"
  }
}
```

DOCUMENTATION

Create docs/02-practices/testing.md:
```markdown
# Testing Guide

## Running Tests

\`\`\`bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
npm run test:unit     # Unit tests only
\`\`\`

## Writing Tests

### Unit Tests
- Test individual functions/classes in isolation
- Mock external dependencies
- Fast (<10ms per test)

### Integration Tests
- Test multiple components together
- Use real dependencies when possible
- Medium speed (<100ms per test)

### E2E Tests
- Test full user flows
- Run against real app
- Slow (seconds per test)

## Coverage Requirements
- Minimum 70% coverage (enforced in CI)
- New code should be 90%+ covered
- Critical paths require 100% coverage

## Best Practices
- Use descriptive test names (Given/When/Then)
- One assertion per test when possible
- Avoid test interdependence
- Use factories/fixtures for test data
```

WORKFLOW

1. Detect project type and existing setup
2. Show proposed setup plan (diff-first):
   ```
   Will install:
   - jest, @types/jest, ts-jest
   - @testing-library/react, @testing-library/jest-dom

   Will create:
   - jest.config.js
   - tests/unit/example.test.ts
   - tests/integration/api.test.ts
   - docs/02-practices/testing.md

   Will update:
   - package.json (add test scripts)
   - .github/workflows/ci.yml (add test job)
   ```

3. Ask: "Proceed with test setup? (YES/NO)"

4. If YES:
   - Run installations
   - Create config files
   - Create example tests
   - Update CI
   - Run tests to verify setup

5. Show results:
   ```
   ✅ Testing framework installed
   ✅ Example tests created
   ✅ CI integration added

   Try running: npm test
   ```

INTEGRATION

- Create story: "US-XXXX: Set up testing infrastructure"
- Update docs/02-practices/testing.md
- Suggest setting required checks in GitHub

RULES
- Preview all changes (diff-first, YES/NO)
- Run test suite after setup to verify
- Create working examples, not just config
- Document how to run and write tests
- Integrate with CI immediately
- Set reasonable coverage thresholds (not 100%)

OUTPUT
- Setup summary
- Test framework configuration
- Example tests (unit + integration + E2E if requested)
- CI integration
- Testing documentation
