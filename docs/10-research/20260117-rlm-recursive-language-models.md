# RLM - Recursive Language Models

**Import Date**: 2026-01-17
**Topic**: Recursive Language Models for Complex Document Reasoning
**Source**: Video transcript (direct import)
**Content Type**: transcript

---

## Summary

Recursive Language Models (RLMs) represent a breakthrough approach for AI agents handling high-complexity tasks outside of software engineering. The core insight is that context length is only half the problem - **task complexity** (the degree of internal self-referencing within documents) is equally important and causes "context rot" where performance deteriorates long before context limits are reached.

The solution is deceptively simple: **code execution plus recursion**. Instead of stuffing entire documents into an LLM's context, RLMs use a REPL (Read-Evaluate-Print-Loop) environment where data assets exist as variables in Python scripts. The LLM programmatically operates on these assets using read, evaluate, print, and loop operations, with the ability to recursively hand off to smaller models for focused subtasks.

This approach enables intelligent search and synthesis over complex documents by modeling them as **dependency graphs** rather than linear text. The result is cheaper, higher-performance reasoning over contexts orders of magnitude larger than advertised context windows, with reduced deterioration compared to naive context stuffing, RAG, or summarization approaches.

---

## Key Findings

### The Problem: Context Rot + Task Complexity

- **Context rot** = performance deterioration as context grows, but it's a function of BOTH context size AND task complexity
- A 1M token model will deteriorate long before 1M tokens if task complexity is high
- **Multi-hop reasoning** (following references across document) is what breaks current approaches
- Models become "confidently wrong" - the fastest way to destroy trust in AI agents

### Why Previous Approaches Fail

- **Naive context stuffing**: Expensive, slow, can actually reduce reliability (noise buries signal)
- **Summarization/compaction**: Lossy, loses important context, causes agent drift off-task
- **RAG**: Only does semantic similarity retrieval, can't pull logical relationships needed for multi-hop reasoning; chunking strategy doesn't scale across document types

### The Mental Model: Dependency Graphs

- Complex documents (legal contracts, codebases) are NOT meant to be read end-to-end
- They have high degrees of **internal self-referencing** (clauses reference clauses, functions call functions)
- Model them as **dependency graphs**: nodes = clauses/functions, edges = relationships
- This is what makes reasoning over them cognitively demanding

### The RLM Solution: REPL + Recursion

- **REPL** = Read, Evaluate, Print, Loop
- Data asset (legal contract, codebase) assigned to a Python variable OUTSIDE the context
- LLM programmatically operates on it:
  - **Read**: Access data object state
  - **Evaluate**: Any programmatic function (slice, keyword match, etc.)
  - **Print**: Return result to interpreter
  - **Loop**: Continue until task solved
- **Recursion**: Main model can hand off to smaller models to focus on different parts
- Result: Build dependency graphs intelligently, search context flexibly

### Results & Implications

- Tested on GPT-5 and Qwen 340B coding model
- Most runs: cheaper AND higher performance than alternatives
- Can reason about contexts orders of magnitude larger than advertised context windows
- Qwen performed slightly worse than GPT-5 → still need high-performance models

### Limitations & Guardrails

- **Not for small models**: Paper shows deterioration even between GPT-5 and 340B model
- **Recursion risks**: Can get into expensive loops if it goes off-tangent (95th percentile very expensive)
- **Guardrails required**:
  - Only one layer deep of recursion
  - Synchronous workflow (async untested but promising)
- **Not one-size-fits-all**:
  - Small context → one-shot LLM often better
  - Long context + LOW complexity → REPL without recursion
  - Long context + HIGH complexity → full RLM with recursion
- **Complexity**: Harder to implement and monitor in production
- **Prompt matters**: Steers the evaluation process

---

## Implementation Approach

1. **Model documents as dependency graphs** - not linear text
2. **Store data assets as Python variables** - outside LLM context
3. **Provide REPL environment** - read/evaluate/print/loop primitives
4. **Enable recursion with guardrails**:
   - One layer deep maximum
   - Synchronous execution
   - Max iterations safeguard
5. **Apply selectively**:
   - Skip for small context tasks
   - Use REPL-only for long context + low complexity
   - Use full RLM for long context + high complexity

---

## Code Snippets

*No code snippets in this transcript - conceptual/theoretical content*

---

## Action Items

- [ ] Research the original RLM paper for implementation details
- [ ] Evaluate how this applies to AgileFlow's subagent architecture
- [ ] Consider REPL-style operations for document/codebase analysis commands
- [ ] Assess if recursive handoffs could improve multi-hop reasoning in complex tasks
- [ ] Document when to apply vs. not apply RLM approach

---

## Risks & Gotchas

- **Model quality matters**: Won't work well with small or weak models
- **Runaway recursion**: Without guardrails, can become very expensive (95th percentile)
- **Complexity overhead**: Harder to implement, monitor, and debug in production
- **Prompt sensitivity**: Nature of prompt steers evaluation process significantly
- **Doesn't eliminate hallucinations**: Still need proper data provenance

---

## Applications

- **Legal analysis**: Merger agreements, contracts with cross-references
- **Policy review**: Complex policy documents
- **Information synthesis**: Thousands of internal documents (Excel, Word, etc.)
- **Codebase reasoning**: Understanding large codebases with complex call graphs
- **Data room analysis**: 100+ document rooms with mixed content types

---

## Story Suggestions

### Potential ADR: RLM Pattern for Complex Document Reasoning

Document the decision of whether/how to apply RLM concepts to AgileFlow's:
- Research import/analysis commands
- Multi-agent orchestration
- Codebase exploration tools

---

## References

- Source: Video transcript (direct import)
- Import date: 2026-01-17
- Related: [20260109-training-knowledge-llm-weights-vs-rag.md](./20260109-training-knowledge-llm-weights-vs-rag.md) (complementary RAG discussion)
