# Gemini CLI Skills System

**Import Date**: 2026-01-09
**Topic**: Gemini CLI Skills
**Source**: https://geminicli.com/docs/cli/skills/
**Content Type**: documentation

---

## Summary

Gemini CLI has a skills system that allows extending the CLI with specialized expertise and procedural workflows. A "skill" is a self-contained directory that packages instructions and assets into a discoverable capability, operating as on-demand capabilities distinct from general context files.

The system uses progressive disclosure where only metadata loads initially and detailed instructions activate when needed, preserving context tokens. Skills are discovered from three locations with precedence: project skills (`.gemini/skills/`), user skills (`~/.gemini/skills/`), and extension skills (bundled within extensions).

This approach is similar to how AgileFlow implements agents and commands, but with some architectural differences worth noting for potential cross-pollination of ideas.

---

## Key Findings

- **Progressive Disclosure**: Only metadata (name + description) loads initially; full instructions activate only when the skill is relevant. This preserves context tokens.
- **Autonomous Activation**: The model independently determines skill relevance based on the user's request, then prompts for user confirmation.
- **Resource Bundling**: Instructions, scripts, templates, and example data coexist in a single folder structure.
- **Three Discovery Tiers**: Project → User → Extension, with higher tiers overriding duplicates in lower tiers.
- **SKILL.md Convention**: Each skill requires a SKILL.md file with YAML frontmatter containing `name` and `description` fields.
- **Directory Structure**: Standard conventions include `scripts/`, `references/`, and `assets/` subdirectories.
- **Management Commands**: Both interactive (`/skills list`, `/skills enable/disable`) and terminal (`gemini skills list`) interfaces available.
- **Experimental Feature**: Skills require activation via `experimental.skills` configuration setting.

---

## Implementation Approach

### Skill Structure

1. Create a directory in `.gemini/skills/<skill-name>/`
2. Add a `SKILL.md` file with YAML frontmatter
3. Include supporting resources in subdirectories

### Activation Flow

1. **Discovery Phase**: Skill names and descriptions inject into the system prompt
2. **Identification**: Model recognizes task relevance to a skill's description
3. **Confirmation**: User approves skill activation via UI prompt
4. **Injection**: SKILL.md content and directory access grant file read permissions
5. **Execution**: Model operates with specialized guidance active

---

## Code Snippets

### Skill File Structure (SKILL.md)

```
---
name: <unique-name>
description: <what the skill does and when Gemini should use it>
---
<your instructions for how the agent should behave / use the skill>
```

### Example: Code Reviewer Skill

```
---
name: code-reviewer
description: Expertise in reviewing code for style, security, and performance. Use when the user asks for "feedback," a "review," or to "check" their changes.
---
# Code Reviewer

You are an expert code reviewer. When reviewing code, follow this workflow:

1. **Analyze**: Review staged changes or specific files provided.
2. **Style**: Ensure code follows project conventions.
3. **Security**: Flag potential vulnerabilities.
4. **Tests**: Verify test coverage adequately validates changes.

Provide feedback as "Strengths" and "Opportunities."
```

### Management Commands

```bash
# Interactive session commands
/skills list        # Display all discovered skills
/skills disable <name>  # Prevent skill usage
/skills enable <name>   # Re-enable a skill
/skills reload      # Refresh discovered skills

# Terminal commands
gemini skills list
gemini skills enable my-expertise
gemini skills disable my-expertise
```

---

## Action Items

- [ ] Compare Gemini CLI skills architecture with AgileFlow's agents/commands system
- [ ] Evaluate progressive disclosure pattern for potential AgileFlow optimization
- [ ] Consider implementing autonomous activation for AgileFlow skills
- [ ] Review discovery tier system for potential improvements to AgileFlow's loading
- [ ] Assess user confirmation flow for skill activation UX

---

## Risks & Gotchas

- Skills are an **experimental feature** requiring explicit enablement
- The `description` field is critical - it determines when the model employs the skill
- Name format is strict: lowercase, alphanumeric, dashes only
- Higher-tier locations override duplicate names (could cause confusion)

---

## AgileFlow Comparison Notes

| Aspect | Gemini CLI Skills | AgileFlow |
|--------|------------------|-----------|
| Directory | `.gemini/skills/` | `.claude/commands/agileflow/` |
| Main file | `SKILL.md` | `*.md` command files |
| Activation | Autonomous + user confirm | Explicit `/command` invocation |
| Discovery | 3 tiers (project/user/extension) | Project-level only |
| Context loading | Progressive (metadata first) | Full file on invocation |
| Asset bundling | Built-in (`scripts/`, `references/`) | Via separate scripts dir |

---

## References

- Source: https://geminicli.com/docs/cli/skills/
- Import date: 2026-01-09
- Related: AgileFlow agents system, Claude Code slash commands
