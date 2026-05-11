# Generate Workflow — Bulk Ad Copy Generation

**Triggers:** "generate ad copy", "write ads for my product", "create headline variants", "I need 40 ad variations", "bulk ad copy for Meta", "generate Google Ads headlines"

**Goal:** Produce 40+ headline, body, and CTA variants from a product description and ICP angles, formatted for direct platform upload (Meta bulk CSV, Google Ads Editor format).

## Inputs needed

| Input               | Required | How to get it                                                       |
| ------------------- | -------- | ------------------------------------------------------------------- |
| product description | Yes      | Ask for it if not provided                                          |
| target platform     | No       | Already captured in opening flow — use that. Ask only if not known. |
| variant count       | No       | Default: 40. Ask only if they want a different number.              |
| ICP angles          | No       | Auto-detect 5 from product description, then confirm                |

## Steps

1. **If product description is not provided**, ask: _"What are you advertising? Paste your product description, landing page URL, or existing ad copy — I'll work from any of those."_ Accept any format.

2. **Don't re-ask about platform** if already captured in the opening flow. Use what you know. Only ask if platform is genuinely unknown:

   _"Which platform should I optimize the format for? (or I can generate for all)"_

3. **Auto-detect 5 ICP angles** from the product description. Common angles:
   - Pain-point-led: leads with the problem they're experiencing
   - Outcome-focused: leads with the transformation or result
   - Social-proof: authority, users, case studies
   - Urgency/FOMO: time limit, scarcity, risk of inaction
   - Feature-differentiated: specific capability competitors don't have

   Show the angles and ask: _"I detected these 5 angles: [list]. Any you want to add or swap out?"_ Keep it conversational — if they say "looks good", move on immediately.

4. **Generate variants for each angle × each format:**

   **Headlines:**
   - Google: max 30 characters — problem-aware, solution-aware, benefit-led variants
   - Meta: up to 40 characters — hook-first, curiosity-driven variants
   - LinkedIn: professional tone, outcome-focused

   **Body copy:**
   - Short (1–2 sentences): matches headline angle, drives to CTA
   - Long (3–4 sentences): expands on the angle with a proof point

   **CTAs** (6–8 variants): action-oriented, urgency, curiosity — varied by platform norms

5. **Show the variants** as structured markdown organized by angle and format, with counts. Make them scannable — the user needs to read and react quickly.

6. **Generate platform-ready export files:**
   - **Meta bulk upload CSV**: Campaign / Ad Set / Ad columns with all variants
   - **Google Ads Editor format**: Campaign / Ad Group / Headline1–15 / Description1–4

7. **Guide next step with AskUserQuestion** — specific to what was generated:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "{N} variants generated across {angle_count} ICP angles. Top recommended variants to test first: {top_3_variants}.",
  "header": "What's next",
  "multiSelect": false,
  "options": [
    {"label": "Save the platform CSV and wrap up (Recommended)", "description": "Export is ready — {platform} format with all {N} variants"},
    {"label": "Regenerate the {weakest_angle} angle", "description": "That angle produced the weakest variants — I'll try different formulas"},
    {"label": "Create A/B test pairs from the top 5 variants", "description": "Pair your strongest variants for head-to-head testing — one variable changed per pair"},
    {"label": "Audit existing campaigns before launching these", "description": "Make sure tracking is working before investing in new copy — /agileflow:ads:track"}
  ]
}]</parameter>
</invoke>
```

## Output

Structured markdown with all variants organized by angle and format. Platform-ready CSV file(s). Total variant count. Recommended top 5 variants to test first based on formula strength.

## Fallbacks

**If AskUserQuestion is unavailable:**
Present options as a numbered list. Example:

```
What would you like to do next?
1. Save the CSV and wrap up
2. Regenerate a specific angle
3. Create A/B test pairs
```
