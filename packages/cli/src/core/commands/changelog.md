---
description: Auto-generate changelog from commit history
compact_context:
  priority: high
  preserve_rules:
    - "Auto-detect version from latest git tag if VERSION not provided"
    - "Parse conventional commits (feat:→Added, fix:→Fixed, perf:→Changed, security:→Security)"
    - "Detect BREAKING CHANGES (! suffix or BREAKING CHANGE: footer)"
    - "Follow Keep a Changelog format strictly (standard markdown structure)"
    - "Include PR/issue numbers for traceability (#123)"
    - "ALWAYS show diff-first preview before updating CHANGELOG.md"
    - "Suggest semantic version bump based on changes (major/minor/patch)"
    - "Never remove old changelog entries"
  state_fields:
    - next_version
    - version_suggestion_accepted
    - changelog_updated
---

# generate-changelog

STEP 0: ACTIVATE COMPACT SUMMARY MODE
Before reading the full command, execute this script to display the compact summary:
```bash
sed -n '/<!-- COMPACT_SUMMARY_START -->/,/<!-- COMPACT_SUMMARY_END -->/p' "$(dirname "$0")/changelog.md" | grep -v "COMPACT_SUMMARY"
```
If the user confirms they want the full details, continue. Otherwise, stop here.

Automatically generate changelog from PR titles, commits, and tags.

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Purpose**: Auto-generate changelog from commit history and PR titles

**Quick Usage**:
```
/agileflow:generate-changelog VERSION=2.5.0 SINCE=v2.4.0 FORMAT=keepachangelog
```

**What It Does**:
1. Detects version from latest git tag if not provided
2. Collects commits/PRs since SINCE point
3. Categorizes changes (Added/Changed/Fixed/Removed/Security)
4. Generates changelog section in Keep a Changelog format
5. Shows diff preview and waits for YES/NO confirmation
6. Updates CHANGELOG.md if approved
7. Optionally commits the changes

**Required Inputs**:
- None (all optional with smart defaults)

**Optional Inputs**:
- `VERSION=<version>` - Version number (default: auto-detect from latest tag)
- `SINCE=<tag>` - Start point (default: last version tag)
- `FORMAT=<format>` - keepachangelog|simple|github (default: keepachangelog)
- `AUTO_COMMIT=yes|no` - Auto-commit changes (default: no)

**Output Files**:
- Updates `CHANGELOG.md` with new version section
- Optional: Git commit with changelog update

**Categorization Rules**:
- `feat:` → Added
- `fix:` → Fixed
- `perf:` → Changed (performance improvement)
- `refactor:` → Changed
- `security:` → Security
- `BREAKING CHANGE` or `!` → Changed (with warning)

**Workflow**:
1. Detect version from latest tag if not provided
2. Get commits/PRs since SINCE point
3. Parse conventional commits and categorize
4. Suggest semantic version based on changes
5. Generate changelog section preview
6. Ask: "Update CHANGELOG.md? (YES/NO)"
7. If YES: Update file and optionally commit

**Example Output**:
```markdown
## [2.5.0] - 2025-12-22

### Added
- OAuth2 authentication support (#123)
- Dark mode toggle (#137)

### Changed
- ⚠️ **BREAKING**: Redesigned API endpoints (#126)
- Improved query performance by 50% (#125)

### Fixed
- Crash when user is null (#124)
- Memory leak in WebSocket handler (#139)
```

**Tool Usage Example**:
When commits need manual categorization:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "How should this commit be categorized?",
  "header": "Categorize Commit",
  "multiSelect": false,
  "options": [
    {"label": "Added", "description": "New feature or capability (feat:)"},
    {"label": "Changed", "description": "Modification or enhancement (refactor:, perf:)"},
    {"label": "Fixed", "description": "Bug fix (fix:)"},
    {"label": "Security", "description": "Security fix (security:)"},
    {"label": "Skip", "description": "Don't include in changelog"}
  ]
}]</parameter>
</invoke>
```

<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: Changelog Generator

INPUTS
VERSION=<version>   Version number (default: auto-detect from latest tag)
SINCE=<tag>         Start point (default: last version tag)
FORMAT=<format>     keepachangelog|simple|github (default: keepachangelog)
AUTO_COMMIT=yes|no  Auto-commit changes (default: no)

ACTIONS
1) Detect version from latest tag if not provided
2) Get commits/PRs since SINCE point
3) Categorize changes (Added/Changed/Fixed/Removed)
4) Generate changelog section in specified format
5) Show diff and ask for confirmation
6) Update CHANGELOG.md if approved
7) Optionally commit the changes

CHANGELOG FORMAT

Follow [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) standard:
```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2025-10-16

### Added
- New feature X for users to do Y (#123)
- Support for Z configuration (#125)

### Changed
- Improved performance of A by 40% (#124)
- Updated B to use new API (#126)

### Deprecated
- Old method C will be removed in v2.0 (#127)

### Removed
- Unused dependency D (#128)

### Fixed
- Bug where E caused F (#129)
- Crash when G is null (#130)

### Security
- Patched XSS vulnerability in H (#131)

## [1.1.0] - 2025-09-15
[...]
```

DATA COLLECTION

### 1. Get Version Info
```bash
# Get latest tag
git describe --tags --abbrev=0

# If no VERSION provided, suggest next version based on changes:
# - Major (2.0.0): Breaking changes
# - Minor (1.X.0): New features (Added)
# - Patch (1.1.X): Bug fixes only (Fixed)
```

### 2. Get Commits Since Last Release
```bash
git log <SINCE>..HEAD --oneline --no-merges
```

### 3. Get Merged PRs (if using GitHub)
```bash
gh pr list --state merged --base main --json number,title,mergedAt,labels
```

### 4. Parse Conventional Commits
Recognize commit prefixes:
- `feat:` or `feat(scope):` → **Added**
- `fix:` or `fix(scope):` → **Fixed**
- `docs:` → (skip or **Documentation**)
- `style:` → (skip)
- `refactor:` → **Changed**
- `perf:` → **Changed** (note performance improvement)
- `test:` → (skip)
- `chore:` → (skip unless important)
- `BREAKING CHANGE:` or exclamation mark → **Changed** (breaking) + note
- `security:` → **Security**

CATEGORIZATION

### Auto-Categorize Commits
```
commit: feat(auth): add OAuth2 support (#123)
→ Added: OAuth2 authentication support (#123)

commit: fix(api): handle null user in login endpoint (#124)
→ Fixed: Crash when user is null in login endpoint (#124)

commit: perf(db): optimize user query with index (#125)
→ Changed: Improved user query performance by 50% (#125)

commit: feat(ui)!: redesign dashboard layout (#126)
→ Changed: **BREAKING** Redesigned dashboard layout (#126)
```

### Manual Review
If commit messages are unclear, suggest manual categorization:
```
Unclear commits (need categorization):
- "update stuff" (abc123)
- "fix things" (def456)

Please categorize:
1. Added / Changed / Fixed / Security? update stuff
   → [User inputs: Changed]

2. Added / Changed / Fixed / Security? fix things
   → [User inputs: Fixed]
```

BREAKING CHANGES

Detect breaking changes:
- Commit with exclamation mark after type: `feat!: new API`
- Commit with `BREAKING CHANGE:` footer
- PR label: `breaking-change`

Highlight prominently:
```markdown
### Changed
- ⚠️ **BREAKING**: Redesigned API endpoints. See migration guide. (#126)
- ...
```

VERSION SUGGESTION

Based on changes:
```
Changes detected:
- 3 Added (feat:)
- 5 Fixed (fix:)
- 1 BREAKING (feat!:)

Suggested version: 2.0.0 (MAJOR - breaking change)
Current version: 1.5.2

Accept suggested version? (YES/NO/CUSTOM)
```

CHANGELOG GENERATION

### New Changelog (if doesn't exist)
Create CHANGELOG.md with:
- Header (Keep a Changelog notice)
- `[Unreleased]` section (empty)
- `[VERSION]` section with all changes
- Footer links

### Update Existing Changelog
1. Read existing CHANGELOG.md
2. Find `## [Unreleased]` section
3. Move unreleased items to new `[VERSION]` section
4. Add new changes to `[VERSION]` section
5. Clear `[Unreleased]` section
6. Update footer links

EXAMPLE OUTPUT

```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [2.0.0] - 2025-10-16

### Added
- OAuth2 authentication support for Google and GitHub providers (#123)
- User profile settings page with avatar upload (#135)
- Dark mode toggle in user preferences (#137)

### Changed
- ⚠️ **BREAKING**: Redesigned API endpoints to RESTful structure. See [migration guide](docs/migration-v2.md). (#126)
- Improved user query performance by 50% with database indexing (#125)
- Updated UI component library from v3 to v4 (#138)

### Fixed
- Crash when user object is null in login endpoint (#124)
- Memory leak in WebSocket connection handler (#139)
- Incorrect timezone display in activity logs (#140)

### Security
- Patched XSS vulnerability in comment rendering (#131)
- Updated dependencies with known CVEs (#141)

## [1.5.2] - 2025-09-15
[Previous release...]

---

[unreleased]: https://github.com/user/repo/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/user/repo/compare/v1.5.2...v2.0.0
[1.5.2]: https://github.com/user/repo/compare/v1.5.1...v1.5.2
```

WORKFLOW

1. Detect current version and changes since last release
2. Parse commits/PRs and categorize
3. Suggest next version number
4. Generate changelog entry preview (diff-first)
5. Ask: "Update CHANGELOG.md? (YES/NO)"
6. If YES:
   - Update CHANGELOG.md
   - Optionally commit:
     ```bash
     git add CHANGELOG.md
     git commit -m "chore(release): update CHANGELOG for v${VERSION}"
     ```
7. Optionally create release:
   - Git tag: `git tag -a v${VERSION} -m "Release v${VERSION}"`
   - GitHub release: `gh release create v${VERSION} --notes-file CHANGELOG-${VERSION}.md`

INTEGRATION

### CI Automation
Suggest adding to release workflow:
```yaml
name: Release

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version number (e.g., 1.2.0)'
        required: true

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Get all tags

      - name: Generate changelog
        run: npx claude-code /agileflow:generate-changelog VERSION=${{ github.event.inputs.version }}

      - name: Commit changelog
        run: |
          git config user.name "github-actions"
          git config user.email "actions@github.com"
          git add CHANGELOG.md
          git commit -m "chore(release): update CHANGELOG for v${{ github.event.inputs.version }}"

      - name: Create tag
        run: git tag -a v${{ github.event.inputs.version }} -m "Release v${{ github.event.inputs.version }}"

      - name: Push changes
        run: |
          git push origin main
          git push origin v${{ github.event.inputs.version }}

      - name: Create GitHub release
        run: gh release create v${{ github.event.inputs.version }} --generate-notes
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Story Integration
Create story after release:
```
US-XXXX: Post-release tasks for v${VERSION}
- [ ] Announce release (blog, social media)
- [ ] Update documentation
- [ ] Monitor error tracking for new issues
```

CUSTOMIZATION

Read project-specific settings from `.agileflow/changelog-config.json`:
```json
{
  "categories": {
    "feat": "Added",
    "fix": "Fixed",
    "perf": "Changed",
    "docs": "Documentation"
  },
  "excludeLabels": ["wip", "draft"],
  "includeAuthors": true,
  "groupByScope": true
}
```

RULES
- Follow Keep a Changelog format strictly
- Include PR/issue numbers for traceability
- Highlight breaking changes prominently
- Use consistent verb tense (past tense)
- Group similar changes together
- Never remove old changelog entries
- Diff-first, YES/NO before updating
- Suggest semantic version based on changes

OUTPUT
- Version suggestion
- Changelog entry preview
- Updated CHANGELOG.md (if approved)
- Optional: Git tag and release creation
