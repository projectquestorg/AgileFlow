---
description: Analyze complex documents using RLM (Recursive Language Models) pattern
argument-hint: DOCUMENT=<path> QUERY=<text> [MAX_ITERATIONS=<number>] [DEPTH=<number>]
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:rlm - RLM document analysis"
    - "Virtualize document - NEVER load full content into context"
    - "Use document-repl.js for all document operations"
    - "Delegate search to rlm-subcore agent (Haiku) when beneficial"
    - "Synthesize results yourself (Sonnet) - sub-agent only searches"
    - "Respect iteration limits and budget constraints"
  state_fields:
    - document_path
    - document_chars
    - complexity
    - query
    - iteration_count
    - max_iterations
---

# /agileflow:rlm

Analyze complex documents using the RLM (Recursive Language Models) pattern. Virtualizes documents outside context and uses programmatic search instead of loading full content.

---

## When to Use RLM

| Scenario | Use RLM? | Why |
|----------|----------|-----|
| Document < 10k chars | No | Direct read is fine |
| Document 10-50k chars, simple query | Maybe | Try direct first |
| Document 50k+ chars | **Yes** | Context rot risk |
| High cross-referencing (legal, specs) | **Yes** | Multi-hop reasoning needed |
| Multiple questions about same doc | **Yes** | REPL state persists |

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js rlm
```

---

<!-- COMPACT_SUMMARY_START -->

## COMPACT SUMMARY - /agileflow:rlm IS ACTIVE

**ROLE**: Analyze complex documents without context rot using REPL + recursion pattern.

### RULE #1: NEVER LOAD FULL DOCUMENT

**CRITICAL**: The whole point of RLM is to NOT stuff the document into your context.

**WRONG**:
```bash
Read("/path/to/large-contract.pdf")  # NO! Context rot!
```

**RIGHT**:
```bash
node packages/cli/scripts/document-repl.js --load="/path/to/large-contract.pdf" --info
```

### RULE #2: WORKFLOW PHASES

**Phase 1: Assess**
```bash
# Get document info and complexity
node packages/cli/scripts/document-repl.js --load="DOCUMENT" --info
```

If complexity is LOW and chars < 10k, consider direct read instead.

**Phase 2: Explore Structure**
```bash
# Get table of contents
node packages/cli/scripts/document-repl.js --load="DOCUMENT" --toc
```

**Phase 3: Targeted Search**
```bash
# Search for relevant terms from the query
node packages/cli/scripts/document-repl.js --load="DOCUMENT" --search="keyword"
```

**Phase 4: Extract Sections**
```bash
# Get specific sections identified in search
node packages/cli/scripts/document-repl.js --load="DOCUMENT" --section="Article 7"
```

**Phase 5: Synthesize**
- YOU (Sonnet) synthesize the final answer
- Sub-agent only did search, you do reasoning

### RULE #3: DELEGATION DECISION

| Complexity | Chars | Approach |
|------------|-------|----------|
| LOW | < 10k | Direct read (no RLM) |
| LOW | 10-50k | REPL yourself (no sub-agent) |
| MEDIUM | Any | REPL yourself |
| HIGH | < 50k | REPL yourself |
| HIGH | 50k+ | **Delegate to rlm-subcore** |

**Delegate when**:
- Document > 50k chars AND complexity HIGH
- Multiple search operations needed
- Budget optimization required

### RULE #4: SUB-AGENT DELEGATION

When delegating to rlm-subcore:

```
Task(
  description: "Search merger agreement for termination clauses",
  prompt: "Use document-repl.js to search '/path/to/doc.pdf' for 'termination'. Return all matches with context. Budget: 10000 chars.",
  subagent_type: "agileflow-rlm-subcore",
  model: "haiku"
)
```

**Sub-agent returns**: Structured search results
**You synthesize**: Use results to answer the original query

### RULE #5: ITERATION LIMITS

| Parameter | Default | Purpose |
|-----------|---------|---------|
| MAX_ITERATIONS | 10 | Prevent runaway loops |
| DEPTH | 1 | Recursion depth (sub-agent layers) |
| BUDGET | 15000 | Chars per operation |

**Track iterations**: If approaching MAX_ITERATIONS, summarize what you have.

### RULE #6: ANSWER FORMAT

After analysis, provide:

```markdown
## RLM Analysis: [Document Name]

**Query**: [Original question]
**Document**: [path] (X chars, Y lines, COMPLEXITY)
**Iterations**: N of MAX

### Answer

[Your synthesized answer based on extracted content]

### Evidence

1. **[Section/Line]**: [relevant excerpt]
2. **[Section/Line]**: [relevant excerpt]

### Confidence

[HIGH/MEDIUM/LOW] - [reason for confidence level]
```

### Anti-Patterns (DON'T)

- Load full document with Read tool
- Skip complexity assessment
- Let sub-agent do reasoning (they only search)
- Exceed iteration limits without notice
- Return raw search results as final answer

### Correct Patterns (DO)

- Assess complexity first
- Use document-repl.js for all doc operations
- Delegate search to sub-agent when beneficial
- Synthesize results yourself
- Track iterations and budget
- Provide confidence assessment

<!-- COMPACT_SUMMARY_END -->

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| DOCUMENT | Yes | Path to document file |
| QUERY | Yes | Question to answer about the document |
| MAX_ITERATIONS | No | Max search iterations (default: 10) |
| DEPTH | No | Recursion depth for sub-agents (default: 1) |

---

## IMMEDIATE ACTIONS

Upon invocation:

### Step 1: Validate Arguments

```bash
# Check DOCUMENT exists
ls -la "DOCUMENT_PATH"

# Check format is supported
# Supported: .txt, .md, .pdf, .docx
```

If DOCUMENT or QUERY missing, ask user:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Please provide the document path and your question.",
  "header": "RLM Input",
  "multiSelect": false,
  "options": [
    {"label": "Enter document path", "description": "Path to .txt, .md, .pdf, or .docx file"},
    {"label": "Cancel", "description": "Exit RLM analysis"}
  ]
}]</parameter>
</invoke>
```

### Step 2: Assess Document

```bash
node packages/cli/scripts/document-repl.js --load="DOCUMENT" --info --json
```

**Decision point**: Based on complexity and size, decide approach:
- LOW + small → suggest direct read
- Otherwise → continue with RLM

### Step 3: Explore Structure

```bash
node packages/cli/scripts/document-repl.js --load="DOCUMENT" --toc
```

### Step 4: Search Strategy

Based on QUERY, identify search terms:
1. Extract key concepts from query
2. Search for each term
3. Identify relevant sections

```bash
# For each key term
node packages/cli/scripts/document-repl.js --load="DOCUMENT" --search="term1"
node packages/cli/scripts/document-repl.js --load="DOCUMENT" --search="term2"
```

### Step 5: Extract Relevant Content

Based on search results, extract full sections:

```bash
node packages/cli/scripts/document-repl.js --load="DOCUMENT" --section="Relevant Section"
```

Or specific line ranges:

```bash
node packages/cli/scripts/document-repl.js --load="DOCUMENT" --slice="100-200"
```

### Step 6: Synthesize Answer

Using ONLY the extracted content (not full document):
1. Answer the QUERY
2. Cite evidence with line numbers
3. Assess confidence

### Step 7: Present Results

Format as shown in RULE #6 above.

---

## Example Usage

### Example 1: Legal Document Analysis

```
/agileflow:rlm DOCUMENT="contracts/merger-agreement.pdf" QUERY="What are the conditions precedent to closing for each party?"
```

**Workflow**:
1. Assess: 429k chars, HIGH complexity
2. TOC: Find "Article 7: Conditions Precedent"
3. Search: "conditions precedent", "closing", "purchaser", "seller"
4. Extract: Article 7 section
5. Synthesize: List conditions for each party

### Example 2: Technical Specification

```
/agileflow:rlm DOCUMENT="specs/api-specification.md" QUERY="What authentication methods are supported?"
```

**Workflow**:
1. Assess: 85k chars, MEDIUM complexity
2. TOC: Find "Authentication" section
3. Search: "authentication", "auth", "OAuth", "JWT"
4. Extract: Authentication section
5. Synthesize: List supported methods with details

### Example 3: Research Paper

```
/agileflow:rlm DOCUMENT="research/rlm-paper.pdf" QUERY="What are the limitations of the RLM approach?"
```

**Workflow**:
1. Assess: 25k chars, LOW complexity
2. Search: "limitations", "risks", "guardrails"
3. Extract: Limitations section
4. Synthesize: Summarize limitations

---

## Integration with Research Commands

RLM can be used with research notes:

```
/agileflow:rlm DOCUMENT="docs/10-research/20260117-rlm-recursive-language-models.md" QUERY="What are the key findings?"
```

For smaller research notes, `/agileflow:research:view` may be sufficient.

---

## Error Handling

| Error | Recovery |
|-------|----------|
| Document not found | Ask user for correct path |
| Unsupported format | Suggest conversion to .txt/.md |
| PDF parse error | Check pdf-parse installed |
| DOCX parse error | Check mammoth installed |
| Budget exceeded | Summarize partial results |
| Max iterations | Report findings so far |

---

## Related Commands

- `/agileflow:research:analyze` - Analyze research notes (uses RLM for large docs)
- `/agileflow:research:view` - View research notes (direct read)
- `/agileflow:research:synthesize` - Cross-document analysis

---

## References

- Research: `docs/10-research/20260117-rlm-recursive-language-models.md`
- Research: `docs/10-research/20260119-rlm-claude-code-implementation.md`
- Sub-agent: `packages/cli/src/core/agents/rlm-subcore.md`
- Script: `packages/cli/scripts/document-repl.js`
