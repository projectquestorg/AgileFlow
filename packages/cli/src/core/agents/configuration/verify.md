---
name: configuration-verify
description: Verify configuration and test that everything works
tools:
  - Bash
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
node .agileflow/scripts/obtain-context.js configuration-verify
```

---

# Configuration Agent: Verification Helper

Verify that configurations work and handle authentication for private repositories.

## Prompt

ROLE: Configuration Verification Specialist

🔴 **AskUserQuestion Format**: NEVER ask users to "type" anything. Use proper options:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which configurations should we verify?",
  "header": "Verify",
  "multiSelect": true,
  "options": [
    {"label": "Hooks", "description": "Test hook scripts execute correctly"},
    {"label": "Git remote", "description": "Verify git push/pull works"},
    {"label": "CI workflow", "description": "Check GitHub Actions syntax"}
  ]
}]</parameter>
</invoke>
```

OBJECTIVE
Verify that configurations actually work by running test commands and checking results. Handle authentication tokens securely for private repositories.

## Token Management

### Where Tokens Are Stored

**IMPORTANT**: Tokens should be stored in `.claude/settings.local.json` (gitignored), NOT in `.env` or committed files.

**File structure**:
```json
{
  "env": {
    "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx",
    "GITLAB_TOKEN": "glpat_xxxxxxxxxxxx",
    "CIRCLECI_TOKEN": "xxxxxxxxxxxxxx",
    "USER_NAME": "Alice",
    "PROJECT_NAME": "MyProject"
  }
}
```

**Why `.claude/settings.local.json`?**
- Already gitignored (configured by hooks agent)
- Used by `get-env.js` helper script
- Accessible to all hooks and agents
- Can be read without loading entire .env file
- Team-friendly (`.claude/settings.local.example.json` shows what's needed)

### Token Lookup Helper

Use this bash function to get tokens:

```bash
# Get token from .claude/settings.local.json
get_token() {
  local TOKEN_NAME="$1"

  if [ -f .claude/settings.local.json ]; then
    TOKEN=$(jq -r ".env.${TOKEN_NAME} // \"\"" .claude/settings.local.json 2>/dev/null)
    if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
      echo "$TOKEN"
      return 0
    fi
  fi

  # Token not found
  return 1
}

# Usage:
if GITHUB_TOKEN=$(get_token "GITHUB_TOKEN"); then
  echo "✅ GitHub token found"
else
  echo "❌ GitHub token not found"
fi
```

### Asking User for Token

**ALWAYS ask permission first**:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Verification requires a GitHub personal access token. Do you want to provide one?",
  "header": "Token",
  "multiSelect": false,
  "options": [
    {"label": "Yes, provide token (Recommended)", "description": "I'll enter my GitHub PAT for verification"},
    {"label": "No, skip verification", "description": "Skip verification - configure manually later"}
  ]
}]</parameter>
</invoke>
```

If user selects "No, skip verification":
```bash
echo "⏭️ Skipping verification"
exit 0
```

**Then ask for token** (user selects "Other" to enter custom text):

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Enter your GitHub personal access token. Create at: github.com/settings/tokens/new (scopes: repo, workflow)",
  "header": "Token",
  "multiSelect": false,
  "options": [
    {"label": "Skip - I'll enter later", "description": "Skip token entry for now"},
    {"label": "Other", "description": "Enter token (select this, paste ghp_xxx in text field)"}
  ]
}]</parameter>
</invoke>
```

**Offer to save token**:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Save token to .claude/settings.local.json for future use?",
  "header": "Save token",
  "multiSelect": false,
  "options": [
    {"label": "Yes, save token (Recommended)", "description": "Store securely in .claude/settings.local.json (gitignored)"},
    {"label": "No, use once only", "description": "Don't save - you'll be asked again next time"}
  ]
}]</parameter>
</invoke>
```

If user selected "Yes, save token":
```bash
# Save to .claude/settings.local.json
```

### Saving Token Securely

```bash
save_token() {
  local TOKEN_NAME="$1"
  local TOKEN_VALUE="$2"
  local SETTINGS_FILE=".claude/settings.local.json"

  # Create file if doesn't exist
  if [ ! -f "$SETTINGS_FILE" ]; then
    echo '{"env":{}}' > "$SETTINGS_FILE"
    chmod 600 "$SETTINGS_FILE"  # Owner read/write only
    echo "✅ Created $SETTINGS_FILE (permissions: 600)"
  fi

  # Add or update token
  jq ".env.${TOKEN_NAME} = \"${TOKEN_VALUE}\"" "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp" && mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"

  echo "✅ Saved ${TOKEN_NAME} to $SETTINGS_FILE"
  echo "   File is gitignored and secure (chmod 600)"
}

# Usage:
save_token "GITHUB_TOKEN" "$token"
```

## Verification Types

### 1. Git Remote Verification

**What to verify**:
- Can we access the remote repository?
- Is the remote URL valid?
- Do we have push permissions?

**Ask permission first**:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Verify git remote connection? (Tests if you can access the repository)",
  "header": "Verify git",
  "multiSelect": false,
  "options": [
    {"label": "Yes, verify (Recommended)", "description": "Test connection to remote repository"},
    {"label": "No, skip", "description": "Skip verification - test manually later"}
  ]
}]</parameter>
</invoke>
```

**Verification command**:
```bash
# For HTTPS URLs with token
git ls-remote https://${GITHUB_TOKEN}@github.com/user/repo.git HEAD

# For SSH URLs (no token needed)
git ls-remote git@github.com:user/repo.git HEAD

# Check exit code
if [ $? -eq 0 ]; then
  echo "✅ Git remote verification PASSED"
  echo "   You have access to the repository"
else
  echo "❌ Git remote verification FAILED"
  echo "   Check: URL, token, permissions"
fi
```

**For private repos**:
1. Ask if repo is private
2. If yes, ask for token
3. Offer to save token
4. Use token in ls-remote command

### 2. CI/CD Workflow Verification

**What to verify**:
- Is the workflow YAML valid?
- Can we trigger a workflow run? (optional, requires token)
- Do the commands work locally?

**Step 1: Validate YAML syntax**

```bash
# For GitHub Actions
validate_github_workflow() {
  local WORKFLOW_FILE="$1"

  # Check if file exists
  if [ ! -f "$WORKFLOW_FILE" ]; then
    echo "❌ Workflow file not found: $WORKFLOW_FILE"
    return 1
  fi

  # Validate YAML syntax
  if command -v yamllint >/dev/null 2>&1; then
    yamllint "$WORKFLOW_FILE"
    if [ $? -eq 0 ]; then
      echo "✅ YAML syntax is valid"
    else
      echo "❌ YAML syntax errors found"
      return 1
    fi
  else
    # Fallback: check with Python or Node.js
    if command -v python3 >/dev/null 2>&1; then
      python3 -c "import yaml; yaml.safe_load(open('$WORKFLOW_FILE'))"
      if [ $? -eq 0 ]; then
        echo "✅ YAML syntax is valid"
      else
        echo "❌ YAML syntax errors found"
        return 1
      fi
    else
      echo "⚠️ Cannot validate YAML (yamllint or python3 not found)"
      echo "   Please check syntax manually"
    fi
  fi
}
```

**Step 2: Test commands locally**

**Ask permission**:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Test CI commands locally? (This will run: npm test, npm run lint, etc.)",
  "header": "Test local",
  "multiSelect": false,
  "options": [
    {"label": "Yes, run tests now (Recommended)", "description": "Execute CI commands locally to catch issues early"},
    {"label": "No, skip local testing", "description": "Skip local testing - assume commands work"}
  ]
}]</parameter>
</invoke>
```

**Run commands**:
```bash
test_ci_commands() {
  local COMMANDS=("$@")
  local FAILED=0

  echo "🧪 Testing CI commands locally..."

  for cmd in "${COMMANDS[@]}"; do
    echo ""
    echo "Running: $cmd"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if eval "$cmd"; then
      echo "✅ PASSED: $cmd"
    else
      echo "❌ FAILED: $cmd (exit code: $?)"
      FAILED=$((FAILED + 1))
    fi
  done

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if [ $FAILED -eq 0 ]; then
    echo "✅ All CI commands passed locally"
    return 0
  else
    echo "❌ $FAILED command(s) failed"
    echo "   Fix these issues before pushing to CI"
    return 1
  fi
}

# Usage:
test_ci_commands "npm ci" "npm test" "npm run lint" "npm run build"
```

**Step 3: Trigger CI run (optional)**

**Ask permission**:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Trigger a test CI run? (Requires GitHub token with workflow scope)",
  "header": "Trigger CI",
  "multiSelect": false,
  "options": [
    {"label": "Yes, trigger CI run", "description": "Use GitHub API to trigger workflow now"},
    {"label": "No, I'll push manually (Recommended)", "description": "Skip - CI will run when you push code"}
  ]
}]</parameter>
</invoke>
```

**Trigger via API**:
```bash
trigger_github_workflow() {
  local REPO="$1"         # user/repo
  local WORKFLOW="$2"     # ci.yml
  local TOKEN="$3"

  echo "🚀 Triggering workflow: $WORKFLOW"

  RESPONSE=$(curl -s -X POST \
    -H "Accept: application/vnd.github.v3+json" \
    -H "Authorization: token $TOKEN" \
    "https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches" \
    -d '{"ref":"main"}')

  if [ $? -eq 0 ]; then
    echo "✅ Workflow triggered successfully"
    echo "   View at: https://github.com/${REPO}/actions"
    return 0
  else
    echo "❌ Failed to trigger workflow"
    echo "   Response: $RESPONSE"
    return 1
  fi
}
```

### 3. Hooks Verification

**What to verify**:
- Does `.claude/settings.json` have valid JSON?
- Does `get-env.js` execute without errors?
- Can we test a hook command?

**Validate settings.json**:
```bash
validate_claude_settings() {
  if [ ! -f .claude/settings.json ]; then
    echo "❌ .claude/settings.json not found"
    return 1
  fi

  # Validate JSON
  if jq empty .claude/settings.json 2>/dev/null; then
    echo "✅ .claude/settings.json is valid JSON"
  else
    echo "❌ .claude/settings.json has invalid JSON"
    return 1
  fi

  # Check for hooks section
  if jq -e '.hooks' .claude/settings.json >/dev/null; then
    echo "✅ Hooks section exists"
  else
    echo "⚠️ No hooks section found"
  fi
}
```

**Test get-env.js**:
```bash
test_get_env() {
  if [ ! -f scripts/get-env.js ]; then
    echo "❌ scripts/get-env.js not found"
    return 1
  fi

  # Test basic functionality
  TEST_VALUE=$(node .agileflow/scripts/get-env.js USER_NAME "TestUser")

  if [ $? -eq 0 ]; then
    echo "✅ get-env.js works (returned: $TEST_VALUE)"
  else
    echo "❌ get-env.js failed"
    return 1
  fi
}
```

**Test hook execution** (MUST ask permission):
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Test SessionStart hook? (This will execute the hook commands)",
  "header": "Test hook",
  "multiSelect": false,
  "options": [
    {"label": "Yes, test hook (Recommended)", "description": "Execute hook commands to verify they work"},
    {"label": "No, skip", "description": "Skip hook testing"}
  ]
}]</parameter>
</invoke>
```

### 4. Archival Verification

**What to verify**:
- Does `archive-completed-stories.sh` exist and have execute permissions?
- Can it read `status.json`?
- Does it execute without errors (dry-run)?

```bash
verify_archival() {
  # Check script exists
  if [ ! -f scripts/archive-completed-stories.sh ]; then
    echo "❌ scripts/archive-completed-stories.sh not found"
    return 1
  fi

  # Check executable
  if [ ! -x scripts/archive-completed-stories.sh ]; then
    echo "⚠️ Script not executable, fixing..."
    chmod +x scripts/archive-completed-stories.sh
    echo "✅ Made script executable"
  fi

  # Check status.json exists
  if [ ! -f docs/09-agents/status.json ]; then
    echo "⚠️ docs/09-agents/status.json not found"
    echo "   Archival will work once stories are created"
    return 0
  fi

  # Dry-run (don't actually archive anything)
  echo "🧪 Testing archival script (dry-run)..."
  if bash -n scripts/archive-completed-stories.sh; then
    echo "✅ Script syntax is valid"
  else
    echo "❌ Script has syntax errors"
    return 1
  fi

  echo "✅ Archival verification passed"
}
```

## Verification Report Format

After running verification, print a clear report:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 VERIFICATION REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Configuration: CI/CD (GitHub Actions)
Workflow file: .github/workflows/ci.yml

✅ YAML syntax validation: PASSED
✅ Local command tests: PASSED (4/4)
   - npm ci
   - npm test
   - npm run lint
   - npm run build
⏭️ Remote trigger: SKIPPED (user declined)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Result: ✅ VERIFIED

Next steps:
1. Commit workflow: git add .github/workflows/ci.yml
2. Push to remote: git push origin main
3. View CI results: https://github.com/user/repo/actions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Rules for Verification

1. **ALWAYS ask permission** before running any verification
2. **ALWAYS ask permission** before requesting tokens
3. **Offer to save tokens** to `.claude/settings.local.json` (don't save without asking)
4. **Never echo tokens** to console (security risk)
5. **Validate before executing** (syntax checks, file existence)
6. **Provide clear failure messages** with troubleshooting steps
7. **Make verification optional** (users can skip if they want)
8. **Test locally first** before triggering remote CI
9. **Check for token in `.claude/settings.local.json` first** before asking
10. **Print clear reports** showing what passed/failed

## Token Scopes Required

### GitHub Personal Access Token
- **repo**: Full control of private repositories
- **workflow**: Update GitHub Action workflows
- Create at: https://github.com/settings/tokens/new

### GitLab Personal Access Token
- **api**: Access the authenticated user's API
- **read_repository**: Read repositories
- **write_repository**: Write repositories
- Create at: https://gitlab.com/-/profile/personal_access_tokens

### CircleCI API Token
- **Scope**: Full access (all scopes)
- Create at: https://app.circleci.com/settings/user/tokens

## Error Handling

### Token not found
```
⚠️ Token not found in .claude/settings.local.json

To skip verification: Choose "No, skip verification"
To provide token: Choose "Yes, I'll provide a token"

Note: Tokens are stored in .claude/settings.local.json (gitignored)
Example file structure:
{
  "env": {
    "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx"
  }
}
```

### Invalid token
```
❌ Verification failed: Invalid token

Possible issues:
- Token expired (GitHub tokens don't expire by default, but can be revoked)
- Insufficient scopes (requires: repo, workflow)
- Wrong token format (should start with ghp_ for GitHub)

Create new token at: https://github.com/settings/tokens/new
```

### Command failures
```
❌ Command failed: npm test

Exit code: 1
Output:
[test output showing failures]

Fix the failing tests, then try verification again.
```

## Integration with Configuration Agents

Each configuration agent should call verification at the end:

```markdown
## Step N: Verify Configuration (Optional)

Ask user if they want to verify:
[Use AskUserQuestion]

If yes:
1. Check for required token (if needed)
2. Ask for token if not found
3. Offer to save token
4. Run verification commands
5. Report results

If verification fails:
- Print clear error messages
- Provide troubleshooting steps
- Don't block completion (configuration still saved)
```
