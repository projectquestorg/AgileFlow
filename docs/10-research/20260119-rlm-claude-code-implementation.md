# RLM Implementation with Claude Code Primitives

**Import Date**: 2026-01-19
**Topic**: Recursive Language Models - Claude Code Implementation
**Source**: YouTube video transcript (implementation demo)
**Content Type**: Video transcript / Tutorial

---

## Summary

This research documents a practical implementation of Recursive Language Models (RLMs) using Claude Code's native primitives. The presenter demonstrates that Claude Code already has all the building blocks needed to implement the RLM pattern described in the research paper - specifically the sub-agent capability for recursive calls and the Python execution environment for the REPL loop.

The key insight is that instead of processing large documents (400k+ characters) in a single LLM call (which causes "context rot"), the implementation virtualizes the document as a Python object and uses programmatic operations (regex, slicing, pattern matching) to locate relevant sections. A smaller model (Haiku) runs the REPL loop over the virtualized memory, enabling efficient search without the full context overhead.

The demo uses a real-world test case: analyzing a complex merger agreement (NVIDIA-ARM share purchase agreement) to answer legal questions like "What are the conditions precedent to closing for each party?" - demonstrating the pattern works on high-complexity, high-length documents.

---

## Key Findings

- **Claude Code has all RLM primitives built-in**: Sub-agent capability = recursive LLM calls, Bash/Python execution = REPL loop environment
- **Main Claude instance acts as "root LLM call"**: Orchestrates the workflow, delegates to sub-agents
- **Sub-agent runs on Haiku (smaller model)**: Only does search operations over virtualized memory - doesn't need full reasoning capability
- **Memory virtualization via Python pickle**: Document is loaded into a Python object (~429k chars in demo), not fed directly to LLM
- **Programmatic context processing**: Instead of semantic search (RAG), uses Python string operations, regex, slicing to locate sections
- **More sophisticated than RAG**: Flexible pattern matching vs rigid similarity search
- **CLAUDE.md as "executive file"**: Keep instructions high-level and abstract - Claude handles delegation
- **Minimal setup required**: Just clone the repo and have Claude Code installed

---

## Implementation Architecture

### File Structure

```
project/
├── CLAUDE.md              # High-level executive instructions
├── .claude/
│   ├── commands/
│   │   └── rlm/           # RLM skill/command
│   │       └── skill.md   # Procedural instructions for REPL
│   └── agents/
│       └── rlm-subcore.md # Sub-agent config (Haiku model)
└── scripts/
    └── ripple.py          # REPL loop (~400 lines Python)
```

### Key Components

1. **CLAUDE.md (Executive Layer)**
   - Very concise, high-level instructions
   - Awareness of available skills and agents
   - Tells Claude how to delegate
   - "Think of it like briefing an executive - high-level tasks, not details"

2. **rlm-subcore.md (Sub-Agent)**
   - Runs on Claude Haiku (smaller, cheaper model)
   - Only does search over virtualized memory
   - No heavy reasoning - just locating and extracting

3. **ripple.py (REPL Script)**
   - ~400 lines of Python
   - Read-Evaluate-Print-Loop for context processing
   - Pattern matching, regex, slicing operations
   - Virtualizes document as Python object

4. **skill.md (Procedural)**
   - Instructions for sub-agent to run the REPL
   - Picked up by sub-agent during delegation

---

## Implementation Approach

1. **Setup**
   - Clone the RLM repo (publicly available)
   - Have Claude Code installed
   - No additional setup required

2. **Execution Flow**
   ```
   User Query → Root Claude (Sonnet/Opus)
         ↓
   Invoke /rlm skill with file path + query
         ↓
   Initialize: Load document into Python object (virtualize memory)
         ↓
   Count characters (e.g., 429,000 chars)
         ↓
   Programmatic search: regex, slicing, pattern matching
         ↓
   Locate relevant sections (e.g., "Article 7")
         ↓
   [If needed] Hand off chunks to sub-agent (Haiku) for analysis
         ↓
   Synthesize answer from located sections
   ```

3. **Key Pattern: Context Virtualization**
   - Document stored as Python object (pickle)
   - LLM never ingests full context
   - Operations performed programmatically
   - Only relevant chunks fed to model

---

## Code Snippets

### Sub-Agent Configuration (rlm-subcore.md)

```yaml
---
name: rlm-subcore
description: RLM sub-agent for memory search operations
model: haiku  # Smaller model - only does search
tools:
  - Bash
  - Read
---

# RLM Sub-Core Agent

Your job is to search over virtualized memory using the ripple script.
Execute Python operations to locate relevant sections.
Do NOT try to reason over the full context.
```

### CLAUDE.md Executive Pattern

```markdown
# CLAUDE.md

## RLM Workflow

You have access to:
- `/rlm` skill for recursive document processing
- `rlm-subcore` agent for delegated search

When given a document + query:
1. Invoke /rlm with file path and query
2. Delegate search operations to rlm-subcore
3. Synthesize results from located sections

Keep delegation high-level. Let the skill handle details.
```

### Demo Invocation

```
/rlm

Context: /path/to/nvidia-arm-merger-agreement.txt
Query: What are the conditions precedent to closing for each party?
```

---

## Action Items

- [ ] Clone the public RLM implementation repo
- [ ] Review the ripple.py REPL script (~400 lines)
- [ ] Test with a complex document (merger agreement, legal contract, technical spec)
- [ ] Compare results with RAG approach for same queries
- [ ] Evaluate Haiku vs Sonnet for sub-agent performance
- [ ] Consider integrating pattern into AgileFlow's agent system

---

## Risks & Gotchas

- **Not validated for production legal use**: Demo explicitly disclaims legal accuracy
- **May not always use sub-agent**: In demo, root agent found answer without delegation (good for efficiency, but makes sub-agent debugging harder)
- **Python pickle security**: Virtualizing arbitrary documents could have security implications
- **Model availability**: Relies on Claude Code's sub-agent capability and Haiku model access

---

## Comparison: RLM vs RAG

| Aspect | RAG | RLM |
|--------|-----|-----|
| Search method | Semantic similarity / keyword | Programmatic (regex, slicing) |
| Flexibility | Rigid chunks | Dynamic operations |
| Context handling | Embed + retrieve | Virtualize + compute |
| Reasoning depth | Limited by chunk quality | Full document awareness |
| Use case fit | Simple lookups | Complex, multi-part queries |

---

## Story Suggestions

### Potential Story: Add RLM Capability to AgileFlow

**US-XXXX**: Implement RLM-style document processing agent
- AC: Given a document path and query, agent can process 400k+ char documents
- AC: Uses programmatic search (not RAG) to locate relevant sections
- AC: Sub-agent (Haiku) handles search operations
- AC: Root agent synthesizes final answer

---

## Related Research

- [RLM - Recursive Language Models](./20260117-rlm-recursive-language-models.md) - Theoretical foundation
- Context Engineering principles
- Multi-agent orchestration patterns

---

## Raw Content Reference

<details>
<summary>Original transcript excerpt (click to expand)</summary>

[00:00:00] If you read the RLM's paper, are you excited about recursive language models in general and you want to play around? I've got the thing for you. An implementation of RLMs using claw code primitives repo is available open source. If you want to try it for yourself, no need for any additional setup apart from installing claude code. Let's go. So, I had this idea to set up the RLM in the claw code harness and that's because all of the primitives are pretty much already available to us...

[Full transcript: ~4000 words]

</details>

---

## References

- Source: YouTube video transcript (implementation demo)
- Import date: 2026-01-19
- Related: [RLM Theory Research](./20260117-rlm-recursive-language-models.md)
