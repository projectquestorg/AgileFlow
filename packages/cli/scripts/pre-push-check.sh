#!/bin/bash
# Pre-push validation script
# Run before pushing to catch CI failures locally
# Usage: npm run check        (quick: lint + tests only, ~30s)
#        npm run check:full   (full: lint + tests + docs build, ~5m)

set -e

echo "🔍 Running pre-push checks..."
echo ""

# Track start time
START_TIME=$(date +%s)

# 1. Lint check (fastest, catches most issues)
echo "📋 Step 1/2: Linting..."
cd packages/cli
npm run lint 2>&1 | tail -30 || {
    echo "❌ Lint failed! Fix errors before pushing."
    exit 1
}
cd ../..
echo "✅ Lint passed"
echo ""

# 2. Run tests (catches logic errors)
echo "🧪 Step 2/2: Running tests..."
cd packages/cli
npm test 2>&1 | tail -20 || {
    echo "❌ Tests failed! Fix errors before pushing."
    exit 1
}
cd ../..
echo "✅ Tests passed"
echo ""

# Calculate elapsed time
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Pre-push checks passed! (${ELAPSED}s)"
echo "   Safe to push."
echo ""
echo "💡 Tip: Run 'npm run check:full' to include docs build"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
