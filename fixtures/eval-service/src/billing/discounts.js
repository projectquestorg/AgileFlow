/**
 * Discount, in currency units, a customer gets on a subtotal.
 * Customers carry an optional whole-number `discountPercent` (0-100).
 */
export function discountFor(customer, subtotal) {
  const percent = Number(customer?.discount_percent ?? 0);
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return roundCents((subtotal * Math.min(percent, 100)) / 100);
}

export function roundCents(amount) {
  return Math.round(amount * 100) / 100;
}
