#!/bin/bash
#
# AgileFlow Automated Release Script
#
# Usage: ./scripts/release.sh <version> <release-title>
# Example: ./scripts/release.sh 2.32.0 "Dynamic Content Injection System"
#
# This script automates the entire release process:
# 1. Syncs README from root to packages/cli/
# 2. Updates CHANGELOG.md with commits since last tag (auto-parsed)
# 3. Bumps version in packages/cli/package.json
# 4. Bumps version in root package.json
# 5. Commits and pushes all changes
# 6. Pushes to GitHub
# 7. Creates and pushes git tag
# 8. Creates GitHub release
# → GitHub Actions automatically publishes to npm
#

set -e  # Exit on error

VERSION=$1
TITLE=$2

# Validate arguments
if [ -z "$VERSION" ]; then
  echo "Error: Version number required"
  echo "Usage: ./scripts/release.sh <version> <release-title>"
  echo "Example: ./scripts/release.sh 2.32.0 \"Dynamic Content Injection\""
  exit 1
fi

# Validate version format (semver: X.Y.Z where X, Y, Z are numbers)
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Invalid version format '$VERSION'"
  echo "Version must be in semver format: X.Y.Z (e.g., 2.32.0)"
  exit 1
fi

if [ -z "$TITLE" ]; then
  echo "Error: Release title required"
  echo "Usage: ./scripts/release.sh <version> <release-title>"
  echo "Example: ./scripts/release.sh 2.32.0 \"Dynamic Content Injection\""
  exit 1
fi

echo "Starting release process for v$VERSION - $TITLE"
echo ""

# Step 0: Sync documentation counts
echo "Step 0: Syncing component counts across documentation..."
node scripts/sync-counts.js
echo ""

# Step 0.5: Validate documentation
echo "Step 0.5: Validating documentation..."
node scripts/validate-docs.js
if [ $? -ne 0 ]; then
  echo ""
  echo "⚠️  Documentation has staleness issues. Review above and fix before releasing."
  echo "   (Continuing anyway - these are warnings, not blockers)"
fi
echo ""

# Step 0.6: Run format and lint checks BEFORE making any changes
echo "Step 0.6: Running format and lint checks..."
cd packages/cli
if ! npm run format:check 2>/dev/null; then
  echo ""
  echo "❌ Formatting issues found. Running prettier --write to fix..."
  npm run format 2>/dev/null || npx prettier --write .
  echo "✅ Formatting fixed. Files will be included in release commit."
fi
if ! npm run lint 2>/dev/null; then
  echo ""
  echo "❌ Linting errors found. Please fix before releasing."
  exit 1
fi
cd ../..
echo "✅ Format and lint checks passed"
echo ""

# Step 0.7: Check for npm audit vulnerabilities (high severity)
echo "Step 0.7: Checking for high-severity npm vulnerabilities..."
if ! npm audit --audit-level=high 2>/dev/null; then
  echo ""
  echo "❌ High-severity vulnerabilities found!"
  echo "   Run 'npm audit fix' to resolve before releasing."
  echo "   If fixes require breaking changes, consider addressing manually."
  exit 1
fi
echo "✅ No high-severity vulnerabilities found"
echo ""

# Step 1: Sync README from root to CLI (root is source of truth)
echo "Step 1: Syncing README.md from root to packages/cli/..."
cp README.md packages/cli/README.md

# Step 2: Update CHANGELOG.md
echo "Step 2: Updating CHANGELOG.md..."
CHANGELOG_FILE="packages/cli/CHANGELOG.md"
DATE=$(date +%Y-%m-%d)

# Get the last tag
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

# Get commits since last tag, parse conventional commits
if [ -n "$LAST_TAG" ]; then
  COMMITS=$(git log ${LAST_TAG}..HEAD --pretty=format:"%s" --no-merges 2>/dev/null || echo "")
else
  COMMITS=$(git log --pretty=format:"%s" --no-merges -20 2>/dev/null || echo "")
fi

# Determine category from commits (for section header)
HAS_FEAT=false
HAS_FIX=false
HAS_CHANGE=false

while IFS= read -r commit; do
  [ -z "$commit" ] && continue
  [[ "$commit" == *"bump version"* ]] && continue
  [[ "$commit" == *"chore: bump"* ]] && continue

  if [[ "$commit" == feat:* ]] || [[ "$commit" == feat\(*\):* ]]; then
    HAS_FEAT=true
  elif [[ "$commit" == fix:* ]] || [[ "$commit" == fix\(*\):* ]]; then
    HAS_FIX=true
  elif [[ "$commit" == refactor:* ]] || [[ "$commit" == perf:* ]] || [[ "$commit" == chore:* ]] || [[ "$commit" == docs:* ]]; then
    HAS_CHANGE=true
  fi
done <<< "$COMMITS"

# Build the new changelog section using TITLE as main description
NEW_SECTION="## [${VERSION}] - ${DATE}\n\n"

# Determine the appropriate category based on commits
if [ "$HAS_FEAT" = true ]; then
  NEW_SECTION="${NEW_SECTION}### Added\n- ${TITLE}\n"
elif [ "$HAS_FIX" = true ]; then
  NEW_SECTION="${NEW_SECTION}### Fixed\n- ${TITLE}\n"
elif [ "$HAS_CHANGE" = true ]; then
  NEW_SECTION="${NEW_SECTION}### Changed\n- ${TITLE}\n"
else
  # Default to Added if no conventional commits found
  NEW_SECTION="${NEW_SECTION}### Added\n- ${TITLE}\n"
fi

# Insert new section after ## [Unreleased]
if [ -f "$CHANGELOG_FILE" ]; then
  # Create temp file with new content
  awk -v section="$NEW_SECTION" '
    /^## \[Unreleased\]/ {
      print
      print ""
      printf section
      next
    }
    { print }
  ' "$CHANGELOG_FILE" > "${CHANGELOG_FILE}.tmp"
  mv "${CHANGELOG_FILE}.tmp" "$CHANGELOG_FILE"
  echo "  Updated $CHANGELOG_FILE with v$VERSION changes"
else
  echo "  Warning: $CHANGELOG_FILE not found, skipping changelog update"
fi

# Step 3: Bump version in packages/cli/package.json (using jq for safe JSON update)
echo "Step 3: Bumping version in packages/cli/package.json..."
jq --arg v "$VERSION" '.version = $v' packages/cli/package.json > packages/cli/package.json.tmp && mv packages/cli/package.json.tmp packages/cli/package.json

# Step 4: Bump version in root package.json (using jq for safe JSON update)
echo "Step 4: Bumping version in root package.json..."
jq --arg v "$VERSION" '.version = $v' package.json > package.json.tmp && mv package.json.tmp package.json

# Step 5: Commit changes
echo ""
echo "Step 5: Committing changes..."
# Add core release files
git add README.md packages/cli/README.md packages/cli/package.json package.json packages/cli/CHANGELOG.md
# Add files potentially updated by sync-counts.js
git add docs/04-architecture/*.md 2>/dev/null || true
git add CLAUDE.md 2>/dev/null || true
git add apps/docs/content/docs/index.mdx 2>/dev/null || true
git add apps/docs/content/docs/agents/index.mdx 2>/dev/null || true
git add apps/docs/content/docs/commands/index.mdx 2>/dev/null || true
git add apps/website/lib/landing-content.ts 2>/dev/null || true
git commit -m "chore: bump version to v${VERSION}"

# Step 6: Push to GitHub
echo "Step 6: Pushing to GitHub..."
git push origin main

# Step 7: Create and push git tag
echo "Step 7: Creating and pushing git tag v${VERSION}..."
git tag -a v${VERSION} -m "Release v${VERSION} - ${TITLE}"
git push origin v${VERSION}

# Step 8: Create GitHub release with editor for notes
echo "Step 8: Creating GitHub release..."
echo ""
echo "Enter release notes (opens editor)..."
gh release create v${VERSION} \
  --title "v${VERSION} - ${TITLE}" \
  --generate-notes \
  --latest

echo ""
echo "Release complete!"
echo ""
echo "Next steps:"
echo "   1. GitHub Actions is now publishing to npm"
echo "   2. Check: https://github.com/projectquestorg/AgileFlow/actions"
echo "   3. Verify: npm view agileflow version"
echo ""
