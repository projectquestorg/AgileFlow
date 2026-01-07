---
description: Generate detailed research prompt for web AI tools (ChatGPT, Perplexity, etc.)
argument-hint: TOPIC=<text> [DETAILS=<constraints>] [ERROR=<error message>]
compact_context:
  priority: critical
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:research:ask - Generate research prompt for external AI"
    - "MUST generate 200+ lines minimum (FAIL and regenerate if shorter)"
    - "MUST include 50+ lines of ACTUAL code from user's codebase (not pseudo-code)"
    - "MUST include exact error messages verbatim if troubleshooting"
    - "MUST list 2+ approaches already tried with detailed results"
    - "MUST ask 3+ specific questions (not vague)"
    - "NO FILE WRITES - output only, user will copy/paste to external AI"
    - "Validation required before output: length, code snippets, error details, attempts, questions"
    - "If validation fails: gather missing info and regenerate"
  state_fields:
    - topic
    - error_message
    - codebase_context
    - attempts_tried
    - prompt_generated
---

# /agileflow:research:ask

Generate a comprehensive, detailed research prompt for external AI tools.

---

## Purpose

When you need external research (from ChatGPT, Perplexity, Claude web, Gemini), this command generates a **detailed, context-rich prompt** that includes:
- Your current codebase context and code snippets
- Exact error messages and stack traces
- What you've already tried
- Specific questions to answer

**This is STEP 1 of research workflow.** After you get results from the external AI, use `/agileflow:research:import` to save them.

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:research:ask IS ACTIVE

**CRITICAL**: You are running `/agileflow:research:ask`. Generate detailed research prompts for external AI tools.

**ROLE**: Generate 200+ line research prompt with actual code, errors, attempts, and specific questions.

---

### 🚨 RULE #1: MINIMUM 200 LINES REQUIRED

**Every research prompt MUST be 200+ lines. If it's shorter, gather more context and regenerate.**

```
❌ WRONG: "How do I implement OAuth in Next.js?" (too short)
✅ RIGHT: [200+ line detailed prompt with code, error, attempts, questions]
```

**Why**: Vague short prompts get vague short answers. Detailed prompts get actionable results.

**Validation step (BEFORE outputting):**
- Count lines in the generated prompt
- If < 200 lines: gather more context and regenerate
- Do NOT output incomplete prompts

---

### 🚨 RULE #2: INCLUDE 50+ LINES OF ACTUAL CODE

**Include actual code from the user's codebase, not pseudo-code or summaries.**

```
❌ WRONG:
```typescript
// User authentication logic
```

✅ RIGHT:
```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
  },
});
```

**How to get code:**
- Read relevant source files using Read tool
- Extract 50+ lines from actual implementation
- Include imports, configuration, any relevant code

---

### 🚨 RULE #3: INCLUDE EXACT ERROR MESSAGES

**If troubleshooting, include the EXACT error verbatim. Not a summary, not paraphrased.**

```
❌ WRONG: "I'm getting an authentication error"
✅ RIGHT:
```
[auth][error] CallbackRouteError: Read more at https://errors.authjs.dev#callbackrouteerror
[auth][cause]: Error: unauthorized_client
```
```

**Include:**
- Full error message (copy-pasted exactly)
- Complete stack trace if available
- When it occurs (which endpoint, which action)
- Steps to reproduce

---

### 🚨 RULE #4: LIST WHAT WAS ALREADY TRIED (2+ APPROACHES)

**Document what approaches were already attempted and why they didn't work.**

Format:
```
## What We've Already Tried

### Attempt 1: [Description]
**What we did**: [Detailed explanation]
**Result**: [What happened]
**Why it didn't work**: [Analysis of why this approach failed]

### Attempt 2: [Description]
**What we did**: [Detailed explanation]
**Result**: [What happened]
**Why it didn't work**: [Analysis]
```

**This helps external AI:**
- Avoid suggesting same solutions
- Understand what's been ruled out
- Provide alternative approaches

---

### 🚨 RULE #5: ASK 3+ SPECIFIC QUESTIONS

**Ask specific, answerable questions. NOT vague ones.**

```
❌ WRONG:
- How do I fix OAuth?
- What should I do?
- Why isn't this working?

✅ RIGHT:
1. Why does next-auth 5.0.0-beta.4 throw unauthorized_client when credentials are verified correct?
2. Is there additional configuration needed for Google OAuth with Next.js 14 App Router?
3. What's the correct format for authorized redirect URIs in Google Console for next-auth v5?
4. Are there known issues with next-auth 5.0.0-beta.4 and the Google provider?
```

**Good questions:**
- Reference specific libraries/versions
- Ask about trade-offs ("Should we use X or Y?")
- Ask about configuration details
- Ask about known issues

---

### 🚨 RULE #6: MANDATORY SECTIONS (IN ORDER)

Every research prompt MUST have:

1. **Project Context** - Framework, versions, dependencies
2. **Current Implementation** - 50+ lines of actual code
3. **The Problem** - Error message, expected vs actual behavior
4. **What We've Tried** - 2+ approaches with results
5. **Specific Questions** - 3+ detailed questions
6. **What We Need** - Expected response format
7. **Environment Details** - Versions, OS, setup

---

### 🚨 RULE #7: NO FILE WRITES

**This command outputs a prompt only. User will copy/paste to ChatGPT/Claude/Perplexity.**

```
❌ WRONG: Write prompt to file
✅ RIGHT: Output prompt in code block, instruct user to copy
```

---

### VALIDATION CHECKLIST (BEFORE OUTPUT)

**Before outputting, verify ALL:**

| Check | Requirement | If Fail |
|-------|-------------|---------|
| Length | ≥200 lines | Add more context and regenerate |
| Code | ≥50 lines actual code | Read more files and extract code |
| Error | Verbatim message present | Ask user for exact error message |
| Tried | ≥2 approaches listed | Ask what was already attempted |
| Questions | ≥3 specific questions | Add more detailed questions |

**If ANY check fails:**
1. Do NOT output the prompt
2. Gather the missing information
3. Regenerate with complete content

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Generate short vague prompts ("How do I do X?")
❌ Include pseudo-code instead of actual code
❌ Summarize errors instead of including verbatim
❌ List no or vague attempted solutions
❌ Ask generic questions without context
❌ Output prompt shorter than 200 lines
❌ Save prompt to file instead of displaying for copy/paste
❌ Skip validation before outputting

### DO THESE INSTEAD

✅ Generate detailed 200+ line prompts
✅ Include 50+ lines of actual code from codebase
✅ Include exact error messages verbatim
✅ List 2+ specific attempts with detailed results
✅ Ask 3+ specific, contextualized questions
✅ Validate prompt quality before outputting
✅ Display prompt in code block for user copy/paste
✅ Instruct user where to paste results back

---

### WORKFLOW

**Phase 1: Gather Context**
1. Read package.json / pyproject.toml for versions
2. Read relevant source files for code snippets
3. Get project overview from README/CLAUDE.md

**Phase 2: Extract Information**
4. Get error message (if ERROR argument provided)
5. Identify what was already tried
6. Understand the tech stack

**Phase 3: Generate Prompt**
7. Create structured prompt with mandatory sections
8. Include 50+ lines of actual code
9. Include exact error messages
10. List 2+ attempted approaches
11. Ask 3+ specific questions

**Phase 4: Validate Quality**
12. Check length ≥200 lines
13. Verify code snippets ≥50 lines
14. Verify error details if applicable
15. Verify 2+ attempts listed
16. Verify 3+ specific questions
17. If any check fails: gather more info and regenerate

**Phase 5: Output**
18. Display prompt in code block
19. Instruct user: "Copy this prompt and paste into ChatGPT/Claude/Perplexity"
20. Provide post-answer instructions: "When you get results, use /agileflow:research:import to save"

---

### KEY FILES

| File | Purpose |
|------|---------|
| `package.json` | Dependency versions, framework info |
| `README.md` / `CLAUDE.md` | Project overview |
| Source files | Code to extract for snippets |

---

### PROMPT TEMPLATE

```markdown
# Research Request: [TOPIC]

## Project Context

**Framework**: [e.g., Next.js 14.0.4 with App Router]
**Key Dependencies**:
- [dependency]: [version]
- [dependency]: [version]

---

## Current Implementation

### File: [path/to/file.ts]

[50+ lines of actual code]

---

## The Problem

### Error Message
[EXACT error, copied verbatim]

### Expected vs Actual
Expected: [What should happen]
Actual: [What actually happens]

---

## What We've Already Tried

### Attempt 1: [Description]
**What**: [Details]
**Result**: [What happened]

### Attempt 2: [Description]
**What**: [Details]
**Result**: [What happened]

---

## Specific Questions

1. **[Specific question with context]**
2. **[Specific question with context]**
3. **[Specific question with context]**

---

## What We Need

1. Root cause analysis
2. Step-by-step solution
3. Complete code examples
4. Testing approach
```

---

### REMEMBER AFTER COMPACTION

- `/agileflow:research:ask` IS ACTIVE - you're generating research prompts
- MUST generate 200+ lines minimum
- MUST include 50+ lines of actual code (not pseudo-code)
- MUST include exact error messages verbatim if applicable
- MUST list 2+ attempts with detailed results
- MUST ask 3+ specific questions
- Validate all checks BEFORE outputting
- NO file writes - output for user to copy/paste
- After user gets results, they use /agileflow:research:import to save

<!-- COMPACT_SUMMARY_END -->

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| TOPIC | Yes | What you're researching (e.g., "OAuth 2.0 with Google") |
| DETAILS | No | Constraints, deadlines, or specific requirements |
| ERROR | No | Exact error message if troubleshooting |

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Create Todo List

```xml
<invoke name="TodoWrite">
<parameter name="todos">[
  {"content": "Gather codebase context", "status": "in_progress", "activeForm": "Gathering context"},
  {"content": "Extract relevant code snippets", "status": "pending", "activeForm": "Extracting code"},
  {"content": "Collect error details", "status": "pending", "activeForm": "Collecting errors"},
  {"content": "Document what was tried", "status": "pending", "activeForm": "Documenting attempts"},
  {"content": "Generate research prompt", "status": "pending", "activeForm": "Generating prompt"},
  {"content": "Validate prompt quality", "status": "pending", "activeForm": "Validating quality"}
]</parameter>
</invoke>
```

### Step 2: Gather Codebase Context

Read and collect:
- `package.json` or `pyproject.toml` - Framework, dependencies, versions
- `docs/context.md` - Project overview if exists
- `docs/09-agents/status.json` - Current story context
- Relevant source files for the TOPIC

### Step 3: Extract Relevant Code Snippets

Find files related to TOPIC and extract **50+ lines of actual code**:
- Current implementation
- Related configuration files
- Import statements and dependencies

### Step 4: Collect Error Details (if applicable)

If ERROR argument provided or troubleshooting:
- Full error message (verbatim)
- Complete stack trace
- Steps to reproduce
- When it occurs

### Step 5: Document What Was Already Tried

If fixing an issue, list **at least 2 approaches** with results:
- Approach 1: [description] → Result: [what happened]
- Approach 2: [description] → Result: [what happened]

### Step 6: Generate Research Prompt

Create a prompt with these **MANDATORY SECTIONS**:

```markdown
# Research Request: [TOPIC]

## Project Context

**Framework**: [e.g., Next.js 14.0.4 with App Router]
**Key Dependencies**:
- [dependency]: [version]
- [dependency]: [version]

**Relevant Files**:
- `src/auth/login.ts` - Authentication logic
- `src/api/users.ts` - User API endpoints
- [list all relevant files]

---

## Current Implementation

### File: [path/to/file.ts]

```typescript
// [50+ lines of actual code from your codebase]
// DO NOT summarize - include the FULL relevant code
```

### File: [path/to/config.ts]

```typescript
// [Additional relevant code]
```

---

## The Problem

### Error Message
```
[EXACT error message, copied verbatim]
```

### Stack Trace
```
[FULL stack trace if available]
```

### Expected Behavior
[What SHOULD happen]

### Actual Behavior
[What ACTUALLY happens]

### Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

---

## What We've Already Tried

### Attempt 1: [Description]
**What we did**: [Detailed explanation]
**Result**: [What happened - did it fail? How?]
**Why it didn't work**: [Analysis]

### Attempt 2: [Description]
**What we did**: [Detailed explanation]
**Result**: [What happened]
**Why it didn't work**: [Analysis]

### Attempt 3: [Description] (if applicable)
**What we did**: [Detailed explanation]
**Result**: [What happened]

---

## Specific Questions

1. **Why is [specific thing] happening?**
   Context: [relevant detail]

2. **What is the correct way to [do X] in [framework version]?**
   Context: [current approach that's failing]

3. **Are there known compatibility issues between [A] and [B]?**
   Context: [why you suspect this]

4. **What configuration am I missing for [feature]?**
   Context: [current config]

---

## What I Need

Please provide:

1. **Root cause analysis**: Why is this happening?

2. **Step-by-step solution** with:
   - Exact code changes needed
   - File paths where changes go
   - Order of operations

3. **Complete code examples** that I can copy-paste

4. **Gotchas and edge cases** to watch for

5. **Testing approach** to verify the fix works

---

## Environment Details

- **Node.js**: [version]
- **npm/yarn/pnpm**: [version]
- **OS**: [operating system]
- **Relevant versions**: [list any relevant tool versions]

---

## References

If citing documentation or examples, please include:
- Source title
- URL
- Date accessed (for version relevance)
```

### Step 7: Validate Prompt Quality

**Before outputting, verify ALL of these:**

| Check | Requirement | If Fail |
|-------|-------------|---------|
| Length | ≥200 lines | Add more code/context |
| Code snippets | ≥50 lines actual code | Read more files |
| Error details | Verbatim message present | Ask user for error |
| Tried section | ≥2 approaches listed | Ask what was tried |
| Questions | ≥3 specific questions | Add more questions |

**If ANY check fails:**
1. Do NOT output the prompt
2. Gather the missing information
3. Regenerate with complete content

### Step 8: Output the Prompt

Wrap the final prompt in a code block:

````
```markdown
[Complete research prompt here - 200+ lines]
```
````

End with instructions:

```
---

Copy this prompt and paste it into ChatGPT, Claude web, Perplexity, or Gemini.

When you get the answer, paste the results here and I'll save them to your research folder using `/agileflow:research:import`.
```

---

## Anti-Pattern: Lazy Prompts

**NEVER generate short, vague prompts like:**

```
"How do I fix OAuth in Next.js?"
```

or

```
"Getting an error with authentication, how to fix?"
```

**ALWAYS generate detailed prompts with:**
- Actual code from the codebase
- Exact error messages
- What was already tried
- Specific questions

---

## Example: Good vs Bad

### BAD (Don't do this)

```markdown
# OAuth Issue

I'm having trouble with OAuth in my Next.js app. It's not working. How do I fix it?
```

**Problems**: No code, no error, no context, no specific questions.

### GOOD (Do this)

```markdown
# Research Request: next-auth Google OAuth unauthorized_client Error

## Project Context

**Framework**: Next.js 14.0.4 with App Router
**Key Dependencies**:
- next-auth: 5.0.0-beta.4
- next: 14.0.4
- typescript: 5.3.3

**Relevant Files**:
- `src/app/api/auth/[...nextauth]/route.ts` - Auth configuration
- `src/lib/auth.ts` - Auth helpers
- `.env.local` - Environment variables

---

## Current Implementation

### File: src/app/api/auth/[...nextauth]/route.ts

```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      return session;
    },
  },
});

export const { GET, POST } = handlers;
```

### File: .env.local (sanitized)

```
GOOGLE_CLIENT_ID=123456789-xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxx
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=my-secret-key
```

---

## The Problem

### Error Message
```
[auth][error] CallbackRouteError: Read more at https://errors.authjs.dev#callbackrouteerror
[auth][cause]: Error: unauthorized_client
```

### Stack Trace
```
at AuthHandler (node_modules/next-auth/lib/index.js:42:15)
at async /app/api/auth/[...nextauth]/route.ts:1:1
```

### Expected Behavior
User should be redirected to Google login, authenticate, and return to the app.

### Actual Behavior
After clicking "Sign in with Google", immediately get unauthorized_client error.

---

## What We've Already Tried

### Attempt 1: Verify credentials
**What we did**: Double-checked GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local against Google Cloud Console
**Result**: Credentials match exactly
**Why it didn't work**: Issue persists

### Attempt 2: Check redirect URIs
**What we did**: Added http://localhost:3000/api/auth/callback/google to authorized redirect URIs in Google Console
**Result**: Still getting unauthorized_client
**Why it didn't work**: Redirect URI appears correct

### Attempt 3: Clear browser state
**What we did**: Cleared cookies, tried incognito window
**Result**: Same error
**Why it didn't work**: Not a caching issue

---

## Specific Questions

1. **Why does next-auth 5.0.0-beta.4 throw unauthorized_client when credentials are verified correct?**
   Context: This is a beta version, might have breaking changes

2. **Is there additional configuration needed for Google OAuth with Next.js 14 App Router?**
   Context: App Router is relatively new, patterns may differ

3. **What's the correct format for authorized redirect URIs in Google Console for next-auth v5?**
   Context: Current URI is http://localhost:3000/api/auth/callback/google

4. **Are there known issues with next-auth 5.0.0-beta.4 and the Google provider?**
   Context: Using beta version, may have bugs

---

## What I Need

[rest of template...]
```

---

## Rules

- **NO file writes** - This is output-only
- **MUST validate quality** before outputting
- **MUST include actual code** from the codebase
- **MUST be detailed** - 200+ lines minimum

---

## Related Commands

- `/agileflow:research:analyze` - Analyze existing research for implementation
- `/agileflow:research:import` - Import research results back
- `/agileflow:research:list` - Show research notes index
- `/agileflow:research:view` - Read specific research note
