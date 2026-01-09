---
description: AI-directed decision making with structured options
argument-hint: <decision> [context]
compact_context:
  priority: normal
  preserve_rules:
    - "Present structured options with trade-offs"
    - "AI selects best option based on context"
    - "Always explain selection rationale"
    - "Can delegate to experts for analysis before choosing"
---

# /agileflow:choose

AI-directed decision making. Use when multiple valid approaches exist and you want Claude to analyze trade-offs and recommend the best option.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js choose
```

---

<!-- COMPACT_SUMMARY_START -->

## Compact Summary

**Role**: Decision Advisor - Analyze options and recommend best approach

**When to use:**
- Multiple valid approaches exist
- Trade-offs need analysis
- Expert judgment required
- Not a simple yes/no question

**Choice block syntax:**
```
choice **<decision criteria>**:
  option "<name>":
    - Description
    - Trade-offs
  option "<name>":
    - Description
    - Trade-offs
```

**Output format:**
```
## Decision: <question>

### Options Analyzed
1. Option A: [analysis]
2. Option B: [analysis]

### Recommendation
**Selected: Option X**
Rationale: [why this is best]

### Trade-offs Accepted
- [trade-off 1]
- [trade-off 2]

### Next Steps
1. [action 1]
2. [action 2]
```

<!-- COMPACT_SUMMARY_END -->

---

## Usage

```
/agileflow:choose <decision>
/agileflow:choose <decision> CONTEXT=<additional_context>
```

---

## How It Works

### 1. Analyze the Decision

First, understand what's being decided:
- What are the constraints?
- What matters most? (speed, quality, maintainability, etc.)
- What's the current context?

### 2. Generate Options

For each viable approach:
- **Name**: Clear label
- **Description**: What this approach entails
- **Pros**: Benefits and strengths
- **Cons**: Drawbacks and risks
- **Effort**: Relative implementation cost
- **Risk**: Potential failure modes

### 3. Evaluate Against Criteria

Score each option against relevant factors:
- **Fit**: How well it matches requirements
- **Feasibility**: How practical to implement
- **Future-proof**: How well it handles change
- **Team capacity**: Skills and time available

### 4. Make Recommendation

Select the best option and explain:
- Why this option wins
- What trade-offs are accepted
- What risks to monitor
- What next steps to take

---

## Examples

### Performance Optimization

```
/agileflow:choose best approach to fix slow API response times
```

**Decision**: Best approach to fix slow API response times

**Options:**
1. **Add Caching (Redis)**
   - Pros: Fast reads, reduces DB load
   - Cons: Cache invalidation complexity, added infrastructure
   - Effort: Medium
   - Risk: Stale data issues

2. **Optimize Database Queries**
   - Pros: Addresses root cause, no new dependencies
   - Cons: May have diminishing returns, requires deep analysis
   - Effort: High
   - Risk: May not be enough

3. **Add Pagination**
   - Pros: Reduces data transfer, simple to implement
   - Cons: UI changes needed, doesn't fix underlying issue
   - Effort: Low
   - Risk: Just masks the problem

**Recommendation**: Start with **Option 2 (Optimize Queries)**, then add **Option 1 (Caching)** if needed.

**Rationale**: Optimizing queries addresses the root cause. Adding caching on top of slow queries just hides the problem. Start with the foundation, then layer caching for frequently accessed data.

---

### Architecture Decision

```
/agileflow:choose authentication approach for new API CONTEXT="multi-tenant SaaS, 50K users"
```

**Decision**: Authentication approach for multi-tenant SaaS (50K users)

**Options:**
1. **JWT with Short Expiry**
   - Pros: Stateless, scalable, industry standard
   - Cons: Can't revoke tokens instantly, need refresh token logic
   - Effort: Medium
   - Risk: Token theft requires expiry wait

2. **Session-based Auth**
   - Pros: Instant revocation, simple mental model
   - Cons: Server state, horizontal scaling needs session store
   - Effort: Medium
   - Risk: Session store becomes bottleneck

3. **OAuth 2.0 with Identity Provider**
   - Pros: SSO support, enterprise ready, offloads auth complexity
   - Cons: External dependency, more complex integration
   - Effort: High
   - Risk: Vendor lock-in, latency from external calls

**Recommendation**: **Option 3 (OAuth 2.0 with Identity Provider)**

**Rationale**: For multi-tenant SaaS with 50K users:
- Enterprises will expect SSO
- Managing auth in-house is a liability
- Auth0/Okta handle the complexity
- Worth the integration effort upfront

---

### Development Approach

```
/agileflow:choose how to implement the new dashboard feature
```

**Decision**: Development approach for new dashboard

**Options:**
1. **Quick Prototype**
   - Pros: Fast iteration, early feedback
   - Cons: Tech debt, may need rewrite
   - Effort: Low
   - Risk: Prototype becomes production

2. **Full Architecture First**
   - Pros: Solid foundation, scalable
   - Cons: Slow, may over-engineer
   - Effort: High
   - Risk: Analysis paralysis

3. **Incremental TDD**
   - Pros: Quality + speed balance, refactorable
   - Cons: Requires discipline, initial slowdown
   - Effort: Medium
   - Risk: Tests may constrain design

**Recommendation**: **Option 3 (Incremental TDD)**

**Rationale**: Dashboard is user-facing with many edge cases. TDD ensures:
- Components work correctly from the start
- Refactoring is safe when design evolves
- Tests serve as documentation

---

## Integration with Experts

For complex decisions, delegate analysis to domain experts:

```
choice **best database for this workload**:
  experts:
    - agileflow-database (analyze data patterns)
    - agileflow-performance (analyze scaling needs)
  options:
    - PostgreSQL
    - MongoDB
    - DynamoDB
```

This spawns experts in parallel to analyze, then synthesizes their recommendations.

---

## Choice Block Syntax (Advanced)

For embedding choice blocks in workflows:

```markdown
## Decision Point

choice **<criteria>**:
  option "<name>":
    - Description line 1
    - Description line 2
  option "<name>":
    - Description line 1
    - Description line 2

### After Choice

Proceed with selected option...
```

The AI evaluates options against the criteria and selects the best one.

---

## Output Format

Every choice decision outputs:

```markdown
## Decision: [question]

### Context
[Summary of situation and constraints]

### Options Analyzed

#### Option 1: [name]
**Description**: [what it is]
**Pros**: [benefits]
**Cons**: [drawbacks]
**Effort**: [low/medium/high]
**Risk**: [potential issues]

#### Option 2: [name]
...

### Analysis

[Comparison matrix or discussion]

### Recommendation

**Selected: [option name]**

**Rationale**: [why this option is best for this situation]

**Trade-offs Accepted**:
- [trade-off 1]
- [trade-off 2]

### Next Steps
1. [immediate action]
2. [follow-up action]
3. [verification step]
```

---

## When NOT to Use

- Simple yes/no questions (just answer directly)
- Only one viable option (just proceed)
- User has already decided (just implement)
- Trivial decisions (don't over-engineer the process)

Use `/agileflow:choose` for decisions that:
- Have 2+ viable options
- Involve trade-offs worth analyzing
- Benefit from structured thinking
- Need documented rationale

---

## Best Practices

1. **Include context**: More context = better recommendations
2. **Define success criteria**: What matters most?
3. **Be honest about trade-offs**: Every option has downsides
4. **Document decisions**: Use `/agileflow:adr` for important architectural choices
5. **Revisit decisions**: Circumstances change; choices may need updating
