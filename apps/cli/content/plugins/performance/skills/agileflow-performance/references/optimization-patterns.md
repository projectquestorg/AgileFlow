# Optimization Patterns

**Load this when:** you have profiling data that identifies a bottleneck and need concrete techniques to address it. Organized by domain. Apply one change at a time and measure after each.

---

## Frontend rendering

### Code splitting

Delivering all JavaScript up front is the single most common cause of slow Time to Interactive. Split by route at minimum.

**Route-based splitting (React + React Router):**

```jsx
import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Settings = lazy(() => import("./pages/Settings"));

function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
}
```

**Component-level splitting for heavy components:**

```jsx
// Heavy editor only loaded when user clicks "Edit"
const RichTextEditor = lazy(() => import("./components/RichTextEditor"));

function PostEditor({ editing }) {
  return editing ? (
    <Suspense fallback={<Spinner />}>
      <RichTextEditor />
    </Suspense>
  ) : (
    <ReadonlyView />
  );
}
```

**Dynamic import for rarely-used utilities:**

```js
async function exportToPDF(data) {
  const { jsPDF } = await import("jspdf"); // only loaded on demand
  const doc = new jsPDF();
  // ...
}
```

---

### Tree shaking

Tree shaking eliminates dead code from the bundle. It only works with ES module `import`/`export` syntax.

**Use named imports — not default namespace imports:**

```js
// Bad — imports the entire lodash library (~70 KB gzipped)
import _ from "lodash";
const result = _.debounce(fn, 300);

// Good — imports only debounce (~2 KB)
import debounce from "lodash/debounce";
```

**Avoid barrel re-exports of unused code:**

```js
// Bad — index.js re-exports everything; bundler may include all of it
// components/index.js:
export { Button } from "./Button";
export { Modal } from "./Modal";
export { HeavyDataGrid } from "./HeavyDataGrid"; // included even if not used

// Good — import directly from the component file
import { Button } from "./components/Button";
```

Mark packages as side-effect-free in `package.json` to enable full tree shaking:

```json
{ "sideEffects": false }
// Or list specific files with side effects:
{ "sideEffects": ["./src/polyfills.js", "*.css"] }
```

---

### Image optimization

Images are the most common reason for slow LCP. Unoptimized images routinely account for 60–80% of page weight.

**Format: prefer WebP, then AVIF for modern browsers:**

```html
<picture>
  <source srcset="hero.avif" type="image/avif" />
  <source srcset="hero.webp" type="image/webp" />
  <img src="hero.jpg" alt="..." width="1200" height="630" />
</picture>
```

**Responsive images with `srcset` + `sizes`:**

```html
<img
  srcset="hero-400.webp 400w, hero-800.webp 800w, hero-1200.webp 1200w"
  sizes="(max-width: 600px) 100vw, (max-width: 1024px) 800px, 1200px"
  src="hero-1200.webp"
  alt="..."
  width="1200"
  height="630"
  loading="lazy"
/>
```

**Always specify `width` and `height` attributes** — the browser can reserve space and prevent CLS before the image loads.

**Do NOT use `loading="lazy"` on the LCP image** — this delays the most important image. Only lazy-load images below the fold.

**Preload the LCP image:**

```html
<link rel="preload" as="image" href="hero.webp" fetchpriority="high" />
```

---

### Critical CSS and JavaScript deferral

**Render-blocking resources delay First Contentful Paint:**

```html
<!-- Bad: render-blocking -->
<link rel="stylesheet" href="all-styles.css" />
<script src="analytics.js"></script>

<!-- Good: inline critical CSS, defer the rest -->
<style>
  /* above-the-fold styles only */
</style>
<link
  rel="preload"
  href="non-critical.css"
  as="style"
  onload="this.rel='stylesheet'"
/>
<script src="analytics.js" defer></script>
```

**Script loading strategies:**

| Attribute     | When to use                                                         |
| ------------- | ------------------------------------------------------------------- |
| (none)        | Never — blocks parsing                                              |
| `defer`       | Scripts that need the DOM; executes after parse, in order           |
| `async`       | Scripts that don't need the DOM and don't need ordering (analytics) |
| `type=module` | ES modules — deferred by default                                    |

---

### Memoization in React

Memoization prevents unnecessary re-renders but adds overhead. Use only when profiling shows a component is an actual bottleneck.

```jsx
// React.memo — skip re-render if props haven't changed
const UserCard = React.memo(function UserCard({ user, onSelect }) {
  return <div onClick={() => onSelect(user.id)}>{user.name}</div>;
});

// useMemo — memoize an expensive computation
const sortedItems = useMemo(
  () => [...items].sort((a, b) => a.price - b.price),
  [items], // only recompute when items changes
);

// useCallback — stable function reference for memoized children
const handleSelect = useCallback((id) => {
  setSelectedId(id);
}, []); // empty deps = stable reference
```

**When memoization hurts more than it helps:**

- The computation is trivial (< 1 ms) — the memoization overhead exceeds the savings
- The dependency array changes on every render anyway (common with inline objects)
- The component renders rarely regardless

---

### Virtualization for long lists

Rendering a DOM node for every item in a 10,000-row list destroys performance. Virtualization renders only the visible rows.

```bash
npm install @tanstack/react-virtual
```

```jsx
import { useVirtualizer } from "@tanstack/react-virtual";

function VirtualList({ items }) {
  const parentRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48, // estimated row height in px
    overscan: 5, // rows to render above/below viewport
  });

  return (
    <div ref={parentRef} style={{ height: "600px", overflow: "auto" }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.index}
            style={{
              position: "absolute",
              top: 0,
              transform: `translateY(${virtualRow.start}px)`,
              height: `${virtualRow.size}px`,
            }}
          >
            {items[virtualRow.index].name}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Rule of thumb:** virtualize any list with more than 100 items visible at once.

---

## Backend

### Response caching

**HTTP cache headers:**

```js
// Express — cache static assets aggressively, API responses briefly
app.use(
  "/static",
  express.static("public", {
    maxAge: "1y", // static assets: cache forever (content-hashed filenames)
    immutable: true,
  }),
);

app.get("/api/products", (req, res) => {
  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  // stale-while-revalidate: serve stale content while refreshing in background
  res.json(products);
});
```

**Redis caching in Node.js:**

```js
import { createClient } from "redis";

const redis = createClient({ url: process.env.REDIS_URL });

async function getCachedProducts(categoryId) {
  const key = `products:category:${categoryId}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const products = await db.query(
    "SELECT * FROM products WHERE category_id = $1",
    [categoryId],
  );
  await redis.setEx(key, 300, JSON.stringify(products)); // TTL: 5 minutes
  return products;
}
```

**Cache invalidation strategy:** prefer TTL-based expiry for read-heavy data. Use event-based invalidation (delete the cache key on write) only when staleness is unacceptable.

---

### Async I/O and event loop health

**Never block the Node.js event loop:**

```js
// Bad — synchronous file read blocks all other requests
app.get("/report", (req, res) => {
  const data = fs.readFileSync("/large-file.csv"); // blocks!
  res.send(process(data));
});

// Good — async with streaming
app.get("/report", async (req, res) => {
  const stream = fs.createReadStream("/large-file.csv");
  res.setHeader("Content-Type", "text/csv");
  stream.pipe(res);
});
```

**Move CPU-intensive work off the main thread:**

```js
// Worker threads for CPU-bound computation (image processing, PDF generation)
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";

if (isMainThread) {
  function processImage(buffer) {
    return new Promise((resolve, reject) => {
      const worker = new Worker("./image-worker.js", { workerData: buffer });
      worker.on("message", resolve);
      worker.on("error", reject);
    });
  }
} else {
  const result = heavyImageProcessing(workerData);
  parentPort.postMessage(result);
}
```

**Paginate large responses — never return unbounded result sets:**

```js
// Bad
const allOrders = await db.query("SELECT * FROM orders WHERE user_id = $1", [
  id,
]);

// Good — keyset pagination (see Database section)
const orders = await db.query(
  "SELECT * FROM orders WHERE user_id = $1 AND id > $2 ORDER BY id LIMIT 50",
  [id, cursor],
);
```

---

### Compression

```js
// Express with compression middleware
import compression from "compression";

app.use(
  compression({
    threshold: 1024, // don't compress responses < 1 KB (overhead exceeds benefit)
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    },
  }),
);
```

Pre-compress static assets at build time (Vite/webpack) rather than compressing on the fly. Use brotli where supported (20–30% smaller than gzip).

---

### Connection pooling

Every database connection has overhead. Establishing a new connection per request is catastrophic at scale.

**PostgreSQL with node-postgres:**

```js
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Optimal pool size formula (for OLTP workloads):
// max = (core_count * 2) + effective_spindle_count
// For a 4-core server with SSD: max ≈ 9–10
// More connections ≠ faster; too many causes context-switch overhead
```

**pgBouncer** for connection pooling at the infrastructure level — essential when many application instances connect to a single PostgreSQL server.

---

## Database

### Index design

Indexes are the single highest-leverage database optimization. A sequential scan on a 10M-row table can take seconds; an index lookup takes microseconds.

**Composite index column order:**

```sql
-- Query: WHERE status = 'active' AND created_at > '2024-01-01' ORDER BY created_at
-- Correct index: equality columns first, then range/sort column
CREATE INDEX idx_orders_status_created ON orders (status, created_at);

-- Wrong order (less efficient for this query):
CREATE INDEX idx_orders_created_status ON orders (created_at, status);
```

**Covering index** (includes all columns the query needs — avoids a table heap fetch):

```sql
-- Query only needs user_id, email, name — no heap fetch needed
CREATE INDEX idx_users_covering ON users (status, created_at)
  INCLUDE (user_id, email, name);
```

**Partial index** (index only the rows that matter — smaller, faster):

```sql
-- If 95% of queries filter on status = 'pending'
CREATE INDEX idx_orders_pending ON orders (created_at)
  WHERE status = 'pending';
```

**Check for missing indexes:**

```sql
-- PostgreSQL: tables with sequential scans
SELECT schemaname, tablename, seq_scan, idx_scan,
       seq_scan - idx_scan AS too_much_seq
FROM pg_stat_user_tables
WHERE seq_scan > idx_scan
ORDER BY too_much_seq DESC;
```

---

### N+1 elimination

N+1 is the most common database performance bug in ORM-heavy codebases. It occurs when code fetches a list (1 query) then fetches related data per item (N queries).

**Identifying N+1 in logs:** look for many identical queries with different IDs in rapid succession.

**Fix 1: Eager loading with JOIN:**

```sql
-- Bad (N+1): fetch users, then for each user fetch their posts
SELECT * FROM users WHERE active = true;
-- ... then for each user: SELECT * FROM posts WHERE user_id = $1

-- Good: one query with JOIN
SELECT u.id, u.name, u.email, p.id AS post_id, p.title
FROM users u
LEFT JOIN posts p ON p.user_id = u.id
WHERE u.active = true;
```

**Fix 2: Batch query (DataLoader pattern):**

```js
// Instead of one query per user ID, collect IDs and query once
import DataLoader from "dataloader";

const postLoader = new DataLoader(async (userIds) => {
  const posts = await db.query("SELECT * FROM posts WHERE user_id = ANY($1)", [
    userIds,
  ]);
  // Group by user_id to match DataLoader's expected shape
  return userIds.map((id) => posts.filter((p) => p.user_id === id));
});

// Now each call queues; DataLoader batches into a single DB query
const posts = await postLoader.load(user.id);
```

---

### Query optimization

**Avoid `SELECT *`** — fetch only the columns you need. On wide tables this can halve I/O.

**Push filters to the database:**

```js
// Bad — fetch all users, filter in JavaScript
const users = await db.query("SELECT * FROM users");
const activeAdmins = users.filter((u) => u.active && u.role === "admin");

// Good — filter in SQL
const activeAdmins = await db.query(
  "SELECT id, name, email FROM users WHERE active = true AND role = 'admin'",
);
```

**Batch inserts:**

```sql
-- Bad: one INSERT per row (N round trips)

-- Good: multi-row INSERT
INSERT INTO events (user_id, type, created_at)
VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9);

-- Or with COPY for bulk loads (10–100x faster than INSERT)
COPY events (user_id, type, created_at) FROM STDIN;
```

---

### Keyset pagination

Offset pagination degrades linearly as the offset grows — a `LIMIT 50 OFFSET 10000` still scans 10,050 rows.

```sql
-- Bad: offset pagination
SELECT * FROM posts ORDER BY created_at DESC LIMIT 50 OFFSET 10000;

-- Good: keyset pagination (always fast regardless of page depth)
SELECT * FROM posts
WHERE created_at < $1  -- $1 = last seen created_at from previous page
ORDER BY created_at DESC
LIMIT 50;
```

Keyset pagination requires a cursor (the last-seen value of the sort column). It does not support random page access ("jump to page 47"), but it scales indefinitely and the response time is constant.

---

## Performance budgets — quick reference

| Resource                   | Target                                    |
| -------------------------- | ----------------------------------------- |
| JS bundle: initial (gzip)  | < 200 KB                                  |
| JS bundle: per route chunk | < 50 KB                                   |
| Image: LCP image           | < 200 KB (WebP/AVIF)                      |
| Total page weight          | < 1 MB on a 3G connection in < 5 s        |
| API response: p50          | < 100 ms                                  |
| API response: p95          | < 500 ms                                  |
| API response: p99          | < 2 s                                     |
| DB query: simple lookup    | < 10 ms                                   |
| DB query: complex join     | < 100 ms                                  |
| DB query: flag if over     | > 500 ms — always investigate             |
| Heap growth (steady)       | < 10 MB/hr                                |
| Long task threshold        | > 50 ms — investigate; > 200 ms — serious |
