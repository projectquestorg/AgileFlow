import type { Order } from '@demo/contracts/src/order';
import type { Db } from './db';

export async function createOrder(db: Db, order: Order): Promise<void> {
  await db.query('INSERT INTO orders (id, customer_id, email, total_cents) VALUES ($1, $2, $3, $4)', [
    order.id,
    order.customerId,
    order.email,
    order.totalCents,
  ]);
}

/** Guest checkout: the buyer has no account, only an email address. */
export async function createGuestOrder(db: Db, input: { id: string; email: string; totalCents: number }): Promise<void> {
  await createOrder(db, { ...input, customerId: null });
}
