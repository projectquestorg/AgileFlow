# Workflow: Design Schema

Follow this workflow when the user needs to design a new database schema or model entities from requirements. Work step-by-step and confirm with the user at key decision points before writing SQL.

---

## Step 1: Gather Requirements

Ask these questions if the answers aren't already clear from context. Don't ask all at once — adapt based on what the user has already provided.

**What to understand:**

- What is this feature or system doing? What are the core user-facing actions?
- What data needs to be stored, and what are the relationships between entities?
- What are the read patterns? (List views, search, reporting, real-time, analytics)
- What are the write patterns? (How often does data change, at what volume)
- Are there multi-tenancy requirements?
- What is the expected data volume at launch vs. in 1 year?
- What database engine is in use?
- Does an ORM manage the schema, or is raw SQL preferred?

**Collect:**

- A rough list of entities mentioned by the user
- Any existing schema they want to extend
- Performance requirements or known constraints

---

## Step 2: Identify Entities

From the requirements, extract the core entities. For each entity:

- Name it as a plural table name (`users`, `orders`, `products`)
- Identify the primary key strategy (BIGSERIAL vs UUID — see `references/schema-design-guide.md`)
- Note what distinguishes one row from another

**Example output:**

```
Entities identified:
- users (authenticated people)
- organizations (multi-tenant accounts)
- projects (owned by an organization)
- tasks (belong to a project, assigned to a user)
- comments (belong to a task)
```

Present this list to the user and confirm before proceeding.

---

## Step 3: Map Relationships

For each pair of entities, determine the cardinality:

| Relationship     | Pattern                                     |
| ---------------- | ------------------------------------------- |
| One-to-many      | FK on the "many" side                       |
| Many-to-many     | Junction table                              |
| One-to-one       | FK + UNIQUE, or shared PK                   |
| Self-referential | Parent FK on same table (hierarchical data) |

Draw the relationships explicitly:

```
organizations 1──< projects 1──< tasks >──M users (assignment)
                                  1
                                  |
                                  M
                               comments
                                  M
                                  |
                                  1
                                users (author)
```

Confirm the relationship map with the user. Surface any ambiguous cases:

- "Can a task have multiple assignees, or just one?"
- "Can a project belong to multiple organizations?"

---

## Step 4: Define Columns

For each entity, define the columns:

1. **Primary key**: `id BIGSERIAL PRIMARY KEY` or UUID strategy
2. **Foreign keys**: reference other entities using `{table_singular}_id`
3. **Required data**: columns that represent the core concept
4. **Optional data**: nullable columns for supplementary information
5. **Status/state**: ENUM or FK to statuses table
6. **Timestamps**: always include `created_at`, `updated_at`; add `deleted_at` if soft-delete is needed
7. **Constraints**: NOT NULL, UNIQUE, CHECK constraints

Apply naming conventions (see `references/schema-design-guide.md`):

- Tables: lowercase_snake_case, plural
- Columns: lowercase_snake_case, singular
- Booleans: `is_`, `has_`, `can_` prefix
- Timestamps: `_at` suffix

---

## Step 5: Normalization Review

Walk through the normal forms quickly:

**1NF check:** Are all values atomic? No arrays or comma-separated values stored in a single column?

**2NF check:** If using a composite PK, does every non-key column depend on the full key (not just part of it)?

**3NF check:** Do any non-key columns depend on another non-key column rather than the PK directly?

If normalization would create a query with 5+ JOINs for a very common read path, consider whether a read-model table or materialized view is appropriate. Document the denormalization decision with its rationale.

---

## Step 6: Plan Indexes

For every table, identify which queries will run against it and define the index strategy:

1. **Primary key**: automatically indexed
2. **Foreign keys**: always add an index (check if ORM does this automatically)
3. **Filter columns**: columns in WHERE clauses for common queries
4. **Sort columns**: columns in ORDER BY for large result sets
5. **Unique constraints**: auto-creates an index
6. **Partial indexes**: if a large percentage of rows are inactive/deleted

Example index plan:

```
tasks table:
- idx_tasks_project_id ON tasks (project_id)          -- FK
- idx_tasks_assigned_user_id ON tasks (assigned_user_id)  -- FK
- idx_tasks_project_status ON tasks (project_id, status)  -- common filter
- idx_tasks_active ON tasks (project_id, due_date)        -- WHERE deleted_at IS NULL (partial)
```

---

## Step 7: Write the Migration

Write the `up` SQL. Apply zero-downtime patterns from `references/migration-guide.md`:

- New tables: always safe
- Adding columns to existing tables: nullable or with a default
- Indexes: use `CREATE INDEX CONCURRENTLY`

Write the `down` SQL immediately after the `up`. Verify the `down` restores the exact prior state.

```sql
-- up
CREATE TABLE projects (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX CONCURRENTLY idx_projects_organization_id
  ON projects (organization_id);
CREATE INDEX CONCURRENTLY idx_projects_org_active
  ON projects (organization_id, created_at)
  WHERE deleted_at IS NULL;

-- down
DROP INDEX IF EXISTS idx_projects_org_active;
DROP INDEX IF EXISTS idx_projects_organization_id;
DROP TABLE IF EXISTS projects;
```

---

## Step 8: Review Checklist

Run through this before presenting the final schema:

- [ ] Every table has a primary key
- [ ] All foreign keys have corresponding indexes
- [ ] Timestamps use TIMESTAMPTZ with DEFAULT NOW()
- [ ] Money columns use DECIMAL or integer cents — not FLOAT
- [ ] Nullable columns are intentionally nullable
- [ ] Cascade rules are explicit and correct for the domain
- [ ] Constraints are named explicitly
- [ ] Migration has both `up` and `down`
- [ ] New indexes use CONCURRENTLY
- [ ] Normalization reviewed — any denormalization is documented
- [ ] No comma-separated values in any column
- [ ] Soft-delete strategy is consistent if applicable

---

## Step 9: Present and Confirm

Present the schema with:

1. An entity-relationship summary in plain English
2. The full SQL for the migration
3. A list of design decisions made and why (e.g., "UUID chosen because IDs will appear in URLs", "JSONB used for metadata because the shape varies per record type")
4. Any open questions where the user's input is needed

Offer to:

- Add sample queries showing how the schema is accessed
- Identify additional indexes if the user shares their access patterns
- Write the ORM model definitions (Prisma schema, SQLAlchemy models, etc.)
