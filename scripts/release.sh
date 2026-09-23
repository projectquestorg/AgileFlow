#!/bin/bash
#
# AgileFlow v5 release script.
#
# Usage: ./scripts/release.sh <version> <release-title>
# Example: ./scripts/release.sh 5.0.0-alpha.1 "Portable skill manager MVP"
#
# 1. Preflight: on main, clean tree, tag unused, release gate green, no high
#    npm audit findings in the published package's dependencies.
# 2. Moves CHANGELOG "Unreleased" notes under the new version.
# 3. Bumps apps/cli/package.json and the root package.json together.
# 4. Syncs the npm README (apps/cli/README.md) from the root README.
# 5. Commits, tags v<version>, pushes, and creates the GitHub release.
#    .github/workflows/publish.yml publishes to npm on the tag
#    (prerelease versions go to the `next` dist-tag).
#
# Skills are NOT released here: they are versioned independently in skills/
# and served from registry/ on main (see apps/cli/PUBLISHING.md).

set -euo pipefail

VERSION=${1:-}
TITLE=${2:-}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
CLI="$ROOT/apps/cli"
CHANGELOG="$CLI/CHANGELOG.md"

usage() {
  echo "Usage: ./scripts/release.sh <version> <release-title>"
  echo "Example: ./scripts/release.sh 5.0.0-alpha.1 \"Portable skill manager MVP\""
  exit 1
}

[ -z "$VERSION" ] && usage
[ -z "$TITLE" ] && usage
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Error: '$VERSION' is not a semver version (X.Y.Z or X.Y.Z-pre.N)"
  exit 1
fi

cd "$ROOT"

echo "Preflight"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "Error: releases are cut from main (current branch: $BRANCH)."
  echo "The skill registry is served from main, so merge first."
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: working tree is not clean."
  exit 1
fi
if git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null; then
  echo "Error: tag v$VERSION already exists."
  exit 1
fi
CURRENT=$(node -p "require('$CLI/package.json').version")
if ! node -e "const s=require('$ROOT/node_modules/semver');process.exit(s.gt('$VERSION','$CURRENT')?0:1)"; then
  echo "Error: $VERSION is not greater than the current version $CURRENT."
  exit 1
fi

echo "Release gate (typecheck, tests, registry, schemas, skill lint)"
npm run release-gate

echo "npm audit of the published package, installed the way users install it"
# A workspace-level audit also reports website/test tooling; audit only what ships.
(cd "$CLI" && npm run build >/dev/null)
AUDIT_DIR=$(mktemp -d)
TARBALL=$(cd "$CLI" && npm pack --silent --pack-destination "$AUDIT_DIR")
(cd "$AUDIT_DIR" && npm init -y >/dev/null && npm install "./$TARBALL" --no-fund >/dev/null \
  && npm audit --omit=dev --audit-level=high \
  && ./node_modules/.bin/agileflow --version >/dev/null)
rm -rf "$AUDIT_DIR"

echo "Changelog"
DATE=$(date +%Y-%m-%d)
node - "$CHANGELOG" "$VERSION" "$DATE" "$TITLE" <<'NODE'
const fs = require('fs');
const [file, version, date, title] = process.argv.slice(2);
const text = fs.readFileSync(file, 'utf8');
const marker = '## [Unreleased]';
const at = text.indexOf(marker);
if (at === -1) throw new Error(`${file} has no "${marker}" section`);
const body = text.slice(at + marker.length);
const next = body.search(/\n## \[/);
const notes = (next === -1 ? body : body.slice(0, next)).trim();
const rest = next === -1 ? '' : body.slice(next);
const section = `## [${version}] - ${date}\n\n${title}.\n${notes ? `\n${notes}\n` : ''}`;
fs.writeFileSync(file, `${text.slice(0, at)}${marker}\n\n${section}${rest}`);
NODE

echo "Version bump: $CURRENT -> $VERSION"
for f in "$CLI/package.json" "$ROOT/package.json"; do
  node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('$f','utf8'));p.version='$VERSION';fs.writeFileSync('$f',JSON.stringify(p,null,2)+'\n')"
done
npm install --package-lock-only --legacy-peer-deps --no-audit --no-fund >/dev/null

echo "npm README"
sed -e 's#(ARCHITECTURE.md)#(https://github.com/projectquestorg/AgileFlow/blob/main/ARCHITECTURE.md)#' \
    -e 's#src="assets/banner.png"#src="https://raw.githubusercontent.com/projectquestorg/AgileFlow/main/assets/banner.png"#' \
    README.md > "$CLI/README.md"

echo "Commit, tag, push"
git add package.json package-lock.json "$CLI/package.json" "$CHANGELOG" "$CLI/README.md"
git commit -m "chore: release v${VERSION}"
git tag -a "v${VERSION}" -m "Release v${VERSION} - ${TITLE}"
git push origin main
git push origin "v${VERSION}"

PRERELEASE=()
if [[ "$VERSION" == *-* ]]; then PRERELEASE=(--prerelease); else PRERELEASE=(--latest); fi
gh release create "v${VERSION}" --title "v${VERSION} - ${TITLE}" --generate-notes "${PRERELEASE[@]}"

echo ""
echo "Released v${VERSION}. publish.yml is publishing to npm:"
echo "  https://github.com/projectquestorg/AgileFlow/actions"
echo "  npm view agileflow@${VERSION} version"
