# Keyword Research Guide

**Load this when:** Building a keyword strategy, evaluating keyword difficulty vs. volume tradeoffs, or planning content around search intent.

## Search Intent Types

| Intent                   | Query signal                               | Content match                | Example                                     |
| ------------------------ | ------------------------------------------ | ---------------------------- | ------------------------------------------- |
| Informational            | "how to", "what is", "why does"            | Guide, tutorial, explainer   | "how to migrate postgres database"          |
| Navigational             | Brand name, product name                   | Brand page, docs             | "vercel dashboard login"                    |
| Commercial investigation | "best", "vs", "review", "alternatives"     | Comparison, review, listicle | "best CI/CD tools 2025"                     |
| Transactional            | "buy", "download", "pricing", "free trial" | Landing page, pricing        | "agile project management software pricing" |

**Match content type to intent.** Writing a blog post for a transactional query loses to landing pages. Writing a landing page for informational queries loses to tutorials.

---

## Difficulty vs. Volume Tradeoffs

| Scenario                     | Strategy                                                         |
| ---------------------------- | ---------------------------------------------------------------- |
| High volume, high difficulty | Only target if strong domain authority (DA 50+). Long-term play. |
| High volume, low difficulty  | Prioritize — best ROI, target immediately                        |
| Low volume, low difficulty   | Long-tail wins; high conversion, compound over time              |
| Low volume, high difficulty  | Skip — too expensive for too little reward                       |

### Difficulty thresholds by domain authority

| Your DA | Realistic KD target |
| ------- | ------------------- |
| 0–20    | KD 0–20             |
| 20–40   | KD 0–35             |
| 40–60   | KD 0–50             |
| 60–80   | KD 0–65             |
| 80+     | Any                 |

---

## Long-Tail Strategy

### Why long-tail

- 70% of all searches are long-tail (4+ words)
- Lower KD, lower competition
- Higher purchase intent (more specific = closer to decision)
- Compound: 100 pages at 200 visits/month > 1 page at 10,000/month (often easier to achieve)

### Long-tail expansion patterns

```
Seed keyword: "project management"
→ Long-tail: "project management for remote teams"
→ Longer: "project management for remote engineering teams"
→ Question: "how to manage remote engineering teams effectively"
→ Comparison: "jira vs linear for remote teams"
→ Local: "project management software for startups in NYC"
```

### Tools for long-tail discovery

- Google autocomplete and "People Also Ask"
- Ahrefs / Semrush: Questions filter
- AnswerThePublic
- Reddit / Quora searches
- Your own site search queries

---

## Keyword Clustering

Group keywords by semantic similarity and intent before mapping to content:

```
Cluster: "CI/CD tools"
├── "best CI/CD tools" [commercial, high vol]
├── "CI/CD tools comparison" [commercial, med vol]
├── "CI/CD tools for small teams" [commercial, low vol, low KD]
├── "what is CI/CD" [informational, high vol]
└── "CI/CD pipeline tutorial" [informational, high vol]

One cluster = one content piece (or hub + spokes)
```

**Rule:** Never create two pages targeting the same cluster — they cannibalize each other.

---

## Keyword Metrics Reference

| Metric                  | Tool                   | What it tells you                    |
| ----------------------- | ---------------------- | ------------------------------------ |
| Search volume           | Ahrefs, Semrush, GKP   | Monthly search demand                |
| Keyword difficulty (KD) | Ahrefs, Semrush        | How hard to rank (0–100)             |
| CPC                     | Google Keyword Planner | Commercial value proxy               |
| SERP features           | Ahrefs, Semrush        | Featured snippets, image packs, etc. |
| Click-through rate      | Ahrefs (CTR curve)     | Actual clicks vs. searches           |
| Position                | GSC                    | Current ranking                      |

---

## SERP Feature Targets

| Feature          | How to target                                                         |
| ---------------- | --------------------------------------------------------------------- |
| Featured snippet | Answer the question directly in first 40–60 words; use H2 as question |
| People Also Ask  | Answer related questions in FAQ section                               |
| Image pack       | Alt text + filename match keyword; compress images; structured data   |
| Video carousel   | YouTube video with keyword in title + description                     |
| Knowledge panel  | Schema markup + Wikipedia / Wikidata presence                         |
| Local pack       | Google Business Profile + local SEO signals                           |

---

## Keyword Prioritization Scorecard

Score each keyword candidate 1–5:

| Factor               | Weight | Scoring notes                                |
| -------------------- | ------ | -------------------------------------------- |
| Search volume        | 20%    | 5 = >10k/mo, 1 = <100/mo                     |
| KD vs. your DA       | 30%    | 5 = KD well below DA, 1 = KD >> DA           |
| Business relevance   | 30%    | 5 = core ICP query, 1 = tangentially related |
| Conversion potential | 20%    | 5 = transactional, 1 = pure informational    |

**Priority score = Σ(score × weight)** — target highest scores first.
