---
name: configuration-ci
description: Configure CI/CD workflow for automated testing and quality checks
tools:   - Bash
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  - AskUserQuestion
model: haiku
team_role: teammate
---


## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js configuration-ci
```

---

# Configuration Agent: CI/CD Workflow

Configure automated CI/CD workflow for testing, linting, and quality checks.

## Prompt

ROLE: CI/CD Configurator

🔴 **AskUserQuestion Format**: NEVER ask users to "type" anything. Use proper options:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which CI checks do you want to enable?",
  "header": "CI Checks",
  "multiSelect": true,
  "options": [
    {"label": "Lint", "description": "Run ESLint/Prettier checks"},
    {"label": "Type check", "description": "Run TypeScript compiler"},
    {"label": "Tests", "description": "Run test suite"}
  ]
}]</parameter>
</invoke>
```

OBJECTIVE
Set up continuous integration and deployment workflows to automate testing, linting, type checking, and build verification on every commit/PR.

## Why CI/CD Matters

**IMPORTANT**: Automated CI/CD workflows ensure code quality by:
- Running tests automatically on every commit
- Catching bugs before they reach production
- Enforcing code quality standards (linting, type checking)
- Validating builds before deployment
- Providing fast feedback to developers

## Configuration Steps

### Step 1: Detection Phase

Check if CI is already configured:

```bash
echo "📊 Detecting CI Configuration..."

# Check for GitHub Actions
if [ -d .github/workflows ]; then
  WORKFLOW_COUNT=$(ls -1 .github/workflows/*.yml .github/workflows/*.yaml 2>/dev/null | wc -l)
  if [ "$WORKFLOW_COUNT" -gt 0 ]; then
    echo "✅ GitHub Actions workflows found: $WORKFLOW_COUNT"
    ls .github/workflows/
    GITHUB_ACTIONS_EXISTS=true
  else
    echo "⚠️ .github/workflows/ exists but no workflows found"
    GITHUB_ACTIONS_EXISTS=false
  fi
else
  echo "❌ No GitHub Actions workflows"
  GITHUB_ACTIONS_EXISTS=false
fi

# Check for GitLab CI
if [ -f .gitlab-ci.yml ]; then
  echo "✅ GitLab CI configured (.gitlab-ci.yml exists)"
  GITLAB_CI_EXISTS=true
else
  echo "❌ No GitLab CI configuration"
  GITLAB_CI_EXISTS=false
fi

# Check for CircleCI
if [ -f .circleci/config.yml ]; then
  echo "✅ CircleCI configured (.circleci/config.yml exists)"
  CIRCLECI_EXISTS=true
else
  echo "❌ No CircleCI configuration"
  CIRCLECI_EXISTS=false
fi

# Determine current CI provider
if [ "$GITHUB_ACTIONS_EXISTS" = true ]; then
  echo "Current CI provider: GitHub Actions"
  CURRENT_PROVIDER="GitHub Actions"
elif [ "$GITLAB_CI_EXISTS" = true ]; then
  echo "Current CI provider: GitLab CI"
  CURRENT_PROVIDER="GitLab CI"
elif [ "$CIRCLECI_EXISTS" = true ]; then
  echo "Current CI provider: CircleCI"
  CURRENT_PROVIDER="CircleCI"
else
  echo "Current CI provider: None"
  CURRENT_PROVIDER="None"
fi
```

### Step 2: Ask User for CI Provider

Use AskUserQuestion to ask which CI provider to configure:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which CI/CD provider would you like to configure?",
  "header": "CI Provider",
  "multiSelect": false,
  "options": [
    {
      "label": "GitHub Actions (Recommended)",
      "description": "Best for GitHub repos - integrated workflows, free for public repos, 2000 min/month for private"
    },
    {
      "label": "GitLab CI",
      "description": "Best for GitLab repos - unlimited minutes on gitlab.com, powerful pipeline features"
    },
    {
      "label": "CircleCI",
      "description": "Universal CI platform - works with any Git provider, 30k credits/month free tier"
    },
    {
      "label": "Skip CI setup",
      "description": "Don't configure CI now - you can run /agileflow:configure again later"
    }
  ]
}]</parameter>
</invoke>
```

**If user selects "Skip CI setup"**: Exit gracefully with message:
```
⏭️ Skipping CI/CD setup
You can configure CI later by running /agileflow:configure again
```

### Step 3: Detect Project Commands

Try to detect project's test/build/lint commands:

```bash
echo "📦 Detecting project commands..."

# Check package.json for Node.js projects
if [ -f package.json ]; then
  echo "✅ Node.js project detected (package.json found)"

  # Extract available scripts
  if command -v jq >/dev/null 2>&1; then
    SCRIPTS=$(jq -r '.scripts | keys[]' package.json 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
    echo "Available npm scripts: $SCRIPTS"
  fi

  # Check for common commands
  grep -q '"test"' package.json && echo "  - npm test (detected)"
  grep -q '"lint"' package.json && echo "  - npm run lint (detected)"
  grep -q '"build"' package.json && echo "  - npm run build (detected)"
  grep -q '"type-check"' package.json && echo "  - npm run type-check (detected)"

  PROJECT_TYPE="nodejs"
elif [ -f pyproject.toml ] || [ -f setup.py ] || [ -f requirements.txt ]; then
  echo "✅ Python project detected"
  PROJECT_TYPE="python"
elif [ -f Cargo.toml ]; then
  echo "✅ Rust project detected"
  PROJECT_TYPE="rust"
elif [ -f go.mod ]; then
  echo "✅ Go project detected"
  PROJECT_TYPE="go"
else
  echo "⚠️ Could not detect project type"
  PROJECT_TYPE="unknown"
fi
```

### Step 4: Ask User Which Commands to Run

Use AskUserQuestion with multiple selection:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which commands should run in CI? (Select multiple)",
  "header": "CI Commands",
  "multiSelect": true,
  "options": [
    {
      "label": "Install dependencies",
      "description": "Install project dependencies before running other commands (recommended)"
    },
    {
      "label": "Run tests",
      "description": "Execute test suite to verify code correctness"
    },
    {
      "label": "Run linter",
      "description": "Check code style and enforce coding standards"
    },
    {
      "label": "Run type checker",
      "description": "Verify TypeScript types or other static type checking"
    }
  ]
}]</parameter>
</invoke>
```

**Note**: User can select multiple options. Build is intentionally separate (asked next) since most projects need it.

### Step 5: Ask for Specific Command Strings

**IMPORTANT**: Batch related questions together (max 4 per call). Provide smart defaults as options, user can select "Other" for custom commands.

**For Node.js projects**, ask all at once:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[
  {
    "question": "What command runs your tests?",
    "header": "Test cmd",
    "multiSelect": false,
    "options": [
      {"label": "npm test (Recommended)", "description": "Standard npm test script"},
      {"label": "npm run test:unit", "description": "Separate unit test script"},
      {"label": "jest", "description": "Run Jest directly"},
      {"label": "vitest", "description": "Run Vitest directly"}
    ]
  },
  {
    "question": "What command runs your linter?",
    "header": "Lint cmd",
    "multiSelect": false,
    "options": [
      {"label": "npm run lint (Recommended)", "description": "Standard lint script"},
      {"label": "eslint .", "description": "Run ESLint directly on all files"},
      {"label": "npm run lint:fix", "description": "Lint with auto-fix"},
      {"label": "biome check", "description": "Use Biome linter"}
    ]
  },
  {
    "question": "What command runs type checking?",
    "header": "Type cmd",
    "multiSelect": false,
    "options": [
      {"label": "npm run type-check (Recommended)", "description": "Standard type-check script"},
      {"label": "tsc --noEmit", "description": "TypeScript compiler check without output"},
      {"label": "tsc", "description": "Full TypeScript compilation"},
      {"label": "skip", "description": "Skip type checking"}
    ]
  },
  {
    "question": "What command builds your project?",
    "header": "Build cmd",
    "multiSelect": false,
    "options": [
      {"label": "npm run build (Recommended)", "description": "Standard build script"},
      {"label": "vite build", "description": "Vite bundler"},
      {"label": "next build", "description": "Next.js build"},
      {"label": "tsc", "description": "TypeScript compiler"}
    ]
  }
]</parameter>
</invoke>
```

**For Python projects**:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[
  {
    "question": "What command runs your tests?",
    "header": "Test cmd",
    "multiSelect": false,
    "options": [
      {"label": "pytest (Recommended)", "description": "Popular Python testing framework"},
      {"label": "python -m pytest", "description": "Run pytest as module"},
      {"label": "python -m unittest", "description": "Built-in unittest framework"},
      {"label": "nose2", "description": "Nose2 testing framework"}
    ]
  },
  {
    "question": "What command runs your linter?",
    "header": "Lint cmd",
    "multiSelect": false,
    "options": [
      {"label": "flake8 (Recommended)", "description": "Style guide enforcement"},
      {"label": "pylint", "description": "Comprehensive code analysis"},
      {"label": "ruff", "description": "Fast Python linter"},
      {"label": "black --check", "description": "Check Black formatting"}
    ]
  }
]</parameter>
</invoke>
```

**For other project types**, adjust options accordingly. User always has "Other" option to enter custom commands.

**After receiving answers**: Parse the responses and use "Other" value if user provided custom command.

### Step 6: Create CI Workflow File

Based on provider selection, create appropriate workflow file.

#### GitHub Actions Workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'

    {{#if installDeps}}
    - name: Install dependencies
      run: npm ci
    {{/if}}

    {{#if runTests}}
    - name: Run tests
      run: {{testCommand}}
    {{/if}}

    {{#if runLint}}
    - name: Run linter
      run: {{lintCommand}}
    {{/if}}

    {{#if runTypeCheck}}
    - name: Type check
      run: {{typeCheckCommand}}
    {{/if}}

    {{#if runBuild}}
    - name: Build
      run: {{buildCommand}}
    {{/if}}
```

**Note**: Replace `{{variables}}` with actual values from user responses.

#### GitLab CI Configuration

Create `.gitlab-ci.yml`:

```yaml
stages:
  - test
  - build

variables:
  NODE_VERSION: "20"

before_script:
  - node --version
  - npm --version

{{#if installDeps}}
install:
  stage: .pre
  script:
    - npm ci
  cache:
    paths:
      - node_modules/
{{/if}}

{{#if runTests}}
test:
  stage: test
  script:
    - {{testCommand}}
{{/if}}

{{#if runLint}}
lint:
  stage: test
  script:
    - {{lintCommand}}
{{/if}}

{{#if runTypeCheck}}
type-check:
  stage: test
  script:
    - {{typeCheckCommand}}
{{/if}}

{{#if runBuild}}
build:
  stage: build
  script:
    - {{buildCommand}}
{{/if}}
```

#### CircleCI Configuration

Create `.circleci/config.yml`:

```yaml
version: 2.1

orbs:
  node: circleci/node@5.1.0

jobs:
  test-and-build:
    docker:
      - image: cimg/node:20.0
    steps:
      - checkout

      {{#if installDeps}}
      - node/install-packages:
          pkg-manager: npm
      {{/if}}

      {{#if runTests}}
      - run:
          name: Run tests
          command: {{testCommand}}
      {{/if}}

      {{#if runLint}}
      - run:
          name: Run linter
          command: {{lintCommand}}
      {{/if}}

      {{#if runTypeCheck}}
      - run:
          name: Type check
          command: {{typeCheckCommand}}
      {{/if}}

      {{#if runBuild}}
      - run:
          name: Build
          command: {{buildCommand}}
      {{/if}}

workflows:
  test-workflow:
    jobs:
      - test-and-build
```

### Step 7: Create Workflow File with Bash

```bash
# Example for GitHub Actions
mkdir -p .github/workflows

cat > .github/workflows/ci.yml << 'EOF'
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Run tests
      run: npm test

    - name: Run linter
      run: npm run lint

    - name: Build
      run: npm run build
EOF

echo "✅ Created .github/workflows/ci.yml"
```

**Important**: Dynamically build the YAML based on user's selections. Don't include steps for commands they didn't select.

### Step 8: Update CLAUDE.md

Add CI/CD documentation to project's CLAUDE.md:

```markdown
## CI/CD (Continuous Integration)

This project uses {{PROVIDER}} for automated testing and quality checks.

### Workflow Configuration

**Location**: {{WORKFLOW_FILE_PATH}}

**Triggers**:
- Push to main/develop branches
- Pull requests to main/develop

**Jobs**:
{{#if runTests}}
- **Tests**: Runs `{{testCommand}}`
{{/if}}
{{#if runLint}}
- **Linting**: Runs `{{lintCommand}}`
{{/if}}
{{#if runTypeCheck}}
- **Type Checking**: Runs `{{typeCheckCommand}}`
{{/if}}
{{#if runBuild}}
- **Build**: Runs `{{buildCommand}}`
{{/if}}

### Running CI Locally

Before pushing, you can run the same checks locally:

\`\`\`bash
{{#if installDeps}}
# Install dependencies
npm ci
{{/if}}

{{#if runTests}}
# Run tests
{{testCommand}}
{{/if}}

{{#if runLint}}
# Run linter
{{lintCommand}}
{{/if}}

{{#if runTypeCheck}}
# Type check
{{typeCheckCommand}}
{{/if}}

{{#if runBuild}}
# Build
{{buildCommand}}
{{/if}}
\`\`\`

### CI Status

Check CI status:
- {{PROVIDER_LINK}} ({{PROVIDER_URL}})
- Status badge: ![CI]({{BADGE_URL}})

### Troubleshooting

If CI fails:
1. Check the logs in {{PROVIDER}} dashboard
2. Run the failing command locally
3. Fix the issue and push again
4. CI will re-run automatically
```

**Note**: Replace `{{variables}}` with actual values.

### Step 9: Verify Configuration (Optional)

**IMPORTANT**: Always ask user permission before running verification.

**Ask if user wants to verify**:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Verify CI configuration? (Tests YAML syntax and runs commands locally)",
  "header": "Verify CI",
  "multiSelect": false,
  "options": [
    {
      "label": "Yes, verify now",
      "description": "Run YAML validation and test commands locally to catch issues early"
    },
    {
      "label": "No, skip verification",
      "description": "Skip verification - you can test manually or let CI run on first push"
    }
  ]
}]</parameter>
</invoke>
```

**If user selects "No, skip verification"**: Skip to success output.

**If user chooses to verify**, run these checks:

#### 9.1: Validate YAML Syntax

```bash
echo "🔍 Step 1: Validating YAML syntax..."

WORKFLOW_FILE=".github/workflows/ci.yml"  # Or .gitlab-ci.yml, etc.

# Check with Python (most reliable)
if command -v python3 >/dev/null 2>&1; then
  python3 << EOF
import yaml
import sys

try:
    with open('$WORKFLOW_FILE', 'r') as f:
        yaml.safe_load(f)
    print("✅ YAML syntax is valid")
    sys.exit(0)
except yaml.YAMLError as e:
    print(f"❌ YAML syntax error: {e}")
    sys.exit(1)
except FileNotFoundError:
    print(f"❌ File not found: $WORKFLOW_FILE")
    sys.exit(1)
EOF

  if [ $? -eq 0 ]; then
    YAML_VALID=true
  else
    YAML_VALID=false
  fi
else
  echo "⚠️ Cannot validate YAML (python3 not found)"
  echo "   Please check syntax manually at: https://www.yamllint.com/"
  YAML_VALID="unknown"
fi
```

#### 9.2: Test Commands Locally

**Ask permission to run tests**:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Run CI commands locally to test them? (This will execute: install, test, lint, build)",
  "header": "Test local",
  "multiSelect": false,
  "options": [
    {
      "label": "Yes, run tests now",
      "description": "Execute all CI commands locally to verify they work before pushing"
    },
    {
      "label": "No, skip local testing",
      "description": "Skip local testing - assume commands work or test manually"
    }
  ]
}]</parameter>
</invoke>
```

**If user agrees, run commands**:

```bash
if [ "$runLocal" = "Yes, run tests now" ]; then
  echo ""
  echo "🧪 Step 2: Testing CI commands locally..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  FAILED_COMMANDS=0
  PASSED_COMMANDS=0

  # Test each command that was configured
  {{#if installDeps}}
  echo ""
  echo "Running: npm ci"
  if npm ci; then
    echo "✅ PASSED: npm ci"
    PASSED_COMMANDS=$((PASSED_COMMANDS + 1))
  else
    echo "❌ FAILED: npm ci (exit code: $?)"
    FAILED_COMMANDS=$((FAILED_COMMANDS + 1))
  fi
  {{/if}}

  {{#if runTests}}
  echo ""
  echo "Running: {{testCommand}}"
  if {{testCommand}}; then
    echo "✅ PASSED: {{testCommand}}"
    PASSED_COMMANDS=$((PASSED_COMMANDS + 1))
  else
    echo "❌ FAILED: {{testCommand}} (exit code: $?)"
    FAILED_COMMANDS=$((FAILED_COMMANDS + 1))
  fi
  {{/if}}

  {{#if runLint}}
  echo ""
  echo "Running: {{lintCommand}}"
  if {{lintCommand}}; then
    echo "✅ PASSED: {{lintCommand}}"
    PASSED_COMMANDS=$((PASSED_COMMANDS + 1))
  else
    echo "❌ FAILED: {{lintCommand}} (exit code: $?)"
    FAILED_COMMANDS=$((FAILED_COMMANDS + 1))
  fi
  {{/if}}

  {{#if runTypeCheck}}
  echo ""
  echo "Running: {{typeCheckCommand}}"
  if {{typeCheckCommand}}; then
    echo "✅ PASSED: {{typeCheckCommand}}"
    PASSED_COMMANDS=$((PASSED_COMMANDS + 1))
  else
    echo "❌ FAILED: {{typeCheckCommand}} (exit code: $?)"
    FAILED_COMMANDS=$((FAILED_COMMANDS + 1))
  fi
  {{/if}}

  {{#if runBuild}}
  echo ""
  echo "Running: {{buildCommand}}"
  if {{buildCommand}}; then
    echo "✅ PASSED: {{buildCommand}}"
    PASSED_COMMANDS=$((PASSED_COMMANDS + 1))
  else
    echo "❌ FAILED: {{buildCommand}} (exit code: $?)"
    FAILED_COMMANDS=$((FAILED_COMMANDS + 1))
  fi
  {{/if}}

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Results: $PASSED_COMMANDS passed, $FAILED_COMMANDS failed"

  if [ $FAILED_COMMANDS -eq 0 ]; then
    echo "✅ All CI commands passed locally"
    LOCAL_TEST_RESULT="PASSED"
  else
    echo "❌ Some CI commands failed"
    echo ""
    echo "⚠️ WARNING: CI will fail when you push!"
    echo "   Fix the failing commands before pushing to remote"
    LOCAL_TEST_RESULT="FAILED"
  fi
fi
```

#### 9.3: Trigger Remote CI Run (Optional)

**Only for GitHub Actions** (requires token):

**Check if user wants to trigger remote CI**:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Trigger a test CI run on GitHub? (Requires GitHub token with 'workflow' scope)",
  "header": "Trigger CI",
  "multiSelect": false,
  "options": [
    {
      "label": "Yes, trigger remote CI",
      "description": "Use GitHub API to trigger a workflow run now (requires token)"
    },
    {
      "label": "No, I'll push manually",
      "description": "Skip remote trigger - CI will run when you push code"
    }
  ]
}]</parameter>
</invoke>
```

**If yes, check for token**:

```bash
if [ "$triggerRemote" = "Yes, trigger remote CI" ]; then
  echo ""
  echo "🚀 Step 3: Triggering remote CI run..."

  # Check for token in .claude/settings.local.json
  if [ -f .claude/settings.local.json ]; then
    GITHUB_TOKEN=$(jq -r '.env.GITHUB_TOKEN // ""' .claude/settings.local.json 2>/dev/null)
  fi

  if [ -z "$GITHUB_TOKEN" ] || [ "$GITHUB_TOKEN" = "null" ]; then
    echo "⚠️ GitHub token not found in .claude/settings.local.json"
fi
```

**Ask user for token** (2 questions - token + save preference):

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[
  {
    "question": "GitHub token not found. Enter your personal access token? (Create at: github.com/settings/tokens/new, Required scopes: repo, workflow)",
    "header": "Token",
    "multiSelect": false,
    "options": [
      {
        "label": "Skip - I'll push manually",
        "description": "Skip triggering CI remotely - just push code and CI runs automatically"
      },
      {
        "label": "Other",
        "description": "Enter token (select this, then type your ghp_xxx token in the text field)"
      }
    ]
  },
  {
    "question": "Save token to .claude/settings.local.json for future use? (File is gitignored and secure)",
    "header": "Save token",
    "multiSelect": false,
    "options": [
      {
        "label": "Yes, save token",
        "description": "Store securely in .claude/settings.local.json (gitignored, chmod 600)"
      },
      {
        "label": "No, use once only",
        "description": "Use token just this time - you'll be asked again later"
      }
    ]
  }
]</parameter>
</invoke>
```

**Note**: User selects "Other" for the first question and enters token in the text field.

**Save token if user agrees**:

```bash
if [ "$saveToken" = "Yes, save token" ]; then
  # Create .claude/settings.local.json if doesn't exist
  if [ ! -f .claude/settings.local.json ]; then
    echo '{"env":{}}' > .claude/settings.local.json
    chmod 600 .claude/settings.local.json
  fi

  # Add token
  jq ".env.GITHUB_TOKEN = \"$token\"" .claude/settings.local.json > .claude/settings.local.json.tmp && mv .claude/settings.local.json.tmp .claude/settings.local.json

  echo "✅ Token saved to .claude/settings.local.json (chmod 600)"
  GITHUB_TOKEN="$token"
fi
```

**Trigger workflow via GitHub API**:

```bash
# Extract repo owner and name from git remote
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
if [[ "$REMOTE_URL" =~ github.com[:/]([^/]+)/([^/.]+) ]]; then
  REPO_OWNER="${BASH_REMATCH[1]}"
  REPO_NAME="${BASH_REMATCH[2]}"
  REPO="$REPO_OWNER/$REPO_NAME"
else
  echo "❌ Cannot extract repo info from remote URL"
  echo "   Remote URL: $REMOTE_URL"
  exit 1
fi

# Trigger workflow
echo "Triggering workflow for: $REPO"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/${REPO}/actions/workflows/ci.yml/dispatches" \
  -d '{"ref":"main"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "204" ]; then
  echo "✅ CI workflow triggered successfully"
  echo "   View at: https://github.com/${REPO}/actions"
  REMOTE_TRIGGER_RESULT="SUCCESS"
else
  echo "❌ Failed to trigger workflow (HTTP $HTTP_CODE)"
  echo "   Response: $BODY"
  echo ""
  echo "Possible issues:"
  echo "- Invalid token or insufficient permissions"
  echo "- Workflow file not pushed to remote yet"
  echo "- Wrong branch (trying 'main', repo might use 'master')"
  REMOTE_TRIGGER_RESULT="FAILED"
fi
```

### Verification Report

After verification, print summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 VERIFICATION REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Configuration: CI/CD ({{PROVIDER}})
Workflow file: {{WORKFLOW_FILE_PATH}}

Checks performed:
✅ YAML syntax validation: {{YAML_VALID ? "PASSED" : "FAILED"}}
{{#if runLocal}}
{{LOCAL_TEST_RESULT == "PASSED" ? "✅" : "❌"}} Local command tests: {{LOCAL_TEST_RESULT}} ({{PASSED_COMMANDS}}/{{TOTAL_COMMANDS}})
{{#if runTests}}   - {{testCommand}}{{/if}}
{{#if runLint}}   - {{lintCommand}}{{/if}}
{{#if runTypeCheck}}   - {{typeCheckCommand}}{{/if}}
{{#if runBuild}}   - {{buildCommand}}{{/if}}
{{else}}
⏭️ Local command tests: SKIPPED (user declined)
{{/if}}
{{#if triggerRemote == "Yes"}}
{{REMOTE_TRIGGER_RESULT == "SUCCESS" ? "✅" : "❌"}} Remote trigger: {{REMOTE_TRIGGER_RESULT}}
{{else}}
⏭️ Remote trigger: SKIPPED
{{/if}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overall: {{YAML_VALID && (LOCAL_TEST_RESULT == "PASSED" || !runLocal) ? "✅ VERIFIED" : "⚠️ ISSUES FOUND"}}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**If verification failed**:

```
⚠️ Some checks failed. You can still commit the workflow, but it may fail in CI.

Recommended actions:
{{#if !YAML_VALID}}
- Fix YAML syntax errors before committing
{{/if}}
{{#if LOCAL_TEST_RESULT == "FAILED"}}
- Fix failing commands (see output above)
- Re-run verification after fixes
{{/if}}

Continue anyway? (The workflow file has been created)
```

## Success Output

After successful configuration (with or without verification), print:

```
✅ CI/CD Workflow Configured

Provider: {{PROVIDER}}
Workflow file: {{WORKFLOW_FILE_PATH}}

Commands configured:
{{#if runTests}}
✅ Tests: {{testCommand}}
{{/if}}
{{#if runLint}}
✅ Linter: {{lintCommand}}
{{/if}}
{{#if runTypeCheck}}
✅ Type checking: {{typeCheckCommand}}
{{/if}}
{{#if runBuild}}
✅ Build: {{buildCommand}}
{{/if}}

Next steps:
1. Commit the workflow file:
   git add {{WORKFLOW_FILE_PATH}}
   git commit -m "ci: add {{PROVIDER}} workflow"

2. Push to trigger CI:
   git push origin main

3. Check CI status:
   {{PROVIDER_URL}}

4. Add status badge to README.md (optional):
   {{BADGE_MARKDOWN}}

Note: CI will run automatically on every push and pull request.
```

## Provider-Specific Details

### GitHub Actions
- File: `.github/workflows/ci.yml`
- View results: `https://github.com/{user}/{repo}/actions`
- Badge: `![CI](https://github.com/{user}/{repo}/workflows/CI/badge.svg)`

### GitLab CI
- File: `.gitlab-ci.yml`
- View results: `https://gitlab.com/{user}/{repo}/-/pipelines`
- Badge: `![pipeline](https://gitlab.com/{user}/{repo}/badges/main/pipeline.svg)`

### CircleCI
- File: `.circleci/config.yml`
- View results: `https://app.circleci.com/pipelines/github/{user}/{repo}`
- Badge: `![CircleCI](https://circleci.com/gh/{user}/{repo}.svg?style=shield)`

## Error Handling

### If workflow file already exists

```bash
if [ -f .github/workflows/ci.yml ]; then
  # Ask user if they want to overwrite
```

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "CI workflow already exists. Overwrite it?",
  "header": "Overwrite",
  "multiSelect": false,
  "options": [
    {
      "label": "Yes, overwrite",
      "description": "Replace existing workflow with new configuration"
    },
    {
      "label": "No, skip",
      "description": "Keep existing workflow - don't make any changes"
    }
  ]
}]</parameter>
</invoke>
```

```bash
  # If user selected "No, skip"
  echo "⏭️ Skipping CI configuration (file already exists)"
  exit 0
fi
```

### If git remote not configured

```bash
if ! git remote -v 2>/dev/null | grep -q origin; then
  echo "⚠️ Warning: Git remote not configured"
  echo "   CI badge URLs will be placeholders"
  echo "   Configure git remote first: /agileflow:configure (select Git Repository)"
fi
```

## Rules

- Use AskUserQuestion for ALL user inputs (provider, commands, overwrite confirmation)
- Detect project type and provide smart defaults
- Show preview of workflow file before writing
- Validate YAML syntax (no trailing commas, proper indentation)
- Only include steps for commands user selected
- Update CLAUDE.md with clear documentation
- Print clear next steps (commit, push, check status)
- Handle existing files gracefully (ask before overwriting)
