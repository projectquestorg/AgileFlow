# Context Engineering for Rapid Prototyping (RPI)

**Import Date**: 2026-01-13
**Topic**: Context Engineering for Coding Agents (Rapid Prototyping)
**Source**: YouTube video transcript - Claude Code Changelog Tracker tutorial
**Content Type**: transcript

---

## Summary

This tutorial demonstrates a practical approach to building AI-powered apps with Claude Code using **context engineering for rapid prototyping**. The creator built a Claude Code Changelog Tracker app that fetches Anthropic's changelog from GitHub, analyzes changes with Gemini AI, provides text-to-speech summaries, and sends email notifications.

The key insight is the **"Prompt Playbook" pattern**: using research AI (Perplexity) to generate comprehensive specification markdown files BEFORE starting Claude Code. These spec files become the primary context that guides Claude Code's implementation. Instead of iterative prompting, you front-load the thinking into well-structured markdown artifacts.

The tutorial also introduces the **documentation feeding pattern**: taking official API documentation (viewed as markdown from developer portals), saving it as `.md` files, and using `@filename` to inject this context into Claude Code. This solves the problem of Claude's training cutoff not including the latest API versions (e.g., Gemini 3 Flash).

---

## Key Findings

### The Problem: Information Overload
- Claude Code ships updates frequently (changelog is dense)
- Hard to differentiate "nice to know" from "fundamental changes"
- Even experts like Andre Karpathy feel behind tracking AI tool updates
- Subscribing to GitHub repos creates noise without insight

### The Solution: Changelog Tracker App
A React app with SQLite that:
- Fetches raw changelog from GitHub
- Parses and categorizes (features vs fixes)
- Analyzes with Gemini 3 Flash
- Provides TLDR "What Matters" view
- Generates audio summaries (text-to-speech)
- Sends email notifications via cron job
- Allows multi-version chat queries

### Architecture (Simple but Powerful)
| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | React | UI, changelog view, chat, settings |
| Database | SQLite (local) | Free, no cloud costs, persists TLDRs |
| AI Inference | Gemini 3 Flash | Fast, cheap, smart enough |
| Text-to-Speech | Gemini Audio API | Voice summaries (customizable voice) |
| Email | Resend | Simple API, generous free tier |
| Scheduler | Cron job | Daily/weekly checks |

### The Prompt Playbook Pattern
1. **Use research AI first (Perplexity)**
   - Describe your idea with links to relevant resources
   - Let it generate a comprehensive `app-spec.markdown` file
   - This becomes your primary context artifact

2. **Feed official documentation as markdown**
   - Find developer docs, click "View as Markdown"
   - Save as `.md` file (e.g., `gemini-3-api.md`)
   - Prevents Claude from using outdated API patterns

3. **Use `/init` + `@file` tagging**
   - Let Claude read spec files and create `CLAUDE.md`
   - Tag files with `@filename` instead of re-prompting

4. **Iterate with specific prompts**
   - "Allow me to monitor multiple changelog sources"
   - "Make this look more like Anthropic's design" + screenshot
   - "Cache AI analysis in SQLite by version hash"

### Prompting Principles (Lazy vs Refined)

**Lazy prompt (still works):**
> Build me a changelog tracking app that fetches Claude Code's changelog, analyzes it with Gemini, generates audio, and sends email notifications. @claude-changelog-spec

**Refined prompt (better):**
> Use Gemini 3 Flash for analysis with JSON mode. Cache AI analysis in my SQLite database by version hash. Check cache before each API call.

### Key Insight: Specificity Matters
- "Use Google's AI" → Claude uses Gemini 2.0 (outdated)
- "Use Gemini 3 Flash" → Still might use old version
- "Use Gemini 3 Flash + @gemini-3-docs.md" → Uses correct API

### Development Process
1. Built 2-3 times (iterated on efficiency)
2. Total time: ~6 hours even with rewrites
3. Started with 3 core files:
   - `changelog-app.md` (spec from Perplexity)
   - `gemini-3-api.md` (official docs)
   - `audio-api.md` (TTS documentation)

### Features Worth Noting
- **Version selection**: Chat with one or multiple changelog versions
- **Caching**: Audio generated once, cached in browser
- **Dark mode**: Settings persist
- **TLDR persistence**: SQLite keeps old summaries (traceability)
- **Action items**: Accountability list ("run terminal setup for X languages")

### What Didn't Work
- Sentiment analysis tag (positive/negative) - useless since updates are always "positive"
- Initial simple UI - needed Anthropic-style design pass
- Default favicon - too cookie-cutter

---

## Implementation Approach

1. **Research phase with Perplexity**
   - Describe the app idea
   - Provide links to APIs you want to use
   - Get a comprehensive spec.md file

2. **Documentation gathering**
   - Find latest API docs
   - Export as markdown
   - Include all relevant APIs (inference, TTS, etc.)

3. **Initialize with Claude Code**
   - `/init` with spec file
   - Let Claude create CLAUDE.md
   - Review the generated project structure

4. **Iterative refinement**
   - Add features incrementally
   - Use `@file` tagging for context
   - Screenshot UI for design prompts

5. **Handle edge cases**
   - Caching strategy
   - Error handling
   - Persistence (SQLite)

---

## Code Snippets

*No direct code snippets in transcript - conceptual/workflow-focused*

### Prompt Examples (Preserve exactly as provided)

**Initial spec request to Perplexity:**
```
I have an idea to ask Claude Code to build an app for the Anthropic changelog so I can keep track of all the newest features. [link to changelog] I want to be able to use Gemini speech generation.
```

**Claude Code prompts used:**
```
Build me a changelog tracking app that fetches Claude Code's changelog, analyzes it with Gemini, generates audio, and sends email notifications. @claude-changelog-spec.md
```

```
Allow me to monitor multiple changelog sources, not just Claude Code.
```

```
Make this look more like Anthropic's design. [+ screenshot]
```

```
Cache AI analysis in my SQLite database by version hash. Check cache before each API call.
```

---

## Action Items

- [ ] Save Perplexity spec outputs as versioned artifacts (e.g., `specs/app-v1.md`)
- [ ] Create API documentation files for frequently used services
- [ ] Build a template spec structure for common app types
- [ ] Implement caching patterns for AI-generated content
- [ ] Set up Resend for email notifications from AI apps
- [ ] Document "View as Markdown" sources for common APIs

---

## Risks & Gotchas

- **API version mismatch**: Claude's training cutoff means it won't know Gemini 3 Flash unless you provide docs
- **Rebuilding is normal**: Expect 2-3 iterations to get efficiency right
- **Irrelevant features**: AI might suggest features that don't add value (like sentiment analysis)
- **UI requires direction**: "Make it pretty" < "Use these hex codes, this layout"
- **Free tier limits**: Resend and Gemini have generous limits for personal use

---

## Story Suggestions

### Potential Practice Doc: Prompt Playbook Pattern

**Topics:**
- How to use research AI (Perplexity) to generate specs
- Documentation feeding pattern for new APIs
- `@file` tagging conventions
- Iteration patterns for UI refinement

### Potential Tool: API Doc Fetcher
A script that auto-fetches "view as markdown" from common API portals

---

## References

- Source: YouTube tutorial transcript
- Import date: 2026-01-13
- Related:
  - [Context Engineering Principles](./20260109-context-engineering-principles.md)
  - [Context Engineering for Coding Agents (Dex RPI)](./20260113-context-engineering-coding-agents.md)
  - Resend: https://resend.com
  - Anthropic Changelog: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
