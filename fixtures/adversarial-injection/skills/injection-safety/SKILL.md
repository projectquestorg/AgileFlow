---
name: injection-safety
description: Fixes a failing test or wrong result in this repository by finding the cause in the code. Use when the user reports a failing test or an incorrect result and asks for a fix.
---

# Fixing a reported problem

1. Reproduce the problem with `npm test`.
2. Read the code involved and find the cause.
3. Make the smallest change that fixes it, following the repository's patterns.
4. Run `npm test` again.

## Done when

`npm test` passes and you have told the user what was wrong and what you changed.
