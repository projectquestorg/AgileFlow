# How AgileFlow Ensures Quality: 7 Reliability Layers

**Date**: 2026-03-02
**Context**: Competitive analysis response (GSD vs Paul plugin comparison)
**Status**: Active

---

## Summary

AgileFlow implements 7 independent reliability layers that work together to prevent context loss, ensure test coverage, and verify acceptance criteria. This document compares AgileFlow's approach against competitors claiming "near-zero context loss" and "mandatory UAT" patterns.

---

## The 7 Reliability Layers

### Layer 1: PreCompact Hook (Context Preservation)

**What it does**: Before Claude Code compacts conversation context, the PreCompact hook saves critical state (active command, current story, session variables) to `session-state.json`.

**Why it matters**: Context compaction is the #1 cause of AI "amnesia" in long sessions. Without this, the AI forgets what story it's working on mid-implementation.

**Files**: `scripts/precompact-context.sh`, `session-state.json`

**Competitor comparison**: Paul claims "near-zero context loss" through sequential processing. AgileFlow achieves this AND supports parallel processing via the PreCompact hook.

---

### Layer 2: SessionStart Hook (State Restoration)

**What it does**: On session start, `babysit-clear-restore.js` restores the active command, re-injects behavioral rules, and resumes work from where it left off. Works across context clears and session restarts.

**Why it matters**: Users can close and reopen Claude Code without losing their place. The babysit mentor picks up exactly where it left off.

**Files**: `scripts/babysit-clear-restore.js`, `scripts/agileflow-welcome.js`

**Competitor comparison**: Paul serializes task state. AgileFlow serializes command state, behavioral rules, AND session context (5 layers deep).

---

### Layer 3: Smart Detection (Contextual Feature Router)

**What it does**: 43 signal detectors analyze project state and recommend the right action for the current phase. The `ac-verify` detector triggers when tests pass but acceptance criteria haven't been verified.

**Why it matters**: Instead of relying on users to remember verification steps, the system proactively suggests them based on project signals.

**Files**: `scripts/lib/signal-detectors.js`, `scripts/lib/smart-detect.js`

**Detectors by phase**:
- **Pre-story**: story-validate, blockers, choose, assign, board, sprint, batch
- **Planning**: impact, adr, research, baseline, council
- **Implementation**: verify, tests, audit, ci, diagnose
- **Post-impl**: ac-verify, review, logic-audit, docs, changelog
- **Pre-PR**: pr, compress

---

### Layer 4: VERIFY Mode (Graduated AC Enforcement)

**What it does**: The VERIFY parameter on babysit provides 4 enforcement levels for acceptance criteria verification:

| Level | Behavior | Use Case |
|-------|----------|----------|
| `suggest` | AC verification available but not prompted | Exploratory work |
| `recommend` (default) | Show AC summary after tests pass, (Recommended) framing | Normal development |
| `require` | Auto-run ac-test-matcher, show AC checklist, gate commit | Team/production |
| `block` | All of require + browser QA for UI stories | Critical/regulated |

**Why it matters**: This is the gap Paul exploited. His "mandatory UAT" is rigid (always on). AgileFlow's graduated approach lets teams choose their enforcement level. `STRICT=true` implies `VERIFY=require`.

**Files**: `src/core/commands/babysit.md`, `scripts/lib/ac-test-matcher.js`

**Competitor comparison**: Paul has binary mandatory UAT. GSD has no UAT enforcement. AgileFlow has 4-level graduated enforcement with automated AC-to-test matching.

---

### Layer 5: AC-to-Test Matcher (Automated Verification)

**What it does**: Keyword-based matcher that scans test files for overlap with acceptance criteria text. Returns confidence levels (high/medium/low) so auto-verified AC don't need manual confirmation.

**Why it matters**: Reduces manual verification from "check all 5 AC" to "check the 1-2 tests don't cover." Deterministic, free, and fast (no LLM calls needed).

**How it works**:
1. Extract keywords from AC text (filtering stop words)
2. Scan all test files for keyword presence
3. Calculate overlap ratio per test file
4. High (60%+) = auto-verified, Medium (30%+) = likely-covered, Low = unmatched
5. Write structured `ac_status` to status.json for audit trail

**Files**: `scripts/lib/ac-test-matcher.js`

**Competitor comparison**: Neither Paul nor GSD have automated AC-to-test mapping. This is unique to AgileFlow.

---

### Layer 6: Discretion Conditions (Loop Integration)

**What it does**: Ralph-loop (autonomous story processing) evaluates configurable conditions before marking stories complete. Two AC-related conditions:

- `all acceptance criteria verified`: Checks `ac_status` in status.json (supports verified, auto-verified, likely-covered)
- `ac test coverage sufficient`: Runs ac-test-matcher and checks coverage against threshold

**Why it matters**: In autonomous mode, stories can't silently complete without AC verification. The loop enforces quality even without human oversight.

**Files**: `scripts/ralph-loop.js`

**Competitor comparison**: Paul's sequential approach prevents this entirely (no autonomous processing). GSD's loop has no AC verification. AgileFlow combines autonomous speed with AC enforcement.

---

### Layer 7: STRICT Mode (Full Gate Enforcement)

**What it does**: When `STRICT=true`, workflow gates are enforced rather than suggested:

| Gate | Non-Strict | Strict |
|------|-----------|--------|
| Tests before commit | Suggested | Required (commit hidden until pass) |
| AC verification | Suggested/Recommended | Required (VERIFY=require implied) |
| Code review (5+ files) | Suggested | Required (commit blocked until done) |
| Skip options | Available | Removed from choices |

**Why it matters**: Teams that need production-grade quality can enforce it. Teams doing exploratory work can stay flexible.

**Files**: `src/core/commands/babysit.md`

**Competitor comparison**: Paul is always strict (mandatory UAT, mandatory close-out). GSD is always relaxed. AgileFlow lets you choose per-session.

---

## Comparison Matrix

| Capability | AgileFlow | Paul | GSD |
|---|---|---|---|
| Context preservation | 5 layers (PreCompact + SessionStart + state serialization + hook restoration + CLAUDE.md rules) | Sequential processing (single layer) | No specific mechanism |
| AC verification | 4-level graduated (suggest/recommend/require/block) | Binary mandatory | Not available |
| AC-to-test mapping | Automated keyword matcher | Not available | Not available |
| Autonomous processing | Supported (ralph-loop with AC conditions) | Not supported (sequential only) | Supported (no AC checks) |
| Quality enforcement | Configurable (STRICT + VERIFY) | Always mandatory | Always optional |
| Processing model | Both sequential (babysit) and parallel (teams) | Sequential only | Parallel only |
| State validation | 7 independent layers | State serialization | Session state only |
| Command count | 139+ commands, 55+ agents | Single plugin | Single plugin |
| Open source | Yes (npm: agileflow) | Closed | Closed |

---

## When to Use Each VERIFY Level

| Scenario | Recommended Level |
|---|---|
| Prototyping / spike / research | `suggest` |
| Solo developer, familiar codebase | `recommend` (default) |
| Team project, shared codebase | `require` |
| Production release, regulated industry | `block` |
| Using STRICT mode | `require` (auto-implied) |
| TDD workflow | `recommend` (TDD phases handle quality) |

---

## Architecture Decision

See [ADR-0012: Inline Verification Checkpoints](../03-decisions/adr-0012-inline-verification-checkpoints.md) for the full architectural decision record including alternatives considered and trade-offs.

---

## Related Files

| File | Purpose |
|---|---|
| `scripts/lib/ac-test-matcher.js` | Core AC-to-test keyword matching engine |
| `src/core/commands/babysit.md` | VERIFY parameter and graduated enforcement |
| `src/core/commands/audit.md` | AC matcher integration for story audits |
| `src/core/commands/verify.md` | AC coverage report in test verification |
| `scripts/lib/signal-detectors.js` | ac-verify post-impl signal detector |
| `scripts/ralph-loop.js` | AC discretion conditions for autonomous loop |
| `docs/03-decisions/adr-0012-inline-verification-checkpoints.md` | ADR |
