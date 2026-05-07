# Research Prompt Guide

**Load this when:** writing a research prompt for `/agileflow:research:ask`
or helping a user formulate a research request.

## What makes a good research prompt

A lazy prompt gets a lazy answer. The quality of external research is directly
proportional to the specificity of the prompt.

**Rule:** A good research prompt should be long enough that it takes 30+ seconds to read.

## Required components

### 1. Context block (what you're building)

```
I'm building [feature] in [framework/language] version [X.Y].
The codebase uses [relevant libraries]. The goal is [specific outcome].
```

### 2. Relevant code (50+ lines)

Include the actual code that's causing the problem or is most relevant.
Don't summarize — paste the real code. Include:

- The function/component with the issue
- How it's called
- Related configuration
- Error handling around it

### 3. Exact error (if applicable)

Full stack trace. Don't truncate. Include:

- Error message
- Stack trace to the first line in your code (not just library internals)
- When the error occurs (on page load, on click, etc.)
- Whether it's intermittent or consistent

### 4. What was tried

List each approach attempted and why it failed:

```
Tried approach 1: [description] → [what happened]
Tried approach 2: [description] → [what happened]
```

### 5. Environment

- Framework and version
- Relevant library versions
- Node/runtime version
- Deployment target (serverless, container, etc.)

### 6. Three specific questions

Not "how do I fix this?" — specific, answerable questions:

**Bad questions:**

- "How do I make this work?"
- "What's wrong with my code?"
- "How do I use OAuth with Next.js?"

**Good questions:**

- "Does NextAuth v4 handle the `code` exchange differently when deployed to Vercel vs local? I'm seeing the callback URL mismatch only in production."
- "Is there a known issue with Prisma's `findMany` returning stale data when using the connection pool with PlanetScale? I see the right data on direct DB query but not through Prisma."
- "Should `useEffect` be used to set up a Supabase realtime subscription, or is there a better pattern in React 18 with concurrent mode?"

## Prompt template

```
## Context
I'm building [feature description] in [framework] [version].
Stack: [list key dependencies with versions].
Goal: [specific thing that needs to work].

## Relevant code
[paste 50+ lines of the most relevant code]

## The problem / question
[Describe the issue or decision in plain language]

## What I've tried
1. [approach 1] → [result]
2. [approach 2] → [result]
3. [approach 3] → [result]

## Error (if applicable)
[Full stack trace]

## Environment
- Node: [version]
- [framework]: [version]
- [key library]: [version]
- Deployment: [platform]

## Specific questions
1. [specific, answerable question]
2. [specific, answerable question]
3. [specific, answerable question]
```

## When to escalate to research

**Immediately (don't retry first):**

- External API response doesn't match documentation
- OAuth / SSO / SAML errors
- Build or bundler configuration errors
- "Cannot find module" for an unfamiliar package
- Cryptic library-internal errors with no obvious cause

**After 2 failed fix attempts:**

- Persistent type errors despite seemingly correct types
- Integration errors between two libraries
- Tests failing in unexpected ways
- Runtime errors with no obvious cause

**Never needs research:**

- Typos and syntax errors
- Missing imports
- Obvious null checks
- Clear logic errors
- Things you've fixed before in this codebase

## Importing and organizing research

After getting external answers:

1. `/agileflow:research:import` — save findings with title, source, and relevant code snippets
2. Tag by topic (e.g., "nextauth", "prisma-pooling") for future retrieval
3. `/agileflow:research:synthesize` if you have multiple sources on the same topic
4. Check `/agileflow:research:list` at the start of sessions working in the same area

Research notes persist across sessions — build the knowledge base over time.
