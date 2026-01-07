---
description: Collect and process agent feedback
compact_context:
  priority: medium
  preserve_rules:
    - "SCOPE (story|epic|sprint) optional - default is story"
    - "STORY or EPIC may be REQUIRED depending on SCOPE"
    - "Feedback is OPTIONAL - never block workflow"
    - "Collect ratings (1-5 scale) and free-form comments"
    - "Save to docs/08-project/feedback/<YYYYMMDD>-<ID>.md"
    - "Analyze patterns across feedback for recurring issues"
    - "Generate improvement stories for recurring problems"
    - "Track metrics: clarity score, estimate accuracy, blocker frequency"
  state_fields:
    - scope
    - story_id
    - epic_id
    - anonymous_flag
---

# agent-feedback

STEP 0: ACTIVATE COMPACT SUMMARY MODE
Before reading the full command, execute this script to display the compact summary:
```bash
sed -n '/<!-- COMPACT_SUMMARY_START -->/,/<!-- COMPACT_SUMMARY_END -->/p' "$(dirname "$0")/feedback.md" | grep -v "COMPACT_SUMMARY"
```
If the user confirms they want the full details, continue. Otherwise, stop here.

Collect feedback from agents and humans for continuous process improvement.

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:agent-feedback IS ACTIVE

**CRITICAL**: You are collecting feedback for continuous improvement. Feedback is OPTIONAL - never force it.

**ROLE**: Feedback Collector & Retrospective Facilitator

---

### 🚨 RULE #1: FEEDBACK IS ALWAYS OPTIONAL

**NEVER require or force feedback collection.** Always ask: "Provide feedback now? (YES/NO/LATER)"

- YES: Collect feedback interactively
- NO: Skip, don't ask again for this story
- LATER: Add reminder to bus log, ask again at next trigger

Feedback should feel helpful, not burdensome.

---

### 🚨 RULE #2: SCOPE DETERMINES INPUTS

| SCOPE | Required Inputs | Example |
|-------|-----------------|---------|
| `story` | STORY=<US-ID> | Feedback on story completion |
| `epic` | EPIC=<EP-ID> | Retrospective on epic |
| `sprint` | None | Sprint retrospective |

Ask user if SCOPE not provided or required inputs missing.

---

### 🚨 RULE #3: FEEDBACK FORM SECTIONS

For each feedback type, use appropriate form:

**Story Feedback** (after story marked "done"):
- AC clarity (1-5)
- Dependencies resolved (1-5)
- Estimate accuracy (1-5)
- Implementation smoothness (1-5)
- What went well? (free-form)
- What could improve? (free-form)
- Blockers? (list)
- Learnings? (optional)

**Epic Retrospective** (after epic 100% complete):
- Success metrics (from epic definition)
- What went well? (bullets)
- What didn't go well? (bullets)
- Surprises/learnings? (bullets)
- Actions for next epic? (checklist)

**Sprint Retrospective** (sprint end):
- Continue (what to keep doing)
- Stop (what to stop doing)
- Start (new practices to try)
- Experiments (things to test next sprint)
- Blockers removed (what was unblocked)
- Recurring issues (what needs addressing)

---

### 🚨 RULE #4: SAVE FEEDBACK TO FILE

Always save to: `docs/08-project/feedback/<YYYYMMDD>-<ID>.md`

Example:
```markdown
## Story Feedback: US-0042

**Completed by**: agent-api
**Date**: 2025-12-22

### Ratings (1-5)
- AC clarity: 5
- Dependencies: 4
- Estimate accuracy: 5
- Smoothness: 4

### What Went Well
- Clear AC with examples
- All tests passed
- Good documentation

### Improvements
- Database migration took longer
```

---

### 🚨 RULE #5: ANALYZE PATTERNS & GENERATE INSIGHTS

After collecting feedback, scan for patterns:

**Pattern Detection:**
- 5+ stories with "unclear AC" → Improve story template
- 3+ stories blocked by missing tests → Enforce test stubs early
- Estimates off by 2x → Revise estimation guidelines

**Generate Improvement Stories:**
```
Issue: 5 stories had "unclear AC" (score <3)
Suggested Story: "US-XXXX: Improve story template with AC examples"
```

**Track Metrics:**
- Avg AC clarity (target: >4.0)
- Avg estimate accuracy (target: within 50%)
- Blocker frequency (target: <20%)

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Force feedback - make it optional
❌ Collect feedback but don't analyze it
❌ Ignore patterns - let issues repeat
❌ Use vague forms - make it specific
❌ Save feedback but don't show insights
❌ Create improvement stories without pattern data

### DO THESE INSTEAD

✅ Ask "Provide feedback? (YES/NO/LATER)"
✅ Use structured forms with 1-5 ratings
✅ Analyze patterns across feedback
✅ Suggest improvement stories for recurring issues
✅ Track metrics over time
✅ Show insights to user

---

### WORKFLOW

1. **Trigger Check**: Story done? Epic complete? Sprint end?
2. **Ask Permission**: "Provide feedback now? (YES/NO/LATER)"
3. **If YES**: Show feedback form with pre-filled context
4. **Collect**: Get ratings, comments, blockers
5. **Save**: To `docs/08-project/feedback/<YYYYMMDD>-<ID>.md`
6. **Analyze**: Scan for patterns and metrics
7. **Suggest**: Show insights and improvement stories
8. **Optional**: Create stories if user approves

---

### TOOL USAGE EXAMPLES

**TodoWrite** (to track feedback process):
```xml
<invoke name="TodoWrite">
<parameter name="content">1. Determine scope and required inputs
2. Ask for feedback (optional)
3. If YES: Show form with pre-filled context
4. Collect ratings and comments
5. Save to docs/08-project/feedback/
6. Analyze patterns
7. Suggest improvements</parameter>
<parameter name="status">in-progress</parameter>
</invoke>
```

**AskUserQuestion** (for feedback permission):
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Provide feedback on US-0042 completion?",
  "header": "Optional Feedback",
  "multiSelect": false,
  "options": [
    {"label": "Yes, provide feedback", "description": "Take 2-3 min to share insights"},
    {"label": "Not now", "description": "Skip feedback"},
    {"label": "Remind me later", "description": "Ask again next time"}
  ]
}]</parameter>
</invoke>
```

---

### REMEMBER AFTER COMPACTION

- `/agileflow:agent-feedback` IS ACTIVE
- Feedback is OPTIONAL - never force it
- SCOPE determines inputs (story/epic/sprint)
- Use 1-5 rating scales for consistency
- Save to docs/08-project/feedback/
- Analyze patterns and suggest improvements
- Track metrics: clarity, estimates, blockers

<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: Feedback Collector & Retrospective Facilitator

OBJECTIVE
Gather feedback on story completion, agent performance, and process effectiveness for continuous improvement.

INPUTS (optional)
- SCOPE=story|epic|sprint (default: story - feedback on single story)
- STORY=<US_ID> (required if SCOPE=story)
- EPIC=<EP_ID> (required if SCOPE=epic)
- ANONYMOUS=yes|no (default: no)

FEEDBACK TYPES

### 1. Story Completion Feedback
After marking story as "done", prompt for:
```markdown
## Story Feedback: <US_ID>

**Completed by**: <agent or human>
**Date**: <ISO timestamp>

### Definition of Ready (1-5 scale)
- Were acceptance criteria clear? (1=very unclear, 5=crystal clear): ___
- Were dependencies resolved? (1=many blockers, 5=no issues): ___
- Was estimate accurate? (1=way off, 5=spot on): ___

### Implementation Process (1-5 scale)
- How smooth was implementation? (1=many obstacles, 5=smooth): ___
- Were tests adequate? (1=missing, 5=comprehensive): ___
- Was documentation sufficient? (1=inadequate, 5=excellent): ___

### What Went Well? (2-3 bullets)
-
-
-

### What Could Be Improved? (2-3 bullets)
-
-
-

### Blockers Encountered? (if any)
-

### Learning/Insights? (optional)
-
```

### 2. Agent Performance Feedback
Track agent effectiveness:
```markdown
## Agent Feedback: <AGENT_ID>

**Time Period**: <start> to <end>
**Stories Completed**: X
**Stories Blocked**: Y
**Avg Completion Time**: Z days

### Strengths (observed patterns)
- Consistently writes thorough tests
- Updates status.json reliably
- Good at identifying edge cases

### Areas for Improvement
- Sometimes skips accessibility checks
- Could improve commit message clarity

### Recommendations
- Add accessibility checklist to workflow
- Review Conventional Commits guide
```

### 3. Epic Retrospective
After epic completion:
```markdown
## Epic Retrospective: <EP_ID>

**Completed**: <ISO timestamp>
**Duration**: X days (estimated: Y days)
**Stories**: X completed, Y blocked, Z punted

### Success Metrics (from epic definition)
- [ ] Goal 1: <status>
- [ ] Goal 2: <status>

### What Went Well?
-
-

### What Didn't Go Well?
-
-

### Surprises/Learnings?
-
-

### Actions for Next Epic
- [ ] Action 1
- [ ] Action 2
```

### 4. Sprint Retrospective
After sprint/iteration:
```markdown
## Sprint Retrospective: Sprint <N>

**Dates**: <start> to <end>
**Velocity**: X stories completed
**Team**: <list of agents/humans>

### Continue (keep doing)
-
-

### Stop (no longer useful)
-
-

### Start (new practices)
-
-

### Experiments (try next sprint)
-
-

### Blockers Removed This Sprint
-
-

### Recurring Issues (need addressing)
-
-
```

COLLECTION WORKFLOW

1. Auto-prompt at trigger points:
   - Story status → done
   - Epic 100% complete
   - Sprint end date reached

2. Present feedback form with pre-filled context

3. Ask: "Provide feedback now? (YES/NO/LATER)"
   - YES: Collect feedback interactively
   - NO: Skip (not required)
   - LATER: Add reminder to docs/09-agents/bus/log.jsonl

4. Save feedback to:
   - docs/08-project/feedback/<YYYYMMDD>-<US_ID or EP_ID>.md
   - Append summary to docs/08-project/retrospectives.md

ANALYSIS

### Patterns & Insights
Scan all feedback for patterns:
- Stories with "unclear AC" → Improve story template
- "Blocked by missing tests" → Enforce test stubs earlier
- "Estimate off by 2x" → Revise estimation guide

### Metrics Tracking
Track over time:
- Avg story clarity score (target: >4.0)
- Avg estimate accuracy (target: within 50%)
- Blocker frequency (target: <20% of stories)

### Agent Performance
Per agent:
- Completion rate
- Test coverage avg
- Status update reliability
- Feedback sentiment

ACTIONABLE OUTPUTS

### Improvement Stories
Auto-generate stories for recurring issues:
```
Issue: 5 stories in last sprint had "unclear AC" (score <3)
Suggested story: "US-XXXX: Improve story template with AC examples"

Issue: Estimates consistently off by 2x for API stories
Suggested ADR: "ADR-XXXX: Update estimation guidelines for backend work"
```

### Recognition
Celebrate wins:
```
🎉 AG-UI completed 8 stories this sprint with 100% test coverage!
🎉 AG-API reduced avg completion time from 2.1d to 1.6d
```

### Process Changes
Suggest concrete improvements:
```
Pattern detected: Stories with test stubs created upfront (by epic-planner)
have 40% fewer blockers.

Recommendation: Always create test stubs with /story-new.
```

RETROSPECTIVE REPORT
```markdown
# Retrospective Summary

**Period**: <start> to <end>
**Stories Reviewed**: X
**Epics Reviewed**: Y

---

## Overall Sentiment
📈 Improving: AC clarity (4.2 → 4.5)
📉 Declining: Estimate accuracy (85% → 78%)
➡️ Stable: Test coverage (avg 87%)

---

## Top Wins 🎉
1. Zero critical bugs this sprint
2. All security stories completed on time
3. Improved docs sync (100% of PRs had doc updates)

---

## Top Challenges ⚠️
1. Dependencies blocking 3 stories
2. Estimates off for DB migration work
3. Flaky E2E tests caused delays

---

## Actions for Next Iteration
- [ ] Review estimation guide for DB work (assign: EPIC-PLANNER)
- [ ] Fix flaky tests (assign: AG-CI, priority: high)
- [ ] Improve dependency tracking in story planning

---

## Insights & Learning
- Smaller stories (<1d) have 50% fewer blockers
- Pairing AG-UI and AG-API on complex features reduces handoff issues
- Weekly debt reviews prevent accumulation
```

INTEGRATION

### Story Creation
If feedback reveals issues, offer to create stories:
```
Feedback indicates: Test coverage inadequate for 3 stories

Create story? (YES/NO)
→ US-XXXX: Add missing tests for authentication flow
```

### ADR Creation
If architectural learnings emerge:
```
Learning: Microservices added complexity without clear benefit

Create ADR to document this? (YES/NO)
→ ADR-XXXX: Revert to modular monolith architecture
```

### Message Bus
Log feedback events:
```json
{"ts":"2025-10-16T10:00:00Z","type":"feedback","story":"US-0042","clarity":5,"smooth":4,"improved":"Add more examples in AC"}
```

AUTOMATION

Suggest periodic reminders:
```
# In docs/08-project/roadmap.md
- Every Friday: Sprint retrospective (if applicable)
- End of epic: Epic retrospective
- Monthly: Review all feedback for patterns
```

RULES
- Feedback is always optional (never block workflow)
- Keep feedback forms short (<5 min to complete)
- Focus on actionable insights, not blame
- Anonymize if requested
- Share retrospective summaries with team
- Celebrate wins before discussing challenges

OUTPUT
- Feedback form (interactive)
- Saved feedback (markdown)
- Optional: Retrospective summary
- Optional: Auto-generated improvement stories
