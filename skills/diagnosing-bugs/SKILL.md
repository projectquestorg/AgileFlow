---
name: diagnosing-bugs
description: Diagnose and fix reproducible defects, regressions, failing tests, crashes, and unexpected behavior by reproducing, isolating the root cause, and making the smallest fix that explains the evidence. Use when the user reports something broken, a test or build is failing, behavior changed unexpectedly, or they ask for root-cause analysis. Do not use for general conceptual questions or new feature work.
---

# Diagnosing bugs

Establish evidence before changing code.

## Workflow

1. **Reproduce** the reported failure when practical: run the failing test, command, or request and capture the actual error output. If it cannot be reproduced, say so and state what evidence you are working from instead.
2. **Inspect** the relevant code and runtime evidence: stack traces, logs, recent commits touching the area (`git log -p` on the suspect files is often the fastest lead for regressions).
3. **Separate symptoms from causes.** The line that throws is often not the line that is wrong. Trace the bad value or state back to where it was introduced.
4. **Test the most plausible hypotheses** with cheap experiments (a targeted log, a narrowed test case, a bisect) before editing production code. Discard hypotheses the evidence contradicts.
5. **Fix the smallest root cause** that explains all of the evidence. If the fix only makes the symptom disappear, keep going.
6. **Verify** the original failure no longer reproduces, using the same reproduction from step 1.
7. **Add focused regression coverage** when it meaningfully protects the fix and the project has a test setup for that area.

## Constraints

- Do not fix unrelated issues discovered during diagnosis. Report them separately.
- Do not paper over errors: no swallowing exceptions, loosening assertions, adding retries, or skipping tests to make a failure go away unless that is genuinely the correct fix and you say why.
- Do not change a test's expectations to match buggy output. If the test itself is wrong, explain the evidence before changing it.
- If several edits in a row have not changed the failure, stop editing and return to evidence gathering.
- If the root cause is outside the code you can change (dependency bug, environment, data, upstream service), stop and report it with the evidence rather than working around it silently.

## Report

State briefly: the root cause, the evidence for it, what you changed, and how you verified it. Mention any unrelated issues found and anything you could not verify.

## Done when

The root cause is identified with evidence, the smallest appropriate fix is applied, and the original reproduction now passes (or, if it could not be reproduced or fixed, the evidence and remaining uncertainty are reported to the user).
