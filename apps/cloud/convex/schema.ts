import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * AgileFlow connected service on Convex. Public identifiers (project, note,
 * run, claim, approval, ... IDs and native Work IDs) are strings stored on the
 * documents; Convex `_id`s never leave the backend. Every project-scoped table
 * is indexed by projectId first, so tenant scoping is part of every access path.
 */
const any = v.any();
const optStr = v.optional(v.string());
const optNum = v.optional(v.number());

export default defineSchema({
  workspaces: defineTable({
    publicId: v.string(),
    clerkOrgId: v.string(),
    name: v.string(),
    status: v.union(v.literal('active'), v.literal('locked'), v.literal('deleted')),
    policy: v.object({ requireStartApproval: v.optional(v.boolean()), allowLifecycleOverride: v.optional(v.boolean()) }),
    policyRevision: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['clerkOrgId'])
    .index('by_public', ['publicId']),

  users: defineTable({
    clerkUserId: v.string(),
    displayName: optStr,
    email: optStr,
    status: v.union(v.literal('active'), v.literal('deleted')),
    updatedAt: v.number(),
  }).index('by_user', ['clerkUserId']),

  memberships: defineTable({
    workspaceId: v.string(),
    userId: v.string(),
    role: v.union(v.literal('admin'), v.literal('member')),
    status: v.union(v.literal('active'), v.literal('removed')),
    verifiedAt: v.number(),
    sourceTs: v.number(),
  })
    .index('by_ws_user', ['workspaceId', 'userId'])
    .index('by_user', ['userId'])
    .index('by_ws', ['workspaceId']),

  projects: defineTable({
    publicId: v.string(),
    workspaceId: v.string(),
    name: v.string(),
    slug: v.string(),
    authorityMode: v.literal('connected'),
    nativeSchema: v.number(),
    clientWritesPaused: v.boolean(),
    archivedAt: optNum,
    deletionRequestedAt: optNum,
    importing: v.optional(v.boolean()),
    policyRevision: v.number(),
    activitySeq: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_public', ['publicId'])
    .index('by_ws', ['workspaceId', 'name'])
    .index('by_ws_slug', ['workspaceId', 'slug'])
    .index('by_deletion', ['deletionRequestedAt']),

  projectGrants: defineTable({
    workspaceId: v.string(),
    projectId: v.string(),
    userId: v.string(),
    role: v.union(v.literal('viewer'), v.literal('editor')),
    status: v.union(v.literal('active'), v.literal('revoked')),
    grantedBy: optStr,
    updatedAt: v.number(),
  })
    .index('by_project_user', ['projectId', 'userId'])
    .index('by_user', ['userId']),

  workItems: defineTable({
    projectId: v.string(),
    nativeId: v.string(),
    type: v.union(v.literal('epic'), v.literal('story'), v.literal('decision')),
    title: v.string(),
    status: v.string(),
    body: v.string(),
    priority: optStr,
    horizon: optStr,
    legacyId: optStr,
    legacySource: v.optional(v.array(v.string())),
    unknownMeta: v.optional(any),
    assignee: optStr,
    tags: v.array(v.string()),
    boardRank: v.number(),
    rankVersion: v.number(),
    archivedAt: optNum,
    version: v.number(),
    contentHash: v.string(),
    claimGeneration: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project_native', ['projectId', 'nativeId'])
    .index('by_project_type', ['projectId', 'type', 'nativeId'])
    .index('by_project_type_status_rank', ['projectId', 'type', 'status', 'boardRank', 'nativeId']),

  relations: defineTable({
    projectId: v.string(),
    sourceId: v.string(),
    targetId: v.string(),
    kind: v.union(v.literal('parent_epic'), v.literal('depends_on'), v.literal('related'), v.literal('superseded_by')),
    position: v.number(),
  })
    .index('by_source', ['projectId', 'sourceId', 'kind', 'position'])
    .index('by_target', ['projectId', 'targetId', 'kind'])
    .index('by_project_kind', ['projectId', 'kind']),

  documents: defineTable({
    projectId: v.string(),
    key: v.union(v.literal('product'), v.literal('roadmap')),
    body: v.string(),
    version: v.number(),
    contentHash: v.string(),
    updatedAt: v.number(),
  }).index('by_project_key', ['projectId', 'key']),

  nativeSources: defineTable({
    projectId: v.string(),
    objectKey: v.string(),
    path: v.string(),
    original: v.string(),
    sourceDigest: v.string(),
    importJobId: v.string(),
    baseVersion: v.number(),
    baseHash: v.string(),
  }).index('by_project_key', ['projectId', 'objectKey']),

  revisions: defineTable({
    projectId: v.string(),
    objectType: v.string(),
    objectId: v.string(),
    version: v.number(),
    snapshot: any,
    actor: any,
    operation: v.string(),
    createdAt: v.number(),
  })
    .index('by_object', ['projectId', 'objectType', 'objectId', 'version'])
    .index('by_project', ['projectId']),

  connections: defineTable({
    publicId: v.string(),
    workspaceId: v.string(),
    issuer: v.string(),
    userId: v.string(),
    clientId: v.string(),
    resource: v.string(),
    allowedProjects: v.optional(v.union(v.array(v.string()), v.null())),
    disabledAt: optNum,
    disabledBy: optStr,
    policyRevision: v.number(),
    lastRequestAt: optNum,
    lastScopes: v.array(v.string()),
    /**
     * Capabilities a person granted to this connection in the dashboard (Clerk cannot issue custom
     * OAuth scopes). Used when AGILEFLOW_CAPABILITY_SOURCE=grants. New connections have none: read-only.
     */
    grants: v.optional(v.array(v.object({ capability: v.string(), grantedBy: v.string(), grantedAt: v.number() }))),
    createdAt: v.number(),
  })
    .index('by_tuple', ['issuer', 'userId', 'workspaceId', 'clientId', 'resource'])
    .index('by_public', ['publicId'])
    .index('by_ws', ['workspaceId'])
    .index('by_user', ['userId']),

  notes: defineTable({
    publicId: v.string(),
    projectId: v.string(),
    workId: optStr,
    runId: optStr,
    kind: v.string(),
    body: v.string(),
    author: any,
    correctsNoteId: optStr,
    promotedDecisionId: optStr,
    version: v.number(),
    redactedAt: optNum,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_public', ['publicId'])
    .index('by_project_created', ['projectId', 'createdAt'])
    .index('by_project_work', ['projectId', 'workId', 'createdAt'])
    .index('by_project_run', ['projectId', 'runId', 'createdAt']),

  runs: defineTable({
    publicId: v.string(),
    projectId: v.string(),
    connectionId: v.string(),
    workIds: v.array(v.string()),
    name: v.string(),
    intent: v.string(),
    state: v.string(),
    summary: optStr,
    blocker: optStr,
    evidence: v.array(any),
    cancelRequestedAt: optNum,
    cancelRequestedBy: optStr,
    cancelAcknowledgedAt: optNum,
    approvalId: optStr,
    version: v.number(),
    startedAt: v.number(),
    lastReportAt: v.number(),
    endedAt: optNum,
  })
    .index('by_public', ['publicId'])
    .index('by_project_started', ['projectId', 'startedAt']),

  claims: defineTable({
    publicId: v.string(),
    projectId: v.string(),
    storyId: v.string(),
    runId: v.string(),
    connectionId: v.string(),
    generation: v.number(),
    version: v.number(),
    expiresAt: v.number(),
    lastRenewedAt: v.number(),
    active: v.boolean(),
    releasedAt: optNum,
    releaseReason: optStr,
    overrideBy: optStr,
    createdAt: v.number(),
  })
    .index('by_public', ['publicId'])
    .index('by_project_story_active', ['projectId', 'storyId', 'active'])
    .index('by_project_active', ['projectId', 'active'])
    .index('by_run_active', ['runId', 'active'])
    .index('by_connection_active', ['connectionId', 'active']),

  approvals: defineTable({
    publicId: v.string(),
    projectId: v.string(),
    kind: v.string(),
    requestedByConnection: optStr,
    requestedByUser: v.string(),
    proposal: any,
    proposalHash: v.string(),
    reason: v.string(),
    state: v.string(),
    decidedBy: optStr,
    decidedAt: optNum,
    consumedAt: optNum,
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index('by_public', ['publicId'])
    .index('by_project_created', ['projectId', 'createdAt']),

  companions: defineTable({
    publicId: v.string(),
    workspaceId: v.string(),
    ownerUserId: v.string(),
    name: v.string(),
    platform: v.string(),
    version: v.string(),
    capabilities: v.array(v.string()),
    credentialHash: optStr,
    revokedAt: optNum,
    lastSeenAt: optNum,
    lastInventory: v.optional(any),
    createdAt: v.number(),
  })
    .index('by_public', ['publicId'])
    .index('by_credential', ['credentialHash']),

  checkouts: defineTable({
    publicId: v.string(),
    companionId: v.string(),
    projectId: v.string(),
    repoIdentity: v.string(),
    checkoutPathHash: v.string(),
    desiredRevision: v.number(),
    observedRevision: v.number(),
    lastObservation: v.optional(any),
  })
    .index('by_public', ['publicId'])
    .index('by_project', ['projectId'])
    .index('by_companion', ['companionId']),

  enrollments: defineTable({
    publicId: v.string(),
    workspaceId: v.string(),
    userId: v.string(),
    projectId: v.string(),
    possessionHash: v.string(),
    request: any,
    approvedBy: optStr,
    approvedCapabilities: v.optional(v.array(v.string())),
    state: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index('by_public', ['publicId'])
    .index('by_project_created', ['projectId', 'createdAt']),

  controlRevisions: defineTable({
    projectId: v.string(),
    revision: v.number(),
    desired: any,
    createdBy: v.string(),
    approvalId: optStr,
    createdAt: v.number(),
  }).index('by_project_revision', ['projectId', 'revision']),

  controlOperations: defineTable({
    publicId: v.string(),
    projectId: v.string(),
    companionId: v.string(),
    checkoutId: v.string(),
    revision: v.number(),
    plan: any,
    planHash: v.string(),
    state: v.string(),
    attempts: v.number(),
    expiresAt: v.number(),
    receipt: v.optional(any),
    error: v.optional(any),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_public', ['publicId'])
    .index('by_project', ['projectId', 'checkoutId', 'revision'])
    .index('by_companion_state', ['companionId', 'state']),

  jobs: defineTable({
    publicId: v.string(),
    workspaceId: v.string(),
    projectId: optStr,
    kind: v.union(v.literal('import'), v.literal('export')),
    ownerUserId: v.string(),
    operationKey: v.string(),
    sourceDigest: optStr,
    status: v.string(),
    preview: v.optional(any),
    /** Quarantined upload (file storage; documents are limited to 1 MiB). Removed on commit. */
    sourceFile: v.optional(v.id('_storage')),
    result: v.optional(any),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index('by_public', ['publicId'])
    .index('by_owner_key', ['workspaceId', 'ownerUserId', 'kind', 'operationKey']),

  activity: defineTable({
    projectId: v.string(),
    seq: v.number(),
    actor: any,
    operation: v.string(),
    objectType: v.string(),
    objectId: v.string(),
    objectVersion: optNum,
    summary: v.string(),
    correlationId: optStr,
    createdAt: v.number(),
  })
    .index('by_project_seq', ['projectId', 'seq'])
    .index('by_project_object', ['projectId', 'objectId', 'seq']),

  idempotency: defineTable({
    principalKey: v.string(),
    projectId: v.string(),
    operation: v.string(),
    requestKey: v.string(),
    requestDigest: v.string(),
    result: any,
    expiresAt: v.number(),
  })
    .index('by_key', ['principalKey', 'projectId', 'operation', 'requestKey'])
    .index('by_expiry', ['expiresAt']),

  /** Development only (AGILEFLOW_DEV_AUTH=1): stands in for Clerk organization membership answers. */
  devDirectory: defineTable({
    orgId: v.string(),
    userId: v.string(),
    info: v.union(v.null(), any),
  }).index('by_org_user', ['orgId', 'userId']),

  /** Server-side cache of OAuth client lookups at Clerk (endpoint/client binding). */
  oauthClients: defineTable({
    clientId: v.string(),
    status: v.union(v.literal('dynamic'), v.literal('first_party'), v.literal('unknown')),
    checkedAt: v.number(),
  }).index('by_client', ['clientId']),

  webhookReceipts: defineTable({
    provider: v.string(),
    eventId: v.string(),
    payloadDigest: v.string(),
    eventType: v.string(),
    status: v.string(),
    receivedAt: v.number(),
  }).index('by_event', ['provider', 'eventId']),
});
