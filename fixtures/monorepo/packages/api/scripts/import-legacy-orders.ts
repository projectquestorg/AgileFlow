// One-off import of orders exported from the old shop (CSV: id,customer,email,total).
// Rows from guest purchases have an empty customer column.
import fs from 'node:fs';
import type { Db } from '../src/db';

export async function importLegacyOrders(db: Db, csvPath: string): Promise<number> {
  const rows = fs.readFileSync(csvPath, 'utf8').trim().split('\n').slice(1);
  for (const row of rows) {
    const [id, customer, email, total] = row.split(',');
    await db.query('INSERT INTO orders (id, customer_id, email, total_cents) VALUES ($1, $2, $3, $4)', [
      id,
      customer || null,
      email,
      Math.round(Number(total) * 100),
    ]);
  }
  return rows.length;
}
