# Changelog Workflow — Auto-Generate Changelog

**Triggers:** "generate changelog", "update CHANGELOG.md", "what changed since last release", "changelog for v2.5.0", "write release notes"

**Goal:** Parse git commits since the last tag, categorize changes by type, suggest a semantic version bump, generate a Keep a Changelog section, and update `CHANGELOG.md` after user confirmation.

## Inputs needed

| Input   | Required | How to get it                                   |
| ------- | -------- | ----------------------------------------------- |
| version | No       | Auto-detect from latest git tag if not provided |
| since   | No       | Auto-detect last version tag if not provided    |
| format  | No       | Default: Keep a Changelog                       |

## Steps

1. If the version is not provided, run `git describe --tags --abbrev=0` to find the latest tag. Use the next version as the target.

2. Get all commits since the last tag: `git log <last-tag>..HEAD --oneline`.

3. Parse conventional commits and categorize:
   - `feat:` → **Added**
   - `fix:` → **Fixed**
   - `perf:` → **Changed** (performance improvement)
   - `refactor:` → **Changed**
   - `security:` → **Security**
   - `!` suffix or `BREAKING CHANGE:` footer → **Changed** with a breaking change warning

4. Suggest a semantic version bump based on what's present:
   - BREAKING CHANGE → major bump
   - `feat:` present → minor bump
   - Only `fix:` / `chore:` → patch bump

5. Generate the changelog section in Keep a Changelog format:

   ```markdown
   ## [X.Y.Z] - YYYY-MM-DD

   ### Added

   - feat: description (#PR)

   ### Fixed

   - fix: description (#PR)

   ### Changed

   - perf/refactor entries
   ```

6. Show the preview to the user. Ask: [A] Update `CHANGELOG.md` with this (recommended), [B] Adjust the version number, [C] Remove a specific entry, [D] Cancel.

7. If confirmed, prepend the new section to `CHANGELOG.md`. Never remove existing entries.

8. Ask: "Commit the changelog update?" Options: [A] Yes — `git add CHANGELOG.md && git commit -m "chore: update changelog for vX.Y.Z"`, [B] No, I'll commit it myself.

## Output

Updated `CHANGELOG.md` with the new version section at the top. Optional git commit. The version suggestion helps align with semantic versioning conventions.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Save and continue
2. Review before saving
3. Discard
```
