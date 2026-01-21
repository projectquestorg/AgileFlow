# Claude Code Parallel Sessions

**Import Date**: 2026-01-21
**Topic**: Claude Code Parallel Sessions
**Source**: YouTube video transcript (direct import)
**Content Type**: transcript

---

## Summary

This video challenges the hype around running dozens or hundreds of Claude Code terminal sessions in parallel. The presenter argues that simply adding more terminals doesn't linearly increase productivity - many parallel sessions end up asking basic questions, colliding with each other, or building brittle features.

The core insight is that you need to understand WHEN parallel execution makes sense vs. when it creates chaos. The video presents three mental models for parallel work: True Parallel (independent non-technical tasks), Phased Parallel (foundation first, then parallel auxiliary tasks), and Relay Race (sequential handoffs between sessions).

Key to success is understanding task dependencies, using plan.md files with checkboxes to track progress across sessions, maintaining a "virgin" planning session to verify phase completion, and keeping each session focused on a single phase to avoid context pollution from auto-compaction.

---

## Key Findings

### The Fantasy vs. Reality
- Screenshots showing 50-100 terminals are misleading - many are doing trivial work or colliding with each other
- Adding 8 terminals doesn't make you 8x faster, just like adding developers doesn't halve development time
- Each task set has nuance about whether it's even eligible for parallel execution

### Three Scenarios for Parallel Execution

**Scenario 1: True Parallel (Independent Tasks)**
- Best for non-technical tasks that don't depend on each other
- Examples: research competitors, draft emails, find influencers, create lead magnets
- Requirements: know what you're doing, know the intermediary steps, have proper prompts that don't need babysitting
- Can safely run 5-15 terminals without collision

**Scenario 2: Phased Parallel (Foundation + Auxiliary)**
- Build foundation first (e.g., database schema), then parallelize dependent features
- Example: Database → Auth + Dashboard + Admin Panel (parallel)
- Ask Claude Code to identify which features can be built independently
- Can request meta-prompts for what to tell new sessions

**Scenario 3: Relay Race (Sequential Handoffs)**
- Tasks in phases where each depends on prior phase output
- Avoids clogging single terminal with overlapping context
- Mark end of each phase as end of that session
- Each session is mutually exclusive in context

### The Plan.md Pattern
- Document entire plan with checkboxes for each task
- Store in CLAUDE.md the instruction to check off completed items
- Include big picture overview for context in stateless sessions
- Keep a separate decisions log for deviations from plan

### The Bonus Session Technique
- Keep one terminal dedicated ONLY to the plan
- Use it to verify phase completion by checking the codebase
- Maintains "virgin" context not polluted by implementation work
- Acts as quality control across all other sessions

### Auto-Compaction Warning
- Every compact loses information you don't control
- Running sessions with disadvantage after compaction
- Solution: end session at phase completion, not mid-build

---

## Implementation Approach

1. **Create comprehensive plan.md** with overview, phases, and checkbox tasks
2. **Map dependencies** to identify what must be sequential vs. parallel
3. **Ask Claude Code** to analyze remaining tasks for parallelization eligibility
4. **Request meta-prompts** for parallel session instructions
5. **Keep planning session open** throughout execution for verification
6. **Check off tasks** as completed in plan.md
7. **Log decisions** that deviate from original plan
8. **End sessions at phase boundaries** to maintain clean context

---

## Code Snippets

### Example Prompts for True Parallel (Scenario 1)

**Terminal 1:**
```
Research the top 10 AI course competitors. List their pricing, unique angles, and targeted audience. Output to research/competitors.md
```

**Terminal 2:**
```
Draft a 5 email welcome sequence for new subscribers to my AI newsletter. Save to welcomes.md
```

**Terminal 3:**
```
Find 20 tech influencers on YouTube with 100-100k subscribers who review online courses.
```

**Terminal 4:**
```
Write landing page copy with headline, sub-headline, three bullet points, SEO optimized.
```

### Example Prompts for Phased Parallel (Scenario 2)

**Phase 1 - Foundation:**
```
Set up database schema for client portal. Create tables for users, projects, files, and invoices. [Specify: SQLite/Supabase/Convex/AWS]
```

**Phase 2 - Parallel (after foundation):**

Terminal A:
```
Build the authentication system with login, signup, and password reset. Use the database schema from [path].
```

Terminal B:
```
Build the user dashboard showing project list and status. Auth and database already set up.
```

Terminal C:
```
Build the admin panel for client management. Auth and database already set up.
```

### Example Prompt for Relay Race (Scenario 3)

```
Read plan.md, execute Phase 1 (database and auth), check off tasks when done, and add any architecture decisions to the decision log.
```

---

## Action Items

- [ ] Create plan.md template with overview section, phased tasks, and checkboxes
- [ ] Develop dependency mapping technique to identify parallelization eligibility
- [ ] Build decision log template for tracking deviations
- [ ] Practice identifying true parallel vs. phased parallel scenarios
- [ ] Implement "bonus session" pattern for plan verification

---

## Risks & Gotchas

- **Context pollution**: Running too much in one session leads to auto-compaction information loss
- **False independence**: Tasks that seem independent may have subtle dependencies
- **Beginner trap**: Without GitHub issues or sophisticated plans, parallel sessions lose context
- **Overestimation**: What looks like one phase may require multiple full sessions
- **Brittle features**: Parallel-built features may break when integrated

---

## Story Suggestions

### Potential Epic: Parallel Session Workflow Support

**US-XXXX**: Plan.md Template Generator
- AC: Command generates plan.md with overview, phases, checkboxes
- AC: Includes dependency mapping section

**US-XXXX**: Parallelization Eligibility Analyzer
- AC: Given a plan, identifies which tasks can run in parallel
- AC: Outputs meta-prompts for each parallel session

**US-XXXX**: Phase Completion Verifier
- AC: Checks codebase against plan.md checkboxes
- AC: Reports incomplete items from a phase

---

## Raw Content Reference

<details>
<summary>Original content (click to expand)</summary>

[00:00:00] If you've been building with cloud code, then at some point you must have seen screenshots or videos just like these on LinkedIn or X. Someone flexing that they have five, 10, 50, hundreds of Claude code terminal sessions running at the exact same time. But here's what they don't show you. When you zoom in on those terminals, you'll see that a bunch of them are asking very basic questions that can be answered in under 30 seconds. And what about the ones that are apparently doing the real work? Well, many of those sessions have agents colliding with each other, stepping on each other's toes, and most importantly, building features that are so brittle that they'll break the moment that they're touched...

[Content truncated at 1000 chars for reference]

</details>

---

## References

- Source: YouTube video transcript (direct import)
- Import date: 2026-01-21
- Related: [Thread-Based Engineering](./20260113-thread-based-engineering-agentic-workflows.md), [Context Engineering](./20260109-context-engineering-principles.md), [GSD Workflow](./20260119-gsd-claude-code-workflow-system.md)
