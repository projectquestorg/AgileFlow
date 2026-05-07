# Brainstorm Techniques

**Load this when:** facilitating a brainstorm, generating feature ideas,
or helping a team get unstuck on a problem.

## Technique selection guide

| Goal                       | Best technique                   |
| -------------------------- | -------------------------------- |
| Generate many ideas fast   | Brainwriting / silent brainstorm |
| Find unexpected angles     | SCAMPER, "How might we"          |
| Understand user problems   | Jobs-to-be-done interviews       |
| Explore adjacent markets   | Analogical thinking              |
| Challenge assumptions      | Pre-mortem, "Kill the company"   |
| Prioritize from large list | Dot voting, RICE                 |

## How Might We (HMW)

Reframes problems as opportunities. Takes a user pain and makes it a design prompt.

**Formula:** "How might we [remove obstacle / improve experience / enable behavior]?"

**Examples:**

- Pain: "Users don't know if their order shipped" → HMW: "How might we give users confidence their order is on its way without them having to check?"
- Pain: "Onboarding takes 20 minutes" → HMW: "How might we get users to their first 'aha' in under 3 minutes?"
- Pain: "Reports are confusing" → HMW: "How might we make our reports understandable to a non-technical manager?"

HMW questions shouldn't imply the solution (avoid "How might we send more emails?").

## SCAMPER

Structured creativity — force new angles by applying transformations:

| Letter                  | Prompt                           | Applied to a feature                                 |
| ----------------------- | -------------------------------- | ---------------------------------------------------- |
| **S**ubstitute          | Replace a component              | Replace email notifications with push                |
| **C**ombine             | Merge with something else        | Combine onboarding with first use                    |
| **A**dapt               | Borrow from another domain       | Adapt Spotify's Discover Weekly to surface old tasks |
| **M**odify / Magnify    | Make bigger, smaller, faster     | Make the dashboard load instantly (edge caching)     |
| **P**ut to other uses   | New context for existing feature | Use billing emails as a re-engagement channel        |
| **E**liminate           | Remove a step                    | Remove the confirmation email entirely               |
| **R**everse / Rearrange | Flip the order                   | Ask for payment before account creation              |

## Crazy 8s

8 ideas in 8 minutes. No judgment, no refining — volume over quality.

**Format:**

1. Set a timer for 8 minutes
2. Fold a sheet into 8 panels (or use 8 sticky notes)
3. Sketch one idea per panel — 1 minute each
4. Review after — usually 1-2 are surprisingly strong

Works best for UI/UX problems. Forces quantity, breaks perfectionism.

## Pre-mortem

Assume the project failed. Work backward to find why.

**Script:**

1. "Imagine it's 12 months from now and this feature completely failed."
2. "What went wrong? List every possible cause."
3. Review the list — which risks can be mitigated now?

More effective than forward-looking risk analysis because it activates different thinking.

## Analogical thinking

Find solutions in adjacent industries:

| Your problem                     | Analogous domain                          | Insight                                          |
| -------------------------------- | ----------------------------------------- | ------------------------------------------------ |
| Reduce checkout abandonment      | Hotel industry: hold room without payment | Allow "save my cart" with intent signal          |
| Onboarding takes too long        | Airlines: pre-check                       | Pre-fill everything available before user starts |
| Engagement drops after day 7     | Fitness apps: streak mechanics            | Day-7 milestone + visible progress streak        |
| Support tickets spike on Mondays | Restaurants: Sunday prep                  | "Monday preview" email sent Fridays              |

**Process:**

1. Abstract your problem to its essence: "How do we maintain engagement over time?"
2. Ask: "Which industries are exceptional at this?"
3. Study their approach
4. Translate back to your context

## "Kill the company" exercise

Forces teams to find their biggest vulnerabilities:

1. "A competitor just put us out of business. What did they do?"
2. "A regulation just killed our product. What was it?"
3. "Our biggest customer just left. What drove them away?"

The answers reveal your defensive priorities and often surface product gaps worth building against.

## Brainwriting (silent brainstorm)

Better than spoken brainstorms for introverts and reducing groupthink:

1. Each person writes 3 ideas (5 min, silent)
2. Pass papers clockwise
3. Read neighbor's ideas, write 3 more (inspired or independent) — 5 min
4. Repeat 3-4 rounds
5. Collect all, group by theme, dot vote

**Why it's better than talking:** No anchoring on first idea, equal participation, no social pressure.

## Dot voting

Quick prioritization from a large list:

1. Put all ideas on a board (sticky notes or digital)
2. Each person gets 3-5 dots (votes)
3. Vote silently — can cluster or spread
4. Count dots, discuss top items

**Bias warning:** People vote for ideas they already know. Require voters to read all ideas before voting.

## Feature analogy generation

Prompt for generating adjacent feature ideas:

```
Our product does [X].
Users also need [related task].
What feature would bridge [X] to [related task]?
```

Example:

```
Our product does project management.
Users also need to communicate with clients.
What feature would bridge project management to client communication?
→ Client-visible comments, shareable milestones, client portal
```
