# Changelog Format Guide

**Load this when:** generating a CHANGELOG entry, writing release notes,
or deciding what level of detail to include for a given change type.

## Keep a Changelog format

Standard format (keepachangelog.com):

```markdown
## [2.4.0] - 2026-03-15

### Added

- Webhook delivery for Slack and Discord notifications
- Retry queue with exponential backoff (up to 5 attempts)
- Delivery status dashboard showing per-channel success rates

### Changed

- Queue processing moved to background worker (was inline)
- Default retry delay increased from 30s to 60s

### Fixed

- Duplicate delivery when network timeout occurred during ACK
- Missing `Content-Type` header on webhook payloads

### Deprecated

- `deliverSync()` — use `deliver()` with `await` instead

### Removed

- Legacy `v1/webhook` endpoint (deprecated in 2.0.0)

### Security

- Webhook signatures now use HMAC-SHA256 (was MD5)
```

## Change type guide

| Type           | What belongs here             | Examples                                              |
| -------------- | ----------------------------- | ----------------------------------------------------- |
| **Added**      | New features users can use    | New endpoint, new config option, new UI page          |
| **Changed**    | Behavior that changed         | Different default, renamed field, new required param  |
| **Fixed**      | Bug fixes                     | Crash fix, wrong output corrected, data integrity fix |
| **Deprecated** | Will be removed in next major | Old API method, config key, endpoint                  |
| **Removed**    | Gone in this version          | Deprecated things now deleted                         |
| **Security**   | Vulnerability fixes           | CVE patches, auth fixes, crypto upgrades              |

**Not in changelog:** Internal refactors, test additions, CI changes, dependency bumps (unless security).

## Writing good changelog entries

**Bad:**

- "Fixed bug"
- "Updated dependencies"
- "Improved performance"
- "Various fixes"

**Good:**

- "Fixed duplicate webhook delivery when network timeout occurred during ACK"
- "Bumped express to 4.21.0 (resolves CVE-2024-29041)"
- "Reduced image resize time by 40% by switching to sharp (was jimp)"
- "Fixed login redirect loop when `returnUrl` contained encoded slashes"

**Rule:** Every entry should answer "what changed and why does it matter to me?"

## Semantic versioning alignment

| Version bump      | When             | What to include                         |
| ----------------- | ---------------- | --------------------------------------- |
| **Major** (X.0.0) | Breaking changes | All breaking changes clearly called out |
| **Minor** (x.Y.0) | New features     | Added section, plus any fixes           |
| **Patch** (x.y.Z) | Bug fixes only   | Fixed section, security if applicable   |

## Release notes vs changelog

| Format         | Audience   | Tone                      | Length          |
| -------------- | ---------- | ------------------------- | --------------- |
| Changelog      | Developers | Technical, precise        | Comprehensive   |
| Release notes  | All users  | Friendly, benefit-focused | Highlights only |
| GitHub release | Mixed      | Semi-technical            | Medium          |

### Converting changelog to release notes

Take the changelog entry and:

1. Lead with the most impactful changes
2. Translate technical details to user benefits
3. Add upgrade instructions if breaking changes exist
4. Link to migration guide if needed

```markdown
# 2.4.0 — Slack & Discord Notifications

You can now deliver to Slack and Discord directly from your workflow.
Set up a webhook URL in Settings → Integrations and start receiving
notifications in your channels.

**Other improvements:**

- Delivery reliability improved — retries now use exponential backoff
- Fixed a rare case where messages could be delivered twice

**Breaking change:** If you use `deliverSync()`, switch to `await deliver()` before upgrading.
See the [migration guide](link) for details.
```

## Automating changelog from commits

Conventional commits map to changelog sections:

```
feat:     → Added
fix:      → Fixed
BREAKING: → Changed (with ⚠️ breaking note)
perf:     → Changed
refactor: → (skip — internal)
test:     → (skip — internal)
chore:    → (skip — unless security)
docs:     → (skip — unless user-facing docs changed)
```

### Using git log to draft entries

```bash
git log v2.3.0..HEAD --oneline --no-merges | grep -E "^[a-f0-9]+ (feat|fix|perf):"
```
