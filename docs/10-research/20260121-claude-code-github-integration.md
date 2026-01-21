# Claude Code GitHub Integration

**Import Date**: 2026-01-21
**Topic**: Claude Code GitHub Integration
**Source**: YouTube video transcript (direct import)
**Content Type**: transcript

---

## Summary

This video describes a practical workflow for building web applications using Claude Code integrated with GitHub. The presenter shares their experience building a new app over several weeks, emphasizing how established software development practices (plan-create-test-deploy) work exceptionally well with AI coding assistants.

The workflow is based on GitHub Flow, a lightweight branching workflow published by GitHub co-founder Scott Chacon about 13-14 years ago. The key insight is that the software development lifecycle phases remain critical even with powerful AI coding agents - writing code is just one phase of shipping and maintaining complex software.

The presenter, a former Twilio engineering manager, notes a shift in their role: instead of writing code, they now spend most time writing detailed specs, reviewing AI-generated code, and managing the overall process - essentially acting as an engineering manager for the AI assistant.

---

## Key Findings

### The Four-Phase Cycle
- **Plan**: Use GitHub issues with detailed specs; break down into atomic tasks using scratchpads
- **Create**: Claude Code writes the code following the plan
- **Test**: Run test suite + use Puppeteer MCP server for UI testing
- **Deploy**: Merge PR to main branch (triggers auto-deploy to Render)

### Critical Success Factors
- **Issue granularity matters**: More atomic, specific issues = better results
- **Tests are essential**: Provides confidence Claude won't break existing functionality
- **CI/CD is foundational**: GitHub Actions for automated testing on every commit
- **MVC architecture helps**: Modularized codebases (Rails, Django) work better with AI agents than monolithic files

### Slash Commands Setup
- Create custom slash commands in `.claude/commands/` directory
- Issue processing command has four sections: plan, create, test, deploy
- PR review command - author suggests running in fresh shell to avoid "context pollution"
- Use "think harder" prompt to trigger extended thinking mode

### Context Window Management
- Use `/clear` after each PR merge to wipe context completely
- Each issue should contain all information needed for a cold start
- Scratchpads preserve planning context across sessions
- Don't compact - clear completely between issues

### PR Review Best Practices
- Can leave comments on PRs and have Claude respond to them
- Separate PR review slash command recommended
- Run reviews in new shell (fresh context) for unbiased review
- Author mentions reviewing "in the style of Sandy Metz" for maintainability

### GitHub Actions vs Claude Code
- GitHub Actions @claude tagging uses metered API billing (even with Max plan)
- Console-based Claude Code gives better results for meaningful changes
- Use GitHub Actions for small fixes/copy changes only
- Anthropic recommends console for large changes

### Work Trees (Parallel Development)
- Git work trees allow multiple Claude instances on different branches
- Analogy: "multi-tabling in poker"
- **Issues encountered**:
  - Permissions need re-approval for each new work tree
  - Clunky interface with cleanup overhead
  - Merge conflicts increase with parallel work
- **Verdict**: Single Claude instance sufficient for author's needs

### Human Role Shift
- "Put my manager hat back on"
- Writing very little code personally
- Time spent: detailed specs, code review, feedback loops
- Feedback includes: "not quite good enough", "throw away your work", "I don't actually want this"

---

## Implementation Approach

1. **Set up GitHub repository** with CI/CD (GitHub Actions)
2. **Create comprehensive test suite** - this is foundational
3. **Install Puppeteer MCP server** for UI testing
4. **Create slash commands**:
   - `/issue <number>` - Process GitHub issues
   - `/review-pr <number>` - Review pull requests
5. **Write detailed GitHub issues** - atomic, specific, well-scoped
6. **Establish scratchpad directory** for planning documents
7. **Configure deployment** (e.g., Render watching main branch)

### Workflow Cycle

```
1. Select GitHub issue
2. Run /issue <number>
   ├── Claude plans using scratchpads
   ├── Searches previous scratchpads for related work
   ├── Reviews previous PRs for context
   └── Writes plan with "think harder"
3. Claude creates code
4. Claude tests (test suite + Puppeteer)
5. Claude commits and opens PR
6. Review PR (human or /review-pr in fresh shell)
7. CI runs (tests + linter)
8. Merge PR → auto-deploy
9. Run /clear
10. Repeat with next issue
```

---

## Code Snippets

No code snippets in transcript - workflow is conceptual.

---

## Action Items

- [ ] Set up GitHub CLI (`gh`) for Claude Code GitHub integration
- [ ] Create `/issue` slash command with plan/create/test/deploy sections
- [ ] Create `/review-pr` slash command (Sandy Metz style optional)
- [ ] Set up scratchpads directory for planning documents
- [ ] Configure GitHub Actions for CI (tests + linting)
- [ ] Install Puppeteer MCP server for UI testing
- [ ] Write atomic, well-scoped GitHub issues before starting work
- [ ] Consider MVC framework for better AI agent compatibility

---

## Risks & Gotchas

- **Issue quality is critical**: Vague issues lead to poor results and false starts
- **Context pollution**: Run PR reviews in fresh shell to avoid bias
- **Test coverage**: Without good tests, Claude can break existing functionality
- **Work tree overhead**: May not be worth it for early-stage projects
- **API costs**: GitHub Actions @claude uses metered billing even with Max plan
- **"Vibe coding" trap**: Easy to skip code review when AI handles everything

---

## Story Suggestions

### Potential Practice Doc: Claude Code + GitHub Workflow

Document the complete workflow for using Claude Code with GitHub:
- Slash command templates
- CI/CD configuration
- Scratchpad conventions
- Issue writing guidelines

### Potential Story: Puppeteer MCP Integration

**US-XXXX**: Add Puppeteer MCP server for UI testing
- AC: Claude can test UI changes by clicking in browser
- AC: Screenshot verification for visual regression

---

## Quotes Worth Noting

> "You've always been responsible for what you merge... you were 5 years ago and you are tomorrow whether or not you use an LLM"

> "If you build something with an LLM that people will depend on, read the code"

> "The more granular, the more specific, the more atomic those issues got, the better results I had"

> "Each issue should contain all of the information that Claude needs to perform that work - it should be able to work on the issue from a cold start"

---

## References

- Source: YouTube video transcript (direct import)
- Import date: 2026-01-21
- Related: Thomas Tacic's "All of My AI Skeptic Friends are Nuts" post
- Related: Anthropic's best practices for agentic coding (Boris)
- Related: GitHub Flow by Scott Chacon
- Related: Sandy Metz's principles for maintainable code
