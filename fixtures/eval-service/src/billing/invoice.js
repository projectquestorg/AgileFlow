import { discountFor, roundCents } from './discounts.js';

/**
 * @typedef {{ sku: string, price: number, qty: number }} LineItem
 * @typedef {{ id: string, name: string, discountPercent?: number }} Customer
 */

/**
 * Compute invoice totals.
 * @param {{ items: LineItem[], customer?: Customer }} input
 * @returns {{ subtotal: number, discount: number, total: number }}
 */
export function calculateInvoice({ items, customer }) {
  let subtotal = 0;
  for (const item of items) {
    if (item.qty < 0) throw new RangeError(`negative quantity for ${item.sku}`);
    subtotal += item.price * item.qty;
  }
  subtotal = roundCents(subtotal);
  const discount = discountFor(customer, subtotal);
  return { subtotal, discount, total: roundCents(subtotal - discount) };
}
