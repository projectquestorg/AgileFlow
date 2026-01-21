# Documentation Auto-Translation System

## Overview

Automated translation pipeline that keeps documentation synchronized across 5 languages (Spanish, French, German, Portuguese, Arabic) when English source files are modified.

## Architecture

```mermaid
flowchart TB
    subgraph Trigger["Trigger Events"]
        Push[Push to main]
        Manual[Manual dispatch]
    end

    subgraph Detection["Change Detection"]
        Diff[git diff HEAD~1]
        Filter[Filter English only]
        Skip[Skip *.lang.mdx files]
    end

    subgraph Translation["Translation Loop"]
        ES[Spanish es]
        FR[French fr]
        DE[German de]
        PT[Portuguese pt]
        AR[Arabic ar]
    end

    subgraph Output["Output"]
        Files[*.lang.mdx files]
        Commit[Auto-commit]
        PushOut[Push to main]
    end

    Push --> Diff
    Manual --> |files=all| Translation
    Diff --> Filter
    Filter --> Skip
    Skip --> Translation

    Translation --> ES --> FR --> DE --> PT --> AR
    AR --> Files
    Files --> Commit
    Commit --> |[skip-translate]| PushOut
```

## Key Files

| File | Purpose |
|------|---------|
| `.github/workflows/translate-docs.yml` | GitHub Actions workflow |
| `apps/docs/scripts/translate-docs.ts` | Translation script using Lingva API |
| `apps/docs/content/docs/*.mdx` | English source files |
| `apps/docs/content/docs/*.{lang}.mdx` | Translated output files |

## How It Works

### 1. Trigger Detection

The workflow triggers on:
- **Push to main**: Any `.mdx` file change in `apps/docs/content/docs/`
- **Manual dispatch**: Can specify language or "all"

### 2. Change Detection

```bash
# Get only English files that changed (exclude translations)
git diff --name-only HEAD~1 HEAD -- 'apps/docs/content/docs/*.mdx' \
  | grep -v '\.\(es\|fr\|de\|pt\|ar\)\.mdx$'
```

### 3. Translation Process

For each changed English file:
1. Parse MDX frontmatter and content
2. Translate title and description in frontmatter
3. Translate markdown content (preserving code blocks, JSX components)
4. Write to `{filename}.{lang}.mdx`

### 4. Languages Supported

| Code | Language | Orama Search |
|------|----------|--------------|
| `es` | Spanish | Supported |
| `fr` | French | Supported |
| `de` | German | Supported |
| `pt` | Portuguese | Supported |
| `ar` | Arabic (RTL) | Supported |

These languages were chosen because they're supported by Orama search integration.

### 5. Infinite Loop Prevention

The commit message includes `[skip-translate]` which triggers the workflow skip condition:

```yaml
if: "!contains(github.event.head_commit.message, '[skip-translate]')"
```

## File Naming Convention

Uses Fumadocs i18n filename suffix format:

```
index.mdx        # English (source)
index.es.mdx     # Spanish
index.fr.mdx     # French
index.de.mdx     # German
index.pt.mdx     # Portuguese
index.ar.mdx     # Arabic
```

## Translation Script Details

Location: `apps/docs/scripts/translate-docs.ts`

### Features
- Uses free Lingva API for translation
- Preserves MDX components (JSX tags)
- Preserves code blocks and inline code
- Handles frontmatter separately
- Rate limiting (2s delay between languages)
- Supports specific file arguments for incremental translation

### Usage

```bash
# Translate all files to Spanish
npx tsx scripts/translate-docs.ts es

# Translate specific file to French
npx tsx scripts/translate-docs.ts fr content/docs/index.mdx

# Full path also works
npx tsx scripts/translate-docs.ts de apps/docs/content/docs/getting-started.mdx
```

## Performance

| Scenario | Time |
|----------|------|
| Single file × 5 languages | ~2-3 minutes |
| Full docs (~117 files) × 5 languages | ~30+ minutes |

## Workflow Configuration

```yaml
permissions:
  contents: write  # Required for pushing commits

steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 2  # Need previous commit for diff
      token: ${{ secrets.GITHUB_TOKEN }}
```

## Troubleshooting

### Workflow not triggering
- Check path patterns match: `apps/docs/content/docs/*.mdx`
- Ensure commit doesn't contain `[skip-translate]`

### Permission denied on push
- Verify `permissions: contents: write` is set
- Check `token: ${{ secrets.GITHUB_TOKEN }}` in checkout

### Translation errors
- Lingva API may rate limit - script has 2s delays
- Check workflow logs for specific errors
- Errors are warnings, workflow continues

## Related Documentation

- [Fumadocs i18n](https://fumadocs.vercel.app/docs/ui/internationalization)
- [Orama Search Languages](https://docs.orama.com/open-source/supported-languages)
