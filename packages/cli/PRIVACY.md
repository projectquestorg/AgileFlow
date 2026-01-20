# Privacy Policy

**Last Updated:** January 2026

AgileFlow is an open-source CLI tool that helps developers manage agile workflows. This privacy policy explains what data AgileFlow collects, how it's used, and your rights.

## Summary

- **AgileFlow does not collect or transmit any personal data by default**
- All data stays on your local machine
- No telemetry, no analytics, no tracking
- You can opt-in to anonymous usage statistics if you choose

## Data Collection

### Local Data Storage

AgileFlow stores configuration and project data locally in your project directory:

| Data Type | Location | Purpose |
|-----------|----------|---------|
| Configuration | `.agileflow/config/` | User preferences and settings |
| Session data | `docs/09-agents/` | Project management state |
| Story tracking | `docs/09-agents/status.json` | Workflow management |
| Consent record | `.agileflow/config/consent.json` | Privacy consent timestamp |

### No Data Transmission

AgileFlow **does not**:
- Send any data to external servers
- Include telemetry or analytics
- Track your usage patterns
- Access your source code for any purpose other than local analysis
- Store any credentials or tokens

### Optional Features That May Process Data

Some optional features interact with external services:

1. **GitHub Integration** (via `gh` command): When you use commands that interact with GitHub (e.g., creating PRs), those operations are performed by the `gh` CLI, not AgileFlow. Refer to [GitHub's privacy policy](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement).

2. **npm Registry**: When installing AgileFlow via npm, standard npm telemetry may apply. Refer to [npm's privacy policy](https://docs.npmjs.com/policies/privacy).

3. **Claude Code Integration**: If you use AgileFlow with Claude Code, refer to [Anthropic's privacy policy](https://www.anthropic.com/privacy).

## Data Retention

See [DATA-RETENTION.md](./DATA-RETENTION.md) for detailed retention policies.

### Summary

- **Local files**: Retained indefinitely until you delete them
- **Archived stories**: Auto-archived after 7 days (configurable)
- **Session logs**: Cleared on session end
- **Consent record**: Retained indefinitely (for compliance)

## Your Rights

Under GDPR and similar privacy regulations, you have the right to:

### 1. Access Your Data
All AgileFlow data is stored locally in your project directory. You can access it at any time by viewing:
- `.agileflow/` directory
- `docs/09-agents/` directory

### 2. Delete Your Data
To completely remove all AgileFlow data from a project:

```bash
# Remove AgileFlow installation
rm -rf .agileflow/
rm -rf .claude/commands/agileflow/

# Remove AgileFlow-managed documentation (optional)
rm -rf docs/
```

### 3. Export Your Data
All data is stored in human-readable formats (JSON, Markdown). Simply copy the files.

### 4. Opt Out
AgileFlow has no data collection to opt out of. All features work offline.

## Consent

### First-Time Setup

During `npx agileflow setup`, you will be asked to acknowledge this privacy policy. Your consent is recorded locally with a timestamp.

### CI/CD Environments

For automated environments where interactive consent is not possible:

```bash
npx agileflow setup --accept-privacy
```

This flag indicates you have read and accept this privacy policy.

### Revoking Consent

To revoke consent:

```bash
rm .agileflow/config/consent.json
```

Note: Revoking consent does not affect AgileFlow functionality since no data collection occurs.

## Children's Privacy

AgileFlow is a developer tool not intended for use by individuals under 16 years of age.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be documented in the CHANGELOG.md with clear descriptions of what changed.

## Contact

For privacy-related questions or concerns:
- Open an issue: https://github.com/projectquestorg/AgileFlow/issues
- Email: privacy@projectquest.org

## Legal Basis (GDPR)

AgileFlow's data processing is based on:
- **Legitimate Interest**: Local storage of configuration and workflow data is necessary for the tool to function
- **Consent**: You actively choose to install and use AgileFlow

Since AgileFlow does not collect or transmit personal data, most GDPR requirements (like data processing agreements) do not apply.

## Third-Party Services

AgileFlow does not integrate with third-party services directly. However, if you use AgileFlow alongside:

| Service | Privacy Policy |
|---------|----------------|
| GitHub | https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement |
| Anthropic/Claude | https://www.anthropic.com/privacy |
| npm | https://docs.npmjs.com/policies/privacy |

These services have their own privacy policies that apply to your use of their platforms.
