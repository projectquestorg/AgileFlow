# Council Session: ULTRADEEP Mode for Audit Commands

**Question**: Should AgileFlow add an ULTRADEEP audit mode that spawns each analyzer as a separate Claude Code session in its own tmux window, giving each analyzer a full 200K context window, Sonnet/Opus capability, and unlimited turns?

**Date**: 2026-02-27

---

## Optimist Perspective

### Key Opportunities

1. **The Context Window Constraint is the Real Bottleneck** - ULTRADEEP removes the single most meaningful limitation of the current system.
   - Evidence: The current audit system uses `model: haiku` in every analyzer (verified in `/home/coder/AgileFlow/packages/cli/src/core/agents/logic-analyzer-edge.md` line 6). Haiku subagents share context within a single session - in a large codebase like this one (1500+ files, 294 stories), a logic audit against the full source tree means each analyzer is working with a compressed slice of the total picture. ULTRADEEP gives each analyzer 200K tokens of headroom to read deeply into inter-file dependencies, trace call stacks across modules, and follow leads across the entire codebase without hitting the shared-context ceiling.

2. **The Infrastructure Already Exists - This Is Assembly, Not Construction** - AgileFlow already has every primitive needed to build ULTRADEEP. The implementation risk is far lower than it appears.
   - Evidence: `spawn-parallel.js` at `/home/coder/AgileFlow/packages/cli/scripts/spawn-parallel.js` already implements the complete tmux session lifecycle: `spawnInTmux()` (line 116), `buildClaudeCommand()` with `--dangerously-skip-permissions` and `--claude-args` passthrough (line 68), per-window flag inheritance (line 94), and even a `--prompt` parameter for injecting initial analyzer instructions (line 104). The messaging bridge at `/home/coder/AgileFlow/packages/cli/scripts/messaging-bridge.js` provides the inter-agent file bus. The audit commands already define a shared-file coordination pattern in their consensus steps (e.g., `logic.md` lines 175-233). ULTRADEEP requires wiring these together, not inventing new primitives.

3. **Sonnet/Opus on Each Analyzer Produces Qualitatively Different Findings** - Upgrading model tier is not incremental improvement; it crosses a capability threshold.
   - Evidence: The existing logic-consensus coordinator already runs on `model: sonnet` (verified in `/home/coder/AgileFlow/packages/cli/src/core/agents/logic-consensus.md` line 6), which is the synthesis step. The analyzers themselves are on Haiku. This asymmetry means the consensus coordinator can only synthesize what the Haiku analyzers surface - and Haiku analyzers will miss subtle multi-file race conditions, deep invariant violations, and cross-module type coercions that Sonnet or Opus would catch. ULTRADEEP corrects this asymmetry by running analyzers on Sonnet/Opus. The output quality difference is not 20% - it is the difference between scanning for surface patterns and reasoning about program semantics.

4. **The Consensus Cross-Validation Signal Gets Stronger** - More capable analyzers produce fewer false positives and better-evidenced findings, making consensus votes more meaningful.
   - Evidence: The consensus logic across all audit types (logic-consensus.md lines 56-66, security-consensus.md lines 73-84) uses a voting model: CONFIRMED = 2+ analyzers agree, LIKELY = 1 with strong evidence. With Haiku analyzers, a finding from a single analyzer is lower-signal because Haiku is more likely to flag circumstantial patterns. With Sonnet/Opus analyzers, a single-analyzer LIKELY finding is substantially higher quality evidence. ULTRADEEP effectively recalibrates the confidence scoring to be more trustworthy.

5. **ULTRADEEP Unlocks a New Product Category: Pre-Release Security Gates** - The quality ceiling shifts high enough that ULTRADEEP audit output becomes defensible in professional security contexts.
   - Evidence: The security-consensus agent already maps findings to OWASP Top 10 2021 and CWE numbers (security-consensus.md lines 111-234). It already generates structured remediation checklists. ULTRADEEP raises the finding quality high enough that this output could plausibly be included in compliance artifacts, pentest readiness reviews, and audit trails - a category of use that quick/deep cannot credibly target. This is new market positioning, not just a feature increment.

6. **ULTRADEEP Validates AgileFlow's Core Thesis at Enterprise Scale** - Running 8 full-context Sonnet sessions in parallel on a 1500-file codebase demonstrates that AgileFlow's multi-agent orchestration works at the scale that matters to enterprise buyers.
   - Evidence: The session-state.json scale detection already classifies this project as `"scale": "large"` with 414 files and 1078 commits (`/home/coder/AgileFlow/packages/cli/docs/09-agents/session-state.json` line 46-53). Enterprise prospects evaluating AI development tooling will ask "does this work on our actual codebase?" ULTRADEEP answers that question affirmatively in a way that a shared-context subagent cannot.

---

### Success Pathway

- **Phase 1 - Minimal Viable ULTRADEEP (2-3 days)**: Add `DEPTH=ultradeep` as a recognized argument in the existing audit commands (e.g., `code/logic.md`). When ultradeep is selected, instead of deploying Task subagents, call `spawn-parallel.js` with a crafted `--prompt` for each analyzer. Each analyzer writes its findings to a well-known shared file path (e.g., `.agileflow/audit/{session-id}/{analyzer-name}.md`). Parent session polls for completion using a simple file-existence check with a configurable timeout. Consensus runs in the parent session or as a final tmux window. Model selection defaults to Sonnet but is configurable.

- **Phase 2 - Progress Visibility and Cost Guard (1-2 days)**: Add a live status display showing which analyzer windows have completed (checking for their output file). Add an estimated cost warning before launch: "This will spawn 8 Sonnet sessions. Estimated cost: $X-$Y. Proceed? [Y/n]". The tmux session grouping under `audit-{type}-{timestamp}` gives the user a natural dashboard they can attach to and observe in real time.

- **Phase 3 - Cross-Audit Composition (future)**: Once ULTRADEEP exists for individual audit types, introduce a `DEPTH=ultradeep` flag for a combined multi-audit run: security + logic + performance in one invocation, with a unified cross-domain consensus report. The team-events infrastructure at `/home/coder/AgileFlow/packages/cli/scripts/lib/team-events.js` already tracks task lifecycle events that could feed a unified audit dashboard.

---

### Enablers (What Supports Success)

- **`spawn-parallel.js` tmux session management** (`/home/coder/AgileFlow/packages/cli/scripts/spawn-parallel.js`): Already implements `spawnInTmux()`, per-window command execution with prompt injection, flag inheritance, and kill-all cleanup. ULTRADEEP needs to call this with analyzer-specific prompts rather than story-specific prompts. The `--prompt` parameter (line 104) is exactly the hook needed.

- **Existing analyzer agent definitions with clear output formats**: All analyzers (`logic-analyzer-edge.md`, `security-analyzer-injection.md`, etc.) define a structured `FINDING-N` output format. This means file-based coordination is immediately viable - the consensus agent can read structured markdown files just as reliably as it reads subagent task output. No new serialization format is needed.

- **The messaging-bridge.js JSONL bus** (`/home/coder/AgileFlow/packages/cli/scripts/messaging-bridge.js`): Already provides inter-agent coordination through a shared log file. ULTRADEEP analyzers can optionally write completion signals to this bus, giving the parent session a clean polling mechanism beyond simple file-existence checks.

- **`tmux_available: true` confirmed in session-state**: The session-state.json already records `"tmux_available": true` for this environment, meaning the tmux dependency is already present. The infrastructure assumption is validated by the existing setup.

- **The consensus coordinator's file-reading capability**: The logic-consensus and security-consensus agents use `tools: Read, Write, Edit, Glob, Grep` (verified in frontmatter). They are designed to read files and synthesize. Switching from subagent TaskOutput to reading files from a shared directory requires no change to the consensus agent instructions - it already reads files as its primary mode of operation.

- **Team-events observability** (`/home/coder/AgileFlow/packages/cli/scripts/lib/team-events.js`): ULTRADEEP sessions can emit `task_completed` events to the existing metrics system as each analyzer window finishes. This plugs ULTRADEEP into AgileFlow's existing observability infrastructure at zero additional cost.

---

### Addressing Concerns

- **Concern**: Cost is prohibitive - 8 Sonnet sessions per audit is expensive.
  **Resolution**: ULTRADEEP is an explicit user opt-in requiring `DEPTH=ultradeep`. Users run it before major releases, on security-sensitive modules, or when quick/deep have already caught the obvious issues and they need deeper confidence. The cost is also not unbounded: a pre-launch cost estimate dialog (as described in Phase 2) lets users make an informed choice. The cost comparison should also be framed correctly - ULTRADEEP replaces a human security reviewer for a specific audit scope, not a free quick scan. For teams paying $200-500/hour for manual security review, ULTRADEEP at $10-30 of API cost is favorable ROI.

- **Concern**: Coordination complexity - polling for file completion is fragile and prone to hangs.
  **Resolution**: The pattern is well-established in the codebase already. The existing messaging-bridge.js provides a reliable shared bus. File-based completion signaling is provably simpler than distributed consensus - each analyzer writes a sentinel file (e.g., `edge.done`) when complete. The parent polls with a configurable timeout (default 10 minutes) and proceeds to consensus with whatever results exist, noting any missing analyzers as "timed out." This graceful degradation is already the pattern in the current `deep` mode when subagents fail.

- **Concern**: Are Haiku subagents already good enough? Is this solving a real problem?
  **Resolution**: The best evidence is the consensus coordinator itself - it already runs on Sonnet rather than Haiku because the AgileFlow team recognized that synthesis requires stronger reasoning. The same logic applies to analysis. Haiku is good enough for surface-level pattern matching; Sonnet and Opus are needed for cross-file reasoning, subtle invariant analysis, and finding the kind of vulnerabilities that require following a data flow across 5+ files. The question is not whether Haiku is good enough for simple files - it is whether Haiku is good enough for the files that matter most: the complex, high-consequence modules where ULTRADEEP would be invoked.

- **Concern**: 8 concurrent sessions may overwhelm the user's Anthropic API rate limits.
  **Resolution**: `spawn-parallel.js` already supports staged spawning and the `--count` parameter allows limiting parallelism. ULTRADEEP can expose a `CONCURRENCY=N` parameter (default: all analyzers in parallel, min: 1 for sequential). Users on lower rate limit tiers can run with `CONCURRENCY=2` to stagger launches. This is the same tradeoff users already make with `spawn-parallel.js` for story parallelization.

---

### Confidence Level

**High** - The core claim is that full-context, higher-model-tier analysis produces qualitatively better audit findings. This is well-supported by how the system is already designed (the consensus agent already uses Sonnet for exactly this reason). The implementation risk is low because all required infrastructure already exists in the codebase. The main unknowns are user adoption patterns and API cost sensitivity, both of which can be managed through opt-in design and cost estimation tooling. The opportunity - a credibly enterprise-grade audit capability that differentiates AgileFlow from single-agent tools - is both real and currently untapped.
