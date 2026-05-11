# Schema Design Guide

A practical reference for designing relational database schemas — from first principles to production patterns. Apply these rules whether you're greenfielding a new service or extending an existing data model.

---

## Normalization

Normalization eliminates redundancy and anomalies. Work through the normal forms in order.

### First Normal Form (1NF)

- Every column holds atomic values — no arrays, no comma-separated lists, no JSON blobs as a workaround for missing columns
- No repeating groups (no `tag1`, `tag2`, `tag3` columns)
- Every row is uniquely identifiable (primary key exists)

```sql
-- Bad: repeating group
CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT,
  tag1 TEXT,
  tag2 TEXT,
  tag3 TEXT  -- what happens with tag4?
);

-- Good: separate table
CREATE TABLE products (id BIGSERIAL PRIMARY KEY, name TEXT);
CREATE TABLE product_tags (
  product_id BIGINT REFERENCES products(id),
  tag TEXT NOT NULL,
  PRIMARY KEY (product_id, tag)
);
```

### Second Normal Form (2NF)

- Must already be in 1NF
- No partial dependencies on a composite primary key — every non-key column must depend on the whole key, not part of it

```sql
-- Bad: order_items with composite PK (order_id, product_id)
-- product_name depends only on product_id, not the full PK
CREATE TABLE order_items (
  order_id BIGINT,
  product_id BIGINT,
  product_name TEXT,  -- partial dependency on product_id only
  quantity INT,
  PRIMARY KEY (order_id, product_id)
);

-- Good: move product_name to products table
CREATE TABLE order_items (
  order_id BIGINT REFERENCES orders(id),
  product_id BIGINT REFERENCES products(id),
  quantity INT NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
```

### Third Normal Form (3NF)

- Must already be in 2NF
- No transitive dependencies — non-key columns must depend directly on the primary key, not on another non-key column

```sql
-- Bad: zip_code determines city and state (transitive dependency)
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT,
  zip_code TEXT,
  city TEXT,    -- depends on zip_code, not id
  state TEXT    -- depends on zip_code, not id
);

-- Good: separate postal codes
CREATE TABLE postal_codes (zip_code TEXT PRIMARY KEY, city TEXT, state TEXT);
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT,
  zip_code TEXT REFERENCES postal_codes(zip_code)
);
```

### When to denormalize

Denormalization is a deliberate performance trade-off. It introduces redundancy in exchange for read speed. Do it intentionally, not by accident.

| Signal                                    | Denormalization approach                                   |
| ----------------------------------------- | ---------------------------------------------------------- |
| Read-heavy analytics or reporting         | Pre-computed aggregate table or materialized view          |
| Query requires 5+ JOINs for common reads  | Collapsed read-model table (updated via trigger or worker) |
| Full-text search across multiple fields   | Denormalized `search_vector` column with GIN index         |
| Display name shown on every list row      | Cache `user_name` on `orders` (accept stale risk)          |
| Leaderboard or ranking updated frequently | Sorted set in Redis, not a live SQL query                  |

**Practical rule:** normalize until it hurts writes or reads, then denormalize with full awareness of the consistency trade-off.

---

## Naming Conventions

Consistent naming is self-documenting schema. Deviate only when an existing codebase has a strong established convention.

### Tables

- Lowercase snake_case
- Plural noun: `users`, `orders`, `order_items`, `payment_methods`
- Junction tables: combine both nouns: `user_roles`, `product_tags`, `post_categories`
- Avoid abbreviations: `organizations` not `orgs`, `addresses` not `addrs`

### Columns

- Lowercase snake_case, singular
- Primary key: `id`
- Foreign keys: `{referenced_table_singular}_id` — `user_id`, `order_id`, `organization_id`
- Boolean: prefix with `is_`, `has_`, `can_`, `should_` — `is_active`, `has_verified_email`, `can_publish`
- Timestamps: `created_at`, `updated_at`, `deleted_at`, `published_at`, `expires_at`
- Counters: `comment_count`, `view_count` (denormalized cache — document it)
- ENUM status: `status` column with named values, or `status_id` FK to a statuses table

### Constraints and indexes

Name constraints explicitly — anonymous constraints produce cryptic error messages.

```sql
-- Good: named constraints
ALTER TABLE order_items
  ADD CONSTRAINT order_items_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES orders(id),
  ADD CONSTRAINT order_items_quantity_positive
    CHECK (quantity > 0);

CREATE INDEX idx_orders_user_id_status ON orders (user_id, status);
CREATE UNIQUE INDEX idx_users_email ON users (email);
```

---

## Column Types

Choose the most specific type that fits the data. Loose types (TEXT everywhere, FLOAT for money) cause subtle bugs and missed optimizations.

### Primary Keys

| Option    | Pros                                       | Cons                                               | Use when                               |
| --------- | ------------------------------------------ | -------------------------------------------------- | -------------------------------------- |
| BIGSERIAL | Compact (8 bytes), sequential, fast B-tree | Exposes count, not suitable across distributed DBs | Single-DB services, internal join keys |
| UUID v4   | Globally unique, safe to expose in APIs    | 16 bytes, random = index bloat, slower inserts     | Distributed systems, public-facing IDs |
| UUID v7   | Globally unique + time-ordered             | Requires PG 17+ or extension                       | Best of both — use when available      |

**Pragmatic default:** use BIGSERIAL internally, UUID v4 as a public identifier column if needed.

```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE
);
```

### Strings

| Type       | When to use                                                  |
| ---------- | ------------------------------------------------------------ |
| TEXT       | Arbitrary length — emails, names, descriptions, free text    |
| VARCHAR(n) | When there is a meaningful enforced maximum (e.g., codes)    |
| CHAR(n)    | Almost never — pads with spaces, wastes space, confuses devs |

Do not use VARCHAR(255) as a default. It signals the developer didn't think about the constraint.

### Numbers

| Type          | When to use                                                                 |
| ------------- | --------------------------------------------------------------------------- |
| SMALLINT      | Tiny integers (2 bytes) — age, rating 1–5                                   |
| INTEGER       | General integer (4 bytes)                                                   |
| BIGINT        | Large integers, IDs, counts that may exceed 2 billion                       |
| DECIMAL(p, s) | Money, precise decimals — use DECIMAL(19, 4) for currency                   |
| NUMERIC       | Alias for DECIMAL — same behavior                                           |
| FLOAT / REAL  | Scientific calculations where approximation is acceptable — NEVER for money |

### Money

```sql
-- Bad: floating-point arithmetic errors accumulate
price FLOAT

-- Good option 1: integer cents
price_cents INTEGER NOT NULL  -- $9.99 stored as 999

-- Good option 2: exact decimal
price DECIMAL(19, 4) NOT NULL  -- supports up to $999,999,999,999,999.9999
```

### Timestamps

Always use `TIMESTAMPTZ` (timestamp with time zone) and store in UTC. `TIMESTAMP` without timezone is a footgun — it stores the wall clock time of the inserting server, which changes meaning across DST transitions and server migrations.

```sql
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
deleted_at TIMESTAMPTZ  -- NULL means not deleted
```

### Booleans

Use `BOOLEAN`, not `SMALLINT` or `CHAR(1)`. Add NOT NULL with a default.

```sql
is_active BOOLEAN NOT NULL DEFAULT true,
has_verified_email BOOLEAN NOT NULL DEFAULT false
```

### JSON (PostgreSQL)

| Type  | When to use                                                                    |
| ----- | ------------------------------------------------------------------------------ |
| JSONB | Semi-structured data you need to query, index, or update — use this by default |
| JSON  | Preserve exact input format (key order, whitespace) — rarely needed            |

Index JSONB with GIN for containment queries:

```sql
CREATE INDEX idx_events_payload ON events USING GIN (payload);

-- Then query efficiently:
SELECT * FROM events WHERE payload @> '{"type": "login"}';
```

---

## Relationships

### One-to-Many

Foreign key on the "many" side. Always index the FK column.

```sql
CREATE TABLE posts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_posts_user_id ON posts (user_id);
```

### Many-to-Many

Junction table. Include timestamps so you know when the association was created.

```sql
CREATE TABLE user_roles (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by BIGINT REFERENCES users(id),
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_role_id ON user_roles (role_id);
```

### One-to-One

Foreign key with a UNIQUE constraint, or shared primary key.

```sql
-- Option 1: FK + UNIQUE (more flexible, allows lazy creation)
CREATE TABLE user_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  bio TEXT,
  avatar_url TEXT
);

-- Option 2: Shared PK (always created together)
CREATE TABLE user_preferences (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'light',
  notifications_enabled BOOLEAN NOT NULL DEFAULT true
);
```

### Soft Delete

Add `deleted_at TIMESTAMPTZ NULL`. Filter every query with `WHERE deleted_at IS NULL`. Create a partial index.

```sql
CREATE INDEX idx_users_active ON users (id) WHERE deleted_at IS NULL;

-- All application queries should use this filter
SELECT * FROM users WHERE deleted_at IS NULL AND email = $1;
```

Use a database view to encapsulate the filter:

```sql
CREATE VIEW active_users AS SELECT * FROM users WHERE deleted_at IS NULL;
```

### Cascade Rules

| Option              | Behavior                                                                 | Use when                                          |
| ------------------- | ------------------------------------------------------------------------ | ------------------------------------------------- |
| ON DELETE CASCADE   | Child rows deleted when parent deleted                                   | Posts when user deleted, items when order deleted |
| ON DELETE RESTRICT  | Prevents parent deletion if children exist                               | Don't delete a category that has products         |
| ON DELETE SET NULL  | Child FK set to NULL when parent deleted                                 | Optional association — audit log user_id          |
| ON DELETE NO ACTION | Error raised (default) — same as RESTRICT, checked at end of transaction | Default — be explicit to signal intent            |

---

## Common Schema Patterns

### User Authentication

```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  email TEXT NOT NULL UNIQUE,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user_id ON sessions (user_id);
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);

CREATE TABLE oauth_accounts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_account_id)
);
```

### Multi-Tenancy

Two main strategies:

**Shared schema with tenant_id (simpler, scales to hundreds of tenants):**

```sql
-- Every table gets tenant_id
CREATE TABLE organizations (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL);

CREATE TABLE projects (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL
);
CREATE INDEX idx_projects_organization_id ON projects (organization_id);

-- Row-level security enforces isolation
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
  USING (organization_id = current_setting('app.current_org_id')::BIGINT);
```

**Schema-per-tenant (stronger isolation, scales to thousands of tenants):**

```sql
-- Each tenant gets their own schema: tenant_123.projects
CREATE SCHEMA tenant_123;
SET search_path TO tenant_123, public;
```

### Hierarchical Data

| Pattern           | Pros                             | Cons                                    | Use when                           |
| ----------------- | -------------------------------- | --------------------------------------- | ---------------------------------- |
| Adjacency list    | Simple, easy inserts/moves       | Recursive queries required, N+1 risk    | Small hierarchies, arbitrary depth |
| Materialized path | Fast reads, simple queries       | Updates require string manipulation     | Read-heavy trees, moderate depth   |
| Closure table     | Fast reads and writes, clean SQL | Extra storage, more complex inserts     | Frequently read hierarchies        |
| Nested sets       | Extremely fast subtree reads     | Slow inserts and moves, complex updates | Rarely — read-only taxonomies      |

```sql
-- Adjacency list (simplest)
CREATE TABLE categories (
  id BIGSERIAL PRIMARY KEY,
  parent_id BIGINT REFERENCES categories(id),
  name TEXT NOT NULL
);

-- PostgreSQL recursive CTE to get full path
WITH RECURSIVE path AS (
  SELECT id, parent_id, name, 0 AS depth
  FROM categories WHERE id = $1
  UNION ALL
  SELECT c.id, c.parent_id, c.name, path.depth + 1
  FROM categories c JOIN path ON c.id = path.parent_id
)
SELECT * FROM path ORDER BY depth DESC;
```

### Event Sourcing

```sql
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  aggregate_id UUID NOT NULL,
  aggregate_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  version INT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (aggregate_id, version)
);

CREATE INDEX idx_events_aggregate ON events (aggregate_id, version);
CREATE INDEX idx_events_type_occurred ON events (event_type, occurred_at);
```

### Audit Trail

```sql
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id BIGINT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values JSONB,
  new_values JSONB,
  performed_by BIGINT REFERENCES users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET
);

CREATE INDEX idx_audit_log_table_record ON audit_log (table_name, record_id);
CREATE INDEX idx_audit_log_performed_at ON audit_log (performed_at);
```

---

## Schema Review Checklist

Before finalizing any schema:

- [ ] Every table has a primary key
- [ ] All foreign keys have a matching index
- [ ] Timestamps use TIMESTAMPTZ with DEFAULT NOW()
- [ ] Money columns use DECIMAL or integer cents
- [ ] No VARCHAR(255) without a meaningful constraint reason
- [ ] Nullable columns are intentionally nullable (not just forgotten NOT NULL)
- [ ] Cascade rules are explicit and correct
- [ ] Junction tables have both FK indexes
- [ ] Constraints are named
- [ ] Soft-delete strategy is consistent across the model
- [ ] Normalization reviewed — denormalization documented with rationale
