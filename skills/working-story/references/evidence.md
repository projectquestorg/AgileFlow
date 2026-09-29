# Acceptance evidence in a story

Evidence lives in the story file itself, in one fenced block under an `## Evidence` heading at the end of the body. `agileflow work evidence` edits only this block; it never checks boxes or changes the status.

## Recording with the CLI

```
agileflow work evidence <story> --criterion <n|text> --kind test|inspection|pr|manual --ref <ref> [--note "<one line>"] [--file <path>...]
```

- `--criterion`: the criterion's 1-based position in Acceptance Criteria, its exact text, or a unique part of it.
- `--ref` by kind:
  - `test`: the test file and line or the test name, for example `test/workspaces.test.js:31 "the last owner cannot leave"`. Only record a test you ran and saw pass.
  - `inspection`: the implementing code, `src/workspaces.js:42`.
  - `pr`: the pull request URL.
  - `manual`: what you checked, in one line.
- With `test` and `inspection`, the file named in `--ref` is hashed automatically. Add `--file` for the other files the criterion depends on (usually the implementation), so a later change to them marks the evidence stale.
- Recording again with the same criterion, kind, and ref refreshes that record; other records are kept.
- `agileflow work evidence <story>` (or `agileflow work show <story>`) lists every criterion as `verified`, `stale` (a hashed file changed or disappeared since), or `not verified` (`not verified: checked, no evidence` when the box is checked without evidence).

## Writing the block by hand (no CLI)

````markdown
## Evidence

```yaml agileflow-evidence
- criterion: The last owner cannot leave; they get an error explaining that they must transfer ownership first.
  kind: test
  ref: test/workspaces.test.js:31 "the last owner cannot leave"
  note: ran npm test, passed
  commit: 31f0f4c0d2a4e8b1c9f7a6e5d4c3b2a1f0e9d8c7
  files:
    test/workspaces.test.js: sha256:9f86d081884c7d65
    src/workspaces.js: sha256:1b4f0e9851971998
  recorded: 2026-09-29T12:00:00.000Z
```
````

- One record per piece of evidence; a criterion may have several.
- `criterion` is the criterion text exactly as written in Acceptance Criteria.
- `kind` and `ref` are required; `note`, `commit` (`git rev-parse HEAD`), `files`, and `recorded` (ISO 8601) are optional.
- A file hash is `sha256:` plus the first 16 hex digits of the SHA-256 of the file's bytes: `printf 'sha256:%s\n' "$(sha256sum <file> | cut -c1-16)"` (on macOS, `shasum -a 256`).
- Keep exactly one `agileflow-evidence` block per story; add records to it rather than starting a second one.

## What is not evidence

- A checked box on its own.
- Stale evidence: re-verify the criterion and record fresh evidence, or treat it as not verified.
- "All tests pass" without a test that exercises this criterion.
- A criterion you could not verify: record nothing for it, leave it unchecked, and report it as not verified with the reason.
