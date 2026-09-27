# Fixtures

Repositories used by integration tests, conformance tests, and eval sandboxes.

| Fixture                  | Purpose                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| `clean-node`             | Plain Node project; default eval sandbox.                                |
| `eval-service`           | Small service with real bugs/features for behavioral evals (scenarios add state via `setup`). |
| `agile-app`              | Small service with an Agile Work workspace (epics, a ready story, a story with 3 of 4 criteria implemented) for Work CLI tests and Agile skill evals. |
| `interaction-service`    | Service with one ambiguity of each class (choice, missing information, repository-answerable) for question-preference evals. |
| `skills/interaction-test` | Synthetic skill whose evals isolate question-preference behavior from real skill guidance. |
| `monorepo`               | pnpm workspace with a shared contracts package, order writers, and SQL migrations (blast-radius scenarios). |
| `ops-dashboard`          | Dashboard with design tokens, server-side user settings, and cron jobs (requirements-interview scenarios). |
| `existing-claude-skills` | Claude-only skills, including one that collides with an official name.   |
| `existing-agents-skills` | Unmanaged skills already in `.agents/skills`; must survive everything.   |
| `windows-mirror`         | Run with `AGILEFLOW_LINK_MODE=mirror` to exercise generated mirrors.     |
| `v4-project`             | A real AgileFlow v4 install plus user content, for `agileflow migrate`.  |

`_golden/` holds expected filesystem trees for integration tests.
