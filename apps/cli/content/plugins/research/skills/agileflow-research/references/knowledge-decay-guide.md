# Knowledge Decay Guide

**Load this when:** Assessing whether research is still current, planning a research refresh, or flagging stale sources.

## Decay Rate by Knowledge Type

| Knowledge type                             | Half-life    | Refresh trigger                     |
| ------------------------------------------ | ------------ | ----------------------------------- |
| Technology benchmarks (LLM, cloud pricing) | 3–6 months   | Major model/service release         |
| Market sizing and competitive landscape    | 6–12 months  | Quarterly                           |
| Consumer behavior patterns                 | 12–18 months | Major platform shift or world event |
| Regulatory and compliance requirements     | On change    | Watch for legislation updates       |
| Industry best practices                    | 2–3 years    | Major methodology shift             |
| Foundational principles (psychology, math) | 10+ years    | Paradigm shift only                 |
| Vendor pricing and feature availability    | 1–3 months   | Before any procurement              |
| SEO signals and algorithms                 | 6–12 months  | Major algorithm update              |

---

## Staleness Signals

### Hard signals (research is definitely stale)

- [ ] Publication date >12 months for fast-moving domain (tech, market)
- [ ] Referenced product, version, or service no longer exists
- [ ] Statistics cite a timeframe that has ended ("by 2024...")
- [ ] Source cites a study that has since been retracted
- [ ] A major event has occurred that would invalidate the assumptions (pandemic, regulation, acquisition)

### Soft signals (may be stale — verify)

- [ ] Publication date >24 months for moderate-velocity domain
- [ ] The landscape "feels" different from what the research describes
- [ ] Recent practitioner opinions contradict the research
- [ ] The research was produced by a party that no longer exists or has merged

---

## Research Freshness Checklist

Before using research findings in a decision, verify:

| Check                                                | Action if failed                           |
| ---------------------------------------------------- | ------------------------------------------ |
| Source is less than [N months] old for this domain   | Find more recent source or flag as dated   |
| No major market event has occurred since publication | Annotate finding with "pre-[event]" caveat |
| The specific claim is still true (quick spot-check)  | Update or replace the finding              |
| Sample still represents current population           | Note demographic / market shift            |
| Technology referenced still exists as described      | Update with current equivalent             |

---

## Refresh Prioritization

When research library needs updating, prioritize refresh by:

1. **Decision proximity** — Refresh before any decision that depends on it
2. **Decay rate** — Fast-moving domains first
3. **Confidence impact** — Low-confidence + old = highest refresh priority
4. **Consequence** — High-stakes decisions need fresh data

### Scoring formula

```
Refresh priority = (decay_rate × 3) + (decision_proximity × 4) + (consequence × 3)
Scale each 1–5; higher = refresh first
```

---

## Evergreen vs. Time-Sensitive Research

### Evergreen (stable over time)

- Cognitive biases and decision-making frameworks
- Accessibility standards (update only on WCAG version bump)
- Security fundamentals (e.g., OWASP Top 10 — update every 4 years)
- Mathematical and statistical methods
- Agile/lean principles (not practices — those evolve)
- Human motivation research (Maslow, self-determination theory)

### Time-sensitive (refresh regularly)

- AI model capabilities and limitations
- Competitor feature parity
- Pricing benchmarks
- Platform algorithm behavior (SEO, social, ads)
- Browser/device market share
- Regulatory compliance requirements
- API documentation and rate limits

---

## Research Decay Annotation Format

When including potentially stale research in a synthesis:

```markdown
> **Currency note:** This finding is from [Date]. The domain moves quickly;
> verify before relying on this for [decision type]. Last verified: [Date or "not verified"].
```

Or inline:

```markdown
[Data from 2023 — may be outdated; verify current benchmarks before using for pricing decisions]
```

---

## Research Refresh Triggers (monitor these)

| Trigger                                                     | Research to refresh                        |
| ----------------------------------------------------------- | ------------------------------------------ |
| New LLM model released (GPT, Claude, Gemini major versions) | AI capability benchmarks, cost comparisons |
| WCAG version update                                         | Accessibility standards research           |
| OWASP Top 10 update                                         | Security vulnerability rankings            |
| Google algorithm update                                     | SEO signal research                        |
| Major competitor launch or acquisition                      | Competitive landscape                      |
| New regulation passed (GDPR, AI Act, CCPA amendments)       | Compliance requirements                    |
| New framework major version (React 19, Node 22 LTS)         | Technical best practices                   |
