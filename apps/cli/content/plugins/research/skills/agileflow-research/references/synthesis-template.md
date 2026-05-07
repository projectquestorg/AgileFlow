# Research Synthesis Template

**Load this when:** Combining findings from multiple research sources, resolving conflicting evidence, or producing a research summary.

## Synthesis Document Structure

```markdown
# Research Synthesis: [Topic]

**Date:** YYYY-MM-DD
**Sources reviewed:** [N] sources
**Time period covered:** [date range of sources]
**Confidence level:** High | Medium | Low

---

## Key Question

[The specific question this research was answering]

## Bottom Line Up Front

[2–4 sentences: what we found, with confidence level.
Lead with the finding, not the methodology.]

## Findings by Theme

### Theme 1: [Name]

**Finding:** [1-2 sentence summary]
**Evidence:** [Which sources support this, what kind of evidence]
**Confidence:** High / Medium / Low
**Contradictions:** [Any sources that conflict with this]

### Theme 2: [Name]

[Same structure]

## Conflicting Evidence

[Document where sources disagree, why, and how to interpret the conflict]

## Gaps

[What we still don't know. What questions this research raised.]

## Implications

[So what? What should we do differently based on this?]

## Sources

| #   | Source | Type | Date | Quality |
| --- | ------ | ---- | ---- | ------- |
| 1   |        |      |      |         |
```

---

## Evidence Quality Tiers

| Tier          | Source type                                              | Weight                        |
| ------------- | -------------------------------------------------------- | ----------------------------- |
| 1 (strongest) | Peer-reviewed studies, RCTs                              | Highest                       |
| 2             | Large-sample surveys (N>1000), meta-analyses             | High                          |
| 3             | Industry reports from credible firms (Gartner, McKinsey) | Medium-high                   |
| 4             | Expert interviews, practitioner case studies             | Medium                        |
| 5             | Blog posts, vendor reports, opinion pieces               | Low                           |
| 6             | Anecdote, single data point                              | Treat as signal, not evidence |

**Default rule:** If only Tier 4–6 evidence exists, state low confidence. Don't present it as settled.

---

## Handling Conflicting Evidence

### Step 1: Categorize the conflict type

| Conflict type             | Interpretation                                  |
| ------------------------- | ----------------------------------------------- |
| Sample population differs | Both may be correct for different contexts      |
| Time period differs       | More recent data is usually more relevant       |
| Methodology differs       | Higher quality methodology takes precedence     |
| Definition differs        | May not actually be conflicting — clarify terms |
| Funding source bias       | Adjust weight based on conflicts of interest    |

### Step 2: Resolution approaches

| Approach                                    | When to use                                         |
| ------------------------------------------- | --------------------------------------------------- |
| Accept the majority / higher quality source | Most cases                                          |
| Report as "disputed"                        | Genuine ongoing debate, similar quality evidence    |
| Split by context                            | "X is true for enterprise, Y is true for SMB"       |
| Investigate further                         | Conflict changes the recommendation; need more data |

### Step 3: Document explicitly

```
Conflicting finding: Source A says X; Source B says Y.
Reason for conflict: [Your assessment]
Resolution: [Which we're using and why]
```

---

## Conflicting Evidence Red Flags

- Single vendor reporting on its own product performance
- Survey with low N (<100) contradicting large-N studies
- Study funded by party with clear financial interest in the outcome
- Source predates a major market or technology shift
- Correlation presented as causation

---

## Knowledge Decay Assessment

Include in synthesis:

| Finding                     | Time-sensitive? | Revalidate by        |
| --------------------------- | --------------- | -------------------- |
| Market size / share         | Yes             | 12 months            |
| Technology benchmarks       | Yes             | 6 months             |
| Regulatory requirements     | Yes             | On regulation change |
| User behavior patterns      | Medium          | 18 months            |
| Foundational best practices | Low             | 3–5 years            |

---

## Synthesis Confidence Levels

| Level        | Criteria                                                              |
| ------------ | --------------------------------------------------------------------- |
| High         | 3+ independent Tier 1–3 sources agree; no credible contradictions     |
| Medium       | 2+ sources agree OR 1 strong source; some conflicting evidence exists |
| Low          | Only 1 source, or sources conflict without clear resolution           |
| Insufficient | Not enough evidence to draw conclusions; more research needed         |

---

## Citation Format (inline)

```markdown
Teams that write unit tests before code ship 40% fewer production bugs
[McKinsey DevEx Report 2024, Tier 3, High confidence].
```

Or footnote style:

```markdown
... ship 40% fewer production bugs.^[1]

[1] McKinsey DevEx Report, 2024. https://example.com
```
