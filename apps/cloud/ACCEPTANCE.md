# Acceptance matrix (spec Appendix A, 50 requirements)

Status as of 2026-10-13.
- **Met (local):** implemented and covered by an automated test against the real HTTP app, the domain, and PGlite, using the development OAuth issuer.
- **Partial:** implemented, but part of the acceptance evidence is missing (named in the row).
- **Blocked:** needs a real Clerk instance, real agent clients, or a production deployment. See [STAGE0.md](STAGE0.md).

Tests are in `apps/cloud/test/*` and `apps/cli/test/integration/cloud.test.ts`. The dashboard was checked with a headless Chromium run; screenshots are not committed.

| ID | Requirement | Status | Evidence / gap |
|---|---|---|---|
| AUTH-01 | Login, signup, recovery, expiry, logout | Blocked | Session verification is tested: expiry, wrong type, a bad bearer never falls back to the cookie, cross-origin cookie writes are refused. The Clerk sign-in UI (`@clerk/clerk-react`) is wired but has never run, because no Clerk keys are available. |
| AUTH-02 | Organization creation, selection, invitations | Partial | The organization comes only from the verified token (`binds requests to the verified organization`). Grants require upstream-confirmed membership (`setGrant`). Invitations go through Clerk's OrganizationSwitcher, which is untested (Blocked). |
| AUTH-03 | Organization and project permissions | Met (local) | A viewer is denied through the browser, MCP and CLI; guessed IDs from another organization return NOT_FOUND; per-tab sessions are isolated (`first-slice`). |
| AUTH-04 | Membership, session, grant revocation | Met (local) | Membership is re-verified on every mutation and cached for at most 60 s on reads; upstream outage fails closed; disabled connection; revoked grant; revoked companion (`collaboration`). |
| AUTH-05 | Lifecycle via Clerk events | Partial | Svix signature verification, deduplication, stale-event ordering and user tombstones are implemented and tested (`Clerk webhooks`). Last-admin protection is left to Clerk and untested. Real Clerk deliveries are Blocked. |
| AUTH-06 | Personal and team onboarding | Partial | The "needs organization" state, creating a project from empty, and first use without waiting for a webhook are covered. The Clerk organization-creation UI is Blocked. |
| WORK-01 | Epics, stories, decisions | Met (local) | Native IDs and type-specific fields (`first-slice`, `collaboration`). |
| WORK-02 | Board and list views | Met (local) | Shared records; complete cursor pagination; standalone stories visible. |
| WORK-03 | Accessible Kanban moves | Met (local) | Drag and the status select call the same transition; rollback on conflict; aria-live announcements (headless browser run). |
| WORK-04 | Readiness and dependencies | Met (local) | A cancelled dependency is not "done"; self, missing, wrong-type and cyclic edges are rejected; a 10k-story chain causes no recursion. |
| WORK-05 | Lifecycle parity | Met (local) | Native warnings are preserved; overrides need approval; export keeps native severity. |
| WORK-06 | Acceptance criteria and Definition of Done | Met (local) | Criteria are counted by the native parser; finishing a run never checks criteria. |
| WORK-07 | Product and roadmap documents | Met (local) | Full-body editing with version and hash; templates; import fidelity. |
| WORK-08 | Decisions and relationships | Met (local) | `related`, `supersededBy`, and note-to-decision promotion (proposed decision linked to the note, single use) are tested (`lifecycle-and-delivery`). |
| WORK-09 | Human and agent notes | Met (local) | Add, list, server-derived author, and corrections are tested. Only the author can edit their own note; admin redaction removes the text from the note, its revisions, and the complete export, and leaves a redaction event (`lifecycle-and-delivery`). |
| WORK-10 | Activity and history | Met (local) | Per-project sequence, filters, pagination. |
| WORK-11 | Concurrent edits | Met (local) | Version conflicts, idempotency replay and conflict, claim race. |
| WORK-12 | Long content and large projects | Met (local) | UTF-8-safe 64 KiB chunks, cursors bound to version and principal; 10k stories (list 0.12 s, board 0.34 s on PGlite). |
| WORK-13 | Cancellation, archive, retention | Met (local) | Archive makes the project read-only; a deletion request removes access immediately; restore works; purge deletes data after 30 days (`lifecycle-and-delivery`). |
| MCP-01 | Discoverable typed interface | Met (local) | A real MCP SDK client lists 22 tools; output schema; resources; prompts. |
| MCP-02 | Scope and tenant enforcement | Met (local) | HTTP 403 `insufficient_scope` before the domain runs; wrong audience, issuer or type and a missing organization are rejected. |
| MCP-03 | Shared domain behavior | Met (local) | One tool registry for MCP, the CLI and the dashboard; the pause applies equally to MCP and the CLI. |
| MCP-04 | Retry and conflict behavior | Met (local) | requestId replay and conflict, expectedVersion, structured errors. |
| MCP-05 | Connection, run, companion, claim identity | Met (local) | A connection can't use another connection's run; runs and claims are owned by their connection. |
| MCP-06 | Work claims | Met (local) | One winner, generations, renewal rate limit, release on finish. |
| MCP-07 | Pagination and structured errors | Met (local) | Signed cursors; tampered cursors rejected. |
| MCP-08 | Skill and plugin distribution | Partial | Plugin generated, passes `claude plugin validate`, installs from the repository marketplace into Claude Code 2.1.296 (router skill plus MCP server; the installed server reached a local service and asked for sign-in). Real clients against the dev authorization server: Claude Code and Codex completed sign-in and tool calls, Claude Code the scope step-up, Codex token refresh (STAGE0.md). Router evals on Codex 0.160.0: 5/5 positive scenarios activated with all deterministic rule checks passing (rubric ungraded, no judge); both negatives pass with the full catalog installed (routed to working-story / writing-stories). Not yet: Cursor, a judged rubric run, and the same runs against Clerk. |
| CTRL-01 | Skill catalog and observed state | Partial | The companion reports a typed inventory that the dashboard shows. No copy inventory across host plugin and global installs. |
| CTRL-02 | Safe skill enable/activation/update | Met (local) | The companion applies enable and activation through the native config writers and sync, and pins an exact approved official version through the native update path. An unavailable version fails and the previous range is restored; modified skills are blocked; third-party sources stay a local review (CLI test). |
| CTRL-03 | Provider configuration | Met (local) | on/off/auto is applied (CLI test). |
| CTRL-04 | Question preference | Met (local) | Applied and observed (CLI test). |
| CTRL-05 | Local consent and supported platforms | Partial | Enrollment (possession proof, single-use, approval, revoke) is tested on linux-x64; unsupported platforms are refused. macOS arm64/x64 have not been exercised. |
| CTRL-06 | Desired versus applied | Met (local) | Pending, unsupported, upgrade retry, blocked partial, applied; observed revision advances only on full application. |
| CTRL-07 | Agent access, pause, revocation | Met (local) | Pause, disable, restrict to projects; a fresh token does not re-enable a disabled connection. |
| CTRL-08 | Bounded local operations and approvals | Met (local) | Typed allowlist; arbitrary commands rejected; agents can request settings changes but never apply them. |
| DATA-01 | Explicit local or connected authority | Met (local) | `.agileflow/connection.json` manifest; no local-file fallback (CLI test). |
| DATA-02 | Native import preview | Met (local) | Quarantined native scan; counts, issues, changes. |
| DATA-03 | Import identity and fidelity | Met (local) | IDs, relations and unknown metadata preserved; unchanged originals are byte-exact on export. |
| DATA-04 | Atomic validation and activation | Met (local) | Duplicate IDs and dangling references block; unsafe paths rejected; commit is transactional and retry-safe. |
| DATA-05 | Native and complete export | Met (local) | Schema-1 files plus namespaced collaboration JSON plus validation report. |
| DATA-06 | Branch and worktree binding | Met (local) | Repository identity and checkout hash are bound. The CLI refuses a moved checkout or a changed remote until it is re-bound, and the companion refuses a mismatched binding (CLI test). |
| DATA-07 | v4 compatibility | Met (local) | v4 → native migration → connected import keeps `legacy_id` (`scale-and-v4`). |
| DATA-08 | Local edits and re-import conflicts | Met (local) | Three-way plan; conflicts require a choice; a missing file never deletes. |
| OPS-01 | Honest loading, saving, errors | Partial | Dashboard states were checked in the headless run; no structured UX review. |
| OPS-02 | Safe rendering and untrusted context | Partial | Markdown without raw HTML (`<script>`, `javascript:` not rendered); content security policy; skills treat stored notes as data. The prompt-injection eval is linted, not run. |
| OPS-03 | Durability and recovery | Partial | Restore drill on real PostgreSQL 18 (`scripts/pg-drill.ts`): cold physical backup restored into a new instance in 1.1 s; all 9 tables identical; reads work after restore; a retried pre-backup request replays its recorded result. Continuous WAL archiving / point-in-time recovery (the 15-minute RPO target) needs the production database. |
| OPS-04 | Observable operation and delivery | Met (local) | Structured logs and activity. An outbox worker delivers committed events with backoff and an exhausted state, and wakes a long-polling dashboard (`lifecycle-and-delivery`). |
| OPS-05 | Measured performance and bounds | Met (local) | Real PostgreSQL 18, 10k stories, 40 runs each (`scripts/pg-drill.ts`), server-side p95: list 13 ms, readiness filter 56 ms, board 143 ms, detail 10 ms, write 18 ms. Targets: reads < 500 ms, writes < 750 ms. Production-network latency and Clerk verification calls are not included. |
| OPS-06 | Accessibility and responsive | Met (local) | axe-core WCAG 2.1 A/AA audit of all 15 routes at 1440 px and 390 px: 0 violations after fixes (`scripts/a11y-audit.mjs`). Keyboard-only navigation reaches each card status select. No manual screen-reader pass yet. |
| OPS-07 | Existing local independence | Met (local) | The full repository suite passes (667 tests); the cloud is optional; the CLI has no new runtime dependency unless `cloud` is used. |

Summary: **40 Met (local), 9 Partial, 1 Blocked** (several Partial rows also contain a Blocked part). None of the "Met (local)" rows have been run against real Clerk OAuth or real clients yet. That evidence comes from Stage 0.
