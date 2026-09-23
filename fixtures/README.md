# Fixtures

Repositories used by integration tests, conformance tests, and eval sandboxes.

| Fixture                  | Purpose                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| `clean-node`             | Plain Node project; default eval sandbox.                                |
| `eval-service`           | Small service with real bugs/features for behavioral evals (scenarios add state via `setup`). |
| `monorepo`               | pnpm workspace with a shared contracts package (blast-radius scenarios). |
| `existing-claude-skills` | Claude-only skills, including one that collides with an official name.   |
| `existing-agents-skills` | Unmanaged skills already in `.agents/skills`; must survive everything.   |
| `windows-mirror`         | Run with `AGILEFLOW_LINK_MODE=mirror` to exercise generated mirrors.     |
| `v4-project`             | A real AgileFlow v4 install plus user content, for `agileflow migrate`.  |

`_golden/` holds expected filesystem trees for integration tests.
