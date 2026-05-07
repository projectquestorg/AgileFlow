# README Sync Workflow — Folder README Update

**Triggers:** "sync README", "update the README for docs/", "README doesn't match the folder contents", "generate contents section", "README for all docs folders"

**Goal:** Update the `## Contents` section of a folder's `README.md` to match its actual files and subdirectories — without touching any other sections.

## Inputs needed

| Input       | Required | How to get it                                                         |
| ----------- | -------- | --------------------------------------------------------------------- |
| folder path | Yes      | Ask: "Which folder should I sync? (e.g., docs/02-practices or 'all')" |

## Steps

1. If the folder is not specified, ask: "Which folder should I sync?" Options: [A] `docs/02-practices` (recommended), [B] `docs/04-architecture`, [C] `all` — sync every subfolder under `docs/`, [D] Enter a different path.

2. For each target folder:
   a. List all files and subdirectories in the folder.
   b. For each file, extract a brief description by reading the first `# ` header or the first non-empty sentence in the file.
   c. For each subdirectory, read its `README.md` first line or directory name.

3. Build the new `## Contents` section:

   ```markdown
   ## Contents

   | File                         | Description                  |
   | ---------------------------- | ---------------------------- |
   | [filename.md](./filename.md) | Brief description            |
   | [subfolder/](./subfolder/)   | What this subfolder contains |
   ```

4. Read the existing `README.md`. Find the `## Contents` section boundaries. Show the user the proposed change (what is currently in the section vs. what the new section will be).

5. Ask: [A] Update the Contents section (recommended), [B] Make changes first, [C] Skip this folder.

6. If confirmed, update only the `## Contents` section using Edit — do not modify any other section of the README.

7. If `all` was specified, repeat for every subfolder under `docs/`. Process them in parallel.

8. Report: N folders updated, M folders already up to date, K folders skipped.

## Output

Updated `## Contents` section in the target README(s). All other sections preserved unchanged.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Save and continue
2. Review before saving
3. Discard
```
