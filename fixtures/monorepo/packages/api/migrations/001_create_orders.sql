CREATE TABLE orders (
  id          TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers (id),
  email       TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
