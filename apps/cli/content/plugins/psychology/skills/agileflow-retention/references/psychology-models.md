# Psychology Models Reference

**Load this when:** designing a retention mechanic, auditing a product for psychological levers, explaining why a mechanic works or doesn't work, or choosing which model applies to a specific retention challenge.

---

## 1. BJ Fogg's Behavior Model (B=MAP)

**Source:** Fogg, B.J. (2009). "A Behavior Model for Persuasive Design." _Proceedings of the 4th International Conference on Persuasive Technology._ Also expanded in: Fogg, B.J. (2019). _Tiny Habits: The Small Changes That Change Everything._ Houghton Mifflin Harcourt.

### The core equation

```
B = MAP  (at the same moment)
```

A behavior (B) happens when **Motivation** (M), **Ability** (A), and **Prompt** (P) all converge simultaneously. Remove any one of the three and the behavior doesn't happen.

This is the most actionable model in product design because it gives you three distinct levers to pull.

### Motivation

Fogg identifies three pairs of core motivators — each with a positive and negative pole:

| Motivator        | Positive pole | Negative pole |
| ---------------- | ------------- | ------------- |
| **Sensation**    | Pleasure      | Pain          |
| **Anticipation** | Hope          | Fear          |
| **Belonging**    | Acceptance    | Rejection     |

These aren't manufactured — they're fundamental human drives. Effective products tap into at least one pair. The belonging motivator is particularly powerful for social products; anticipation motivators drive checking behaviors (checking email, refreshing feeds).

**Important:** Motivation is volatile. It spikes and crashes. You cannot design a product that relies on users always being highly motivated. High motivation at the wrong moment (no prompt, no ability) produces no behavior. Design for low-motivation states.

### Ability

Ability is a function of simplicity. Fogg defines 6 factors that limit a person's ability to perform a behavior:

| Factor              | What limits it                 | Design fix                                                     |
| ------------------- | ------------------------------ | -------------------------------------------------------------- |
| **Time**            | Behavior takes too long        | Reduce steps; auto-fill; sensible defaults                     |
| **Money**           | Behavior has financial cost    | Free tier; clear value before asking for payment               |
| **Physical effort** | Behavior requires exertion     | One-click actions; reduce taps/clicks                          |
| **Brain cycles**    | Behavior requires thinking     | Progressive disclosure; clear labeling; one decision at a time |
| **Social deviance** | Behavior feels weird to others | Social proof; normalize the behavior                           |
| **Non-routine**     | Behavior is unfamiliar         | Familiar patterns; contextual guidance                         |

The weakest factor determines overall ability. A behavior can be free, fast, and familiar but fail if it feels socially deviant.

**Key insight for retention:** Don't try to raise motivation — raise ability instead. It's more reliable and easier to control. If users aren't completing onboarding, the problem is almost never lack of motivation (they signed up!). The problem is ability — friction in the flow.

### The Prompt (Trigger)

The prompt must arrive at exactly the right moment — when both motivation and ability are sufficient. There are three prompt types:

| Type                   | Works when                            | Example                            |
| ---------------------- | ------------------------------------- | ---------------------------------- |
| **Facilitator prompt** | Ability is high but motivation is low | "You're 80% done — one more step"  |
| **Spark prompt**       | Ability is low but motivation is high | Compelling case for why to act now |
| **Signal prompt**      | Both M and A are high                 | Simple reminder at the right time  |

Most apps use only signal prompts (push notifications, emails). Better retention comes from designing facilitator prompts: catching users mid-task, celebrating near-completion, and reducing the last 20% of friction.

### Tiny Habits methodology

For designing new habits, Fogg's Tiny Habits framework uses the sequence:

```
Anchor → Tiny Behavior → Celebration (immediate)
```

- **Anchor:** An existing routine that reliably triggers at the desired time ("After I pour my morning coffee...")
- **Tiny Behavior:** A version of the target behavior made so small it's trivially easy ("...I will open the app and read one headline")
- **Celebration:** An immediate positive emotional signal ("Awesome! I did it!") — this wires the habit loop

**Application to product design:** Identify what existing routine (anchor) can trigger your product behavior. Make the initial behavior tiny enough that no motivation is required. Deliver immediate positive feedback. Once the anchor-behavior-celebration loop runs consistently, gradually expand the behavior.

### Behavior grid

Fogg also distinguishes behavior types by duration and novelty:

|              | New behavior                 | Familiar behavior                    |
| ------------ | ---------------------------- | ------------------------------------ |
| **One-time** | One-time new (e.g., setup)   | One-time familiar                    |
| **Ongoing**  | New ongoing (habit to build) | Familiar ongoing (habit to maintain) |
| **Increase** | —                            | Do it more often                     |
| **Decrease** | —                            | Do it less often                     |
| **Cease**    | —                            | Stop doing it                        |

Most retention work is in the "new ongoing" or "familiar increase" categories. Each requires different design approaches.

---

## 2. Nir Eyal's Hook Model

**Source:** Eyal, N. (2014). _Hooked: How to Build Habit-Forming Products._ Portfolio/Penguin.

### The four-phase loop

```
Trigger → Action → Variable Reward → Investment → (next Trigger)
```

Each completed loop increases the probability of the next loop firing faster and with less external prompting. The goal is to shrink the path from internal trigger to action until it becomes automatic.

### Phase 1: Trigger

**External triggers** contain explicit information about what to do next:

- Paid triggers: advertisements, sponsored content
- Earned triggers: PR, word of mouth, viral content
- Relationship triggers: referrals, social sharing
- Owned triggers: email list, push notifications, bookmarks

**Internal triggers** are emotions or states that cue behavior without external prompting:

- Boredom → open Reddit/Twitter
- Loneliness → check Facebook/Instagram
- Uncertainty → search Google
- FOMO → check notifications
- Anxiety → procrastinate on email

The transition from external to internal triggers is the sign that a habit has formed. Products that never achieve internal triggers must continuously pay for external ones — expensive and fragile. Products that become emotionally associated ("I feel bored, I open Netflix") have achieved habit status.

**Design principle:** Which emotion or internal state do you want your product to "own"? Design the product experience to be associated with that state, and ensure the product reliably resolves it.

### Phase 2: Action

The action is the simplest behavior in anticipation of the reward. Eyal adopts Fogg's ability framework here: reduce the action to its simplest possible form. The action should require:

- Minimum time
- Minimum cognitive effort
- Minimum social risk

Examples:

- Twitter: type up to 280 characters (low effort, low commitment)
- Instagram: double-tap to like (1 gesture, 0 cognitive load)
- Spotify: press play (1 tap to immediate reward)

**Design principle:** What is the one action that delivers the user to the reward? Eliminate every step between trigger and that action.

### Phase 3: Variable Reward

This is the most psychologically powerful phase. Eyal builds on B.F. Skinner's operant conditioning research: variable ratio reward schedules produce the highest response rates and the greatest resistance to extinction (stopping the behavior).

Eyal categorizes three types of variable reward:

**Rewards of the Tribe (social)**

- Variable social validation: likes, comments, shares, upvotes
- Who liked my photo? Did anyone reply to my tweet?
- The variability comes from social unpredictability — you don't know how others will respond
- Examples: Instagram, Twitter, Reddit, Slack

**Rewards of the Hunt (resources)**

- Variable acquisition of useful information or resources
- Scrolling a feed: will the next post be interesting?
- Job board refreshes: will there be a new listing?
- News aggregators, email inbox, product feeds
- Examples: Pinterest, LinkedIn feed, Hacker News

**Rewards of the Self (mastery/completion)**

- Variable internal satisfaction from accomplishment
- Completing a level, mastering a skill, making progress
- The variability comes from difficulty — sometimes it's easy, sometimes hard
- Examples: Duolingo, games, fitness apps

**Critical design principle:** Rewards must be variable, not predictable. If a user can predict exactly what they'll get, dopamine release diminishes. The anticipation of a variable reward is neurologically more powerful than a fixed reward.

**Also critical:** Rewards should not constrain autonomy. If users feel manipulated or limited during the reward phase, the experience becomes aversive. Give users a sense of agency within the reward.

### Phase 4: Investment

The investment phase is the most underutilized and most powerful for retention.

Users invest in products by storing value — value that increases over time:

- **Data:** personalization improves with use (Spotify recommendations, Netflix suggestions)
- **Content:** user-generated content that others consume (tweets, photos, posts)
- **Followers/following:** the social graph you've built (Twitter, LinkedIn)
- **Reputation:** reviews, ratings, badges, levels built over time
- **Skills/settings:** configurations that would be painful to recreate
- **History:** browsing history, purchase history, progress that would be lost

Investment increases switching costs. But more importantly, it makes the next trigger more effective: a user who has invested receives a more personalized, more relevant prompt that they're more likely to act on.

**Design principle:** After each usage session, has the user left something behind that makes the product more valuable on the next visit? If not, you're missing the investment phase.

### Hook Model audit

To audit your product against the Hook Model:

| Phase               | Questions to ask                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Trigger**         | What external triggers exist? What internal trigger are you targeting? Have users associated the product with that emotional state yet? |
| **Action**          | What is the simplest behavior that delivers the reward? How many steps separate the trigger from that action?                           |
| **Variable Reward** | Which type of reward do you deliver (tribe/hunt/self)? Is it variable or predictable? Do users feel in control during the reward?       |
| **Investment**      | What does the user leave behind after each session? Does it increase value on the next visit?                                           |

---

## 3. Charles Duhigg's Habit Loop

**Source:** Duhigg, C. (2012). _The Power of Habit: Why We Do What We Do in Life and Business._ Random House.

Also informed by neuroscience research: Graybiel, A.M. (2008). "Habits, Rituals, and the Evaluative Brain." _Annual Review of Neuroscience_, 31, 359–387.

### The neurological loop

```
Cue → Routine → Reward → (Craving builds → Cue)
```

Once a habit is established:

- The **cue** triggers a craving for the reward
- The **routine** runs automatically (basal ganglia takes over from prefrontal cortex)
- The **reward** satisfies the craving
- Over time, the craving itself reinforces the cue's power

The key neuroscience finding (Graybiel's MIT lab experiments): when habits form, the brain's basal ganglia — which controls pattern recognition and routine behaviors — increasingly handles the routine, freeing the prefrontal cortex for other tasks. This is why habits feel effortless once formed.

### Cue types

Habits are triggered by five cue categories:

1. **Location** — where you are
2. **Time** — time of day
3. **Emotional state** — how you're feeling
4. **Other people** — social context
5. **Immediately preceding action** — what you just did

**Application:** Which of these five cue types can your product "own"? The most powerful are time-based cues (daily rituals like morning routines) and preceding-action cues (anchors in Fogg's Tiny Habits language).

### The Golden Rule of Habit Change

To change an existing habit:

- Keep the **cue** the same
- Keep the **reward** the same
- Change the **routine**

This explains why habit replacement works better than habit elimination. You can't easily stop a habit; you can replace its routine while keeping the same cue and delivering the same reward.

**Product application:** If you're trying to replace a competitor's habit, target the same cue and promise the same reward (or better). Your product is the new routine. Examples:

- Slack replaced email for team communication: same cue (need to communicate), same reward (staying connected), new routine (channels instead of inbox)
- Spotify replaced iTunes: same cue (want music), same reward (listening), new routine (streaming instead of owning)

### Keystone habits

Duhigg identifies "keystone habits" — single behaviors that trigger cascades of other positive habits. Exercise is the canonical example: people who start exercising tend to also improve their diet, sleep, and stress management, even without intending to.

**Application:** Identify the keystone habit in your product domain. What is the one behavior that, if done consistently, makes everything else in your product valuable? Design the entire onboarding experience around establishing that single keystone habit.

Examples:

- Duolingo: doing one lesson per day (keystone) → reinforces study habit → improves language skills → increases motivation
- Strava: logging one workout (keystone) → creates social accountability → improves athletic consistency
- LinkedIn: completing your profile (keystone) → enables network effects → creates value for other users

### Habit strength indicators

A habit is forming when:

- Users perform the routine without external prompting
- The routine happens at consistent times/contexts
- Users report anxiety or discomfort when unable to perform the routine ("I feel weird when I haven't checked...")
- The routine requires less conscious decision-making over time

---

## 4. Self-Determination Theory (SDT)

**Sources:**

- Deci, E.L. & Ryan, R.M. (1985). _Intrinsic Motivation and Self-Determination in Human Behavior._ Plenum Press.
- Ryan, R.M. & Deci, E.L. (2000). "Self-Determination Theory and the Facilitation of Intrinsic Motivation, Social Development, and Well-Being." _American Psychologist_, 55(1), 68–78.
- Deci, E.L., Koestner, R., & Ryan, R.M. (1999). "A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation." _Psychological Bulletin_, 125(6), 627–668. (Meta-analysis of 128 studies.)

### Three basic psychological needs

SDT proposes that humans have three innate psychological needs whose satisfaction predicts intrinsic motivation, well-being, and sustained engagement:

**Autonomy** — the experience of volition and self-direction

- Feeling that your actions are chosen, not coerced
- Having meaningful choices about how to engage
- Product design: customizable settings, multiple paths to the same goal, optional features, user control over notifications and recommendations

**Competence** — the experience of effectiveness and mastery

- Feeling that you can achieve goals and develop skills
- Seeing clear progress and skill development over time
- Product design: progressive disclosure of complexity, clear feedback on performance, visible skill progression, challenges calibrated to current ability (not too easy, not too hard)

**Relatedness** — the experience of connection to others

- Feeling that you are meaningfully connected to other people
- Caring about and being cared for by others in the product context
- Product design: social features, community, shared experiences, collaborative tools, seeing others' activity

Products that satisfy all three needs build deeply resilient retention. Users don't just use them because of habit or switching costs — they actively want to be there.

### Cognitive Evaluation Theory (CET)

A sub-theory within SDT that addresses the effect of external rewards on intrinsic motivation:

**The undermining effect:** Providing external rewards (points, badges, money) for behaviors people already find intrinsically interesting can decrease their intrinsic motivation for those behaviors.

The mechanism: external rewards shift the "perceived locus of causality" from internal to external. The user no longer does the thing because they want to — they do it for the reward. When the reward is removed, the behavior stops.

**Classic study:** Lepper, Greene & Nisbett (1973). Children who expected a reward for drawing (which they loved) showed less interest in drawing after the reward period ended, compared to children who received unexpected rewards or no rewards.

**Design implication:** Be cautious about gamifying activities users already intrinsically enjoy. Adding points to reading, creativity, or learning can undermine the love of those activities.

**When external rewards work:** They're most effective for:

- Activities people don't intrinsically enjoy (onboarding steps, profile completion)
- Initial behavior establishment before intrinsic motivation can develop
- Unexpected rewards (which don't shift perceived locus of causality)
- Rewards that provide information and feedback (competence-satisfying) rather than just control

### Applying SDT to retention design

| Need            | Audit question                                                    | Design levers                                                                                 |
| --------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Autonomy**    | Do users feel in control of their experience?                     | Customization, opt-in notifications, multiple paths, user-controlled recommendations          |
| **Competence**  | Do users see clear evidence of their progress and growing skills? | Progress visualization, skill trees, performance feedback, challenges at the right difficulty |
| **Relatedness** | Do users feel connected to other people through the product?      | Activity feeds, collaborative features, community spaces, shared challenges                   |

A product that scores low on all three is retained only by switching costs and habit inertia — fragile when a better option appears. A product that scores high on all three is retained because users genuinely want to be there.

---

## Model selection guide

| Retention challenge                       | Best model   | Why                                                          |
| ----------------------------------------- | ------------ | ------------------------------------------------------------ |
| Users don't complete onboarding           | Fogg B=MAP   | Find where motivation or ability is insufficient             |
| Users sign up but don't return            | Hook Model   | External triggers not creating internal triggers             |
| Users engage but don't form a daily habit | Habit Loop   | Find the cue to anchor and make the routine automatic        |
| Users churn after initial engagement      | SDT          | Check if autonomy, competence, and relatedness needs are met |
| Designing a new behavioral feature        | Hook Model   | Build the trigger→action→reward→investment loop first        |
| Notifications feel spammy / users opt out | Fogg B=MAP   | Prompts not aligned with motivation state                    |
| Users feel manipulated by gamification    | SDT + Ethics | Extrinsic rewards undermining intrinsic motivation           |
