---
description: Manage dependencies with updates and security audits
compact_context:
  priority: high
  preserve_rules:
    - "Auto-detect package manager (npm, pip, cargo, etc.) from manifest files"
    - "MUST use TodoWrite to track 8-step workflow (inputs, detect, analyze, generate, preview, confirm, apply, save)"
    - "ALWAYS show diff-first before applying updates (YES/NO confirmation)"
    - "Prioritize security updates - run ACTION=audit first if vulnerabilities suspected"
    - "For major updates: Create stories, don't auto-update (may require code changes)"
    - "NEVER auto-update without approval (AUTO_PR default is no)"
    - "Update/create reports in docs/08-project/ (dependencies-dashboard.md, dependency-report-*.md)"
    - "If critical CVEs found, create story: 'US-XXXX: Fix security vulnerabilities in dependencies'"
  state_fields:
    - package_manager_detected
    - vulnerabilities_found
    - updates_applied
    - report_saved
---

# packages

Manage project package dependencies (npm, pip, cargo, etc.) with dashboard, updates, and security audits.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js packages
```

---

## Context Loading (Documentation)

**PURPOSE**: Immediately load full context before executing any logic.

**ACTIONS**:
1. Read this command file (`.agileflow/commands/packages.md`) in its entirety
2. Absorb all instructions, rules, and examples
3. Proceed to execution phase with complete context

**WHY**: Prevents incomplete instruction loading and ensures consistent behavior.

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary
- **Command**: /agileflow:packages
- **Purpose**: Manage dependencies with dashboards, updates, and security audits
- **Arguments**:
  - ACTION=dashboard|update|audit (default: dashboard)
  - SCOPE=all|security|major|minor|patch (for update, default: all)
  - OUTPUT=markdown|html|json|csv (for dashboard, default: markdown)
  - INCLUDE_DEV=yes|no (default: yes)
  - SAVE_TO=<path> (default: docs/08-project/dependencies-dashboard.md)
  - AUTO_PR=yes|no (for update, default: no)
- **Actions**:
  1. Detect package manager (npm, pip, cargo, etc.)
  2. Run analysis based on ACTION
  3. Generate report with findings
  4. For update: show plan and wait for YES/NO approval
  5. Apply updates if approved
  6. Save reports to docs/08-project/
  7. Create stories for security issues if needed
- **TodoList**: Required for tracking 7-step workflow
- **Output**: Dashboard report, update report, or audit report
- **Safety**: Never auto-update without approval, preview all commands
- **Related**: Security audits, CI integration, Dependabot config

**Tools Used**:
- TodoWrite: Track 8-step dependency management workflow

**TodoWrite Example**:
```xml
<invoke name="TodoWrite">
<parameter name="content">
1. Parse inputs (ACTION, SCOPE, OUTPUT, INCLUDE_DEV, SAVE_TO, AUTO_PR)
2. Detect package manager(s) (npm, pip, cargo, etc.)
3. Run analysis based on ACTION (dashboard/update/audit)
4. Generate report with findings
5. For ACTION=update: Show update plan and wait for YES/NO
6. Apply updates (if approved)
7. Save reports to docs/08-project/
8. Create stories for security issues (if needed)
</parameter>
<parameter name="status">in-progress</parameter>
</invoke>
```

<!-- COMPACT_SUMMARY_END -->

---

## Prompt

ROLE: Package Dependency Manager

TODO LIST TRACKING
**CRITICAL**: Immediately create a todo list using TodoWrite tool to track package management:
```
1. Parse inputs (ACTION, SCOPE, OUTPUT, INCLUDE_DEV, SAVE_TO, AUTO_PR)
2. Detect package manager(s) (npm, pip, cargo, etc.)
3. Run analysis based on ACTION (dashboard/update/audit)
4. Generate report with findings
5. For ACTION=update: Show update plan and wait for YES/NO
6. Apply updates (if approved)
7. Save reports to docs/08-project/
8. Create stories for security issues (if needed)
```

Mark each step complete as you finish it. This ensures comprehensive dependency management.

INPUTS (optional)
- ACTION=dashboard|update|audit (default: dashboard)
- SCOPE=all|security|major|minor|patch (for ACTION=update, default: all)
- OUTPUT=markdown|html|json|csv (for ACTION=dashboard, default: markdown)
- INCLUDE_DEV=yes|no (default: yes)
- SAVE_TO=<path> (default: docs/08-project/dependencies-dashboard.md)
- AUTO_PR=yes|no (for ACTION=update, default: no, ask first)

---

## ACTION=dashboard (default)
Generate comprehensive dashboard of all project dependencies.

### Detection
Scan for dependency manifests:
- **Node.js**: package.json, package-lock.json
- **Python**: requirements.txt, Pipfile, pyproject.toml
- **Ruby**: Gemfile, Gemfile.lock
- **Go**: go.mod, go.sum
- **Rust**: Cargo.toml, Cargo.lock
- **Java**: pom.xml, build.gradle
- **.NET**: *.csproj, packages.config
- **PHP**: composer.json

### Analysis
For each dependency, collect:
1. **Name**: Package name
2. **Current Version**: Installed version
3. **Latest Version**: Most recent available
4. **Type**: Production / Development / Peer
5. **Status**: Up-to-date / Minor update / Major update / Deprecated
6. **Vulnerabilities**: Known CVEs
7. **License**: Software license
8. **Last Updated**: When dependency was last updated upstream
9. **Dependents**: How many project files import it

### Data Sources
- `npm outdated`, `pip list --outdated`, etc.
- `npm audit`, `pip-audit`, etc.
- Registry APIs (npmjs.com, pypi.org, crates.io, etc.)
- License scanners
- Import/usage analysis (grep)

### Dashboard Format (Markdown)

```markdown
# Dependencies Dashboard

**Project**: <name>
**Generated**: 2025-10-25 10:00:00 UTC
**Total Dependencies**: 145 (prod: 98, dev: 47)

---

## Summary

| Category | Count | Action Needed |
|----------|-------|---------------|
| 🔴 Critical Vulnerabilities | 2 | Update immediately |
| 🟠 Major Updates | 12 | Review breaking changes |
| 🟡 Minor Updates | 28 | Safe to update |
| 🟢 Up-to-date | 85 | No action |
| ⚪ Deprecated | 3 | Find alternatives |

---

## Critical Vulnerabilities 🔴

### express@4.16.0
**Current**: 4.16.0 → **Latest**: 4.18.2 (+2 major)
**Severity**: HIGH (CVSS 7.5)
**CVE**: CVE-2022-24999
**Description**: ReDoS vulnerability in Express.js routing
**Fix**: `npm install express@4.18.2`
**Affected**: 3 files import this
**License**: MIT

---

[Additional sections: Deprecated Packages, Major Updates, Minor/Patch Updates, License Compliance, Size Analysis, etc.]

---

## Maintenance Score: 78/100

**Breakdown**:
- Security: 60/100 (2 critical vulnerabilities)
- Freshness: 80/100 (most deps recent)
- License compliance: 95/100 (2 GPL warnings)
- Bundle size: 75/100 (some optimization possible)

**Recommendation**: Address security issues immediately, then plan regular maintenance.
```

### Visualization (HTML Output)
If OUTPUT=html, generate interactive dashboard with:
- Color-coded status badges
- Sortable/filterable tables
- Dependency graph visualization (D3.js or Mermaid)
- Click to expand details
- Quick action buttons ("Update", "Learn more")

### JSON Output
If OUTPUT=json, provide structured data for tooling:
```json
{
  "generated": "2025-10-25T10:00:00Z",
  "project": "my-app",
  "summary": {
    "total": 145,
    "production": 98,
    "development": 47,
    "critical": 2,
    "major_updates": 12,
    "minor_updates": 28,
    "up_to_date": 85,
    "deprecated": 3
  },
  "vulnerabilities": [...],
  "outdated": [...],
  "deprecated": [...],
  "licenses": {...}
}
```

---

## ACTION=update
Automatically update project dependencies with security audit.

### Detection & Analysis
1. Detect package manager(s):
   - Node.js: package.json, package-lock.json, yarn.lock, pnpm-lock.yaml
   - Python: requirements.txt, Pipfile, pyproject.toml, poetry.lock
   - Ruby: Gemfile, Gemfile.lock
   - Go: go.mod, go.sum
   - Rust: Cargo.toml, Cargo.lock
   - Java: pom.xml, build.gradle
   - .NET: *.csproj, packages.config

2. Run appropriate outdated check:
   - npm outdated --json
   - pip list --outdated --format=json
   - bundle outdated --parseable
   - go list -u -m all
   - cargo outdated --format json
   - mvn versions:display-dependency-updates

3. Security audit:
   - npm audit --json
   - pip-audit --format json
   - bundle audit
   - cargo audit --json
   - snyk test (if available)

### Categorization
Group updates by SCOPE:
- **security**: Security vulnerabilities (CVE)
- **major**: Breaking changes (1.x → 2.x)
- **minor**: New features (1.2.x → 1.3.x)
- **patch**: Bug fixes (1.2.3 → 1.2.4)
- **all**: All of the above

### Output Report
```markdown
# Dependency Update Report

**Generated**: <ISO timestamp>
**Project**: <name from manifest>
**Package Manager**: <detected>
**Scope**: <SCOPE parameter>

## Critical Security Updates
| Package | Current | Latest | Severity | CVE |
|---------|---------|--------|----------|-----|
| express | 4.16.0 | 4.18.2 | High | CVE-2022-24999 |

## Major Updates (Breaking Changes)
| Package | Current | Latest | Changelog |
|---------|---------|--------|-----------|
| react | 17.0.2 | 18.2.0 | [link] |

## Minor Updates (New Features)
| Package | Current | Latest | Changelog |
|---------|---------|--------|-----------|
| lodash | 4.17.19 | 4.17.21 | [link] |

## Patch Updates (Bug Fixes)
| Package | Current | Latest |
|---------|---------|--------|
| uuid | 8.3.0 | 8.3.2 |
```

### Actions (after user review)
1. For SCOPE=security or critical vulnerabilities:
   - Preview update command (e.g., npm update <package>)
   - Ask: "Apply security updates? (YES/NO)"

2. For major updates:
   - Suggest creating individual stories per major update (may require code changes)
   - Format: "US-XXXX: Upgrade <package> from <old> to <new>"

3. For minor/patch:
   - Offer bulk update: "Apply all minor/patch updates? (YES/NO)"

4. If AUTO_PR=yes and approved:
   - Create feature branch: deps/<date>-<scope>
   - Run update commands
   - Run tests (if available)
   - Commit with message: "chore(deps): update dependencies (<scope>)"
   - Push and create PR using /agileflow:pr-template

### Integration
- Save report to docs/08-project/dependency-report-<YYYYMMDD>.md
- If vulnerabilities found, create story: "US-XXXX: Fix security vulnerabilities in dependencies"
- Update docs/09-agents/bus/log.jsonl with "dependency-check" event

### Schedule Suggestion
Recommend adding to CI:
```yaml
- cron: '0 0 * * 1'  # Weekly on Monday
```

---

## ACTION=audit
Run security audit only (no updates).

### Process
1. Detect package manager
2. Run security audit:
   - `npm audit --json`
   - `pip-audit --format json`
   - `bundle audit`
   - `cargo audit --json`
   - `snyk test` (if available)

3. Report findings with severity levels
4. Suggest fixes (but don't apply)
5. Optional: Create story for security fixes

### Output
```markdown
# Security Audit Report

**Generated**: 2025-10-25 10:00:00 UTC
**Package Manager**: npm

## Critical (2)
- express@4.16.0: CVE-2022-24999 (CVSS 7.5)
- lodash@4.17.19: CVE-2021-23337 (CVSS 7.4)

## High (0)
None

## Moderate (3)
[...]

**Recommendation**: Run /agileflow:packages ACTION=update SCOPE=security
```

---

## Usage Examples

```bash
# Show dependency dashboard (default)
/agileflow:packages
/agileflow:packages ACTION=dashboard

# Export dashboard as HTML
/agileflow:packages ACTION=dashboard OUTPUT=html

# Export as JSON for tooling
/agileflow:packages ACTION=dashboard OUTPUT=json > deps.json

# Security audit only
/agileflow:packages ACTION=audit

# Update security vulnerabilities
/agileflow:packages ACTION=update SCOPE=security

# Update all minor and patch versions
/agileflow:packages ACTION=update SCOPE=minor

# Update all with auto-PR
/agileflow:packages ACTION=update SCOPE=all AUTO_PR=yes

# Update only production dependencies
/agileflow:packages ACTION=update INCLUDE_DEV=no
```

---

## CI Integration

Suggest adding automated checks:
```yaml
- name: Dependency audit
  run: npm audit --audit-level=high

- name: Check outdated
  run: npm outdated || true  # Don't fail, just warn

- name: Generate dashboard
  run: npx claude-code /agileflow:packages ACTION=dashboard
```

Suggest Dependabot config (.github/dependabot.yml):
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

---

## Rules
- Prioritize security updates
- Group minor/patch updates when safe
- Warn about breaking changes (major updates)
- Never auto-update without approval
- Highlight deprecated packages prominently
- Consider bundle size impact
- Check license compatibility
- Never force-update without running tests
- Preview all commands before execution (require YES/NO)
- Link to changelogs and migration guides

---

## Output

Depending on ACTION:
- **dashboard**: Dependency dashboard (markdown/html/json/csv)
- **update**: Update report + optional PR with updates (if approved)
- **audit**: Security audit report with severity levels
