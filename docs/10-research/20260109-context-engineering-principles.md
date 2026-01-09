# Context Engineering Principles for AI Workflows

**Import Date**: 2026-01-09
**Topic**: Context Engineering Principles for AI Workflows
**Source**: YouTube video transcript
**Content Type**: transcript

---

## Summary

This video explains the core principles behind effective AI coding workflows, emphasizing that pre-made frameworks often fail because they don't fit specific use cases. The key insight is that **context management is what these frameworks fundamentally do** - managing the limited working memory of AI models.

The presenter identifies several critical principles: **progressive disclosure** (revealing only what matters now), **structured note-taking** (externalizing context that isn't immediately needed), **attention budget management** (keeping context below 70% to avoid hallucinations), and **sub-agent isolation** (background tasks in separate context windows). The video also covers file format efficiency (YAML > Markdown > XML > JSON for token count) and the importance of reusable commands.

A major takeaway is that workflows should be built around your specific use case rather than adopted wholesale. The principles are universal, but the implementation must be project-specific.

---

## Key Findings

### 1. Progressive Disclosure is the #1 Principle
- Reveal to the LLM only what matters for the current task
- Keep model attention focused on immediate needs
- Don't fill context with "might need later" information
- Skills are "the embodiment of progressive disclosure" - descriptions provide just enough info

### 2. Context Window Composition
- Not just system prompt + user messages
- Includes: past messages, memory files, tools, MCP calls
- Anthropic models: 200K tokens
- Gemini models: 1M tokens
- "Actually are not that huge" when you factor in all components

### 3. Attention Budget (70% Rule)
- When context exceeds 70% capacity, models struggle
- Higher chance of hallucinations
- Agents stop using tools effectively
- They may "choose to ignore" tools entirely
- **Solution**: Proactive compaction before hitting 90% auto-compact

### 4. Structured Note-Taking
- External files for decisions, issues, technical debt
- Maintains critical context across compactions
- Not solely relying on compaction summaries
- Use CLAUDE.md to guide how external files are structured

### 5. Sub-Agent Isolation
- Background tasks run in isolated context windows
- Only output (not tool calls/searches) goes to main agent
- Main context stays "protected from being bloated"
- Great for research tasks

### 6. File Format Token Efficiency

| Format | Efficiency | Best For |
|--------|------------|----------|
| **YAML** | Most efficient | Database schemas, security configs, API details |
| **Markdown** | Good | Documentation, CLAUDE.md (heading navigation) |
| **XML** | Claude-optimized | Distinct sections (constraints, summaries) |
| **JSON** | Least efficient | Only small things like task states |

### 7. Git as Context Recovery
- Commit history as progress reminder
- Enables step-by-step planned execution
- Revert capability for problematic changes
- Git worktrees enable parallel sub-agent work

### 8. Reusable Commands
- Avoid repeating instructions for common procedures
- Examples: `/commit`, `/catch-up`
- Enforce structure (commit message format, pre-commit checks)
- Keep everything standardized

### 9. MCPs vs Skills
- **MCPs**: ONLY for external data (Jira, Figma, etc.)
- **Skills**: Everything else
- "A huge mistake people make is using MCPs for everything"

---

## Implementation Approach

1. **Build workflows around your specific use case** - don't adopt frameworks wholesale
2. **Apply progressive disclosure** - only load what's needed now
3. **Monitor attention budget** - compact proactively at ~70%
4. **Use external files** for context persistence across compactions
5. **Isolate research/background tasks** to sub-agents
6. **Choose file formats deliberately** based on token efficiency
7. **Create reusable commands** for repeated procedures
8. **Reserve MCPs for external data** only

---

## Code Snippets

*No code snippets in this transcript - conceptual content only.*

---

## Action Items

- [ ] Audit current workflow for progressive disclosure compliance
- [ ] Monitor context window usage and compact proactively at 70%
- [ ] Review file format choices (switch from JSON to YAML where possible)
- [ ] Create `/catch-up` command for session resumption
- [ ] Move research tasks to sub-agents to protect main context
- [ ] Ensure CLAUDE.md documents external file structure
- [ ] Audit MCP usage - move non-external-data tasks to skills

---

## Risks & Gotchas

- Pre-made frameworks often fail because they don't fit specific use cases
- Context window size is deceptive - many hidden consumers
- Over 70% context = hallucinations and tool avoidance
- JSON is token-inefficient for most use cases
- MCPs overuse pollutes context unnecessarily

---

## Story Suggestions

### Potential Practice Doc: Context Engineering Guidelines

Create `docs/02-practices/context-engineering.md` documenting:
- The 70% attention budget rule
- File format selection guidelines
- When to use sub-agents vs inline work
- Proactive compaction triggers

### Potential Story: Audit File Format Efficiency

**US-XXXX**: Audit and optimize file format token efficiency
- AC: Review all JSON config files for YAML conversion opportunities
- AC: Document file format guidelines in practices

---

## AgileFlow Alignment

This research validates many patterns AgileFlow already implements:

| Principle | AgileFlow Implementation |
|-----------|-------------------------|
| Progressive disclosure | Skills load on-demand, commands use `obtain-context.js` |
| Structured note-taking | `docs/` hierarchy, `status.json`, research folder |
| Sub-agent isolation | Task tool with background agents |
| Reusable commands | 69 slash commands in `.claude/commands/` |
| Context preservation | PreCompact hook with `COMPACT_SUMMARY` sections |

**Gaps to consider:**
- No explicit 70% context monitoring/warning
- Could optimize more JSON configs to YAML

---

## References

- Source: YouTube video transcript
- Import date: 2026-01-09
- Related: AgileFlow context preservation system
