---
name: checking-blast-radius
description: Identify what a proposed or completed code change could break elsewhere by tracing its consumers and proving the load-bearing assumptions. Use when a change touches public APIs, shared contracts or schemas, migrations, shared components, config, or cross-package code, or when the user asks about blast radius, regressions, downstream impact, or "what else could this break".
---

# Checking blast radius

Answer one question: what else can this change break?

The value of this skill is evidence, not a restatement of the reasoning already in the conversation. A blast-radius check that only re-argues why the change is safe has not checked anything.

## Workflow

1. **Pin down the change.** Identify exactly what is changing: signatures, return shapes, defaults, file formats, schema columns, env vars, behavior under edge inputs. Use the diff if one exists (`git diff`, `git diff <base>...HEAD`).
2. **Find the consumers.** Search for every reference to the changed symbols, keys, routes, or files across the whole repository, not just the current package. Include string-based references (config keys, event names, route paths, serialized field names) that a symbol search misses.
3. **Name the load-bearing assumptions.** Pick the one or two assumptions that, if wrong, would cause real breakage. Examples: "no caller relies on the old null return", "existing rows already satisfy the new constraint", "the CLI flag is not used in any script".
4. **Prove them.** For each, gather direct evidence: read the call sites, run the affected tests, query the data shape, execute the consumer. State what would have disproven it.
5. **Check the surfaces that usually leak.** If the change crosses a boundary, read `references/impact-surfaces.md` (only when needed) and check the relevant items.
6. **Report** the findings.

## Constraints

- Search before concluding "no other callers". Absence of evidence from a narrow search is not evidence.
- Distinguish **verified** (you read or ran it) from **inferred** (you reasoned about it). Label each finding.
- Do not fix what you find unless the user asked for fixes. Report it; fixing may widen scope.
- Keep it proportional. A private helper with two local callers needs a short answer, not a full sweep.

## Report format

- **Change:** one line.
- **Affected consumers:** list with file paths, each marked verified or inferred.
- **Load-bearing assumptions:** each with the evidence that proved or disproved it.
- **Risks remaining:** what could still break and how to check it.

## Done when

All direct consumers of the changed surface are enumerated, the one or two load-bearing assumptions are proven or disproven with concrete evidence, and the user has a clear list of verified impacts, inferred impacts, and remaining risks.
