# AI Council Deliberation

## Session Info
- **Session ID**: {{session_id}}
- **Created**: {{timestamp}}
- **Mode**: {{mode}} (parallel | debate)
- **Rounds**: {{rounds}}

---

## Question/Proposal

{{question}}

---

## Council Perspectives

### Round 1

#### Optimist Strategist
<!-- council-optimist writes here -->

[Awaiting optimist perspective...]

---

#### Devil's Advocate
<!-- council-advocate writes here -->

[Awaiting advocate perspective...]

---

#### Neutral Analyst
<!-- council-analyst writes here -->

[Awaiting analyst perspective...]

---

{{#if debate_mode}}
### Round {{round_number}}

#### Optimist Response
<!-- Responds to other perspectives -->

[Awaiting optimist response...]

---

#### Advocate Response
<!-- Responds to other perspectives -->

[Awaiting advocate response...]

---

#### Analyst Synthesis
<!-- Synthesizes debate -->

[Awaiting analyst synthesis...]

---
{{/if}}

## Final Synthesis

### Common Ground (All Agree)
- [To be synthesized after all perspectives received]

### Opportunities (Optimist Unique)
- [From optimist perspective]

### Risks (Advocate Unique)
- [From advocate perspective]

### Trade-offs (Analyst Assessment)
- [From analyst perspective]

### Recommendation
**Decision**: [To be determined]
**Confidence**: [High/Medium/Low]
**Reasoning**: [Summary of key factors]

### Next Steps
1. [Action item]
2. [Action item]
3. [Action item]

---

## Metadata

```json
{
  "session_id": "{{session_id}}",
  "question": "{{question}}",
  "mode": "{{mode}}",
  "rounds": {{rounds}},
  "agents": ["council-optimist", "council-advocate", "council-analyst"],
  "status": "in_progress",
  "created_at": "{{timestamp}}",
  "completed_at": null
}
```
