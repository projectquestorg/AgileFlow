# Self-Improving Skills in Claude Code

**Import Date**: 2026-01-06
**Topic**: Self-Improving Skills in Claude Code
**Source**: YouTube video transcript (IndyDevDan)
**Content Type**: Video transcript

---

## Summary

This research covers how to set up self-improving skills within Claude Code that learn from user corrections and persist that knowledge across sessions. The core problem addressed is that LLMs don't retain memory between conversations - every session starts from zero, leading to repeated mistakes and frustrations around naming conventions, input validation, button styles, and other project-specific patterns.

The solution uses a "reflect" skill that analyzes sessions, extracts corrections/approvals, categorizes them by confidence level (high/medium/low), and updates skill files. These skills are stored as markdown files that can be version-controlled in Git, allowing visibility into how the system learns over time.

Two modes are available: manual (run `/reflect` command after corrections) and automatic (bind reflect to the stop hook for end-of-session learning). The approach avoids complexity of embeddings and vector databases - everything lives in readable markdown files.

---

## Key Findings

- **Problem**: LLMs have no memory between sessions. Corrections in Session 1 are forgotten in Session 2, leading to perpetual repetition of the same mistakes
- **Solution**: Reflex skill system that analyzes conversation, extracts corrections, and updates skill files
- **Manual Flow**: Call `/reflect` command after making corrections; Claude analyzes conversation and proposes skill updates
- **Automatic Flow**: Bind reflect script to the stop hook; runs automatically when session ends
- **Confidence Levels**: High (explicit "never do X" corrections), Medium (patterns that worked well), Low (observations to review later)
- **Version Control**: Skills stored in Git allow tracking how the system learns over time and rollback if needed
- **Toggle System**: Can turn reflect on/off and check status with `reflect on`, `reflect off`, `reflect status`
- **No Embeddings Required**: Everything stored in plain markdown files, readable with natural language
- **Signal Types**: Both corrections AND approvals are captured as learning signals
- **Review Process**: Shows detected signals, proposed changes, and commit message before applying

---

## Implementation Approach

1. Create a `reflect` skill file (markdown) that defines the reflection behavior
2. Set up a `/reflect` slash command that invokes the skill
3. Optionally create a stop hook script that triggers reflect automatically
4. Version control all skill files in Git for history and rollback
5. After corrections in a session, run reflect to extract and persist learnings
6. Review proposed changes (high/medium/low confidence) before accepting
7. Changes are committed to Git with descriptive commit messages

---

## Code Snippets

### Stop Hook Configuration (Conceptual)

```json
{
  "hooks": {
    "stop": {
      "command": "bash scripts/reflect.sh",
      "description": "Reflect on session and update skills"
    }
  }
}
```

### Toggle Commands

```bash
# Turn on automatic reflection
reflect on

# Turn off automatic reflection
reflect off

# Check current status
reflect status
```

---

## Action Items

- [ ] Create a `reflect.md` skill file that analyzes conversations for corrections
- [ ] Create `/reflect` slash command to invoke the skill manually
- [ ] Create `reflect.sh` shell script for stop hook integration
- [ ] Add toggle mechanism (on/off/status) for automatic reflection
- [ ] Set up Git repository for versioning skill files
- [ ] Define confidence level categories and extraction logic
- [ ] Create review/approval UI flow before applying changes
- [ ] Test with real correction scenarios (button styles, naming conventions, etc.)

---

## Risks & Gotchas

- **Automatic mode requires high confidence**: Only enable auto-reflect when you trust the mechanism
- **Review before applying**: Always verify proposed changes before accepting
- **Git integration optional**: Can use reflect without version control, but lose history benefits
- **Skill scope matters**: Can reflect on specific skills by passing skill name, or all used skills in session

---

## Story Suggestions

### Potential Epic: Self-Improving Skills System

**US-XXXX**: Create reflect skill for session analysis
- AC: Skill analyzes conversation for corrections and approvals
- AC: Extracts signals with confidence levels (high/medium/low)
- AC: Proposes changes to relevant skill files

**US-XXXX**: Add /reflect slash command
- AC: Command invokes reflect skill with conversation context
- AC: Shows review UI with signals, proposed changes, commit message
- AC: Allows natural language modifications before accepting

**US-XXXX**: Implement stop hook for automatic reflection
- AC: Shell script triggers reflect on session end
- AC: Toggle commands (on/off/status) control behavior
- AC: Silent notification shows which skills were updated

**US-XXXX**: Version control integration for skills
- AC: Skills directory tracked in Git
- AC: Changes committed with descriptive messages
- AC: History shows how skills evolve over time

---

## Raw Content Reference

<details>
<summary>Original content (click to expand)</summary>

[00:00:00] In this video, I'm going to be showing you how to set up self-improving skills within cloud code. Now, one of the issues with LLMs right now is they don't actually learn from us. Just to run through an example of this, let's say you're working on a web application. There might be a mistake that the coding harness or the model that you're using makes within the first iteration of what it's trying to do. Let's say you want to add a new feature and then it has a button as a part of that feature. Just a simple but relatively common mistake could be that an LLM doesn't actually know the particular button that you might want to leverage...

</details>

---

## References

- Source: YouTube video transcript (IndyDevDan)
- Import date: 2026-01-06
- Related: [Agent Experts: Self-Improving Agents](./20251216-agent-experts-self-improving-agents.md), [AI Agent Skills - Reusable Workflows](./20251227-ai-agent-skills-reusable-workflows.md)
