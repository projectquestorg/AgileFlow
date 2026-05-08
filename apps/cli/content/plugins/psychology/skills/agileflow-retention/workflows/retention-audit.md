# Workflow: Retention Audit

**Follow this when:** the user wants to audit their existing product for retention gaps, understand why users are churning, or get a prioritized list of retention improvements.

**Time estimate:** 60–120 minutes for a thorough audit. Can be done in 20 minutes for a quick scan.

**Output:** A prioritized gap list with specific recommendations, organized by psychological model and impact vs. effort.

---

## Before you start

Ask the user for the following information (or infer from context):

1. What type of product is this? (mobile app, SaaS, consumer web, marketplace, etc.)
2. What is the primary retention metric? (D1/D7/D30 retention, DAU/MAU, churn rate, session frequency)
3. What are the current baseline numbers for that metric?
4. Where in the funnel is the biggest drop-off? (acquisition → activation → retention → revenue → referral)
5. Do they have a defined "aha moment" — a specific action that correlates with long-term retention?

If the user doesn't know the answer to questions 3–5, note that identifying these is part of the audit.

---

## Step 1: Define and baseline the retention metric

**Goal:** Know exactly what you're measuring before recommending any mechanic.

Actions:

1. Identify the primary retention metric for this product type:
   - Mobile consumer app → D1 / D7 / D30 retention
   - SaaS / subscription → D30 / D90 retention, monthly churn rate
   - Daily-use utility (messaging, email) → DAU/MAU ratio
   - Social / community product → D7 / session frequency per week
2. Get the current baseline number if available
3. Identify the benchmark for the product category (e.g., D30 retention > 25% is good for mobile apps; DAU/MAU > 20% is good for most products)
4. Note the gap between current and benchmark

**Output:** "We're measuring D7 retention. Current: 18%. Benchmark for this category: 30%. Gap: 12 percentage points."

---

## Step 2: Map the current user journey

**Goal:** Understand the full path from signup to retained user, and find where most users exit.

Actions:

1. Walk through the product from a new user's perspective (or ask the user to describe it)
2. Map each step: Signup → Onboarding → First value → Return visit → Habit
3. Note which steps require decisions, effort, or motivation
4. Identify where users most commonly drop off (ask for data if available; otherwise estimate from product knowledge)
5. Identify the "aha moment" — the specific action that signals a user will be retained
   - If undefined: ask "What do your most retained users do in their first week that casual users don't?"
   - Common examples: Facebook (7 friends in 10 days), Slack (2,000 messages exchanged), Dropbox (first file uploaded)

**Output:** A journey map with drop-off points marked and the aha moment identified (or TBD with a research recommendation).

---

## Step 3: Audit against the Hook Model

**Goal:** Assess whether the product has a functional habit loop.

For each phase, score 1–5 (1 = absent/broken, 5 = excellent):

**Trigger audit**

- What external triggers exist? (push notifications, emails, badges)
- Are these triggers behavioral (user-action-triggered) or scheduled (marketing calendar)?
- What internal trigger is the product trying to own? (boredom, FOMO, loneliness, anxiety, curiosity)
- Do users report opening the app without a specific external trigger? (if yes: internal triggers are forming)
- Score: `/5`

**Action audit**

- What is the single most important action the product wants users to take?
- How many steps separate the external trigger from that action?
- What are the friction points in reaching that action? (login walls, decision points, loading time)
- Score: `/5`

**Variable reward audit**

- What reward does the user receive after completing the core action?
- Is the reward variable or predictable?
- Which reward type does it represent: Tribe (social), Hunt (information), or Self (mastery)?
- Does the user feel in control during the reward phase, or constrained?
- Score: `/5`

**Investment audit**

- What does the user leave behind after each session?
- Does that stored value increase over time? (e.g., recommendations get better, more followers, more content)
- Does the user feel the product would be painful to leave because of what they've invested?
- Score: `/5`

**Hook Model total:** `/20`

Interpretation:

- 16–20: Strong habit loop. Focus on growth, not retention mechanics.
- 10–15: Moderate loop. Specific phases need work. Prioritize lowest-scoring phase.
- Under 10: Weak or broken loop. Retention mechanics are unlikely to work until the core loop is fixed.

---

## Step 4: Audit against the Fogg Behavior Model

**Goal:** Find where motivation or ability is insufficient in critical flows.

**For each critical action (onboarding completion, first core action, first return visit):**

1. **Motivation audit:**
   - Is the value proposition clear before the user is asked to take this action?
   - Is there social proof, urgency, or benefit framing near the action?
   - Would a user with moderate motivation still take this action?
   - Identify specific moments where motivation is likely to drop

2. **Ability audit:**
   - Walk through each step: how long does it take? how much does it cost? how much cognitive load?
   - Are there steps that require decisions without enough information to decide well?
   - Are there unnecessary steps that could be removed or defaulted?
   - Apply Fogg's 6 simplicity factors to the critical path

3. **Prompt audit:**
   - Are users prompted at the right moment, or does the prompt fire when motivation is low?
   - Are prompts generic (scheduled) or behavioral (triggered by user state)?
   - Is there a facilitator prompt catching users who are mid-flow and almost done?

**Output:** List of specific friction points and motivation drops, with the step in the flow where each occurs.

---

## Step 5: Notification strategy audit

**Goal:** Evaluate whether the notification strategy supports or undermines retention.

Questions to answer:

1. How many notification types exist? List them all.
2. For each: is it triggered by user behavior or by a marketing schedule?
3. What is the average weekly notification count per user?
4. What is the notification opt-out rate? (>20% is a warning sign)
5. Are there "streak at risk" or loss-aversion notifications?
6. Are there recovery mechanics for users who have lapsed?

Score each notification type:

- Behavioral trigger (high relevance): strong keep
- Milestone trigger (user's own progress): keep
- Social trigger (friend activity): keep
- Marketing/scheduled blast: reduce or eliminate

**Output:** Notification audit with keep/improve/remove recommendation for each type.

---

## Step 6: Identify the keystone habit

**Goal:** Find the single behavior that, if habitual, makes everything else in the product stick.

Questions:

1. What is the behavior that your most retained users do that casual users don't?
2. What is the minimum frequency of that behavior that predicts long-term retention?
3. Is the product designed to make that behavior frictionless and rewarding?
4. Is there an anchor (existing routine) that could trigger this behavior?

**Output:** The keystone habit, current state (frictionless vs. too much friction), and recommended design change.

---

## Step 7: Score the retention mechanics inventory

**Goal:** Check which mechanics exist and how well they're implemented.

For each mechanic, score: Missing (0) / Exists but weak (1) / Well-implemented (2):

| Mechanic                                  | Present? | Quality | Notes |
| ----------------------------------------- | -------- | ------- | ----- |
| Streaks                                   |          |         |       |
| Progress bars / completion                |          |         |       |
| Variable rewards                          |          |         |       |
| Social proof                              |          |         |       |
| Personalized onboarding / aha moment path |          |         |       |
| Behavioral notifications                  |          |         |       |
| Endowed progress                          |          |         |       |
| Loss aversion mechanics                   |          |         |       |
| Social features / relatedness             |          |         |       |
| Investment mechanics                      |          |         |       |

**Mechanics score:** `/20`

---

## Step 8: Synthesize findings and prioritize

**Goal:** Create a prioritized gap list the team can act on.

Prioritization framework:

- **Impact:** How much would fixing this improve the primary retention metric? (H/M/L)
- **Effort:** How much engineering and design work is required? (H/M/L)
- **Priority:** High impact + low effort = do first. High impact + high effort = plan as a project. Low impact = deprioritize.

**Priority 1 (do immediately):** Low effort, high impact

- Typically: fixing a broken notification trigger, adding loss-aversion framing to an existing notification, adding a streak recovery mechanic, reducing friction in a critical flow

**Priority 2 (plan as a feature):** High impact, moderate/high effort

- Typically: redesigning onboarding around aha moment, adding streak system, redesigning reward phase

**Priority 3 (nice to have):** Low impact or low confidence

- Typically: social proof additions, gamification experiments, investment mechanic improvements

---

## Output format

Structure the audit output as:

```
RETENTION AUDIT SUMMARY
========================

Product: [name]
Primary metric: [metric]
Current baseline: [number]
Category benchmark: [number]
Gap: [gap]

HOOK MODEL SCORE: [X/20]
  Trigger: [X/5] — [key finding]
  Action: [X/5] — [key finding]
  Variable Reward: [X/5] — [key finding]
  Investment: [X/5] — [key finding]

FOGG AUDIT: [2–3 key friction points]

NOTIFICATION AUDIT: [summary]

KEYSTONE HABIT: [identified or TBD with recommendation]

MECHANICS INVENTORY: [X/20]

PRIORITY 1 GAPS (do immediately):
  1. [Specific recommendation] — expected impact: [H/M/L] — effort: [H/M/L]
  2. ...

PRIORITY 2 GAPS (plan as features):
  1. [Specific recommendation]
  2. ...

PRIORITY 3 (nice to have):
  1. ...
```
