# OpenAI Codex Skills System

**Import Date**: 2026-01-09
**Topic**: OpenAI Codex Agent Skills
**Source**: https://developers.openai.com/codex/skills/
**Content Type**: Documentation

---

## Summary

OpenAI Codex's skill system extends the CLI with task-specific capabilities through packages containing instructions, resources, and optional scripts. Skills are based on the "open agent skills standard" from agentskills.io, enabling interoperability and community sharing.

The system uses "progressive disclosure" - at startup, Codex loads only skill names and descriptions, then fully loads skill content only when invoked (explicitly via `/skills` or `$` mention, or implicitly when Codex matches a task description). This is similar to AgileFlow's approach with Claude Code commands.

Skills follow a simple folder structure with `SKILL.md` as the core file (containing YAML frontmatter metadata + markdown instructions), plus optional `scripts/`, `references/`, and `assets/` directories.

---

## Key Findings

- **Skill = Capability in Markdown**: A skill is fundamentally instructions in a `SKILL.md` file with YAML frontmatter for metadata
- **Progressive Disclosure**: Codex only loads skill names/descriptions at startup; full content loads on-demand when invoked
- **Two Invocation Methods**: Explicit (`/skills` command or `$` mention) and Implicit (Codex autonomously selects matching skills)
- **Hierarchical Precedence**: Skills load from multiple locations with priority order (REPO > USER > ADMIN > SYSTEM)
- **Built-in Skill Creator**: The `$skill-creator` skill bootstraps new skills from a description
- **Standards-Based**: Built on agentskills.io specification for community interoperability

---

## Implementation Approach

1. Define skill in `SKILL.md` with required metadata (`name`, `description`)
2. Place in valid skill location (`.codex/skills/` in repo, or user/system paths)
3. Optional: Add `scripts/` for executable code, `references/` for docs, `assets/` for templates
4. Restart Codex to recognize new skills

---

## Code Snippets

### SKILL.md Structure

```yaml
---
name: skill-name
description: Description that helps Codex select the skill
metadata:
  short-description: Optional user-facing description
---

Skill instructions for the Codex agent to follow when using this skill.
```

### Installing Skills

```
$skill-installer linear
```

---

## Action Items

- [ ] Compare Codex skill structure with AgileFlow's current skill format
- [ ] Evaluate adopting agentskills.io standard for cross-agent compatibility
- [ ] Consider adding `$skill-creator` equivalent to AgileFlow
- [ ] Review progressive disclosure pattern for optimization opportunities

---

## Skill Locations & Precedence

| Scope | Location | Use |
|-------|----------|-----|
| REPO | `$CWD/.codex/skills` | Repository-specific skills |
| REPO | `$CWD/../.codex/skills` | Nested folder skills |
| REPO | `$REPO_ROOT/.codex/skills` | Organization-wide repository skills |
| USER | `$CODEX_HOME/skills` | Personal cross-repository skills |
| ADMIN | `/etc/codex/skills` | System-level default skills |
| SYSTEM | Bundled | Built-in Codex skills |

Higher precedence scopes override lower ones with identical skill names.

---

## Available Example Skills

- **$create-plan**: Research and planning for features
- **$skill-installer linear**: Linear integration for task context
- **$skill-creator**: Bootstrap new skills from description

---

## Risks & Gotchas

- Implicit invocation may select wrong skill if descriptions overlap
- Skill precedence could cause confusion when same-named skills exist at multiple levels
- No mention of skill versioning or dependency management

---

## Story Suggestions

### Potential Story: Codex Skill Compatibility Layer

**US-XXXX**: Add Codex skill format support to AgileFlow
- AC: AgileFlow can load and execute `SKILL.md` format skills
- AC: Existing AgileFlow skills continue to work unchanged
- AC: Users can install skills from agentskills.io ecosystem

---

## Comparison with AgileFlow

| Feature | Codex Skills | AgileFlow Skills |
|---------|--------------|------------------|
| Core file | `SKILL.md` | `*.md` in skills/ |
| Metadata | YAML frontmatter | YAML frontmatter |
| Invocation | `$skillname` or implicit | `/skill:name` |
| Progressive disclosure | Yes | Yes (via skill loading) |
| Scripts | `scripts/` folder | Inline or external |
| Standards | agentskills.io | Custom |

---

---

## AgileFlow Implementation Status

**Status**: ✅ Already Implemented

AgileFlow fully supports the Codex skill standard documented above:

| Feature | AgileFlow Status | Location |
|---------|------------------|----------|
| Agents → Codex Skills | ✅ Implemented | `packages/cli/tools/cli/installers/ide/codex.js` |
| Commands → Prompts | ✅ Implemented | Same file |
| AGENTS.md scaffolding | ✅ Implemented | Same file |
| Progressive disclosure | ✅ Native support | Codex handles on-demand loading |
| agentskills.io standard | ✅ Compliant | SKILL.md format matches spec |

**Related documentation:**
- ADR: `docs/03-decisions/adr-0002-codex-cli-integration.md`
- Epic: `docs/05-epics/EP-0003-codex-cli-support.md`
- Original research: `docs/10-research/20251224-openai-codex-cli-integration.md`

**Usage:**
```bash
npx agileflow setup  # Detects Codex CLI and installs skills
```

This research validates the existing implementation follows the official standard.

---

## References

- Source: https://developers.openai.com/codex/skills/
- Import date: 2026-01-09
- Related: [20251224-openai-codex-cli-integration.md](./20251224-openai-codex-cli-integration.md)
- Related: [20251227-ai-agent-skills-reusable-workflows.md](./20251227-ai-agent-skills-reusable-workflows.md)
