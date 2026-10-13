-- AgileFlow connected service, schema 1.
-- Tenant isolation is structural: every project-scoped row carries
-- workspace_id + project_id and related rows use composite foreign keys.

CREATE TABLE workspaces (
  id              text PRIMARY KEY,
  clerk_org_id    text NOT NULL UNIQUE,
  name            text NOT NULL,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'locked', 'deleted')),
  -- Settings that govern every project: requireStartApproval, allowLifecycleOverride.
  policy          jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_revision integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            text PRIMARY KEY,             -- Clerk user ID
  display_name  text,
  email         text,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Mirror of Clerk organization membership (Clerk stays authoritative).
CREATE TABLE memberships (
  workspace_id  text NOT NULL REFERENCES workspaces(id),
  user_id       text NOT NULL REFERENCES users(id),
  role          text NOT NULL CHECK (role IN ('admin', 'member')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  -- Last time this row was confirmed against Clerk (read cache bound).
  verified_at   timestamptz NOT NULL DEFAULT now(),
  -- Clerk event timestamp that last changed this row (ordering guard).
  source_ts     bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE projects (
  id              text PRIMARY KEY,
  workspace_id    text NOT NULL REFERENCES workspaces(id),
  name            text NOT NULL,
  slug            text NOT NULL,
  authority_mode  text NOT NULL DEFAULT 'connected' CHECK (authority_mode IN ('connected')),
  native_schema   integer NOT NULL DEFAULT 1,
  -- Pause connected-client changes to work (token clients only).
  client_writes_paused boolean NOT NULL DEFAULT false,
  archived_at     timestamptz,
  deletion_requested_at timestamptz,
  policy_revision integer NOT NULL DEFAULT 1,
  activity_seq    bigint NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug),
  UNIQUE (workspace_id, id)
);

CREATE TABLE project_grants (
  workspace_id  text NOT NULL,
  project_id    text NOT NULL,
  user_id       text NOT NULL REFERENCES users(id),
  role          text NOT NULL CHECK (role IN ('viewer', 'editor')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  granted_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE work_items (
  id            text PRIMARY KEY,               -- internal UUID
  workspace_id  text NOT NULL,
  project_id    text NOT NULL,
  native_id     text NOT NULL,                  -- EPIC-/STORY-/DEC- + 8 Crockford chars
  type          text NOT NULL CHECK (type IN ('epic', 'story', 'decision')),
  title         text NOT NULL,
  status        text NOT NULL,
  body          text NOT NULL DEFAULT '',
  priority      text CHECK (priority IN ('p0', 'p1', 'p2', 'p3')),
  horizon       text CHECK (horizon IN ('now', 'next', 'later')),
  legacy_id     text,
  legacy_source jsonb,
  -- Unknown frontmatter preserved from import; never interpreted.
  unknown_meta  jsonb,
  -- Collaboration extensions (not native frontmatter).
  assignee      text,
  tags          jsonb NOT NULL DEFAULT '[]'::jsonb,
  board_rank    double precision NOT NULL DEFAULT 0,
  rank_version  integer NOT NULL DEFAULT 1,
  archived_at   timestamptz,
  version       integer NOT NULL DEFAULT 1,
  content_hash  text NOT NULL,
  -- Lease generation counter for claims on this story.
  claim_generation integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, native_id),
  UNIQUE (workspace_id, project_id, native_id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id),
  CHECK (
    (type = 'story' AND status IN ('backlog', 'ready', 'in-progress', 'in-review', 'blocked', 'done', 'cancelled')) OR
    (type = 'epic' AND status IN ('proposed', 'active', 'done', 'cancelled')) OR
    (type = 'decision' AND status IN ('proposed', 'accepted', 'superseded', 'rejected'))
  )
);
CREATE INDEX work_items_project_type_status ON work_items (project_id, type, status);

-- Canonical relationships; native epic/depends_on/related are rendered from these rows.
CREATE TABLE work_relations (
  workspace_id  text NOT NULL,
  project_id    text NOT NULL,
  source_id     text NOT NULL,   -- native ID
  target_id     text NOT NULL,   -- native ID
  kind          text NOT NULL CHECK (kind IN ('parent_epic', 'depends_on', 'related', 'superseded_by')),
  position      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, source_id, kind, target_id),
  FOREIGN KEY (workspace_id, project_id, source_id) REFERENCES work_items(workspace_id, project_id, native_id),
  FOREIGN KEY (workspace_id, project_id, target_id) REFERENCES work_items(workspace_id, project_id, native_id),
  CHECK (source_id <> target_id)
);
CREATE INDEX work_relations_target ON work_relations (project_id, target_id, kind);
-- A story has at most one parent epic; a decision has at most one successor.
CREATE UNIQUE INDEX work_relations_one_parent ON work_relations (project_id, source_id) WHERE kind = 'parent_epic';
CREATE UNIQUE INDEX work_relations_one_successor ON work_relations (project_id, source_id) WHERE kind = 'superseded_by';

CREATE TABLE documents (
  workspace_id  text NOT NULL,
  project_id    text NOT NULL,
  key           text NOT NULL CHECK (key IN ('product', 'roadmap')),
  body          text NOT NULL DEFAULT '',
  version       integer NOT NULL DEFAULT 1,
  content_hash  text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, key),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

-- Original imported bytes and merge bases, for exact downloads and re-import.
CREATE TABLE native_sources (
  workspace_id  text NOT NULL,
  project_id    text NOT NULL,
  object_key    text NOT NULL,      -- native ID, or 'doc:product' / 'doc:roadmap'
  path          text NOT NULL,
  original      text NOT NULL,
  source_digest text NOT NULL,
  import_job_id text NOT NULL,
  base_version  integer NOT NULL,
  base_hash     text NOT NULL,
  PRIMARY KEY (project_id, object_key),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE revisions (
  id            bigserial PRIMARY KEY,
  workspace_id  text NOT NULL,
  project_id    text NOT NULL,
  object_type   text NOT NULL,   -- work | document | note
  object_id     text NOT NULL,
  version       integer NOT NULL,
  snapshot      jsonb NOT NULL,
  actor         jsonb NOT NULL,
  operation     text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, object_type, object_id, version),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE access_connections (
  id            text PRIMARY KEY,
  workspace_id  text NOT NULL REFERENCES workspaces(id),
  issuer        text NOT NULL,
  user_id       text NOT NULL REFERENCES users(id),
  client_id     text NOT NULL,
  resource      text NOT NULL,      -- canonical resource URI (/mcp, /cli, /local-control)
  -- null = every project the user can access; otherwise an explicit subset.
  allowed_projects jsonb,
  disabled_at   timestamptz,
  disabled_by   text,
  policy_revision integer NOT NULL DEFAULT 1,
  last_request_at timestamptz,
  last_scopes   jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, user_id, workspace_id, client_id, resource)
);

CREATE TABLE notes (
  id            text PRIMARY KEY,
  workspace_id  text NOT NULL,
  project_id    text NOT NULL,
  work_id       text,       -- native ID
  run_id        text,
  kind          text NOT NULL CHECK (kind IN ('comment', 'progress', 'blocker', 'handoff', 'decision-proposal', 'correction')),
  body          text NOT NULL,
  author        jsonb NOT NULL,
  corrects_note_id text,
  promoted_decision_id text,
  version       integer NOT NULL DEFAULT 1,
  redacted_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);
CREATE INDEX notes_project_created ON notes (project_id, created_at, id);

CREATE TABLE runs (
  id            text PRIMARY KEY,
  workspace_id  text NOT NULL,
  project_id    text NOT NULL,
  connection_id text NOT NULL REFERENCES access_connections(id),
  work_ids      jsonb NOT NULL DEFAULT '[]'::jsonb,
  name          text NOT NULL,
  intent        text NOT NULL,
  state         text NOT NULL CHECK (state IN ('planning', 'running', 'blocked', 'awaiting-review', 'completed', 'failed', 'cancelled')),
  summary       text,
  blocker       text,
  evidence      jsonb NOT NULL DEFAULT '[]'::jsonb,
  cancel_requested_at timestamptz,
  cancel_requested_by text,
  cancel_acknowledged_at timestamptz,
  approval_id   text,
  version       integer NOT NULL DEFAULT 1,
  started_at    timestamptz NOT NULL DEFAULT now(),
  last_report_at timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);
CREATE INDEX runs_project_state ON runs (project_id, state);

CREATE TABLE claims (
  id            text PRIMARY KEY,
  workspace_id  text NOT NULL,
  project_id    text NOT NULL,
  story_id      text NOT NULL,    -- native ID
  run_id        text NOT NULL REFERENCES runs(id),
  connection_id text NOT NULL,
  generation    integer NOT NULL,
  version       integer NOT NULL DEFAULT 1,
  expires_at    timestamptz NOT NULL,
  last_renewed_at timestamptz NOT NULL DEFAULT now(),
  released_at   timestamptz,
  release_reason text,
  override_by   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, project_id, story_id) REFERENCES work_items(workspace_id, project_id, native_id)
);
-- One unreleased claim row per story; expiry is checked at acquire time and
-- an expired row is released inside the acquiring transaction.
CREATE UNIQUE INDEX claims_one_active ON claims (project_id, story_id) WHERE released_at IS NULL;

CREATE TABLE approvals (
  id            text PRIMARY KEY,
  workspace_id  text NOT NULL,
  project_id    text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('settings_change', 'execution_start', 'lifecycle_override', 'claim_override')),
  requested_by_connection text,
  requested_by_user text NOT NULL,
  proposal      jsonb NOT NULL,    -- immutable reviewed operation and bound versions
  proposal_hash text NOT NULL,
  reason        text NOT NULL,
  state         text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'rejected', 'consumed', 'expired', 'cancelled')),
  decided_by    text,
  decided_at    timestamptz,
  consumed_at   timestamptz,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE companions (
  id            text PRIMARY KEY,
  workspace_id  text NOT NULL REFERENCES workspaces(id),
  owner_user_id text NOT NULL REFERENCES users(id),
  name          text NOT NULL,
  platform      text NOT NULL,
  version       text NOT NULL,
  capabilities  jsonb NOT NULL DEFAULT '[]'::jsonb,
  credential_hash text,
  revoked_at    timestamptz,
  last_seen_at  timestamptz,
  last_inventory jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE companion_checkouts (
  id            text PRIMARY KEY,
  companion_id  text NOT NULL REFERENCES companions(id),
  workspace_id  text NOT NULL,
  project_id    text NOT NULL,
  repo_identity text NOT NULL,
  checkout_path_hash text NOT NULL,
  desired_revision integer NOT NULL DEFAULT 0,
  observed_revision integer NOT NULL DEFAULT 0,
  last_observation jsonb,
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

-- Single-use, expiring enrollment approvals. The possession secret's hash is
-- set by the initiating companion; the credential is delivered only on redeem.
CREATE TABLE enrollment_requests (
  id            text PRIMARY KEY,
  workspace_id  text NOT NULL REFERENCES workspaces(id),
  user_id       text NOT NULL,
  project_id    text NOT NULL,
  possession_hash text NOT NULL,
  request       jsonb NOT NULL,     -- name, platform, version, capabilities, repo identity, checkout hash
  approved_by   text,
  approved_capabilities jsonb,
  state         text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'redeemed', 'expired', 'rejected')),
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE control_revisions (
  id            text PRIMARY KEY,
  workspace_id  text NOT NULL,
  project_id    text NOT NULL,
  revision      integer NOT NULL,
  desired       jsonb NOT NULL,
  created_by    text NOT NULL,
  approval_id   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, revision),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE control_operations (
  id            text PRIMARY KEY,
  workspace_id  text NOT NULL,
  project_id    text NOT NULL,
  companion_id  text NOT NULL REFERENCES companions(id),
  checkout_id   text NOT NULL REFERENCES companion_checkouts(id),
  revision      integer NOT NULL,
  plan          jsonb NOT NULL,
  plan_hash     text NOT NULL,
  state         text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'applying', 'applied', 'blocked', 'unsupported', 'failed', 'expired', 'cancelled', 'superseded', 'unknown')),
  attempts      integer NOT NULL DEFAULT 0,
  expires_at    timestamptz NOT NULL,
  receipt       jsonb,
  error         jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE jobs (
  id            text PRIMARY KEY,
  workspace_id  text NOT NULL,
  project_id    text,
  kind          text NOT NULL CHECK (kind IN ('import', 'export')),
  owner_user_id text NOT NULL,
  operation_key text NOT NULL,
  source_digest text,
  status        text NOT NULL CHECK (status IN ('previewed', 'committed', 'failed', 'expired', 'completed')),
  preview       jsonb,
  -- Quarantined upload kept until commit or expiry (private; never served back).
  source        jsonb,
  result        jsonb,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, owner_user_id, kind, operation_key)
);

CREATE TABLE activity_events (
  workspace_id  text NOT NULL,
  project_id    text NOT NULL,
  seq           bigint NOT NULL,
  actor         jsonb NOT NULL,
  operation     text NOT NULL,
  object_type   text NOT NULL,
  object_id     text NOT NULL,
  object_version integer,
  summary       text NOT NULL,
  correlation_id text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, seq),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE TABLE idempotency_records (
  principal_key text NOT NULL,
  project_id    text NOT NULL,
  operation     text NOT NULL,
  request_key   text NOT NULL,
  request_digest text NOT NULL,
  result        jsonb NOT NULL,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (principal_key, project_id, operation, request_key)
);

CREATE TABLE outbox (
  id            bigserial PRIMARY KEY,
  workspace_id  text NOT NULL,
  project_id    text,
  topic         text NOT NULL,
  payload       jsonb NOT NULL,
  attempts      integer NOT NULL DEFAULT 0,
  delivered_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhook_receipts (
  provider      text NOT NULL,
  event_id      text NOT NULL,
  payload_digest text NOT NULL,
  event_type    text NOT NULL,
  status        text NOT NULL CHECK (status IN ('accepted', 'processed', 'failed')),
  attempts      integer NOT NULL DEFAULT 0,
  error         text,
  received_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

CREATE TABLE evidence_links (
  id            text PRIMARY KEY,
  workspace_id  text NOT NULL,
  project_id    text NOT NULL,
  work_id       text,
  run_id        text,
  url           text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('pr', 'commit', 'ci', 'link')),
  provenance    text NOT NULL CHECK (provenance IN ('reported', 'verified')),
  observed      jsonb,
  added_by      jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);
