# Audience Targeting Guide

**Load this when:** Building audience segments, planning retargeting funnels, or structuring lookalike strategies.

## Funnel-Stage Targeting Framework

| Stage | Audience Type                        | Goal          | Typical ROAS |
| ----- | ------------------------------------ | ------------- | ------------ |
| TOFU  | Cold — Interest/Lookalike            | Awareness     | 1–2x         |
| MOFU  | Warm — Engagement/Video views        | Consideration | 2–4x         |
| BOFU  | Hot — Site visitors, cart abandoners | Conversion    | 4–10x+       |

---

## Lookalike Audiences

### Seed quality hierarchy (best to worst)

1. Purchasers (last 90–180 days)
2. High-LTV customers (top 10–20% by spend)
3. Qualified leads (completed form / booked call)
4. Add-to-cart / checkout-initiated
5. All site visitors (lowest signal quality)

### Lookalike size vs. precision tradeoff

| Size  | Precision          | Best for                        |
| ----- | ------------------ | ------------------------------- |
| 1%    | Highest similarity | Small budgets, niche products   |
| 2–5%  | Balanced           | Scale with acceptable CPA drift |
| 6–10% | Broad reach        | Awareness, large budgets        |

**Rule:** Start at 1–2%. Expand only when 1% audiences show frequency >3 or CPM spikes.

---

## Retargeting Funnel Structure

### Standard 3-layer retargeting stack

```
Layer 1 — Engaged visitors (1–7 days)
  Segment: Visited key page, >30s session, scrolled 50%+
  Message: Direct offer, urgency, social proof
  Budget: ~40% of retargeting spend

Layer 2 — Broader visitors (8–30 days)
  Segment: Any site visit, no conversion
  Message: Benefits reminder, testimonials
  Budget: ~35%

Layer 3 — Cold re-engagement (31–90 days)
  Segment: Past visitors gone cold
  Message: New angle, discount/offer, "we missed you"
  Budget: ~25%
```

### High-intent signals to create custom audiences from

- Visited `/pricing` or `/demo`
- Watched >50% of product video
- Opened email 3+ times without clicking
- Downloaded lead magnet but didn't book
- Started checkout / signup, did not complete

---

## Exclusion Strategy (critical for efficiency)

Always exclude from prospecting:

- [ ] Current customers (suppress by email list + pixel)
- [ ] Active leads in nurture sequence
- [ ] Recent converters (30-day window minimum)
- [ ] Employees / internal traffic (IP exclusion)
- [ ] Low-quality converters (refunds, chargebacks)

Always exclude from retargeting:

- [ ] Already converted in attribution window
- [ ] Suppression list (unsubscribes, complaints)

---

## Platform-Specific Audience Notes

### Meta

- Minimum seed size for lookalikes: 100 people (1,000+ recommended)
- Advantage+ audiences: Use when scale matters more than control
- Broad targeting (no detailed targeting) outperforms interest stacks at $50k+/mo budgets
- Engagement custom audiences: video views, Instagram interactions, lead form openers

### Google

- Customer Match: upload email list for RLSA and lookalikes
- Similar Segments: auto-generated, less controllable than Meta LAL
- In-market segments: highest purchase intent in Display/YouTube
- RLSA bid adjustments: +20–50% for cart abandoners on Search

### LinkedIn

- Matched audiences: upload CSV (min 300 matched for activation)
- Account-based targeting: upload target company list
- Retargeting: needs LinkedIn Insight Tag on site (24-hour delay)
- Lookalikes: available but limited — better for awareness than conversion

### TikTok

- Value-based lookalikes: feed pixel purchase events (not just add-to-cart)
- Interest + behavior combinations outperform single-dimension targeting
- SPARK Ads: allowlist organic posts → boosted as paid (higher trust signal)

---

## Audience Overlap Check

Before launching:

```
Overlap >30% between ad sets = audience cannibalization risk
Fix: Merge ad sets OR add mutual exclusions
Tool: Meta Audience Overlap tool, Google Audience Manager
```

---

## Frequency Caps by Stage

| Stage                | Recommended cap                |
| -------------------- | ------------------------------ |
| Awareness (cold)     | 1–2/week                       |
| Consideration (warm) | 3–5/week                       |
| Retargeting (hot)    | 5–7/week, then rotate creative |
| Re-engagement        | 2–3/week max                   |

**Fatigue signal:** CTR drops >20% week-over-week with stable CPM → creative rotation needed, not audience expansion.
