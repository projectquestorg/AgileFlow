# Skills Reference

AgileFlow uses a **dynamic skill generator** that creates custom skills on demand with web research, cookbook patterns, and MCP integration.

---

## How Skills Work

Skills are context-aware helpers that activate automatically when Claude detects relevant keywords:

- **Activation:** Keyword-based detection (no manual invocation)
- **Context:** Main conversation (not separate window)
- **Purpose:** Reusable workflows with executable code
- **Structure:** SKILL.md pivot file + cookbook/ + tools/ + .mcp.json

### Key Benefits

| Benefit | Description |
|---------|-------------|
| **Token Efficiency** | First run explores (high tokens), skill saves solution, subsequent runs 10x cheaper |
| **Consistency** | Users get documents/outputs with same structure instead of random layouts |
| **Reusability** | Figure out hard part once, reuse forever |
| **MCP Integration** | Skills can include MCP server configuration for external services |

---

## Creating Skills

Use the `/agileflow:skill:create` command to generate custom skills:

```bash
/agileflow:skill:create
```

### Interactive Workflow

1. **Requirements Gathering** - What skill do you want? What technology?
2. **Web Research** - Searches for best practices, documentation, MCP servers
3. **Skill Generation** - Creates SKILL.md with cookbook pattern
4. **Preview & Confirm** - Review structure before writing
5. **Save to `.claude/skills/`** - Directly usable by Claude Code

### Generated Skill Structure

```
.claude/skills/<skill-name>/
├── SKILL.md              # Pivot file (<500 lines)
│   ├── Frontmatter (name, description)
│   ├── When to Use (activation triggers)
│   ├── Variables (feature flags)
│   ├── Cookbook (conditional routing)
│   └── Quick Reference
├── cookbook/             # Per-use-case workflows
│   ├── <use-case-1>.md
│   └── <use-case-2>.md
├── tools/                # Executable scripts
│   └── <script>.py
├── prompts/              # Reusable templates
│   └── <prompt>.md
└── .mcp.json             # MCP server config (if applicable)
```

---

## MCP Integration

Skills can include MCP server configuration for technologies like:

| Technology | MCP Package | Setup |
|------------|-------------|-------|
| Supabase | @supabase/mcp-server | Database, auth, storage |
| GitHub | @modelcontextprotocol/server-github | Repository operations |
| PostgreSQL | @modelcontextprotocol/server-postgres | SQL database |
| Playwright | @anthropic/playwright-mcp | Browser automation |
| Slack | @modelcontextprotocol/server-slack | Messaging integration |

The `.mcp.json` file in skill folders provides server configuration that can be merged with your project's MCP settings.

---

## Skills vs Commands vs Subagents

| Feature | Activation | Context | Best For |
|---------|------------|---------|----------|
| **Skills** | Automatic (keywords) | Main conversation | Reusable workflows, templates |
| **Commands** | Manual (`/agileflow:*`) | Main conversation | Single-purpose actions |
| **Subagents** | Manual (Task tool) | Separate window | Complex implementation |

---

## Example Skills

### Database Skill (e.g., Supabase Swift)

```bash
/agileflow:skill:create
# Choose: "Database integration"
# Technology: "Supabase"
# Language: "Swift"
# MCP: "Yes"
```

Creates:
```
.claude/skills/supabase-swift/
├── SKILL.md
├── cookbook/
│   ├── crud-operations.md
│   ├── authentication.md
│   ├── migrations.md
│   └── realtime-subscriptions.md
└── .mcp.json
```

### Testing Skill (e.g., Jest)

```bash
/agileflow:skill:create
# Choose: "Development workflow"
# Technology: "Jest"
# MCP: "No"
```

Creates:
```
.claude/skills/jest-testing/
└── SKILL.md  # Single workflow, no cookbook needed
```

---

## Safety

**Important Rule**: Agents can USE skills but cannot MODIFY the skills directory.

- Skills are version-controlled and reviewable
- Agents generate new skills to separate locations
- Trusted skills remain locked

---

## Related Documentation

- [Commands](./commands.md) - 69 slash commands
- [Subagents](./subagents.md) - 28 specialized agents
