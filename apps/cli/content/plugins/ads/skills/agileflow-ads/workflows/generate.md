# Generate Workflow — Bulk Ad Copy Generation

**Triggers:** "generate ad copy", "write ads for my product", "create headline variants", "I need 40 ad variations", "bulk ad copy for Meta", "generate Google Ads headlines"

**Goal:** Produce 40+ headline, body, and CTA variants from a product description and ICP angles, formatted for direct platform upload (Meta bulk CSV, Google Ads Editor format).

## Inputs needed

| Input               | Required | How to get it                                                                 |
| ------------------- | -------- | ----------------------------------------------------------------------------- |
| product description | Yes      | Ask: "Paste your product description, landing page URL, or existing ad copy." |
| target platform     | No       | Default: all. Options: meta, google, linkedin, tiktok                         |
| variant count       | No       | Default: 40                                                                   |
| ICP angles          | No       | Default: auto-detect 5 angles from product description                        |

## Steps

1. If product description is not provided, ask: "What are you advertising? Paste a product description, landing page URL, or existing ad copy." Accept any format.

2. Ask the user: "Which platform are you targeting?" Options: [A] All platforms (recommended — I'll optimize format per platform), [B] Meta only, [C] Google Ads only, [D] LinkedIn, [E] TikTok.

3. If the user didn't specify variant count, default to 40. If they want more, ask: "How many variants? (20–100)"

4. Auto-detect the ideal customer profile (ICP) angles from the product description. Identify 5 angles by default, for example: pain-point-led, outcome-focused, social-proof, urgency/FOMO, feature-differentiated. Ask the user: "I detected these 5 ICP angles: [list]. Approve these or would you like to add/change any?"

5. Generate variants for each angle × each format:
   - **Headlines** (Google: max 30 chars; Meta: up to 40 chars): problem-aware, solution-aware, benefit-led
   - **Body copy** (short: 1–2 sentences; long: 3–4 sentences): matches each headline angle
   - **CTAs** (6–8 variants): action-oriented, urgency, curiosity

6. Display the variants as structured markdown organized by angle and format. Show counts per angle.

7. Generate a platform-ready CSV for the user's selected platform(s):
   - Meta bulk upload format (Campaign/Ad Set/Ad columns)
   - Google Ads Editor format (Campaign/Ad Group/Headline1–15/Description1–4)

8. Ask the user: [A] Download/save the CSV (recommended), [B] Regenerate a specific angle, [C] Swap out underperforming formulas, [D] Generate A/B test pairs from the top variants.

## Output

Structured markdown with all variants organized by angle. Platform-ready CSV file(s). Total variant count across all formats. Recommended top 5 variants to test first based on formula strength.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Save and continue
2. Review before saving
3. Discard
```
