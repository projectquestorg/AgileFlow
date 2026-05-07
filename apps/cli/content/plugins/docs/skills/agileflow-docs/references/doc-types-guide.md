# Documentation Types Guide

**Load this when:** deciding what kind of documentation to write, choosing
a format for a given audience, or auditing whether docs are complete.

## The four types of documentation

(Divio documentation system — each type has a distinct purpose and format)

| Type             | Answers                     | Analogy                  | User's goal                |
| ---------------- | --------------------------- | ------------------------ | -------------------------- |
| **Tutorial**     | "Help me learn"             | Teaching a child to cook | Learning by doing          |
| **How-to guide** | "How do I do X?"            | Recipe                   | Solving a specific problem |
| **Reference**    | "What is X?"                | Encyclopedia             | Looking something up       |
| **Explanation**  | "Why does X work this way?" | Essay                    | Understanding concepts     |

### Tutorial

- **Goal**: Learning by doing
- **Format**: Step-by-step walkthrough with expected output at each step
- **Tone**: Teacher-led. "We'll now add a user to the database."
- **Don't**: Explain why things work. Just do the thing.

```markdown
## Getting Started

In this tutorial, you'll build a simple task list API from scratch.
By the end, you'll have a working endpoint that stores and retrieves tasks.

### Step 1: Create the project

Run the following command to scaffold your project:
\`\`\`bash
npx create-api my-tasks
cd my-tasks
\`\`\`

You should see output like:
\`\`\`
✓ Project created
✓ Dependencies installed
\`\`\`
```

### How-to guide

- **Goal**: Accomplish a specific task the reader already understands
- **Format**: Numbered steps. Assumes context.
- **Tone**: Direct. "Do X. Then do Y."
- **Don't**: Teach concepts. Reference the explanation doc instead.

```markdown
## How to add a custom webhook

1. Open **Settings → Integrations**
2. Click **Add webhook**
3. Enter the destination URL
4. Select which events to send
5. Click **Save**

To verify delivery, check **Settings → Delivery log**.
```

### Reference

- **Goal**: Accurate, complete information to look up
- **Format**: Tables, parameter lists, type definitions
- **Tone**: Neutral, dense, no narrative
- **Don't**: Add tutorials or explanations. Just the facts.

```markdown
## `deliver(payload, options)`

Delivers a payload to all configured channels.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `payload` | `object` | Yes | — | The data to deliver |
| `options.retries` | `number` | No | `3` | Max retry attempts |
| `options.timeout` | `number` | No | `5000` | Timeout in ms |

**Returns:** `Promise<DeliveryResult>`
```

### Explanation

- **Goal**: Understanding — the "why" behind decisions
- **Format**: Prose. Can include diagrams, comparisons, history.
- **Tone**: Thoughtful. "We chose X because..."
- **Don't**: Include step-by-step instructions.

```markdown
## Why we use event sourcing for delivery state

Delivery systems face a fundamental problem: at-least-once vs at-most-once
delivery. We chose at-least-once with idempotency keys because...
```

## Choosing the right type

| User says...                            | Write this               |
| --------------------------------------- | ------------------------ |
| "I'm new to X, where do I start?"       | Tutorial                 |
| "How do I configure Y?"                 | How-to guide             |
| "What parameters does Z accept?"        | Reference                |
| "Why does the system do X this way?"    | Explanation              |
| "I want to understand the architecture" | Explanation              |
| "Show me an example of X"               | How-to guide or Tutorial |

## Common documentation mistakes

| Mistake                       | Problem                     | Fix                                 |
| ----------------------------- | --------------------------- | ----------------------------------- |
| Tutorial that explains theory | Breaks learning flow        | Move explanations to a separate doc |
| How-to with "why it works"    | Reader just wants the steps | Strip the explanation               |
| Reference with narrative      | Hard to scan                | Tables and lists only               |
| No examples in reference      | Too abstract                | Add one example per concept         |
| Explanation with step-by-step | Wrong register              | Move steps to how-to                |

## API documentation checklist

For every public function/endpoint:

```
⬜ Description (one sentence, active voice)
⬜ All parameters documented (name, type, required, default, description)
⬜ Return value documented (type + shape)
⬜ At least one example
⬜ Error cases documented (what throws, what returns null)
⬜ Side effects noted (if any)
⬜ Version added / deprecated (if applicable)
```

## Docs-as-code practices

- Write docs in the same PR as the code change
- Docs live in the repo alongside the code they document
- Use the same review process as code
- Broken docs = broken code: treat them with equal priority
- Auto-generate reference docs from code comments where possible (JSDoc → TypeDoc)
