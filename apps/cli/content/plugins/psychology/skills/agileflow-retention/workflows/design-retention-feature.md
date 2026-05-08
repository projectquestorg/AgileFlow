# Workflow: Design a Retention Feature

**Follow this when:** the user wants to design a new retention mechanic — a streak system, notification strategy, progress indicator, social feature, reward loop, or any other habit-forming feature.

**Time estimate:** 30–60 minutes for a complete feature design with psychological rationale.

**Output:** A fully specified retention mechanic with trigger, action, reward, investment, ethical check, and measurement plan.

---

## Before you start

Ask the user:

1. Which mechanic type are they considering? (streak, progress bar, notifications, social proof, variable reward, something else)
2. What user behavior do they want to become habitual? (be specific: "open the app daily", "complete a project update each Friday", "share work with a colleague weekly")
3. What is the target user segment? (new users / lapsed users / power users)
4. What does success look like? (D7 retention improvement, DAU/MAU increase, session frequency increase)

If the user doesn't know which mechanic to use, help them choose one using the model selection table in `references/psychology-models.md`.

---

## Step 1: Choose the psychological model

**Goal:** Match the mechanic to the right model before designing any feature.

| Retention goal                      | Best model                                   | Best mechanic                                          |
| ----------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| Build a new daily habit             | Hook Model + Habit Loop                      | Streak + daily content + notifications                 |
| Increase onboarding completion      | Fogg B=MAP                                   | Progress bar + endowed progress + facilitator prompts  |
| Drive social engagement             | Hook Model (Tribe rewards) + SDT Relatedness | Social features + variable social validation           |
| Reduce churn among engaged users    | Loss aversion + Investment                   | Streak mechanics + investment layer                    |
| Increase feature adoption           | Fogg B=MAP (ability) + Endowed Progress      | Guided flow + pre-filled defaults + progress indicator |
| Build intrinsic long-term retention | SDT                                          | Autonomy + competence progression + community          |

Select the primary model and note why it fits this specific challenge.

---

## Step 2: Define the target behavior

**Goal:** Be precise about what behavior you want users to perform and how often.

Fill in this template:

```
Target behavior: [Specific, observable action]
Frequency: [Daily / Weekly / Per session / On trigger]
Target user state: [What emotion or context should trigger this?]
Minimum viable version: [The simplest version of the behavior]
```

Examples:

- "Complete one lesson in the app. Daily. When the user has free time or is waiting. Minimum: answer 3 questions."
- "Update project status. Weekly on Friday afternoon. When wrapping up the work week. Minimum: one sentence."
- "Log a workout. After exercising. When arriving home from exercise. Minimum: tap 'I worked out today'."

The minimum viable behavior matters for Fogg's ability lever. The smaller the minimum behavior, the lower the motivation threshold required to perform it.

---

## Step 3: Design the trigger

**Goal:** Design an external trigger that will eventually be replaced by an internal trigger.

**External trigger design:**

1. Identify the trigger delivery channel:
   - Push notification (requires permission; most immediate)
   - Email (no permission required; lower urgency)
   - In-app badge or indicator (only reaches users already in app)
   - SMS (highest open rates; highest friction to opt into)

2. Design the trigger timing:
   - Behavioral: triggered by user action or inaction ("user hasn't logged in for 3 days")
   - Time-based: tied to a specific time the user has indicated they prefer
   - Calendar-based: tied to a recurring event (end of work week, before a deadline)
   - Location-based: triggered by physical context if available

3. Write the trigger copy using these principles:
   - Personal: use name or specific context ("Your 14-day streak is at risk")
   - Loss framing: "You're about to lose X" outperforms "Keep your X going"
   - Specific numbers: "You're on day 14" not "You have a streak"
   - Single action: tell them exactly what to do ("Tap here to complete today's lesson")

4. Design for internal trigger formation:
   - Which emotion should become associated with opening the product?
   - How does the product reliably resolve that emotion?
   - Document this: "We want users to associate [boredom / procrastination avoidance / productivity] with opening [product]"
   - Check after 4–6 weeks of external triggers: are users opening without the notification?

**Trigger quality checklist:**

- [ ] Behavioral trigger, not scheduled blast
- [ ] Fires at the right motivation moment (not at 2am, not during user's known low-engagement hours)
- [ ] Loss-framed copy with specific numbers
- [ ] Single clear action
- [ ] Opt-out available and respected

---

## Step 4: Reduce friction in the action

**Goal:** Make the target behavior as easy as possible to perform in response to the trigger.

Apply Fogg's 6 simplicity factors to the path from trigger to completed behavior:

| Factor          | Current state         | Target state               | Change required                     |
| --------------- | --------------------- | -------------------------- | ----------------------------------- |
| Time            | [how long?]           | < 2 minutes                | [what to remove]                    |
| Money           | [any cost?]           | Free to perform            | [if cost exists, justify or remove] |
| Physical effort | [taps/clicks]         | < 3 taps from notification | [what to streamline]                |
| Brain cycles    | [decisions required?] | 0 decisions, 1 action      | [what to default or remove]         |
| Social deviance | [does it feel weird?] | Normal, expected           | [normalize or destigmatize]         |
| Non-routine     | [familiar or new?]    | Familiar pattern           | [use existing UI patterns]          |

**The one-tap principle:** Wherever possible, the notification should take users directly to the action — not to a home screen they have to navigate from. Deep link from notification to the specific action.

---

## Step 5: Design the reward

**Goal:** Deliver a variable, autonomy-preserving reward immediately after the target behavior.

**Choose the reward type:**

| Type                   | What it delivers                           | Best for                        |
| ---------------------- | ------------------------------------------ | ------------------------------- |
| **Tribe (social)**     | Social validation from other users         | Social products, community apps |
| **Hunt (information)** | Useful, surprising, or interesting content | News, education, productivity   |
| **Self (mastery)**     | Progress, completion, skill advancement    | Learning, fitness, productivity |

**Variable reward design principles:**

1. Not every session delivers the same reward level — some are better than others
2. The anticipation of the reward is as motivating as the reward itself
3. Deliver the reward immediately after the action (not on the next session)
4. Add occasional "jackpot" moments: unexpected larger rewards
5. Never make the reward predictable (same reward every time → diminishing motivation)

**Autonomy preservation:** During the reward phase, the user should feel in control, not constrained. If getting the reward requires watching an ad, completing a survey, or navigating required steps, the reward experience becomes aversive.

**Reward examples by mechanic:**

- **Streak system:** Streak counter increment + animation + occasional celebration (jackpot at 7/30/100 days)
- **Progress bar:** Visual bar fill + "You're X% done" + next step suggestion
- **Social feature:** Variable social feedback (likes, comments, replies — timing is unpredictable)
- **Learning product:** Quiz result + "You got X/Y right" + occasional perfect score celebration

---

## Step 6: Design the investment layer

**Goal:** Ensure users leave something behind after each session that makes the product more valuable on the next visit.

Investment types to consider:

| Type                       | Example                              | Value increase mechanism            |
| -------------------------- | ------------------------------------ | ----------------------------------- |
| **Data/personalization**   | Watched content, completed lessons   | Better recommendations next session |
| **User-generated content** | Posts, photos, notes, projects       | History and portfolio building      |
| **Social graph**           | Followers, connections, team members | Social switching cost               |
| **Reputation**             | Badges, reviews, ratings, level      | Public identity investment          |
| **Settings/configuration** | Custom workflows, saved preferences  | Painful to recreate                 |
| **History/progress**       | Learning progress, activity log      | Loss if they leave                  |

For the mechanic being designed, answer:

- What does the user leave behind after completing the target behavior?
- How does that accumulate over time?
- What would they lose if they switched to a competitor?
- Is the investment visible to the user (so they're aware of its value)?

---

## Step 7: Ethical check

**Goal:** Verify the mechanic delivers genuine value to users and doesn't exploit psychological vulnerabilities.

Answer each question honestly:

1. **The thank-you test:** "If a user understood exactly what psychological mechanism this feature uses, would they thank us for designing it this way?"
   - If yes: proceed
   - If uncertain: redesign until yes

2. **Value alignment:** Does the mechanic encourage behavior that genuinely improves the user's life or experience? Or does it maximize engagement at the expense of user wellbeing?
   - Streak for learning a language: helps the user achieve their goal → proceed
   - Streak for viewing ads: maximizes platform revenue without user benefit → do not ship

3. **Anxiety test:** Will this mechanic cause anxiety or distress for users who can't maintain it?
   - If yes: add opt-out, recovery mechanics, or reduce the stakes framing

4. **Dark pattern check:** Does this mechanic make it harder to leave the product than easier to stay?
   - Genuine retention: make the product so valuable users don't want to leave
   - Dark pattern: hide cancel buttons, charge after free trial without clear warning, make account deletion difficult
   - Dark patterns are off-limits regardless of retention impact

5. **Regulatory check:** Does this mechanic involve gambling mechanics (loot boxes), target children, or create addictive loops with no opt-out?
   - These require legal review before implementation

---

## Step 8: Define the measurement plan

**Goal:** Define how you'll know if this mechanic is working.

**Primary metric:**

- What specific retention metric does this mechanic target?
- What is the current baseline?
- What is the target improvement (e.g., D7 retention from 22% to 28%)?
- How long will you run the test before evaluating?

**Measurement approach:**

- A/B test: control (no mechanic) vs. treatment (mechanic enabled) — preferred
- Cohort analysis: compare retention curves for users who engage with mechanic vs. those who don't
- Note: cohort analysis has selection bias (users who engage with mechanic are already more motivated); A/B test is cleaner

**Guardrail metrics:**

- Monitor these to ensure the mechanic doesn't harm other user behaviors:
  - Notification opt-out rate (rising opt-outs = spam signal)
  - Session quality (time in productive feature / total time) — don't optimize for empty engagement
  - Support ticket volume (streak anxiety complaints, etc.)
  - NPS / user satisfaction scores

**Leading indicators (check weekly):**

- % of target users who engaged with the mechanic
- Mechanic engagement rate (e.g., streak completion rate day-over-day)

**Lagging indicator (check at 4/8/12 weeks):**

- Primary retention metric vs. control group

---

## Step 9: Document and handoff

**Goal:** Create a complete feature spec the team can implement.

Feature spec template:

```
RETENTION MECHANIC: [Name]

Psychological model: [Hook / Fogg / Habit Loop / SDT]
Target behavior: [Specific action]
Target user segment: [New / Returning / At-risk]
Primary metric: [Metric] — Baseline: [X] — Target: [Y]

TRIGGER:
  Type: [Behavioral / Time-based / Calendar-based]
  Channel: [Push / Email / In-app]
  Timing: [Specific logic]
  Copy: [Notification text with loss framing]

ACTION PATH:
  Steps from trigger to completion: [count]
  Deep link target: [specific screen]
  Friction removed: [what was simplified]

REWARD:
  Type: [Tribe / Hunt / Self]
  Variable? [Yes / No — if no, explain why]
  Jackpot moment: [Description]
  Timing: [Immediate on completion]

INVESTMENT:
  What user leaves behind: [Description]
  Value accumulation mechanism: [How it grows]

ETHICAL REVIEW:
  Thank-you test: [Pass / Fail — notes]
  Value alignment: [Pass / Fail — notes]
  Anxiety risk: [Low / Medium — mitigation]
  Recovery mechanic: [If streak: streak freeze. If other: describe]

MEASUREMENT:
  Primary metric: [Metric]
  Test approach: [A/B test / Cohort]
  Test duration: [Weeks]
  Guardrail metrics: [List]
```
