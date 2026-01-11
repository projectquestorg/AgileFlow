# ADR-0006: Cross-Platform Skill Patterns

**Status**: Proposed
**Date**: 2026-01-09
**Deciders**: Development Team
**Research**: [Gemini CLI Skills](../10-research/20260109-gemini-cli-skills.md), [OpenAI Codex Skills](../10-research/20260109-openai-codex-skills-system.md)

## Context

AI coding assistant CLIs (Gemini CLI, OpenAI Codex, Claude Code) are converging on similar patterns for extensibility:

| Pattern | Gemini CLI | OpenAI Codex | AgileFlow/Claude Code |
|---------|-----------|--------------|----------------------|
| Core file | `SKILL.md` | `SKILL.md` | `*.md` commands |
| Metadata | YAML frontmatter | YAML frontmatter | YAML frontmatter |
| Discovery tiers | 3 (project/user/extension) | 4 (repo/user/admin/system) | 1 (project only) |
| Activation | Autonomous + confirm | Explicit `$` or implicit | Explicit `/command` |
| Progressive disclosure | Yes (metadata first) | Yes (metadata first) | Partial |
| Asset bundling | `scripts/`, `references/`, `assets/` | `scripts/`, `references/`, `assets/` | Separate `scripts/` dir |
| Standard | Custom | agentskills.io | Custom |

An industry standard is emerging around **agentskills.io** which both Codex and Gemini CLI align with. AgileFlow already supports Codex skill format (ADR-0002) but doesn't implement multi-tier discovery.

### Key Questions

1. Should AgileFlow adopt multi-tier skill discovery (project → user → system)?
2. Should AgileFlow implement autonomous skill activation (model suggests skills)?
3. Should AgileFlow standardize on agentskills.io for cross-platform portability?

## Decision

**Adopt multi-tier discovery in a future release, defer autonomous activation.**

### Rationale

1. **Multi-tier discovery** (ADOPT)
   - Users are asking for personal skill libraries that work across projects
   - Implementation is straightforward (extend existing scanners)
   - No breaking changes to existing functionality
   - Aligns with industry direction

2. **Autonomous activation** (DEFER)
   - Adds complexity to session management
   - Risk of unwanted skill suggestions
   - Current explicit invocation works well
   - Can revisit based on user feedback

3. **agentskills.io standard** (PARTIAL)
   - Already support SKILL.md format for Codex
   - Don't need full standard compliance for Claude Code
   - Maintain flexibility for Claude-specific features

## Consequences

### Positive

- Users can build personal skill libraries (`~/.agileflow/skills/`)
- Skills portable across projects without reinstallation
- Better alignment with Gemini CLI and Codex patterns
- Foundation for future community skill sharing

### Negative

- Increased complexity in skill discovery
- Potential confusion about which tier a skill comes from
- More code paths to maintain and test

### Neutral

- No change to existing explicit `/command` invocation
- Codex installer continues to work unchanged
- Claude Code commands remain project-specific by default

## Implementation Path

### Phase 1: User-Level Skills (Recommended Next)

Add `~/.agileflow/skills/` as second discovery tier:

```
Discovery Order:
1. PROJECT: .agileflow/skills/     (highest precedence)
2. USER:    ~/.agileflow/skills/   (new)
3. SYSTEM:  Built-in commands      (lowest precedence)
```

**Files to modify:**
- `packages/cli/tools/cli/installers/core/installer.js`
- `packages/cli/scripts/obtain-context.js`
- New: `packages/cli/scripts/generators/skill-registry.js`

**New commands:**
- `/skill:user:list` - List user-level skills
- `/skill:user:add <path>` - Add skill to user library
- `/skill:user:remove <name>` - Remove from user library

### Phase 2: Enhanced Discovery (Future)

- Add skill source indicator to `/skills list`
- Add `/skill:debug` for troubleshooting precedence
- Consider `~/.agileflow/config.yaml` for user preferences

### Phase 3: Autonomous Activation (If Requested)

- Opt-in setting: `autoSuggestSkills: true`
- Inject skill metadata at session start
- Model suggests relevant skills, user confirms

## Alternatives Considered

### 1. Full agentskills.io Compliance

**Rejected**: Would require restructuring existing commands. Current format works well for Claude Code. Maintain partial compatibility via Codex installer.

### 2. Gemini CLI Directory Structure

**Rejected**: `.gemini/skills/` vs `.agileflow/skills/` - no benefit to changing. AgileFlow has established conventions.

### 3. No Multi-Tier Discovery

**Rejected**: Users have requested personal skill libraries. Industry is moving this direction. Cost of implementation is low.

## References

- [Gemini CLI Skills Documentation](https://geminicli.com/docs/cli/skills/)
- [OpenAI Codex Skills Documentation](https://developers.openai.com/codex/skills/)
- [agentskills.io Standard](https://agentskills.io)
- [ADR-0002: Codex CLI Integration](./adr-0002-codex-cli-integration.md)
- Research: `docs/10-research/20260109-gemini-cli-skills.md`
- Research: `docs/10-research/20260109-openai-codex-skills-system.md`
