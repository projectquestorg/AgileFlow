---
plan_id: {{PLAN_ID}}
epic: {{EPIC_ID}}
title: {{TITLE}}
created: {{CREATED}}
---

# {{TITLE}}

## Overview

{{GOAL}}

---

## Phase 1: Foundation (Sequential)

<!-- Stories that must complete before parallel work can begin -->
<!-- These have no dependencies or are prerequisites for everything else -->

- [ ] {{STORY_ID}}: {{STORY_TITLE}}
- [ ] {{STORY_ID}}: {{STORY_TITLE}}

---

## Phase 2: Features (Parallel-eligible)

<!-- Stories that can run in parallel sessions -->
<!-- All depend only on Phase 1 completion -->

- [ ] {{STORY_ID}}: {{STORY_TITLE}} (Session A)
- [ ] {{STORY_ID}}: {{STORY_TITLE}} (Session B)
- [ ] {{STORY_ID}}: {{STORY_TITLE}} (Session C)

---

## Phase 3: Integration (Sequential)

<!-- Stories that depend on Phase 2 completion -->
<!-- Must wait for parallel work to merge -->

- [ ] {{STORY_ID}}: {{STORY_TITLE}}

---

## Deviations Log

<!-- Track decisions that differ from original plan -->
<!-- Important: Keep this updated so next sessions have context -->

| Date | Phase | Original | Changed To | Reason |
|------|-------|----------|------------|--------|
| | | | | |

---

## Session Prompts

<!-- Copy-paste prompts for new parallel sessions -->
<!-- Customize based on specific stories in Phase 2 -->

### Session A prompt:
```
Read plan.md in the project root.
Execute Phase 2 Task A: [TASK DESCRIPTION].
Phase 1 is complete - foundation is in place.
Check off tasks in plan.md when done.
Log any deviations to the Deviations Log section.
Run tests before marking complete.
```

### Session B prompt:
```
Read plan.md in the project root.
Execute Phase 2 Task B: [TASK DESCRIPTION].
Phase 1 is complete - foundation is in place.
Check off tasks in plan.md when done.
Log any deviations to the Deviations Log section.
Run tests before marking complete.
```

### Session C prompt:
```
Read plan.md in the project root.
Execute Phase 2 Task C: [TASK DESCRIPTION].
Phase 1 is complete - foundation is in place.
Check off tasks in plan.md when done.
Log any deviations to the Deviations Log section.
Run tests before marking complete.
```

---

## Verification Session

<!-- Keep one terminal dedicated to plan verification -->
<!-- After each phase, run these checks -->

### Phase completion checks:
```
After Phase 1:
- [ ] All Phase 1 checkboxes checked
- [ ] Tests passing
- [ ] No uncommitted changes
- [ ] Ready to spawn parallel sessions

After Phase 2:
- [ ] All Phase 2 checkboxes checked
- [ ] All parallel branches merged
- [ ] No merge conflicts
- [ ] Integration tests passing

After Phase 3:
- [ ] All Phase 3 checkboxes checked
- [ ] Final tests passing
- [ ] Ready for review/deploy
```

---

## Notes

<!-- Additional context, risks, or decisions -->
<!-- Reference ADRs if architectural decisions were made -->

