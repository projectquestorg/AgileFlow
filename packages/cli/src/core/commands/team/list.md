---
description: List available team templates
argument-hint: "(no arguments)"
compact_context:
  priority: low
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:team:list - List team templates"
  state_fields: []
---

# /agileflow:team:list

List all available team composition templates.

---

## Step 1: Find Templates

Read all `.json` files from the teams directory:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const teamsDir = path.join(process.cwd(), '.agileflow', 'teams');
if (!fs.existsSync(teamsDir)) {
  console.log('No teams directory found. Run: npx agileflow update');
  process.exit(0);
}
const files = fs.readdirSync(teamsDir).filter(f => f.endsWith('.json'));
for (const file of files) {
  const template = JSON.parse(fs.readFileSync(path.join(teamsDir, file), 'utf8'));
  console.log(JSON.stringify({ name: template.name, description: template.description, teammates: template.teammates.length, tags: template.tags }));
}
"
```

## Step 2: Display as Table

Format and display all templates:

| Template | Description | Team Size | Tags |
|----------|-------------|-----------|------|
| `fullstack` | Full-stack development team | 3 | development, feature |
| `code-review` | Code review specialists | 3 | review, quality |
| `builder-validator` | Paired builder+validator | 4 | validation, high-confidence |
| `logic-audit` | Multi-perspective logic analysis | 4 | analysis, bugs |

## Step 3: Show Agent Teams Status

Also display:
- Whether Agent Teams is enabled (native mode vs subagent fallback)
- How to enable if not enabled
- Link to `/agileflow:team:start <template>` for starting a team

## Step 4: Show Active Team (if any)

If a team is currently active, show its status at the top:
- "Active team: fullstack (started 2h ago, 3 teammates)"
